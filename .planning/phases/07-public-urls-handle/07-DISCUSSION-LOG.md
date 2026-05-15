# Phase 7: Public URLs + handle reservation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-14
**Phase:** 7-public-urls-handle
**Areas discussed:** Handle picker UX, Public read API surface, 1-city orbit camera, Nginx cache scope split

---

## Handle picker UX — trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Blocking modal on first /app/* visit | Modal fires immediately if `users.handle IS NULL`; cannot dismiss until claimed. Guarantees handle exists before any share. | ✓ |
| Inline banner on /app/me + nudge | Non-blocking banner; user can use /app/trips without one. Zero friction but users may forget. | |
| Required step before first city save | Picker blocks the city-save form. Ties claim to first real value moment but mixes concerns. | |

**User's choice:** Blocking modal on first /app/* visit
**Notes:** Selected via preview. The modal sits ABOVE the route content so layout doesn't flash on dismiss.

---

## Handle picker UX — uniqueness check

| Option | Description | Selected |
|--------|-------------|----------|
| Debounced live check | GET /api/handles/check returns availability; 300ms debounce; inline status icon. POST /api/me/handle is still authoritative. | ✓ |
| Submit-only validation | No live check; 409 on claim if taken. Simplest, worst UX. | |
| Client-side format + server uniqueness on submit | Live regex/reserved check using shared `RESERVED_HANDLES` Set; uniqueness only on submit. | |

**User's choice:** Debounced live check
**Notes:** Cache-Control: no-store on the check endpoint so Nginx can't serve a stale "available" between racers.

---

## Public read API surface — endpoint shape

| Option | Description | Selected |
|--------|-------------|----------|
| New GET /api/public/u/:handle one-shot | Single unauthenticated endpoint returns `{ user, cities, photos }`. Cache-friendly, one round-trip. | ✓ |
| Extend /api/cities + /api/photos with handle param + skip-auth | Reuses existing routes but doubles auth branching on every handler. Two round-trips. | |
| SSR-rendered HTML with embedded JSON | Server renders HTML with inlined JSON. Fastest LCP, but SSR plumbing not on roadmap until Phase 12. | |

**User's choice:** New GET /api/public/u/:handle one-shot
**Notes:** DTO shape matches existing `useCitiesQuery` + `useAllPhotos` so reel renderers are unchanged.

---

## Public read API surface — empty / 404 behavior

| Option | Description | Selected |
|--------|-------------|----------|
| 404 page for unknown handle, world-view + caption for 0 cities | Distinguishes "not a user" from "user without content" — different intents, different recovery. | ✓ |
| Same world-view + caption for both cases | Simplest, but hides the typo case. | |
| 404 for unknown, redirect to / for 0-cities | Bounces empty owners to generic landing. Loses handle context. | |

**User's choice:** 404 page for unknown handle, world-view + caption for 0 cities
**Notes:** New `NotFoundHandleRoute` distinct from generic `NotFoundRoute` — copy speaks specifically to "this handle doesn't exist".

---

## 1-city orbit camera (REEL-08) — motion shape

| Option | Description | Selected |
|--------|-------------|----------|
| Continuous 360° rotation at constant rate | 45°/s = 8s per full revolution; loops until user input. Simplest, predictable, matches Apple Weather hero shot. | ✓ |
| Single 8s ease-in-out half-orbit then hold | Cinematic finality but feels static after 8s. | |
| Slow continuous orbit + subtle pitch breathing | Most cinematic but pitch breathing reads as broken on low refresh-rate devices. | |

**User's choice:** Continuous 360° rotation at constant rate
**Notes:** No flyTo (only one city). Arrival pulse fires once on land, not on each loop. Photo cycling continues normally.

---

## 0-city empty state — camera

| Option | Description | Selected |
|--------|-------------|----------|
| Slow-rotating globe view, centered Pacific | Zoom 1 / pitch 0 / ~10°/s rotation. Feels alive without being noisy. Caption bottom-anchored. | ✓ |
| Static world view (no motion) | Zero risk of "broken" feel; dead-page energy. | |
| Slow zoom-in toward random ocean | Visually different but random feels arbitrary; not on-brand. | |

**User's choice:** Slow-rotating globe view, centered Pacific
**Notes:** prefers-reduced-motion → static globe at fixed bearing.

---

## Nginx cache scope split

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 7 ships the .conf file + cache contract; Phase 8 wires it on VM | Contract is code-reviewable now; Phase 8 minimal infra. Can't test end-to-end until VM exists. | ✓ |
| Defer entire Nginx work to Phase 8 | Cleaner Phase 7 scope but contract drift risk. | |
| App-layer Cache-Control headers only; Nginx pass-through | App-layer headers are weaker than Nginx-side key control. | |

**User's choice:** Phase 7 ships the .conf file + cache contract; Phase 8 wires it on VM
**Notes:** App also sets Cache-Control headers so the contract is double-anchored (app + Nginx). Phase 8 just symlinks `ops/nginx/timeline.conf` into `/etc/nginx/conf.d/`.

---

## Nginx cache — invalidation

| Option | Description | Selected |
|--------|-------------|----------|
| TTL-only (5m), no active invalidation | Zero coupling between mutations and cache; up to 5m staleness on owner edits. | ✓ |
| Authenticated mutation sends X-No-Cache to bypass + repopulate | Near-instant freshness; extra request per mutation, edge cases on failure. | |
| TTL + manual purge endpoint | Escape hatch but extra endpoint surface. | |

**User's choice:** TTL-only (5m), no active invalidation
**Notes:** Acceptable for portfolio scale. Recruiters won't refresh within 5 min; owner sees changes via authenticated /app/* view.

---

## Claude's Discretion

- TanStack Query key shape for `usePublicReel(handle)` — pick something consistent with `useCitiesQuery`.
- Modal entry-fade animation timing — DESIGN.md tokens apply; pick what feels right.
- 404 page exact copy.
- Whether `/api/handles/check` also returns the canonical lowercased form (to surface the transformation).
- Fetch primitive for live-uniqueness (TanStack Query vs raw fetch + AbortController).

## Deferred Ideas

- Real OG image rendering (PUBLIC-05) — Phase 12.
- Handle rename UI — v2.
- Owner-active cache invalidation — rejected; revisit if staleness complaints land.
- Admin purge endpoint — YAGNI for portfolio scale.
- 301 redirect for uppercase handles — plan decides whether to add now or defer.
- Live-uniqueness rate limiting — acceptable risk; could add IP rate limit in Phase 8.
- Display name / about-me field — v2.
- Per-photo public/private flag — v2.
- Static `/` landing page redesign — Phase 12.
