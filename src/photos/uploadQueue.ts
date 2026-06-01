/**
 * XHR upload queue with p-limit concurrency semaphore and per-file state machine.
 *
 * Design note: fetch() has no upload progress API in any browser as of 2026.
 * XMLHttpRequest.upload.onprogress is mandatory for per-file progress bars.
 *
 * p-limit v7+ is ESM-only — always use `import pLimit from 'p-limit'`, never require().
 *
 * Immutability: item status updates always produce a new UploadQueueItem object
 * via spread — items in the Map are never mutated in-place.
 */

import pLimit from 'p-limit';
import { BACKOFF_MS, MAX_AUTO_RETRIES, classifyError, sleep } from './retry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UploadStatus =
  | { readonly kind: 'queued' }
  | { readonly kind: 'converting' }
  | { readonly kind: 'uploading'; readonly progress: number } // 0..1
  | { readonly kind: 'retrying'; readonly attempt: number; readonly nextAttemptAt: number }
  | { readonly kind: 'done' }
  | { readonly kind: 'failed'; readonly reason: string };

export interface UploadQueueItem {
  readonly id: string;        // stable client-generated id (crypto.randomUUID)
  readonly file: File;
  readonly status: UploadStatus;
}

export interface CreateUploadQueueOptions {
  readonly concurrency?: number;           // default 3
  readonly onItemUpdate: (item: UploadQueueItem) => void;
  // Per-file pipeline supplied by the consumer (06-03) so this module stays
  // free of API dependencies:
  readonly runOne: (item: UploadQueueItem, signal: { aborted: boolean }) => Promise<void>;
}

export interface UploadQueueHandle {
  readonly add: (files: readonly File[]) => readonly UploadQueueItem[];
  readonly retry: (id: string) => void;
  readonly cancelAll: () => void;
}

// ---------------------------------------------------------------------------
// xhrUpload — reusable XHR helper used by 06-03 inside its runOne impl
// ---------------------------------------------------------------------------

export function xhrUpload(args: {
  readonly url: string;
  readonly blob: Blob;
  readonly contentType: string;
  readonly onProgress: (ratio: number) => void;
  readonly signal?: { aborted: boolean };
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', args.url);
    xhr.setRequestHeader('Content-Type', args.contentType);
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) args.onProgress(e.loaded / e.total);
    });
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.onabort = () => reject(new Error('Aborted'));
    if (args.signal?.aborted) {
      xhr.abort();
      return;
    }
    xhr.send(args.blob);
  });
}

// ---------------------------------------------------------------------------
// createUploadQueue
// ---------------------------------------------------------------------------

export function createUploadQueue(opts: CreateUploadQueueOptions): UploadQueueHandle {
  const concurrency = opts.concurrency ?? 3;
  const { onItemUpdate, runOne } = opts;

  // Internal state — never exposed directly; callers receive copies via onItemUpdate
  const items = new Map<string, UploadQueueItem>();
  const limit = pLimit(concurrency);

  // Shared abort signal — cancelAll() flips this to true
  const abortFlag = { aborted: false };

  function updateItem(id: string, status: UploadStatus): UploadQueueItem {
    const prev = items.get(id)!;
    // Immutable update: spread prev, replace status
    const next: UploadQueueItem = { ...prev, status };
    items.set(id, next);
    onItemUpdate(next);
    return next;
  }

  function scheduleOne(item: UploadQueueItem): void {
    void limit(async () => {
      for (let attempt = 0; attempt <= MAX_AUTO_RETRIES; attempt++) {
        try {
          await runOne(item, abortFlag);
          return; // success — runOne sets terminal state (done) via its onProgress->updateItem path
        } catch (err) {
          // Operator-cancelled — bail without re-scheduling.
          if (abortFlag.aborted) return;

          const klass = classifyError(err);
          // Terminal OR exhausted retries -> flip to failed and stop.
          if (klass !== 'transient' || attempt === MAX_AUTO_RETRIES) {
            const reason = err instanceof Error ? err.message : String(err);
            updateItem(item.id, { kind: 'failed', reason });
            return;
          }

          // Transient + room to retry — surface countdown state, then back off.
          const delay = BACKOFF_MS[attempt]!;
          updateItem(item.id, {
            kind: 'retrying',
            attempt: attempt + 1,
            nextAttemptAt: Date.now() + delay,
          });
          await sleep(delay);
          if (abortFlag.aborted) return;
        }
      }
    });
  }

  function add(files: readonly File[]): readonly UploadQueueItem[] {
    const seeded = files.map((file): UploadQueueItem => {
      const id = crypto.randomUUID();
      const item: UploadQueueItem = { id, file, status: { kind: 'queued' } };
      items.set(id, item);
      return item;
    });

    // Emit initial state for each item, then schedule
    for (const item of seeded) {
      onItemUpdate(item);
      scheduleOne(item);
    }

    return seeded;
  }

  function retry(id: string): void {
    const item = items.get(id);
    if (!item || item.status.kind !== 'failed') return;
    const queued = updateItem(id, { kind: 'queued' });
    scheduleOne(queued);
  }

  function cancelAll(): void {
    abortFlag.aborted = true;
  }

  return { add, retry, cancelAll };
}
