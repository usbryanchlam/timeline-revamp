import { z } from 'zod';

// Zod schemas for /api/cities request bodies. CONVENTIONS.md: "Zod is
// the schema validator at every boundary." Both schemas use .strict() to
// reject unknown keys — this is what enforces server-authoritative
// order_index. Without .strict(), a client could POST { order_index: 0 }
// and a naive insert.values(body) would honor it.
//
// Server-controlled fields (id, userId, orderIndex, createdAt, updatedAt)
// are absent by construction — .strict() rejects any attempt to send them.
export const createCitySchema = z.object({
  name: z.string().trim().min(1).max(200),
  tripLabel: z.string().trim().max(200).nullish(),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  // Defaults match the cinematic-but-flat camera profile from seeded-cities.ts.
  zoom: z.number().gte(0).lte(22).default(12),
  pitch: z.number().gte(0).lte(85).default(50),
  bearing: z.number().gte(-180).lte(180).default(0),
  arrivedAt: z.coerce.date(),
  caption: z.string().max(500).nullish(),
}).strict();

export type CreateCityInput = z.infer<typeof createCitySchema>;

// PATCH: every field optional, .strict() still applies. order_index updates
// happen only via /api/cities/reorder (Plan 05-03), never here.
export const updateCitySchema = createCitySchema.partial().strict();
export type UpdateCityInput = z.infer<typeof updateCitySchema>;
