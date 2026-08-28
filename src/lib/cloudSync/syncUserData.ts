import { collection, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { getFirebaseServices } from '@/lib/firebase/client';
import { loadGuardianPhone, saveGuardianPhone } from '@/lib/guardianStorage';
import { loadManualPlaces, saveManualPlaces } from '@/lib/manualPlacesStorage';
import { loadBatterySave, saveBatterySave } from '@/lib/navSafety';
import { loadTravelMaps, replaceTravelMapsForSync } from '@/lib/travelMapStorage';
import { loadUserSettings, saveUserSettings, type UserSettings } from '@/lib/userData';
import type { PlaceItem, PlacePhoto } from '@/types/place';
import type { TravelMap } from '@/types/travelMap';
import {
  clearCloudDirtyIfUnchanged,
  getCloudDirtyAt,
  scopedStorageKey,
  type CloudDataKind,
} from './storageScope';

type CloudPhoto = Omit<PlacePhoto, 'dataUrl'> & { driveFileId: string };

type CloudPlace = Omit<PlaceItem, 'photos'> & {
  photos?: CloudPhoto[];
};

type CloudTravelMap = Omit<TravelMap, 'places'> & {
  places: CloudPlace[];
};

type CloudSettings = UserSettings & {
  batterySave: boolean;
  highContrast: boolean;
  updatedAtMs: number;
};

type CloudGuardian = {
  phone: string;
  updatedAtMs: number;
};

const HIGH_CONTRAST_KEY = 'noeul.highContrast.v1';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function toCloudPlace(place: PlaceItem): CloudPlace {
  const photos = place.photos
    ?.filter((photo): photo is PlacePhoto & { driveFileId: string } => Boolean(photo.driveFileId))
    .map((photo) => {
      const cloudPhoto: Partial<PlacePhoto> & { driveFileId: string } = { ...photo };
      delete cloudPhoto.dataUrl;
      return cloudPhoto as CloudPhoto;
    });
  const cloudPlace = { ...place, photos: photos?.length ? photos : undefined };
  return cloudPlace;
}

async function fromCloudPlace(
  place: CloudPlace,
  driveAccessToken?: string
): Promise<PlaceItem> {
  if (!driveAccessToken || !place.photos?.length) {
    const { photos, ...placeWithoutPhotos } = place;
    void photos;
    return placeWithoutPhotos;
  }
  const photos = (
    await Promise.all(
      place.photos.map(async (photo): Promise<PlacePhoto | null> => {
        try {
          const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(photo.driveFileId)}?alt=media`,
            { headers: { Authorization: `Bearer ${driveAccessToken}` } }
          );
          if (!response.ok) return null;
          return {
            ...photo,
            dataUrl: await blobToDataUrl(await response.blob()),
          };
        } catch {
          return null;
        }
      })
    )
  ).filter((photo): photo is PlacePhoto => photo != null);
  return { ...place, photos: photos.length ? photos : undefined };
}

async function toCloudMap(map: TravelMap): Promise<CloudTravelMap> {
  return {
    ...map,
    places: map.places.map(toCloudPlace),
  };
}

async function fromCloudMap(map: CloudTravelMap, driveAccessToken?: string): Promise<TravelMap> {
  return {
    ...map,
    places: await Promise.all(map.places.map((place) => fromCloudPlace(place, driveAccessToken))),
  };
}

function mergeMaps(localMaps: TravelMap[], cloudMaps: TravelMap[], allowedCloudIds?: Set<string>): TravelMap[] {
  const merged = new Map<string, TravelMap>();
  for (const map of cloudMaps) {
    if (!allowedCloudIds || allowedCloudIds.has(map.id)) merged.set(map.id, map);
  }
  for (const local of localMaps) {
    const cloud = merged.get(local.id);
    if (!cloud || local.updatedAt >= cloud.updatedAt) merged.set(local.id, local);
  }
  return [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function mergePlaces(localPlaces: PlaceItem[], cloudPlaces: PlaceItem[]): PlaceItem[] {
  const merged = new Map(cloudPlaces.map((place) => [place.id, place]));
  for (const place of localPlaces) merged.set(place.id, place);
  return [...merged.values()];
}

function preserveLocalPhotos(localPlaces: PlaceItem[], cloudPlaces: PlaceItem[]): PlaceItem[] {
  const localById = new Map(localPlaces.map((place) => [place.id, place]));
  return cloudPlaces.map((place) => {
    if (place.photos?.length) return place;
    const localPhotos = localById.get(place.id)?.photos;
    return localPhotos?.length ? { ...place, photos: localPhotos } : place;
  });
}

function readHighContrast(): boolean {
  return window.localStorage.getItem(scopedStorageKey(HIGH_CONTRAST_KEY)) === '1';
}

function writeHighContrast(enabled: boolean): void {
  window.localStorage.setItem(scopedStorageKey(HIGH_CONTRAST_KEY), enabled ? '1' : '0');
}

function knownMapIdsKey(uid: string): string {
  return `noeul.cloudKnownMapIds.${uid}`;
}

function readKnownMapIds(uid: string): Set<string> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(knownMapIdsKey(uid)) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeKnownMapIds(uid: string, ids: string[]): void {
  window.localStorage.setItem(knownMapIdsKey(uid), JSON.stringify(ids));
}

function knownFavoriteIdsKey(uid: string): string {
  return `noeul.cloudKnownFavoriteIds.${uid}`;
}

function readKnownFavoriteIds(uid: string): Set<string> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(knownFavoriteIdsKey(uid)) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeKnownFavoriteIds(uid: string, ids: string[]): void {
  window.localStorage.setItem(knownFavoriteIdsKey(uid), JSON.stringify(ids));
}

async function uploadTravelMaps(uid: string, maps: TravelMap[]): Promise<void> {
  const services = getFirebaseServices();
  if (!services) return;
  const dirtyAt = getCloudDirtyAt(uid, 'travelMaps');
  const cloudCollection = collection(services.db, 'users', uid, 'travelMaps');
  const [existing, cloudMaps] = await Promise.all([
    getDocs(cloudCollection),
    Promise.all(maps.map(toCloudMap)),
  ]);
  const localIds = new Set(maps.map((map) => map.id));
  const operations: Array<
    | { type: 'set'; id: string; value: CloudTravelMap }
    | { type: 'delete'; id: string }
  > = [
    ...cloudMaps.map((value) => ({ type: 'set' as const, id: value.id, value })),
    ...existing.docs
      .filter((snapshot) => !localIds.has(snapshot.id))
      .map((snapshot) => ({ type: 'delete' as const, id: snapshot.id })),
  ];
  for (let index = 0; index < operations.length; index += 400) {
    const batch = writeBatch(services.db);
    for (const operation of operations.slice(index, index + 400)) {
      const target = doc(cloudCollection, operation.id);
      if (operation.type === 'set') batch.set(target, operation.value);
      else batch.delete(target);
    }
    await batch.commit();
  }
  const metadataBatch = writeBatch(services.db);
  metadataBatch.set(doc(services.db, 'users', uid, 'sync', 'state'), {
      version: 1,
      mapIds: [...localIds],
      updatedAtMs: Date.now(),
    });
  await metadataBatch.commit();
  writeKnownMapIds(uid, [...localIds]);
  clearCloudDirtyIfUnchanged(uid, 'travelMaps', dirtyAt);
}

async function uploadFavorites(uid: string, places: PlaceItem[]): Promise<void> {
  const services = getFirebaseServices();
  if (!services) return;
  const dirtyAt = getCloudDirtyAt(uid, 'favorites');
  await setDoc(doc(services.db, 'users', uid, 'favorites', 'state'), {
    places: places.map(toCloudPlace),
    updatedAtMs: Date.now(),
  });
  writeKnownFavoriteIds(uid, places.map((place) => place.id));
  clearCloudDirtyIfUnchanged(uid, 'favorites', dirtyAt);
}

async function uploadSettings(uid: string): Promise<void> {
  const services = getFirebaseServices();
  if (!services) return;
  const settingsDirtyAt = getCloudDirtyAt(uid, 'settings');
  const settings: CloudSettings = {
    ...loadUserSettings(),
    batterySave: loadBatterySave(),
    highContrast: readHighContrast(),
    updatedAtMs: Date.now(),
  };
  await setDoc(doc(services.db, 'users', uid, 'settings', 'prefs'), settings);
  clearCloudDirtyIfUnchanged(uid, 'settings', settingsDirtyAt);
}

async function uploadGuardian(uid: string): Promise<void> {
  const services = getFirebaseServices();
  if (!services) return;
  const guardianDirtyAt = getCloudDirtyAt(uid, 'guardian');
  const guardian: CloudGuardian = {
    phone: loadGuardianPhone(),
    updatedAtMs: Date.now(),
  };
  await setDoc(doc(services.db, 'users', uid, 'private', 'guardian'), guardian);
  clearCloudDirtyIfUnchanged(uid, 'guardian', guardianDirtyAt);
}

export async function uploadLocalUserData(uid: string, kind?: CloudDataKind): Promise<void> {
  if (kind == null || kind === 'travelMaps') await uploadTravelMaps(uid, loadTravelMaps());
  if (kind == null || kind === 'favorites') await uploadFavorites(uid, loadManualPlaces());
  if (kind == null || kind === 'settings') await uploadSettings(uid);
  if (kind == null || kind === 'guardian') await uploadGuardian(uid);
}

export async function synchronizeUserData(
  uid: string,
  attempt = 0,
  driveAccessToken?: string
): Promise<boolean> {
  const services = getFirebaseServices();
  if (!services) return false;
  const startingRevisions = {
    travelMaps: getCloudDirtyAt(uid, 'travelMaps'),
    favorites: getCloudDirtyAt(uid, 'favorites'),
    settings: getCloudDirtyAt(uid, 'settings'),
    guardian: getCloudDirtyAt(uid, 'guardian'),
  };

  const [mapSnapshots, favoritesSnapshot, settingsSnapshot, guardianSnapshot, syncSnapshot] = await Promise.all([
    getDocs(collection(services.db, 'users', uid, 'travelMaps')),
    getDoc(doc(services.db, 'users', uid, 'favorites', 'state')),
    getDoc(doc(services.db, 'users', uid, 'settings', 'prefs')),
    getDoc(doc(services.db, 'users', uid, 'private', 'guardian')),
    getDoc(doc(services.db, 'users', uid, 'sync', 'state')),
  ]);

  const localMaps = loadTravelMaps();
  const cloudMaps = (
    await Promise.all(
      mapSnapshots.docs.map((snapshot) =>
        fromCloudMap(snapshot.data() as CloudTravelMap, driveAccessToken)
      )
    )
  ).map((map) => ({
    ...map,
    places: preserveLocalPhotos(
      localMaps.find((localMap) => localMap.id === map.id)?.places ?? [],
      map.places
    ),
  }));
  const syncData = syncSnapshot.exists()
    ? (syncSnapshot.data() as { mapIds?: unknown })
    : null;
  const storedMapIds = Array.isArray(syncData?.mapIds)
    ? syncData.mapIds.filter((id: unknown): id is string => typeof id === 'string')
    : cloudMaps.map((map) => map.id);
  const cloudMapIds = new Set<string>(storedMapIds);
  const knownMapIds = readKnownMapIds(uid);
  const locallyDeleted = new Set([...knownMapIds].filter((id) => !localMaps.some((map) => map.id === id)));
  const localMapsDirty = getCloudDirtyAt(uid, 'travelMaps') > 0;
  const allowedCloudIds = localMapsDirty
    ? new Set([...cloudMapIds].filter((id) => !locallyDeleted.has(id)))
    : cloudMapIds;
  const mergedMaps = localMapsDirty
    ? mergeMaps(localMaps, cloudMaps, allowedCloudIds)
    : cloudMaps.length > 0 || syncSnapshot.exists()
      ? cloudMaps.filter((map) => cloudMapIds.has(map.id))
      : localMaps;

  const localPlaces = loadManualPlaces();
  const cloudPlaces = favoritesSnapshot.exists()
    ? preserveLocalPhotos(
        localPlaces,
        await Promise.all(
          ((favoritesSnapshot.data().places as CloudPlace[] | undefined) ?? []).map((place) =>
            fromCloudPlace(place, driveAccessToken)
          )
        )
      )
    : [];
  const localFavoritesDirty = getCloudDirtyAt(uid, 'favorites') > 0;
  const knownFavoriteIds = readKnownFavoriteIds(uid);
  const localFavoriteIds = new Set(localPlaces.map((place) => place.id));
  const locallyDeletedFavoriteIds = new Set(
    [...knownFavoriteIds].filter((id) => !localFavoriteIds.has(id))
  );
  const mergedPlaces = localFavoritesDirty
    ? mergePlaces(
        localPlaces,
        cloudPlaces.filter((place) => !locallyDeletedFavoriteIds.has(place.id))
      )
    : favoritesSnapshot.exists()
      ? cloudPlaces
      : mergePlaces(localPlaces, cloudPlaces);

  const localSettings = {
    ...loadUserSettings(),
    batterySave: loadBatterySave(),
    highContrast: readHighContrast(),
  };
  const cloudSettings =
    settingsSnapshot.exists() && getCloudDirtyAt(uid, 'settings') === 0
      ? (settingsSnapshot.data() as CloudSettings)
      : null;
  const localGuardian = loadGuardianPhone();
  const cloudGuardian =
    guardianSnapshot.exists() && getCloudDirtyAt(uid, 'guardian') === 0
      ? (guardianSnapshot.data() as CloudGuardian)
      : null;
  const changed =
    JSON.stringify(localMaps) !== JSON.stringify(mergedMaps) ||
    JSON.stringify(localPlaces) !== JSON.stringify(mergedPlaces) ||
    (cloudSettings != null &&
      JSON.stringify(localSettings) !==
        JSON.stringify({
          voiceStyle: cloudSettings.voiceStyle,
          headingUp: cloudSettings.headingUp,
          batterySave: Boolean(cloudSettings.batterySave),
          highContrast: Boolean(cloudSettings.highContrast),
        })) ||
    (cloudGuardian != null && localGuardian !== (cloudGuardian.phone ?? ''));

  const localChangedDuringSync =
    getCloudDirtyAt(uid, 'travelMaps') !== startingRevisions.travelMaps ||
    getCloudDirtyAt(uid, 'favorites') !== startingRevisions.favorites ||
    getCloudDirtyAt(uid, 'settings') !== startingRevisions.settings ||
    getCloudDirtyAt(uid, 'guardian') !== startingRevisions.guardian;
  if (localChangedDuringSync) {
    if (attempt >= 2) throw new Error('Local data changed repeatedly during cloud sync');
    return synchronizeUserData(uid, attempt + 1, driveAccessToken);
  }

  replaceTravelMapsForSync(mergedMaps);
  saveManualPlaces(mergedPlaces);

  if (cloudSettings) {
    saveUserSettings({
      voiceStyle: cloudSettings.voiceStyle,
      headingUp: cloudSettings.headingUp,
    });
    saveBatterySave(Boolean(cloudSettings.batterySave));
    writeHighContrast(Boolean(cloudSettings.highContrast));
  }
  if (cloudGuardian) saveGuardianPhone(cloudGuardian.phone ?? '');

  await uploadLocalUserData(uid);
  return changed;
}
