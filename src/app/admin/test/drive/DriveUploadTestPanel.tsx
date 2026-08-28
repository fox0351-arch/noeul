'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import AuthControls from '@/components/AuthControls';
import { useAuth } from '@/components/AuthProvider';
import BlogDraftCard from '@/components/BlogDraftCard';
import ContentPackCards from '@/components/ContentPackCards';
import ContentQualityCard from '@/components/ContentQualityCard';
import GalmaetgilInfoCard from '@/components/GalmaetgilInfoCard';
import GeminiAnalysisCard from '@/components/GeminiAnalysisCard';
import PhotoDropzone from '@/components/PhotoDropzone';
import TravelCourseCard from '@/components/TravelCourseCard';
import TravelInfoCard from '@/components/TravelInfoCard';
import TravelPlaceMap from '@/components/TravelPlaceMap';
import TravelStoryRoute from '@/components/TravelStoryRoute';
import { photoAnalysisFromPipeline } from '@/lib/blog/fromPipeline';
import { inferTravelStory } from '@/lib/blog/travelStory';
import { parseGeminiAnalysisResult } from '@/lib/geminiAnalysis';
import { readCaptureTimeFromImageFile } from '@/lib/photoExif';
import { getFirebaseServices } from '@/lib/firebase/client';
import {
  beginDriveConnection,
  checkDriveConnection,
  createDriveFolder,
  listDriveFolders,
  readSelectedDriveFolder,
  requestDriveAccessToken,
  saveSelectedDriveFolder,
  uploadPhotoToDrive,
  type DriveFolder,
  type DriveUploadedFile,
} from '@/lib/googleDrive/client';
import {
  requestContentPack,
  requestGalmaetgilMatch,
  requestPhotoPipeline,
  requestTravelBlogDraft,
  requestTravelCourse,
  requestTravelMap,
  requestTravelPlaceInfo,
} from '@/lib/photoPipelineClient';
import type { BlogDraft, PhotoAnalysis, TravelStory } from '@/types/blog';
import type { PhotoPipelineResult } from '@/types/photoPipeline';
import type { ContentPack } from '@/types/contentPack';
import type { ContentQualityScore } from '@/types/contentQuality';
import type { GalmaetgilPlaceMatch } from '@/types/galmaetgilMatch';
import type { TravelCourse } from '@/types/travelCourse';
import type { TravelPlaceInfo } from '@/types/travelInfo';
import type { TravelMapData } from '@/types/travelMapOverlay';

type FolderLocation = DriveFolder & { id: string };

type PhotoJob = {
  id: string;
  file: File;
  capturedAt?: string;
  uploaded?: DriveUploadedFile;
  pipeline?: PhotoPipelineResult;
  analysis?: PhotoAnalysis;
  error?: string;
  status: PhotoAnalysis['status'];
};

export default function DriveUploadTestPanel() {
  const { configured, user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [folderPath, setFolderPath] = useState<FolderLocation[]>([{ id: 'root', name: '내 드라이브' }]);
  const [selectedFolder, setSelectedFolder] = useState<FolderLocation>({
    id: 'root',
    name: '내 드라이브',
  });
  const [newFolderName, setNewFolderName] = useState('노을 앱');
  const [photos, setPhotos] = useState<File[]>([]);
  const [jobs, setJobs] = useState<PhotoJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [story, setStory] = useState<TravelStory | null>(null);
  const [draft, setDraft] = useState<BlogDraft | null>(null);
  const [draftError, setDraftError] = useState('');
  const [travelInfos, setTravelInfos] = useState<TravelPlaceInfo[]>([]);
  const [travelInfoError, setTravelInfoError] = useState('');
  const [travelMap, setTravelMap] = useState<TravelMapData | null>(null);
  const [travelMapError, setTravelMapError] = useState('');
  const [course, setCourse] = useState<TravelCourse | null>(null);
  const [courseError, setCourseError] = useState('');
  const [galmaetgilMatches, setGalmaetgilMatches] = useState<GalmaetgilPlaceMatch[]>([]);
  const [galmaetgilError, setGalmaetgilError] = useState('');
  const [contentPack, setContentPack] = useState<ContentPack | null>(null);
  const [contentError, setContentError] = useState('');
  const [quality, setQuality] = useState<ContentQualityScore | null>(null);
  const [message, setMessage] = useState('');

  const currentFolder = folderPath[folderPath.length - 1];
  const analyzedPhotos = useMemo(
    () => jobs.map((job) => job.analysis).filter((item): item is PhotoAnalysis => item?.status === 'analyzed'),
    [jobs]
  );
  const previewStory = useMemo(() => inferTravelStory(analyzedPhotos), [analyzedPhotos]);

  const loadFolders = useCallback(async (token: string, folderId: string) => {
    setFolders(await listDriveFolders(token, folderId));
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      setChecking(true);
      try {
        const isConnected = await checkDriveConnection(user);
        if (cancelled) return;
        setConnected(isConnected);
        if (isConnected) {
          const token = await requestDriveAccessToken(user);
          if (cancelled) return;
          setAccessToken(token);
          await loadFolders(token, 'root');
          const savedFolder = await readSelectedDriveFolder(user);
          if (!cancelled && savedFolder) setSelectedFolder(savedFolder);
        }
        const result = new URLSearchParams(window.location.search).get('drive');
        if (result === 'connected') setMessage('Google Drive 연결이 완료되었습니다.');
        if (result === 'error') setMessage('Google Drive 연결에 실패했습니다.');
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : '연결 상태 확인에 실패했습니다.');
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadFolders, user]);

  const openFolder = async (folder: DriveFolder) => {
    if (!accessToken) return;
    setMessage('');
    try {
      await loadFolders(accessToken, folder.id);
      setFolderPath((path) => [...path, folder]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '폴더를 열지 못했습니다.');
    }
  };

  const goBack = async () => {
    if (!accessToken || folderPath.length <= 1) return;
    const nextPath = folderPath.slice(0, -1);
    try {
      await loadFolders(accessToken, nextPath[nextPath.length - 1].id);
      setFolderPath(nextPath);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '상위 폴더를 열지 못했습니다.');
    }
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!user || !accessToken || !name) return;
    setMessage('폴더를 만드는 중입니다.');
    try {
      const folder = await createDriveFolder(accessToken, name, currentFolder.id);
      await loadFolders(accessToken, currentFolder.id);
      await saveSelectedDriveFolder(user, folder);
      setSelectedFolder(folder);
      setMessage(`'${folder.name}' 폴더를 만들고 선택했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '폴더를 만들지 못했습니다.');
    }
  };

  const selectFolder = async (folder: FolderLocation) => {
    if (!user) return;
    try {
      await saveSelectedDriveFolder(user, folder);
      setSelectedFolder(folder);
      setMessage(`'${folder.name}' 폴더를 사진 저장 위치로 선택했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '폴더 선택을 저장하지 못했습니다.');
    }
  };

  const upload = async () => {
    if (!user || !accessToken || photos.length === 0) return;
    const services = getFirebaseServices();
    if (!services) {
      setMessage('Firebase가 설정되지 않았습니다.');
      return;
    }
    setBusy(true);
    setDraft(null);
    setDraftError('');
    setStory(null);
    setTravelInfos([]);
    setTravelInfoError('');
    setTravelMap(null);
    setTravelMapError('');
    setCourse(null);
    setCourseError('');
    setGalmaetgilMatches([]);
    setGalmaetgilError('');
    setContentPack(null);
    setContentError('');
    setQuality(null);
    const queue: PhotoJob[] = [];
    for (const [index, file] of photos.entries()) {
      const capturedAt = (await readCaptureTimeFromImageFile(file)) || undefined;
      queue.push({
        id: `${file.name}-${file.lastModified}-${index}`,
        file,
        capturedAt,
        status: 'pending',
      });
    }
    setJobs(queue);
    setMessage(`사진 ${queue.length}장을 Drive에 올리고 Gemini로 분석합니다.`);

    let ok = 0;
    let failed = 0;
    const foundPlaces: string[] = [];
    const analyzedForCourse: PhotoAnalysis[] = [];
    for (const [index, job] of queue.entries()) {
      setJobs((current) =>
        current.map((item) => (item.id === job.id ? { ...item, status: 'uploading' } : item))
      );
      setMessage(`${index + 1}/${queue.length} ${job.file.name} 업로드 중`);
      try {
        const result = await uploadPhotoToDrive(accessToken, job.file, selectedFolder.id);
        await setDoc(doc(services.db, 'users', user.uid, 'media', result.id), {
          driveFileId: result.id,
          driveFolderId: selectedFolder.id,
          name: result.name,
          mimeType: result.mimeType,
          size: Number(result.size ?? job.file.size),
          kind: 'photo',
          status: 'uploaded',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setJobs((current) =>
          current.map((item) =>
            item.id === job.id ? { ...item, uploaded: result, status: 'analyzing' } : item
          )
        );
        setMessage(`${index + 1}/${queue.length} ${job.file.name} Gemini 분석 중`);
        const pipelineResult = await requestPhotoPipeline(user, { driveFileId: result.id });
        const analysis = photoAnalysisFromPipeline(pipelineResult, {
          driveFileId: result.id,
          fileName: result.name || job.file.name,
          capturedAt: job.capturedAt,
          lastModified: job.file.lastModified,
        });
        const place =
          analysis.place ||
          pipelineResult.geminiAnalysis?.placeName ||
          pipelineResult.geminiAnalysis?.estimatedLocation ||
          '';
        if (place) foundPlaces.push(place);
        analyzedForCourse.push(analysis);
        ok += 1;
        setJobs((current) =>
          current.map((item) =>
            item.id === job.id
              ? { ...item, uploaded: result, pipeline: pipelineResult, analysis, status: 'analyzed' }
              : item
          )
        );
      } catch (error) {
        failed += 1;
        const reason = error instanceof Error ? error.message : '사진 처리에 실패했습니다.';
        setJobs((current) =>
          current.map((item) =>
            item.id === job.id
              ? {
                  ...item,
                  status: 'failed',
                  error: reason,
                  analysis: {
                    driveFileId: '',
                    fileName: job.file.name,
                    place: '',
                    description: '',
                    objects: [],
                    mood: '',
                    keywords: [],
                    status: 'failed',
                    error: reason,
                    capturedAt: job.capturedAt,
                    lastModified: job.file.lastModified,
                  },
                }
              : item
          )
        );
      }
    }

    if (user && analyzedForCourse.length) {
      const uniquePlaces = Array.from(new Set(foundPlaces.map((place) => place.trim()).filter(Boolean)));
      let trailMatches: GalmaetgilPlaceMatch[] = [];
      if (uniquePlaces.length) {
        setMessage('장소별 여행 정보, 코스, 지도를 만드는 중입니다.');
        const [infoResult, mapResult, courseResult, trailResult] = await Promise.allSettled([
          requestTravelPlaceInfo(user, uniquePlaces),
          requestTravelMap(user, uniquePlaces),
          requestTravelCourse(user, analyzedForCourse),
          requestGalmaetgilMatch(user, uniquePlaces),
        ]);
        if (infoResult.status === 'fulfilled') {
          setTravelInfos(infoResult.value);
          setTravelInfoError('');
        } else {
          setTravelInfoError(
            infoResult.reason instanceof Error ? infoResult.reason.message : '여행 정보를 만들지 못했습니다.'
          );
        }
        if (mapResult.status === 'fulfilled') {
          setTravelMap(mapResult.value);
          setTravelMapError('');
        } else {
          setTravelMapError(
            mapResult.reason instanceof Error ? mapResult.reason.message : '지도를 만들지 못했습니다.'
          );
        }
        if (courseResult.status === 'fulfilled') {
          setCourse(courseResult.value);
          setCourseError('');
        } else {
          setCourseError(
            courseResult.reason instanceof Error ? courseResult.reason.message : '여행 코스를 만들지 못했습니다.'
          );
        }
        if (trailResult.status === 'fulfilled') {
          trailMatches = trailResult.value;
          setGalmaetgilMatches(trailResult.value);
          setGalmaetgilError('');
        } else {
          setGalmaetgilError(
            trailResult.reason instanceof Error ? trailResult.reason.message : '갈맷길 매칭에 실패했습니다.'
          );
        }
      }

      setMessage('장소와 갈맷길 정보로 콘텐츠를 만드는 중입니다.');
      try {
        const pack = await requestContentPack(user, analyzedForCourse, trailMatches);
        setContentPack(pack);
        setDraft(pack.blog);
        setStory(pack.story);
        setQuality(pack.quality ?? null);
        setDraftError('');
        setContentError('');
      } catch (error) {
        setContentError(error instanceof Error ? error.message : '콘텐츠를 만들지 못했습니다.');
        try {
          const blog = await requestTravelBlogDraft(user, analyzedForCourse, trailMatches);
          setDraft(blog.draft);
          setStory(blog.story);
          setQuality(blog.quality ?? null);
          setDraftError('');
        } catch (blogError) {
          setDraftError(blogError instanceof Error ? blogError.message : '블로그 초안을 만들지 못했습니다.');
        }
      }
    }

    setBusy(false);
    setMessage(
      failed
        ? `분석 완료 ${ok}장, 실패 ${failed}장. 성공한 사진으로 블로그 초안을 만들 수 있습니다.`
        : `Gemini 분석과 콘텐츠 생성이 완료되었습니다. ${ok}장을 아래에서 확인하세요.`
    );
  };

  const createBlogDraft = async () => {
    if (!user || analyzedPhotos.length === 0) {
      setDraftError('분석이 끝난 사진이 없어 콘텐츠를 만들 수 없습니다.');
      setContentError('분석이 끝난 사진이 없어 콘텐츠를 만들 수 없습니다.');
      return;
    }
    setDraftBusy(true);
    setDraft(null);
    setDraftError('');
    setContentPack(null);
    setContentError('');
    setQuality(null);
    setMessage('같은 장소 정보로 블로그·카드뉴스·쇼츠·유튜브 콘텐츠를 만드는 중입니다.');
    try {
      const pack = await requestContentPack(user, analyzedPhotos, galmaetgilMatches);
      setContentPack(pack);
      setDraft(pack.blog);
      setStory(pack.story);
      setQuality(pack.quality ?? null);
      setMessage('콘텐츠가 준비되었습니다.');
    } catch (error) {
      setContentError(error instanceof Error ? error.message : '콘텐츠를 만들지 못했습니다.');
      try {
        const blog = await requestTravelBlogDraft(user, analyzedPhotos, galmaetgilMatches);
        setDraft(blog.draft);
        setStory(blog.story);
        setQuality(blog.quality ?? null);
        setDraftError('');
        setMessage('블로그 초안은 준비되었습니다.');
      } catch (blogError) {
        const reason = blogError instanceof Error ? blogError.message : '블로그 초안을 만들지 못했습니다.';
        setDraftError(reason);
        setMessage(reason);
      }
    } finally {
      setDraftBusy(false);
    }
  };

  if (!configured) {
    return <p className="p-4 text-red-700">Firebase 환경변수를 먼저 설정해 주세요.</p>;
  }

  return (
    <main className="min-h-dvh p-4 bg-slate-100 text-slate-900">
      <div className="max-w-6xl mx-auto space-y-4">
        <header className="flex items-center justify-between gap-3 p-4 bg-white rounded-xl">
          <div>
            <h1 className="text-xl font-black">Google Drive 업로드 시험</h1>
            <p className="mt-1 text-sm text-slate-600">로그인, 폴더 선택, 사진 저장을 순서대로 확인합니다.</p>
          </div>
          <AuthControls />
        </header>

        {user && (
          <>
            <section className="p-4 bg-white rounded-xl">
              <h2 className="font-black">1. Drive 연결</h2>
              <p className="mt-2 text-sm">상태: {checking ? '확인 중' : connected ? '연결됨' : '연결 안 됨'}</p>
              {!connected && (
                <button
                  type="button"
                  onClick={() => void beginDriveConnection(user)}
                  className="px-4 mt-3 font-bold text-white bg-blue-700 rounded-lg min-h-11"
                >
                  Google Drive 연결
                </button>
              )}
            </section>

            {connected && accessToken && (
              <section className="p-4 bg-white rounded-xl">
                <h2 className="font-black">2. 저장 폴더 선택</h2>
                <p className="mt-2 text-sm text-slate-600">현재 위치: {folderPath.map((item) => item.name).join(' / ')}</p>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => void selectFolder(currentFolder)}
                    className="px-3 font-bold text-white bg-emerald-700 rounded-lg min-h-11"
                  >
                    현재 폴더 선택
                  </button>
                  <button
                    type="button"
                    disabled={folderPath.length <= 1}
                    onClick={() => void goBack()}
                    className="px-3 font-bold bg-slate-200 rounded-lg min-h-11 disabled:text-slate-400"
                  >
                    상위 폴더
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => void openFolder(folder)}
                      className="block w-full px-3 text-left bg-slate-100 rounded-lg min-h-11"
                    >
                      📁 {folder.name}
                    </button>
                  ))}
                  {folders.length === 0 && <p className="text-sm text-slate-500">하위 폴더가 없습니다.</p>}
                </div>
                <div className="flex gap-2 mt-4">
                  <input
                    value={newFolderName}
                    onChange={(event) => setNewFolderName(event.target.value)}
                    aria-label="새 폴더 이름"
                    className="flex-1 min-w-0 px-3 border rounded-lg min-h-11"
                  />
                  <button
                    type="button"
                    onClick={() => void createFolder()}
                    className="px-3 font-bold bg-amber-200 rounded-lg min-h-11"
                  >
                    폴더 만들기
                  </button>
                </div>
                <p className="mt-3 text-sm font-bold text-emerald-700">선택됨: {selectedFolder.name}</p>
              </section>
            )}

            {connected && accessToken && (
              <section className="p-4 bg-white rounded-xl">
                <h2 className="font-black">3. 사진 업로드 시험</h2>
                <PhotoDropzone files={photos} onFiles={setPhotos} disabled={busy} />
                {photos.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-slate-600">
                    {photos.map((file) => (
                      <li key={`${file.name}-${file.lastModified}`}>{file.name}</li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  disabled={photos.length === 0 || busy}
                  onClick={() => void upload()}
                  className="px-4 mt-3 font-bold text-white bg-violet-700 rounded-lg min-h-11 disabled:bg-slate-400"
                >
                  {busy ? '처리 중...' : '선택한 폴더에 올리기'}
                </button>
                {jobs.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {jobs.map((job) => (
                      <li key={job.id} className="p-3 text-sm bg-slate-50 rounded-xl">
                        <p className="font-bold">{job.file.name}</p>
                        <p className="text-slate-600">
                          {job.status === 'analyzed'
                            ? '분석 완료'
                            : job.status === 'failed'
                              ? `실패: ${job.error}`
                              : job.status === 'analyzing'
                                ? 'Gemini 분석 중'
                                : job.status === 'uploading'
                                  ? 'Drive 업로드 중'
                                  : '대기'}
                        </p>
                        {job.uploaded?.webViewLink && (
                          <a
                            href={job.uploaded.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-blue-700 underline"
                          >
                            Drive에서 열기
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {jobs.some((job) => job.pipeline?.geminiAnalysis || job.pipeline?.analysis) && (
                  <div className="mt-2">
                    <h3 className="mt-4 text-lg font-black">Gemini 분석 결과</h3>
                    {jobs.map((job) =>
                      job.pipeline?.geminiAnalysis || job.pipeline?.analysis ? (
                        <GeminiAnalysisCard
                          key={job.id}
                          heading={job.file.name}
                          analysis={
                            job.pipeline.geminiAnalysis ??
                            parseGeminiAnalysisResult(job.pipeline.analysis)
                          }
                          rawJson={job.pipeline.rawGeminiJson ?? job.pipeline.analysis}
                        />
                      ) : null
                    )}
                    <TravelStoryRoute story={story ?? previewStory} />
                    <button
                      type="button"
                      disabled={analyzedPhotos.length === 0 || draftBusy || busy}
                      onClick={() => void createBlogDraft()}
                      className="px-4 mt-4 font-bold text-white bg-emerald-700 rounded-lg min-h-11 disabled:bg-slate-400"
                    >
                      {draftBusy ? '콘텐츠 작성 중...' : '콘텐츠 다시 만들기'}
                    </button>
                    <TravelCourseCard course={course} error={courseError} />
                    <div className="grid items-start grid-cols-1 gap-4 mt-4 lg:grid-cols-2">
                      <div className="space-y-3">
                        <GalmaetgilInfoCard matches={galmaetgilMatches} error={galmaetgilError} />
                        <TravelInfoCard infos={travelInfos} error={travelInfoError} />
                      </div>
                      <TravelPlaceMap data={travelMap} error={travelMapError} routePath={course?.path} />
                    </div>
                    <BlogDraftCard draft={draft} error={draftError} />
                    <ContentQualityCard quality={quality ?? contentPack?.quality} />
                    {contentError && !draftError && (
                      <section className="p-4 mt-4 bg-white border border-red-200 shadow-md rounded-2xl">
                        <h3 className="text-lg font-black text-red-800">콘텐츠를 만들지 못했습니다</h3>
                        <p className="mt-2 text-red-700">{contentError}</p>
                      </section>
                    )}
                    <ContentPackCards pack={contentPack} />
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {!user && (
          <section className="p-4 bg-white rounded-xl">
            <p className="font-bold">먼저 위의 구글 로그인 버튼을 눌러 주세요.</p>
          </section>
        )}

        {message && <p className="p-3 font-bold bg-white rounded-xl">{message}</p>}
      </div>
    </main>
  );
}
