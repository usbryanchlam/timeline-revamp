---
phase: 09-deploy-part-2-empty-error-states
plan: 01
subsystem: infra
tags: [ci-cd, github-actions, ocir, docker-buildx, ssh-deploy, appleboy-ssh-action, hono]

# Dependency graph
requires:
  - phase: 08.1-infra-terraform
    provides: "OCI VM with Reserved Public IP 64.181.252.226, ubuntu user, docker installed; /opt/timeline-revamp clone target pre-created"
  - phase: 08-deploy-part-1
    provides: "docker-compose.prod.yml structure (postgres delta + api service), Dockerfile (oven/bun:1-alpine), infra/DEPLOY.md manual runbook scaffolding"
provides:
  - "Tag-driven CI/CD pipeline (.github/workflows/deploy.yml) with three triggers: PR verify-only, main-push build+push, tag-push full deploy"
  - "linux/arm64 buildx pipeline targeting OCIR with GHA cache (mode=max)"
  - "Tag-match guard: vX.Y.Z must equal v$(node -p require('./package.json').version)"
  - "SSH-in deploy via appleboy/ssh-action@v1 with set -euo pipefail discipline, migrate-before-up, --password-stdin OCIR login, post-deploy docker logout"
  - "production GitHub environment reviewer gate + concurrency: cancel-in-progress: false"
  - "workflow_dispatch rollback path with <5 min recovery target"
  - "docker-compose.prod.yml image-pin (image: not build:) for tag-pin rollback discipline"
  - "infra/DEPLOY.md ## CI/CD runbook (prereqs, secrets/vars tables, standard deploy, rollback, troubleshooting)"
affects:
  - "09-02 (server middleware: requestId + onError) — same workflow ships these once added"
  - "09-03 (empty/error UX) — same workflow ships these once added"
  - "Future micro-phase: OIDC Identity Propagation Trust + provider-pin bump replaces OCIR auth token with OIDC token exchange"

# Tech tracking
tech-stack:
  added:
    - "oven-sh/setup-bun@v2 (Bun 1.3.12 on GHA runner)"
    - "docker/setup-qemu-action@v3 + docker/setup-buildx-action@v3 (cross-arch arm64 build on ubuntu-latest)"
    - "docker/login-action@v3 + docker/build-push-action@v6 (OCIR push with GHA layer cache)"
    - "appleboy/ssh-action@v1 (SSH-in deploy with envs: passthrough)"
  patterns:
    - "Three-trigger CI/CD: PR=verify, main=build+push, tag=full deploy (CONTEXT D-trigger-model)"
    - "Tag-match guard fail-fast against package.json.version drift (T-09-01-04)"
    - "concurrency: cancel-in-progress: false — queued deploys WAIT, never cancel mid-flight (terraform.yml.deferred analog)"
    - "--env-file .env --env-file .env.tag ordering (last wins) for IMAGE_TAG override (RESEARCH Pitfall 3)"
    - "Migrate BEFORE up -d (no race; terraform-analog migration discipline)"
    - "--password-stdin docker login + trailing docker logout (clears /root/.docker/config.json between runs)"
    - "appleboy/ssh-action envs: passthrough — secrets piped from GHA env, masked in logs"
    - "Floating major-version action pins (@v4, @v3, @v6, @v1) per RESEARCH Open Question 2"

key-files:
  created:
    - ".github/workflows/deploy.yml — 168 lines; three-job verify→build-and-push→deploy chain"
  modified:
    - "docker-compose.prod.yml — api service switched from build: + 4 VITE_* args to image: ${OCIR_REGISTRY}/${OCIR_REPO}:${IMAGE_TAG}; header comment now documents --env-file .env --env-file .env.tag CI/CD invocation"
    - "infra/DEPLOY.md — replaced stub '## Phase 9 — what changes from this runbook' with full ## CI/CD section (137 net new lines: prereqs, secrets/vars tables, standard deploy, rollback, troubleshooting)"

key-decisions:
  - "Tag-only deploys (not main-push) — semver tag is the explicit deploy intent signal; main-push only builds + pushes main-<sha> + latest"
  - "Single :vX.Y.Z tag on tag-push (NOT also :latest) — latest mirrors main, never tags, per CONTEXT image-tag scheme and T-09-01-08 (tag-pin rollback discipline)"
  - "verify job skipped on workflow_dispatch — rollback redeploys already-verified images, no re-test needed"
  - "build-and-push gated on github.event_name == 'push' — PRs only run verify, never touch OCIR"
  - "production environment reviewer gate retained — symmetry with terraform.yml.deferred apply gate; CONTEXT 'default: yes, can disable later'"
  - "docker logout as LAST script command — defense-in-depth extension of T-09-01-02; token re-caches on every deploy via login --password-stdin"
  - "Bun 1.3.12 pinned on GHA runner — matches oven/bun:1-alpine Dockerfile base"

patterns-established:
  - "GHA action version pin convention: floating major (@v4, @v6, @v1) — documented precedent from terraform.yml.deferred"
  - "set -euo pipefail as MANDATORY first line of every multi-line run: | and appleboy script: | block (RESEARCH Pitfall 2)"
  - "Comment-filtered grep guards for acceptance criteria: grep -v '^[[:space:]]*#' before counting matches (MEMORY feedback_grep_guard_vs_comments)"
  - ".env.tag overlay pattern: deploy step writes IMAGE_TAG to .env.tag; compose --env-file .env --env-file .env.tag merges last-wins"

requirements-completed: [DEPLOY-03, DEPLOY-04]

# Metrics
duration: ~22min
completed: 2026-06-01
---

# Phase 09 Plan 01: CI/CD Pipeline Summary

**Tag-driven GHA CI/CD shipping the Hono+Vite app to OCI via OCIR (arm64 buildx) and appleboy/ssh-action deploy with migrate-before-up, /api/health smoke, and workflow_dispatch rollback.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-06-01T22:17:00Z (worktree branch base correction completed first)
- **Completed:** 2026-06-01T22:38:56Z
- **Tasks:** 3 / 3
- **Files modified:** 3 (1 created, 2 edited)

## Accomplishments

- Shipped the full tag-driven CI/CD workflow that mirrors `terraform.yml.deferred`'s env-gate + concurrency pattern but uses OCIR auth token (not OIDC, per CONTEXT — OIDC trust deferred to its own micro-phase).
- Replaced docker-compose.prod.yml's local build with an image-pin reference to OCIR (`${OCIR_REGISTRY}/${OCIR_REPO}:${IMAGE_TAG}`), enabling tag-pin rollback discipline.
- Documented the operator runbook end-to-end in `infra/DEPLOY.md` — prereqs (dedicated ed25519 deploy key, OCIR auth token, production environment reviewer, VITE_* build-time values), secrets/vars tables, standard deploy procedure, rollback via `gh workflow run deploy.yml -f tag=v0.x.y`, and four common troubleshooting branches.
- All STRIDE mitigations from the plan's threat register implemented as written (T-09-01-01 password-stdin, T-09-01-02 docker logout, T-09-01-03 dedicated key, T-09-01-04 tag-match guard, T-09-01-06 cancel-in-progress: false, T-09-01-08 :latest-never-in-deploy).

## Task Commits

Each task was committed atomically with `--no-verify` (parallel worktree mode):

1. **Task 1: Create .github/workflows/deploy.yml** — `cb933c3` (feat)
2. **Task 2: Switch docker-compose.prod.yml to image-pin** — `7d01f51` (feat)
3. **Task 3: Append ## CI/CD section to infra/DEPLOY.md** — `6430a2f` (docs)

_Plan metadata commit pending; will be added by execute-plan.md's commit_metadata step._

## Files Created/Modified

- `.github/workflows/deploy.yml` (NEW, 168 lines) — Three-job GHA workflow: verify (skipped on workflow_dispatch) → build-and-push (skipped on PR) → deploy (only on tag push or workflow_dispatch). Includes tag-match guard, GHA buildx cache (mode=max), 4 VITE_* build-args, SSH deploy with migrate-before-up, post-deploy /api/health curl smoke.
- `docker-compose.prod.yml` (EDIT) — api service: `build:` block + 4 VITE_* args replaced by single `image: ${OCIR_REGISTRY}/${OCIR_REPO}:${IMAGE_TAG}` line. Header comment block rewritten to document CI/CD invocation with `--env-file .env --env-file .env.tag` ordering. All runtime config preserved: loopback `127.0.0.1:8787:8787` bind, `./.oci:/app/.oci:ro` volume, `depends_on.postgres.condition: service_healthy`, `restart: always`.
- `infra/DEPLOY.md` (EDIT) — Old stub `## Phase 9 — what changes from this runbook` removed entirely. New `## CI/CD` section appended (137 net new lines) with: workflow trigger summary, 4-step prereq list, GitHub secrets table (4 entries) + variables table (6 entries), standard deploy bash block, rollback bash block + procedure list + <5 min target, four troubleshooting branches (tag-match guard fail, OCIR token expired, SSH timeout, /api/health smoke fail), notes section (no auto-rollback in v1, buildx warm/cold times, `latest` ≠ release tag clarification).

## Decisions Made

- **PKG_VERSION grep acceptance string** — the plan's acceptance criterion literal includes `$(` characters which require careful shell escaping. The file contains the exact required string (`PKG_VERSION=v$(node -p "require('./package.json').version")`) verified via `grep -F`. No deviation.
- **YAML validation tool** — the plan's `<verification>` section specified `python3 -c 'import yaml; ...'`, but this worktree's Python install lacks PyYAML. Used `ruby -r yaml` instead — same semantic validation (no schema check, just well-formedness). Both `deploy.yml` and `docker-compose.prod.yml` parse cleanly. Documented as Decision, not Deviation, since the plan explicitly allowed "if `actionlint` not installed locally, skip — the YAML parser above + GitHub's parser on push are the safety net."
- **VITE_AUTH0_AUDIENCE** — included as a build-arg even though Auth0 SPAs technically don't strictly require it client-side; it IS already in the prior docker-compose.prod.yml build-args block (see git history for the original file), so preserving the existing four-key set keeps the operator's mental model unchanged. Matches CONTEXT `<interfaces>` section.

## Deviations from Plan

None — plan executed exactly as written. Every locked literal (action pins, image path, tag-match guard logic, --env-file ordering, smoke-check curl flags, concurrency block, docker logout placement) was implemented verbatim per the plan's `<interfaces>` block and Task 1 "Locked rationale notes".

## Issues Encountered

- **Worktree branch base correction** — agent initial HEAD was at `02c520b` instead of the expected base `50db0eb`. Ran `git reset --hard 50db0eb` per the `<worktree_branch_check>` protocol; HEAD verified equal to expected base before any task work began. No work lost.
- **Python YAML lib unavailable** — `python3 -c 'import yaml'` fails on this worktree. Used `ruby -r yaml` as functional equivalent for the YAML well-formedness check in both task verifications. The plan's `<verification>` section already provides this as an acceptable fallback.

## User Setup Required

External services require manual configuration before the first tag-driven deploy. Per the plan's `user_setup` frontmatter and the new `infra/DEPLOY.md` `## CI/CD → Prerequisites` section, the operator must:

1. **Generate dedicated SSH key** (separate from operator's personal key):
   ```bash
   ssh-keygen -t ed25519 -f gha-deploy-key -C "gha-deploy-$(date +%Y%m%d)"
   ssh-copy-id -i gha-deploy-key.pub ubuntu@64.181.252.226
   ```
   Paste private key into GitHub repo secret `DEPLOY_SSH_KEY`. **Record the public-key fingerprint in the operator's audit log** (the SUMMARY can't capture it because the key is generated locally on the operator's laptop, not by this agent).

2. **Generate OCIR auth token** (OCI Console → Profile → Auth Tokens) and paste into repo secret `OCIR_AUTH_TOKEN`.

3. **Set repo secret `DEPLOY_HOST`** to `64.181.252.226` (Phase 8.1 Reserved Public IP).

4. **Set repo secret `VITE_MAPTILER_KEY`** to the existing MapTiler API key (same value as VM `.env`).

5. **Set repo variables**: `OCIR_USER` (`<tenancy-namespace>/<user-email>`), `OCI_REGION` (e.g. `iad`), `OCI_NAMESPACE` (tenancy namespace), `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE` (last three same values as VM `.env`).

6. **Create `production` GitHub environment** with required reviewer = `usbryanchlam` (repo owner).

7. **First tag push** (one-off):
   ```bash
   # package.json already at 0.1.0 — if shipping as 0.1.0, no bump needed.
   git tag v0.1.0
   git push origin v0.1.0
   ```
   Watch the workflow run UI and approve the `production` environment gate. Verify `curl -fsSL https://timeline.bryanlam.dev/api/health` returns 200 after deploy job goes green.

## First-Run Experience Notes for Operator

- A **vanilla deploy to the existing VM works immediately** — nginx + certbot are already hand-configured from Phase 8 cutover, so the SSH-in step (`docker compose pull && migrate && up -d`) succeeds against the running stack with zero infra prep beyond the secrets/vars/environment setup above.
- A **tag-driven rebuild from scratch** (e.g. `terraform taint` the VM, re-apply) currently still requires the F1.1 cloud-init fix that Plan 09-02 Task 3 ships. Until 09-02 lands, the rebuilt VM would fail `nginx -t` on first boot because the certbot TLS template files aren't pre-staged. CI/CD pipeline itself is unaffected — this is a substrate concern, not a deploy-pipeline concern.
- **GHA buildx cold-cache time** is 8–15 min (QEMU emulation of arm64 on x86 runners). Warm-cache (BuildKit layer cache hit) drops to 3–6 min. First PR after a `bun.lock` bump invalidates the dep-install layer and goes back to cold.
- **`actionlint` was NOT run** locally — the agent verified deploy.yml against the per-task grep gates + ruby YAML parser. The GHA-side schema check (which runs automatically when the workflow file is pushed to the default branch) is the second safety net. Per the plan, this is the documented acceptable validation path.

## Threat Surface Scan

No new threat surface introduced beyond what the plan's `<threat_model>` block enumerates. The deploy workflow does open a new network path (GHA runner → OCI VM port 22), but this path was already documented in the plan and threat-modeled (T-09-01-03 mitigation: dedicated ed25519 key; T-09-01-06 mitigation: concurrency gate).

## Self-Check: PASSED

**File existence:**
- `.github/workflows/deploy.yml` — FOUND
- `docker-compose.prod.yml` — FOUND (modified, contains image-pin)
- `infra/DEPLOY.md` — FOUND (contains `## CI/CD`, lacks stub heading)

**Commit existence (git log):**
- `cb933c3` (Task 1: feat deploy workflow) — FOUND
- `7d01f51` (Task 2: feat image-pin compose) — FOUND
- `6430a2f` (Task 3: docs CI/CD runbook) — FOUND

**Grep gates re-verified:**
- `appleboy/ssh-action@v1` — present (1 occurrence in deploy.yml, 1 in DEPLOY.md)
- `docker/build-push-action@v6` — present
- `platforms: linux/arm64` — present (in qemu setup + build step)
- `set -euo pipefail` — present in every multi-line run/script block
- `environment: production` — present (deploy job)
- `cancel-in-progress: false` — present (deploy job concurrency)
- `PKG_VERSION=v$(node -p` — present (tag-match guard)
- `bun run db:migrate` — present (line 160) BEFORE `up -d` (line 161)
- `docker logout "${OCIR_REGISTRY}"` — present as LAST script command (line 163)
- `curl --retry 5 --retry-delay 5 -fsSL https://timeline.bryanlam.dev/api/health` — present
- `image: ${OCIR_REGISTRY}/${OCIR_REPO}:${IMAGE_TAG}` — present (1 config occurrence in docker-compose.prod.yml)
- No `build:` key under api service in docker-compose.prod.yml — confirmed
- No `VITE_*:` build-arg keys under api in docker-compose.prod.yml — confirmed
- `## CI/CD` heading present in infra/DEPLOY.md
- `## Phase 9 — what changes from this runbook` stub REMOVED
- All 4 required secrets + 6 required vars listed in DEPLOY.md tables — confirmed
- `gh workflow run deploy.yml -f tag=` rollback example present
- `git tag -d v0.1.2` tag-recovery procedure present
- YAML validity confirmed via `ruby -r yaml` for both deploy.yml and docker-compose.prod.yml

## Next Phase Readiness

- Plan 09-02 (server middleware + F9 Auth0 custom claim + F1.1 cloud-init) and Plan 09-03 (empty/error UX) can now be shipped via this same deploy workflow once they merge.
- The pipeline does NOT trigger automatically on this plan's merge — there's no `v*` tag yet. Operator must perform the prerequisite setup (secrets/vars/environment) and push the first tag manually. The plan's `## User Setup Required` section above is the canonical checklist.
- No blockers for Plans 09-02 and 09-03 — they touch disjoint files (server/, src/, infra/cloud-init.yaml) and will commit cleanly through this same pipeline.

---
*Phase: 09-deploy-part-2-empty-error-states*
*Plan: 01*
*Completed: 2026-06-01*
