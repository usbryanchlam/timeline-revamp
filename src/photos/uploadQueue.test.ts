import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UploadQueueItem } from './uploadQueue.js';

// ---------------------------------------------------------------------------
// createUploadQueue — concurrency tests
// ---------------------------------------------------------------------------

describe('createUploadQueue', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('with concurrency=2, starts only 2 runOne invocations until one resolves', async () => {
    const { createUploadQueue } = await import('./uploadQueue.js');

    const pending = new Map<string, () => void>();
    const runOne = vi.fn().mockImplementation(
      (item: UploadQueueItem) =>
        new Promise<void>((resolve) => {
          pending.set(item.id, resolve);
        }),
    );

    const updates: UploadQueueItem[] = [];
    const queue = createUploadQueue({
      concurrency: 2,
      onItemUpdate: (item) => { updates.push(item); },
      runOne,
    });

    const files = [
      new File(['a'], 'a.jpg'),
      new File(['b'], 'b.jpg'),
      new File(['c'], 'c.jpg'),
      new File(['d'], 'd.jpg'),
    ];

    queue.add(files);

    // Let the microtask queue drain so p-limit dispatches initial batch
    await new Promise((r) => setTimeout(r, 10));

    // Only 2 runOne calls should be active
    expect(runOne).toHaveBeenCalledTimes(2);

    // Resolve the first one
    const firstId = [...pending.keys()][0]!;
    pending.get(firstId)!();
    pending.delete(firstId);

    await new Promise((r) => setTimeout(r, 10));

    // A 3rd should have started
    expect(runOne).toHaveBeenCalledTimes(3);
  });

  it('retry(id) re-queues a failed item and runs runOne again', async () => {
    const { createUploadQueue } = await import('./uploadQueue.js');

    const runOneCalls: string[] = [];
    let callCount = 0;

    const runOne = vi.fn().mockImplementation(async (item: UploadQueueItem) => {
      callCount++;
      runOneCalls.push(item.id);
      if (callCount === 1) {
        throw new Error('simulated failure');
      }
      // Second call succeeds
    });

    const updates: UploadQueueItem[] = [];
    const queue = createUploadQueue({
      concurrency: 3,
      onItemUpdate: (item) => { updates.push(item); },
      runOne,
    });

    const items = queue.add([new File(['x'], 'x.jpg')]);
    const id = items[0]!.id;

    await new Promise((r) => setTimeout(r, 20));

    // Item should be in failed state after the first runOne throws
    const matchingUpdates = updates.filter((u) => u.id === id);
    const failedUpdate = matchingUpdates[matchingUpdates.length - 1];
    expect(failedUpdate?.status.kind).toBe('failed');

    // Retry
    queue.retry(id);
    await new Promise((r) => setTimeout(r, 20));

    // runOne must have been called a second time for the same id
    expect(runOneCalls.filter((rid) => rid === id)).toHaveLength(2);
  });

  it('add returns items immediately with kind: "queued"', async () => {
    const { createUploadQueue } = await import('./uploadQueue.js');

    const runOne = vi.fn().mockResolvedValue(undefined);
    const queue = createUploadQueue({
      concurrency: 3,
      onItemUpdate: vi.fn(),
      runOne,
    });

    const items = queue.add([new File(['x'], 'x.jpg'), new File(['y'], 'y.jpg')]);
    expect(items).toHaveLength(2);
    expect(items[0]!.status.kind).toBe('queued');
    expect(items[1]!.status.kind).toBe('queued');
  });
});

// ---------------------------------------------------------------------------
// xhrUpload — progress and status tests
// ---------------------------------------------------------------------------

describe('xhrUpload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /**
   * Build a proper XHR mock class. Using `class` so that `new XMLHttpRequest()`
   * works correctly in node environment (arrow/plain fn implementations aren't
   * valid constructors per vitest's mock validation).
   */
  function buildXhrClass(opts: {
    progressEvents?: Array<{ loaded: number; total: number }>;
    status?: number;
    triggerError?: boolean;
    triggerAbort?: boolean;
  }) {
    const progressEvents = opts.progressEvents ?? [];
    const xhrStatus = opts.status ?? 200;
    const { triggerError = false, triggerAbort = false } = opts;

    class MockXHR {
      status = xhrStatus;
      onload: ((e: Event) => void) | null = null;
      onerror: ((e: Event) => void) | null = null;
      onabort: ((e: Event) => void) | null = null;

      private progressHandler: ((e: ProgressEvent) => void) | undefined;

      upload = {
        addEventListener: (eventName: string, handler: (e: ProgressEvent) => void) => {
          if (eventName === 'progress') {
            this.progressHandler = handler;
          }
        },
      };

      open = vi.fn();
      setRequestHeader = vi.fn();
      abort = vi.fn();

      send = (_blob: Blob) => {
        // Emit progress events synchronously before load/error
        for (const pe of progressEvents) {
          if (this.progressHandler) {
            this.progressHandler({
              lengthComputable: true,
              loaded: pe.loaded,
              total: pe.total,
            } as ProgressEvent);
          }
        }
        // Trigger completion callback
        if (triggerError) {
          this.onerror?.(new Event('error'));
        } else if (triggerAbort) {
          this.onabort?.(new Event('abort'));
        } else {
          this.onload?.(new Event('load'));
        }
      };
    }

    return MockXHR;
  }

  it('reports progress: 0.5 and 1.0 callbacks during a mocked upload', async () => {
    const { xhrUpload } = await import('./uploadQueue.js');

    vi.stubGlobal('XMLHttpRequest', buildXhrClass({
      progressEvents: [
        { loaded: 500, total: 1000 },
        { loaded: 1000, total: 1000 },
      ],
      status: 200,
    }));

    const progressValues: number[] = [];
    await xhrUpload({
      url: 'https://example.com/upload',
      blob: new Blob(['data']),
      contentType: 'image/jpeg',
      onProgress: (ratio) => { progressValues.push(ratio); },
    });

    expect(progressValues).toContain(0.5);
    expect(progressValues).toContain(1.0);
  });

  it('rejects on xhr.status 500 with "HTTP 500" message', async () => {
    const { xhrUpload } = await import('./uploadQueue.js');

    vi.stubGlobal('XMLHttpRequest', buildXhrClass({ status: 500 }));

    await expect(
      xhrUpload({
        url: 'https://example.com/upload',
        blob: new Blob(['data']),
        contentType: 'image/jpeg',
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow('HTTP 500');
  });

  it('rejects with "Network error" on xhr onerror', async () => {
    const { xhrUpload } = await import('./uploadQueue.js');

    vi.stubGlobal('XMLHttpRequest', buildXhrClass({ triggerError: true }));

    await expect(
      xhrUpload({
        url: 'https://example.com/upload',
        blob: new Blob(['data']),
        contentType: 'image/jpeg',
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow('Network error');
  });
});
