import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useApi } from '@/auth/useApi';
import { convertHeicToJpeg, detectIsHeic } from '@/photos/heicToJpeg';
import { resizeAndStrip } from '@/photos/canvasResize';
import {
  createUploadQueue,
  xhrUpload,
  type UploadQueueItem,
  type UploadQueueHandle,
  type UploadStatus,
} from '@/photos/uploadQueue';
import { requestUploadUrl, finalizePhoto, type PhotoDTO } from '@/api/photos';

interface PhotoUploaderProps {
  readonly cityId: string;
  readonly remainingCap: number; // 10 - current photo count
  readonly onUploaded: (photo: PhotoDTO) => void;
}

export function PhotoUploader({ cityId, remainingCap, onUploaded }: PhotoUploaderProps) {
  const [items, setItems] = useState<readonly UploadQueueItem[]>([]);
  // ERR-01: 1Hz tick re-render so the 'Retrying in {N}s…' caption recomputes
  // from Date.now() without storing a derived clock in state. Value is unused;
  // only the setter is read (force re-render).
  const [, setCountdownTick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<UploadQueueHandle | null>(null);
  const apiRef = useRef(useApi());

  // StrictMode mountedRef (CRITICAL — mirror CityForm.tsx pattern).
  // Re-anchor on every (re-)mount; StrictMode double-invoke leaves the
  // ref stuck at false otherwise (memory: feedback_mountedref_strictmode.md).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setItemStatus = useCallback((id: string, status: UploadStatus) => {
    if (!mountedRef.current) return;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status } : it)));
  }, []);

  const runOne = useCallback(
    async (item: UploadQueueItem, signal: { aborted: boolean }) => {
      // 1. Convert HEIC if needed
      setItemStatus(item.id, { kind: 'converting' });
      const isHeic = await detectIsHeic(item.file);
      if (signal.aborted) throw new Error('Aborted');
      const sourceBlob: Blob = isHeic ? await convertHeicToJpeg(item.file) : item.file;
      if (signal.aborted) throw new Error('Aborted');

      // 2. Resize + EXIF strip
      const resized = await resizeAndStrip(sourceBlob);
      if (signal.aborted) throw new Error('Aborted');

      // 3. Request PAR URL (output is always image/jpeg after the pipeline)
      setItemStatus(item.id, { kind: 'uploading', progress: 0 });
      const { photoId, uploadUrl } = await requestUploadUrl(apiRef.current, cityId, {
        contentType: 'image/jpeg',
        sizeBytes: resized.size,
      });
      if (signal.aborted) throw new Error('Aborted');

      // 4. PUT to OCI with progress
      await xhrUpload({
        url: uploadUrl,
        blob: resized,
        contentType: 'image/jpeg',
        signal,
        onProgress: (ratio) =>
          setItemStatus(item.id, { kind: 'uploading', progress: ratio }),
      });
      if (signal.aborted) throw new Error('Aborted');

      // 5. Finalize → thumb generation → ready
      const finalized = await finalizePhoto(apiRef.current, photoId);
      if (!mountedRef.current) return;
      setItemStatus(item.id, { kind: 'done' });
      onUploaded({
        id: finalized.id,
        masterUrl: finalized.masterUrl,
        thumbUrl: finalized.thumbUrl,
        orderIndex: 0, // server-authoritative; refetch via parent will replace
      });
    },
    [cityId, onUploaded, setItemStatus],
  );

  // Queue init: create queue on mount, cancel on unmount.
  useEffect(() => {
    queueRef.current = createUploadQueue({
      concurrency: 3,
      runOne,
      onItemUpdate: (item) => {
        if (!mountedRef.current) return;
        setItems((prev) => {
          const existing = prev.findIndex((it) => it.id === item.id);
          if (existing >= 0) {
            const next = prev.slice();
            next[existing] = item;
            return next;
          }
          return [...prev, item];
        });
      },
    });
    return () => {
      queueRef.current?.cancelAll();
    };
  }, [runOne]);

  // ERR-01: 1Hz tick — only mounted when at least one item is in 'retrying' state.
  // Cleanup on items change / unmount keeps StrictMode double-mount safe (the
  // useEffect cleanup naturally clears the interval before the second mount
  // re-anchors a new one).
  useEffect(() => {
    const anyRetrying = items.some((it) => it.status.kind === 'retrying');
    if (!anyRetrying) return;
    const id = window.setInterval(() => setCountdownTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [items]);

  const onFilesPicked = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same file later
    if (files.length === 0) return;
    // DATA-06 client-side cap: drop overflow with inline microcopy
    const accepted = files.slice(0, Math.max(0, remainingCap));
    queueRef.current?.add(accepted);
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/heic,image/heif"
        onChange={onFilesPicked}
        className="hidden"
        data-testid="photo-uploader-input"
      />
      <button
        type="button"
        disabled={remainingCap <= 0}
        onClick={() => fileInputRef.current?.click()}
        className="bg-amber-500 text-black px-4 py-2 rounded-lg font-semibold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg min-w-[44px]"
      >
        Add photos
      </button>
      {remainingCap <= 0 ? (
        <p className="text-ink-mute text-[13px]">
          You've reached the 10-photo limit for this city.
        </p>
      ) : remainingCap < 10 ? (
        <p className="text-ink-mute text-[13px] tabular-nums">
          You can add {remainingCap} more {remainingCap === 1 ? 'photo' : 'photos'} to this city.
        </p>
      ) : null}
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-3 text-[13px]">
            <span className="truncate flex-1">{it.file.name}</span>
            {it.status.kind === 'uploading' && (
              <div
                className="w-24 h-1.5 rounded-full bg-bg-elev overflow-hidden"
                data-testid={`upload-progress-${it.id}`}
              >
                <div
                  className="h-full bg-amber-500"
                  style={{ width: `${Math.round(it.status.progress * 100)}%` }}
                />
              </div>
            )}
            {it.status.kind === 'converting' && (
              <span className="text-ink-mute">Converting…</span>
            )}
            {it.status.kind === 'retrying' && (
              <div className="flex items-center gap-2 text-[13px] border border-amber-500 rounded-md px-2 py-1">
                <span
                  aria-hidden="true"
                  className="inline-block w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"
                />
                <span className="text-amber-500" aria-live="polite">
                  Retrying in {Math.max(0, Math.ceil((it.status.nextAttemptAt - Date.now()) / 1000))}s…
                </span>
              </div>
            )}
            {it.status.kind === 'done' && (
              <span className="text-success-500">Done</span>
            )}
            {it.status.kind === 'failed' && (
              <button
                type="button"
                onClick={() => queueRef.current?.retry(it.id)}
                className="text-amber-500 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 min-w-[44px]"
              >
                Upload failed. Tap to retry.
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
