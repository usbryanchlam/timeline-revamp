#!/usr/bin/env bash
# Lighthouse mobile baseline for the public reel ('/').
#
# Runs against `bun run preview` (NOT `bun run dev` — see Pitfall 5 in
# 11-RESEARCH.md: dev mode disables minification, code-splitting, and the
# production-only `import.meta.env.DEV` literal replacement, so the perf
# numbers from dev are meaningless as a v1.0.0 baseline).
#
# Outputs:
#   docs/lighthouse/v1.0.0-baseline.json
#   docs/lighthouse/v1.0.0-baseline.html
#
# Symlinks the timestamped run to the stable filenames so v1.0.0-baseline.json
# is always the latest run while history is preserved on disk.

set -euo pipefail

readonly LH_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly LH_OUT_DIR="${LH_REPO_ROOT}/docs/lighthouse"
readonly LH_RUN_TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
readonly LH_RUN_BASENAME="v1.0.0-baseline-${LH_RUN_TS}"
readonly LH_STABLE_BASENAME="v1.0.0-baseline"
readonly LH_PORT=4173
readonly LH_URL="http://localhost:${LH_PORT}/"

mkdir -p "${LH_OUT_DIR}"

echo "==> Starting preview server on :${LH_PORT}"
# Use vite preview directly (bypasses tsc, which trips on pre-existing 11-01
# typecheck errors in test files — see deferred-items.md).
bunx vite preview --host --port "${LH_PORT}" > /tmp/lh-preview.log 2>&1 &
PREVIEW_PID=$!

# Ensure the preview server is killed on script exit (success OR error).
cleanup() {
  if kill -0 "${PREVIEW_PID}" 2>/dev/null; then
    echo "==> Stopping preview server (pid=${PREVIEW_PID})"
    kill "${PREVIEW_PID}" 2>/dev/null || true
    wait "${PREVIEW_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "==> Waiting for preview server to respond"
for i in {1..30}; do
  if curl -sf "${LH_URL}" -o /dev/null; then
    echo "    preview server up after ${i}s"
    break
  fi
  sleep 1
done

if ! curl -sf "${LH_URL}" -o /dev/null; then
  echo "ERROR: preview server did not respond within 30s"
  cat /tmp/lh-preview.log
  exit 1
fi

echo "==> Running Lighthouse mobile audit against ${LH_URL}"
bunx lighthouse "${LH_URL}" \
  --form-factor=mobile \
  --screenEmulation.mobile \
  --screenEmulation.width=375 \
  --screenEmulation.height=667 \
  --screenEmulation.deviceScaleFactor=2 \
  --throttling.cpuSlowdownMultiplier=4 \
  --throttling-method=simulate \
  --output=json \
  --output=html \
  --output-path="${LH_OUT_DIR}/${LH_RUN_BASENAME}" \
  --chrome-flags="--headless=new --no-sandbox" \
  --quiet

# Symlink the latest timestamped run to the stable filenames.
echo "==> Symlinking latest run to ${LH_STABLE_BASENAME}.{json,html}"
ln -sf "${LH_RUN_BASENAME}.report.json" "${LH_OUT_DIR}/${LH_STABLE_BASENAME}.json"
ln -sf "${LH_RUN_BASENAME}.report.html" "${LH_OUT_DIR}/${LH_STABLE_BASENAME}.html"

echo "==> Done. Baseline at ${LH_OUT_DIR}/${LH_STABLE_BASENAME}.{json,html}"
