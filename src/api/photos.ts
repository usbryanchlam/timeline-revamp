import type { useApi } from '@/auth/useApi';

export interface PhotoDTO {
  readonly id: string;
  readonly masterUrl: string;
  readonly thumbUrl: string;
  readonly orderIndex: number;
}

export interface UploadUrlResponse {
  readonly photoId: string;
  readonly uploadUrl: string;
}

export interface FinalizeResponse {
  readonly id: string;
  readonly masterUrl: string;
  readonly thumbUrl: string;
}

type Api = ReturnType<typeof useApi>;

async function readErrorCode(res: Response): Promise<string | null> {
  try {
    const b = (await res.json()) as { error?: string } | null;
    return b?.error ?? null;
  } catch {
    return null;
  }
}

export async function listPhotos(api: Api, cityId: string): Promise<readonly PhotoDTO[]> {
  const res = await api(`/api/cities/${cityId}/photos`);
  if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
  return (await res.json()) as readonly PhotoDTO[];
}

export async function requestUploadUrl(
  api: Api,
  cityId: string,
  body: { contentType: 'image/jpeg' | 'image/png'; sizeBytes: number },
): Promise<UploadUrlResponse> {
  const res = await api(`/api/cities/${cityId}/photos/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const code = await readErrorCode(res);
    throw new Error(code ?? `API ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as UploadUrlResponse;
}

export async function finalizePhoto(api: Api, photoId: string): Promise<FinalizeResponse> {
  const res = await api(`/api/photos/${photoId}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const code = await readErrorCode(res);
    throw new Error(code ?? `API ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as FinalizeResponse;
}

export async function deletePhoto(api: Api, photoId: string): Promise<void> {
  const res = await api(`/api/photos/${photoId}`, { method: 'DELETE' });
  if (!res.ok) {
    const code = await readErrorCode(res);
    throw new Error(code ?? `API ${res.status} ${res.statusText}`);
  }
}
