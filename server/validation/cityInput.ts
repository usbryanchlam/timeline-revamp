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

// PATCH /api/cities/reorder body schema.
//
// Contract: the request MUST include EVERY one of the user's cities exactly
// once, with orderIndex values forming the exact set {0..n-1}. Zod catches
// the structural failures (duplicate ids, duplicate indices, gaps); the
// route handler catches the user-scoped failures (foreign id → 404,
// payload size != owned count → 422 must_include_all_cities).
//
// .strict() rejects any unknown top-level key. Each item is also strict
// via the nested z.object (no .passthrough() — Zod object is strict on
// nested objects by default for unknown-key rejection).
export const reorderSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    orderIndex: z.number().int().gte(0),
  })).min(1).superRefine((items, ctx) => {
    const ids = new Set<string>();
    const indices = new Set<number>();
    for (const it of items) {
      if (ids.has(it.id)) {
        ctx.addIssue({ code: 'custom', message: `duplicate id: ${it.id}`, path: ['items'] });
      }
      if (indices.has(it.orderIndex)) {
        ctx.addIssue({ code: 'custom', message: `duplicate orderIndex: ${it.orderIndex}`, path: ['items'] });
      }
      ids.add(it.id);
      indices.add(it.orderIndex);
    }
    // Indices must be exactly {0..n-1} — no gaps.
    const sorted = [...indices].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i) {
        ctx.addIssue({ code: 'custom', message: `orderIndex set must be 0..n-1; got gap at ${i}`, path: ['items'] });
        break;
      }
    }
  }),
}).strict();

export type ReorderInput = z.infer<typeof reorderSchema>;
