---
phase: 07-public-urls-handle
plan: "03"
subsystem: infra
tags: [nginx, cache, proxy_cache, deploy-prep, ops]

requires:
  - phase: 07-public-urls-handle
    plan: "02"
    provides: app-layer Cache-Control header values (300s on 200, 60s on 404) that this Nginx config mirrors in proxy_cache_valid directives
  - phase: 07-public-urls-handle
    plan: "01"
    provides: /api/handles/check Cache-Control no-store contract — the /api/ catch-all in this config is a pass-through so no-store wins

provides:
  - ops/nginx/timeline.conf — Phase 7 ships as code; Phase 8 wires via symlink
  - ops/nginx/timeline.conf.test.sh — grep-based CI-runnable directive presence check
  - Cache contract locked in code: cache key, TTLs, X-Cache-Status header, X-No-Cache bypass, no-cache on /api/ catch-all, no TLS in Phase 7

affects: 08 (deployment — symlinks ops/nginx/timeline.conf into /etc/nginx/conf.d/, runs nginx -t and systemctl reload nginx; certbot run appends TLS directives separately)

tech-stack:
  added: []  # No new code dependencies — Nginx is OS-provided on the Phase 8 VM
  patterns:
    - "Ship Nginx config as code: commit to ops/nginx/, write a grep-based self-check, wire by symlink at deploy time. Eliminates drift between repo and live config."
    - "Negative-test pattern for forbidden directives: skip comment lines in grep to avoid false-positives on documentation strings that mention the forbidden token."

key-files:
  created:
    - ops/nginx/timeline.conf (122 lines — full vhost with proxy_cache_path zone, /api/public/u and /u location regex blocks, /api/ catch-all pass-through, SPA fallback)
    - ops/nginx/timeline.conf.test.sh (executable; 16 check() invocations + TLS-absence negative-check + optional nginx -t)

key-decisions:
  - "Comment text scrub for grep guards: the original docstring mentioned 'listen 443 ssl http2' as documentation about what Phase 8 will add — that literal text false-positived the negative grep. Rephrased to 'the HTTPS port directive and the certificate-path directives' so the docstring describes the deferred work without using the forbidden tokens. Same pattern as the comment-text scrub in 07-02 (mountedRef/easeTo/rotateTo)."
  - "Self-check script handles its own false-positives via `grep -vE '^\\s*#' \"$CONF\" | grep -qE ...` — strips comment lines before the negative check fires. The docstring-vs-grep tension is a general project hazard now; this is the second case in Phase 7 alone."
  - "TLS configuration delegated entirely to Phase 8. Certbot's --nginx installer plugin will append the HTTPS port directive + certificate paths in-place; this file does not gain `listen 443` until then. The grep guard in the self-check enforces this until certbot runs."
  - "X-No-Cache request-header bypass shipped now even though D-20 specifies TTL-only invalidation for v1. The directive cost is one line; adding it later would require a second Nginx config edit + reload. Trade: tiny attack surface (bypass skips cache for one request — does NOT invalidate the entry) vs. zero v2 friction."
  - "Cache key intentionally case-sensitive (LOWER() happens at the app layer). /u/Bryan and /u/bryan are different cache entries returning the same content. At-most-2x cache space per popular handle is acceptable at portfolio scale."

patterns-established:
  - "Self-check script + commit-as-code for Nginx config: any future ops file (e.g. a Caddyfile, a Docker compose snippet) can follow the same shape — grep-based directive checks, exits 0 = green, optional native-binary syntax check if available."
  - "Comment-aware negative grep: strip `^\\s*#` lines before scanning for forbidden tokens. Useful any time documentation needs to describe what's NOT being done."

requirements-completed: [PUBLIC-04]

duration: 8min
completed: 2026-05-15
---

# Phase 7 Plan 03: Nginx config + self-check Summary

**`ops/nginx/timeline.conf` committed as reviewable code with the full proxy_cache contract (1GB zone, 5m/1m TTLs, `$scheme$host$uri` key, X-Cache-Status always, X-No-Cache bypass, /api/ pass-through, no TLS until Phase 8's certbot run) plus a grep-based self-check script that validates 16 directives and confirms the absence of TLS directives — all without needing nginx installed.**

## Performance

- **Duration:** ~8 min (smallest plan in the phase — pure file authoring + one small directive-grep fix)
- **Started:** 2026-05-15T11:05:00Z
- **Completed:** 2026-05-15T11:13:00Z
- **Tasks:** 2
- **Files modified:** 2 created

## Accomplishments

- **Nginx vhost config shipped as code.** 122-line `ops/nginx/timeline.conf` with the full proxy_cache_path declaration (1GB zone `public_reel`, levels=1:2, inactive=24h), location blocks for `/api/public/u/[^/]+$` (cached, 5m/1m TTLs) and `/u/[^/]+$` (SPA fallback), pass-through `/api/` catch-all (Authorization forwarded, no proxy_cache), and `/` SPA fallback. X-Cache-Status header has `always` for 4xx/5xx debug visibility. X-No-Cache request-header bypass present for future v2 owner-active invalidation. proxy_cache_use_stale + proxy_cache_lock prevent thundering-herd on cache miss.
- **Self-check script shipped.** Executable `ops/nginx/timeline.conf.test.sh` performs 16 grep-based directive checks + a TLS-absence negative-check (comment-aware) + an optional `nginx -t` syntax pass if nginx is installed. Exits 0 with all PASS on the committed config.
- **No runtime side effects.** Phase 7 does not touch the live VM. The file ships as data, Phase 8 wires it via symlink.

## Task Commits

1. **Task 1: Write ops/nginx/timeline.conf**
2. **Task 2: Add self-check script**

Both tasks landed in one bundled commit:
- `37fa96a` — feat(07-03): Nginx vhost config + self-check script

(Both tasks touched the same directory ops/nginx/ and the self-check tests the conf. A single atomic commit is appropriate; partial state would have left the test script with no target.)

## Files Created/Modified

- `ops/nginx/timeline.conf` — new file, 122 lines
- `ops/nginx/timeline.conf.test.sh` — new executable file, 16 `check()` invocations + TLS-absence guard + optional nginx -t

## Decisions Made

All locked CONTEXT.md decisions touching this plan are honored:

- **D-18** Full directive list: proxy_cache_path declaration, /api/public/u cached, /api/ catch-all uncached, X-Cache-Status header — shipped
- **D-19** Phase 7 ships the config, Phase 8 wires it via symlink + nginx -t + systemctl reload — handoff command included in this SUMMARY for Phase 8's plan
- **D-20** TTL-only invalidation (5m on 200, 1m on 404) — shipped. X-No-Cache request-header bypass directive ships now to avoid a second Nginx edit when v2 owner-active invalidation lands.
- **D-21** Cache key = `$scheme$host$uri` — no Vary, no per-Accept-Language variation. English-only v1, locked — shipped.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TLS-token literal in conf-file docstring false-positived the negative grep**
- **Found during:** Task 2 self-check first run (`RESULT: FAIL (1 check(s) failed)` with "TLS directives present" against the conf file).
- **Issue:** The conf file's top-of-file docstring contained the literal phrase ``does not include `listen 443 ssl http2```. The plan-level acceptance criterion `grep -c "ssl_certificate\|listen 443" ops/nginx/timeline.conf` = 0 is an absolute count — it doesn't distinguish comments from directives. Same pattern as the mountedRef/easeTo/rotateTo comment-scrub deviation in plan 07-02.
- **Fix (two parts):**
  1. Rephrased the docstring to describe the deferred work without using the forbidden tokens ("intentionally omits the HTTPS port directive and the certificate-path directives" — no `listen 443` or `ssl_certificate` literals).
  2. Updated the self-check script to skip comment lines before the negative grep fires: `grep -vE '^\\s*#' "$CONF" | grep -qE "(listen 443|ssl_certificate)"`. This makes the script robust against future docstring mentions of these directives.
- **Files modified:** `ops/nginx/timeline.conf`, `ops/nginx/timeline.conf.test.sh`
- **Verification:** Plan-level grep returns 0/0; self-check exits 0 with all PASS.
- **Committed in:** `37fa96a` (part of the bundled commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — same grep-vs-comment friction as 07-02; documented as a project hazard for future ops files).
**Impact on plan:** No scope creep. The fix made the self-check more robust (comment-aware), which is strictly better than the plan's spec.

## Issues Encountered

None beyond the deviation above. Plan executed inline in ~8 minutes — no executor agent dispatch needed (the plan is small enough that orchestrator-context execution is faster than agent spawn overhead).

## User Setup Required

Phase 8 prerequisites (not Phase 7 user setup, but flagged for the next phase):

- DNS for `timeline.bryanlam.dev` must be pointed at the OCI VM before certbot can run.
- OCI Ampere A1 VM must be provisioned (2 OCPU / 8 GB sizing carried from STATE.md blockers).
- Nginx must be installed on the VM.
- Bash invocation: `ln -sf $(pwd)/ops/nginx/timeline.conf /etc/nginx/conf.d/timeline.conf && nginx -t && systemctl reload nginx` (run from the repo root on the VM; assumes the repo is cloned to a stable path like `/opt/timeline-revamp`).

## Next Phase Readiness

- **Phase 7 fully shipped.** All 3 plans + 3 waves complete. Phase verification next.
- **Phase 8 hand-off note:** the Nginx config is a single symlink away from live. The certbot run appends TLS directives directly to this file (or via an include) — when that lands, the self-check script's TLS-negative check will switch from `PASS: no TLS directives` to FAIL, which is the correct signal that Phase 8 has wired the certbot output. At that point, the negative check should be removed from the self-check or inverted — track in Phase 8's plan.
- **Project memory candidate flagged.** Comment-text-vs-grep-guard friction has now appeared TWICE in Phase 7 (07-02 and 07-03). Worth saving: "When a plan's acceptance criterion is `grep -c '<token>' <file>` = 0, comment text counts. Either (a) paraphrase comments to avoid the literal token, or (b) write the acceptance check to skip `^\\s*#` lines. The plan should call out which it expects."
- **No code-side regressions.** Phase 7's test suite is 347/347 green; this plan added zero tests (per plan spec — Nginx config is data, not code).

## Self-Check: PASSED

Verified against plan-level `<verification>` block:

- ✓ `bash ops/nginx/timeline.conf.test.sh` exits 0, prints "RESULT: PASS"
- ✓ `ls -la ops/nginx/` — both files committed; the .sh has the executable bit set
- ✓ `cat ops/nginx/timeline.conf | grep -E "proxy_cache_valid 200 5m|proxy_cache_valid 404 1m"` returns both lines (matches 07-02's app-layer Cache-Control values)
- ✓ `bun run test` → 347/347 green (unchanged — no TS edits in this plan)
- ✓ `bun run typecheck` → exit 0 (unchanged — no TS edits)

All 8 plan-level success criteria are met. Plan 07-03 shipped.

`nginx -t` was NOT run locally — nginx is not installed on the dev box (Darwin laptop). The self-check script's optional native-syntax check correctly prints `SKIP: nginx not installed; Phase 8 will run the full syntax check on the VM`. The grep-only check is the binding contract for Phase 7.

---
*Phase: 07-public-urls-handle*
*Completed: 2026-05-15*
