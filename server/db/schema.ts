// ─── DATA-02 OWNERSHIP NOTICE ─────────────────────────────────────────
// The deferrable UNIQUE CONSTRAINT on cities (user_id, order_index) is
// NOT declared in this schema file. It lives in a hand-authored custom
// migration: server/db/migrations/0001_cities_deferrable_unique.sql.
//
// Why: Drizzle's pg-core only models unique INDEXes, and Postgres does
// NOT allow CREATE UNIQUE INDEX to be DEFERRABLE — only ALTER TABLE ...
// ADD CONSTRAINT ... UNIQUE (...) DEFERRABLE INITIALLY DEFERRED works.
// If we declared `uniqueIndex(...)` here, Drizzle Kit would diff against
// the live DB on every `bun run db:generate` (Phase 5 reorder, Phase 6
// photos, etc.), see "no index", and silently re-introduce a
// non-deferrable unique INDEX — breaking DATA-03's reorder transaction.
//
// By OMITTING the constraint from schema.ts, Drizzle has nothing to
// diff against and the custom migration stays put across all future
// schema changes. See REQUIREMENTS.md DATA-02.
// ──────────────────────────────────────────────────────────────────────

import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  doublePrecision,
  jsonb,
} from 'drizzle-orm/pg-core';

// ─── users ────────────────────────────────────────────────────────────
// Lazy-provisioned on first authenticated /api/me call (AUTH-03).
// Plan 04-02 writes the upsert; this plan only defines the table.
// `handle` is nullable because users get an account before they pick one
// (the picker UI in 04-02 fills it in). `auth0_sub` is the immutable Auth0
// user ID — used as the upsert key.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  auth0Sub: text('auth0_sub').notNull().unique(),
  email: text('email').notNull(),
  handle: text('handle').unique(), // NULL until picker UI runs (AUTH-07)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── cities ──────────────────────────────────────────────────────────
// FK cascade: ON DELETE CASCADE — when a user deletes their account,
// their cities die with them. (Account deletion UI is v2 per PROJECT.md
// out-of-scope, but the cascade rule is the schema-level commitment.)
//
// The unique (user_id, order_index) constraint is owned by the custom
// migration 0001_cities_deferrable_unique.sql. Do NOT add a uniqueIndex
// declaration here — see top-of-file ownership notice.
export const cities = pgTable('cities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  orderIndex: integer('order_index').notNull(),
  name: text('name').notNull(),
  tripLabel: text('trip_label'), // optional grouping string ("Trips" entity is v2)
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  zoom: doublePrecision('zoom').notNull(),
  pitch: doublePrecision('pitch').notNull(),
  bearing: doublePrecision('bearing').notNull(),
  arrivedAt: timestamp('arrived_at', { withTimezone: true }).notNull(),
  caption: text('caption'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── photos ──────────────────────────────────────────────────────────
// FK cascade: ON DELETE CASCADE on city_id — deleting a city deletes
// its photos. (Bucket-side cleanup is a Phase 6 problem, not a schema one.)
// Photo upload pipeline (DATA-05/06/07) lands in Phase 6; this table
// exists now because DATA-01 says all four tables ship in Phase 4.
export const photos = pgTable('photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  cityId: uuid('city_id')
    .notNull()
    .references(() => cities.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull(), // OCI Object Storage key (Phase 6)
  thumbKey: text('thumb_key'),
  width: integer('width'),
  height: integer('height'),
  sizeBytes: integer('size_bytes'),
  caption: text('caption'),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── notifications ───────────────────────────────────────────────────
// FK cascade: ON DELETE CASCADE on user_id. Used by MP4 export polling
// (Phase 10) — user gets a notification row when render completes/fails.
// `payload` is jsonb because schemas vary by `kind` (mp4_ready vs mp4_failed
// vs future kinds). `read_at` nullable; null = unread.
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Type exports — Drizzle's typeof helpers. Used by upcoming handlers
// and by the lazy-provisioning code in plan 04-02.
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type City = typeof cities.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
