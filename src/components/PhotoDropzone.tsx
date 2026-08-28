'use client';

import { useRef, useState } from 'react';

const MAX_PHOTOS = 50;

type PhotoDropzoneProps = {
  files: File[];
  onFiles: (files: File[]) => void;
  disabled?: boolean;
};

function takeImages(list: FileList | File[]): File[] {
  return Array.from(list).filter((file) => file.type.startsWith('image/'));
}

export default function PhotoDropzone({ files, onFiles, disabled }: PhotoDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const apply = (incoming: File[]) => {
    const merged = [...files];
    for (const file of incoming) {
      const duplicate = merged.some(
        (item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified
      );
      if (!duplicate) merged.push(file);
    }
    onFiles(merged.slice(0, MAX_PHOTOS));
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (disabled) return;
        apply(takeImages(event.dataTransfer.files));
      }}
      className={`mt-3 rounded-xl border-2 border-dashed p-4 text-center ${
        dragging ? 'border-violet-600 bg-violet-50' : 'border-slate-300 bg-slate-50'
      }`}
    >
      <p className="font-bold text-slate-800">사진을 끌어다 놓거나 눌러서 선택하세요</p>
      <p className="mt-1 text-sm text-slate-500">이미지 최대 {MAX_PHOTOS}장</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        disabled={disabled}
        onChange={(event) => {
          apply(takeImages(event.target.files ?? []));
          event.target.value = '';
        }}
        className="hidden"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="px-4 mt-3 font-bold bg-white border rounded-lg min-h-11 disabled:text-slate-400"
      >
        사진 선택
      </button>
      <p className="mt-2 text-sm font-bold text-violet-800">선택됨 {files.length}/{MAX_PHOTOS}</p>
    </div>
  );
}

export { MAX_PHOTOS };
