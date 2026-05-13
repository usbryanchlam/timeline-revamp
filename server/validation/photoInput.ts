import { z } from 'zod';

// Zod schemas for /api/photos request bodies. Both schemas use .strict()
// to reject unknown keys — this enforces server-authoritative fields
// (id, userId, status, masterKey, thumbKey, orderIndex, createdAt, updatedAt)
// are absent from any client-supplied body.

export const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png'] as const;
export const MAX_BYTES = 5_242_880; // 5 MB (DATA-06)
export const PER_CITY_LIMIT = 10;   // DATA-06

export const uploadUrlSchema = z.object({
  contentType: z.enum(ALLOWED_CONTENT_TYPES),
  sizeBytes: z.number().int().gte(1).lte(MAX_BYTES),
}).strict();
// cityId comes from URL path, not body — keeps the body minimal and prevents
// a body-cityId-vs-path-cityId mismatch class of bug.

export const finalizeSchema = z.object({}).strict();
// Body is empty — photoId comes from URL path. .strict() still rejects junk.

export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;
