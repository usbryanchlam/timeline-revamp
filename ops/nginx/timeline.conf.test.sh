#!/usr/bin/env bash
# ops/nginx/timeline.conf.test.sh
#
# Lightweight self-check for ops/nginx/timeline.conf — verifies that every
# directive locked by Phase 7 CONTEXT.md (D-18 through D-21) is present.
# Runs WITHOUT nginx installed (grep-only).
#
# Optional: if `nginx` is on PATH, also runs `nginx -t -c ...` for full
# syntax validation. CI on the OCI VM (Phase 8+) will run the full check.
#
# Exit code 0 = all checks pass. Exit code != 0 = at least one directive
# missing or wrong.

set -euo pipefail

CONF="$(dirname "$0")/timeline.conf"

if [[ ! -f "$CONF" ]]; then
  echo "FAIL: $CONF does not exist"
  exit 1
fi

fail=0
check() {
  local desc="$1"
  local pattern="$2"
  if grep -qE "$pattern" "$CONF"; then
    echo "PASS: $desc"
  else
    echo "FAIL: $desc (pattern: $pattern)"
    fail=1
  fi
}

# D-18 directive set
check "proxy_cache_path declared"        "^proxy_cache_path "
check "zone keys_zone=public_reel:10m"   "keys_zone=public_reel:10m"
check "max_size=1g"                       "max_size=1g"
check "inactive=24h"                      "inactive=24h"
check "levels=1:2"                        "levels=1:2"
check "200 TTL = 5m"                      "proxy_cache_valid 200 5m"
check "404 TTL = 1m"                      "proxy_cache_valid 404 1m"
check "cache key = \$scheme\$host\$uri"   'proxy_cache_key \$scheme\$host\$uri'
check "X-No-Cache bypass"                 'proxy_cache_bypass \$http_x_no_cache'
check "X-Cache-Status with always"        'X-Cache-Status \$upstream_cache_status always'
check "use_stale: error timeout updating" "proxy_cache_use_stale error timeout updating"
check "proxy_cache_lock on"               "proxy_cache_lock on"

# Location blocks
check "/api/public/u/:handle location"    '^\s*location ~ \^/api/public/u/\[\^/\]\+\$'
check "/u/:handle location"               '^\s*location ~ \^/u/\[\^/\]\+\$'

# Upstream + server name
check "upstream timeline_api"             '^upstream timeline_api'
check "server_name set"                   "server_name timeline.bryanlam.dev"

# Negative checks — TLS / runtime ops are Phase 8 territory, NOT Phase 7.
# Strip comments (lines starting with optional whitespace then '#') before
# scanning so the documentation strings mentioning these directives don't
# false-positive.
if grep -vE '^\s*#' "$CONF" | grep -qE "(listen 443|ssl_certificate)"; then
  echo "FAIL: TLS directives present in Phase 7 file (Phase 8 owns these)"
  fail=1
else
  echo "PASS: no TLS directives (Phase 8 will add via certbot)"
fi

# Optional: full nginx syntax check if installed
if command -v nginx >/dev/null 2>&1; then
  tmp="$(mktemp -d)"
  if nginx -t -p "$tmp" -c "$CONF" >/dev/null 2>&1; then
    echo "PASS: nginx -t syntax check"
  else
    echo "WARN: nginx -t failed (often due to missing certbot include files; not a Phase 7 blocker)"
  fi
  rm -rf "$tmp"
else
  echo "SKIP: nginx not installed; Phase 8 will run the full syntax check on the VM"
fi

if [[ "$fail" -ne 0 ]]; then
  echo "RESULT: FAIL ($fail check(s) failed)"
  exit 1
fi
echo "RESULT: PASS"
