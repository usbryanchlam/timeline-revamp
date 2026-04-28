# timeline-revamp

A reimagined travel-tracker, built from scratch. The original project lives at
`../timeline/` and is retained as reference only — this is not a migration.

> Timeline — your travels, as a movie.

## Status

W1 in progress. Cinematic mobile-first reel with a full gesture state machine
running on hardcoded seed data. Backend, auth, photo pipeline, MP4 export,
and deploy land in W4–W12.

## Stack

React 19 + TypeScript + Vite 7, MapLibre GL JS v5, Tailwind 3.4, bun.

Backend (W4+): Hono + Drizzle + Postgres, Auth0, OCI Object Storage,
Docker Compose on OCI Ampere A1. See `docs/plan.md` for the full lock.

## Docs

- [`DESIGN.md`](./DESIGN.md) — visual / UX design system. Read before any UI change.
- [`docs/plan.md`](./docs/plan.md) — master implementation plan, W1–W12 schedule, locked
  decisions. Snapshot of the gstack-canonical doc (primary lives in
  `~/.gstack/projects/usbryanchlam-timeline-revamp/`); resync after major plan changes.
- [`docs/test-plan.md`](./docs/test-plan.md) — affected pages, key interactions, edge
  cases for `/qa`. Same gstack-primary, copy-here pattern.
- [`TODOS.md`](./TODOS.md) — v2 backlog (everything explicitly cut from v1).

## Develop

```sh
bun install
bun run dev      # http://localhost:5173
bun run build
bun run typecheck
```
