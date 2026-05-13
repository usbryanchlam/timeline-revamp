import { describe, it, expect } from 'vitest';
import { listPhotos, requestUploadUrl, finalizePhoto, deletePhoto } from './photos.js';
import type { useApi } from '@/auth/useApi';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApi(impl: (input: string, init?: RequestInit) => Promise<Response>) {
  return impl as ReturnType<typeof useApi>;
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// listPhotos
// ---------------------------------------------------------------------------

describe('listPhotos', () => {
  it('resolves to PhotoDTO[] when API returns 200', async () => {
    const payload = [
      { id: 'p1', masterUrl: 'https://example.com/master.jpg', thumbUrl: 'https://example.com/thumb.jpg', orderIndex: 0 },
    ];
    const api = makeApi(async () => jsonRes(payload, 200));
    const result = await listPhotos(api, 'city-1');
    expect(result).toEqual(payload);
  });

  it('throws Error with status on non-2xx response', async () => {
    const api = makeApi(async () => new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' }));
    await expect(listPhotos(api, 'city-1')).rejects.toThrow('API 500');
  });

  it('calls the correct URL', async () => {
    let capturedUrl = '';
    const api = makeApi(async (input) => {
      capturedUrl = input as string;
      return jsonRes([], 200);
    });
    await listPhotos(api, 'city-abc');
    expect(capturedUrl).toBe('/api/cities/city-abc/photos');
  });
});

// ---------------------------------------------------------------------------
// requestUploadUrl
// ---------------------------------------------------------------------------

describe('requestUploadUrl', () => {
  it('POSTs JSON body { contentType, sizeBytes } to the correct URL', async () => {
    let capturedUrl = '';
    let capturedBody: unknown;
    const api = makeApi(async (input, init) => {
      capturedUrl = input as string;
      capturedBody = JSON.parse(init?.body as string) as unknown;
      return jsonRes({ photoId: 'photo-1', uploadUrl: 'https://oci.example.com/upload' }, 201);
    });
    await requestUploadUrl(api, 'city-1', { contentType: 'image/jpeg', sizeBytes: 1024 });
    expect(capturedUrl).toBe('/api/cities/city-1/photos/upload-url');
    expect(capturedBody).toEqual({ contentType: 'image/jpeg', sizeBytes: 1024 });
  });

  it('returns { photoId, uploadUrl } from a 201 response', async () => {
    const api = makeApi(async () =>
      jsonRes({ photoId: 'photo-1', uploadUrl: 'https://oci.example.com/upload' }, 201),
    );
    const result = await requestUploadUrl(api, 'city-1', { contentType: 'image/jpeg', sizeBytes: 1024 });
    expect(result.photoId).toBe('photo-1');
    expect(result.uploadUrl).toBe('https://oci.example.com/upload');
  });

  it('throws "photo_limit_reached" when body.error === "photo_limit_reached" (422)', async () => {
    const api = makeApi(async () =>
      jsonRes({ error: 'photo_limit_reached' }, 422),
    );
    await expect(
      requestUploadUrl(api, 'city-1', { contentType: 'image/jpeg', sizeBytes: 1024 }),
    ).rejects.toThrow('photo_limit_reached');
  });

  it('throws on 404', async () => {
    const api = makeApi(async () =>
      new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } }),
    );
    await expect(
      requestUploadUrl(api, 'bad-city', { contentType: 'image/jpeg', sizeBytes: 1024 }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// finalizePhoto
// ---------------------------------------------------------------------------

describe('finalizePhoto', () => {
  it('POSTs to /api/photos/:id/finalize and returns { id, masterUrl, thumbUrl }', async () => {
    let capturedUrl = '';
    const payload = { id: 'photo-1', masterUrl: 'https://example.com/master.jpg', thumbUrl: 'https://example.com/thumb.jpg' };
    const api = makeApi(async (input) => {
      capturedUrl = input as string;
      return jsonRes(payload, 200);
    });
    const result = await finalizePhoto(api, 'photo-1');
    expect(capturedUrl).toBe('/api/photos/photo-1/finalize');
    expect(result).toEqual(payload);
  });

  it('throws "already_finalized" on 409 with that error code', async () => {
    const api = makeApi(async () =>
      jsonRes({ error: 'already_finalized' }, 409),
    );
    await expect(finalizePhoto(api, 'photo-1')).rejects.toThrow('already_finalized');
  });
});

// ---------------------------------------------------------------------------
// deletePhoto
// ---------------------------------------------------------------------------

describe('deletePhoto', () => {
  it('returns void on 204', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    const api = makeApi(async (input, init) => {
      capturedUrl = input as string;
      capturedMethod = init?.method ?? '';
      return new Response(null, { status: 204 });
    });
    const result = await deletePhoto(api, 'photo-1');
    expect(result).toBeUndefined();
    expect(capturedUrl).toBe('/api/photos/photo-1');
    expect(capturedMethod).toBe('DELETE');
  });

  it('throws on 404', async () => {
    const api = makeApi(async () =>
      jsonRes({ error: 'not_found' }, 404),
    );
    await expect(deletePhoto(api, 'photo-1')).rejects.toThrow();
  });
});
