#!/usr/bin/env bash
# Re-run the red team proofs after the F-133 rework, without touching them.
# The fixture writes the tenant_sign_in flag rows directly, which the fix now
# refuses (RT-4), so a copy of the fixture sets the marker that
# public.set_tenant_sign_in sets. Nothing else in the proofs is changed.
set -uo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL:=postgres://postgres:postgres@localhost:5432/postgres}"
BASE="${DATABASE_URL%/*}"
bash redteam/f133/setup-db.sh >/dev/null
OUT=redteam/f133/after-fix
mkdir -p "$OUT"
awk '/^insert into public.feature_flags/ { print "select set_config('"'"'akana.tenant_sign_in_switch'"'"', '"'"'on'"'"', true);"; inflag=1 }
     { print }
     inflag && /;$/ { print "select set_config('"'"'akana.tenant_sign_in_switch'"'"', '"'"''"'"', true);"; inflag=0 }' redteam/f133/_fixture.sql > "$OUT/_fixture.sql"
for f in 02_revocation_leaves_live_token 03_db_probes 04_hook_probes; do
  sed "s#redteam/f133/_fixture.sql#$OUT/_fixture.sql#" "redteam/f133/$f.sql" > "$OUT/$f.sql"
  echo "=================== $f"
  psql "$BASE/akana_rt" -q -f "$OUT/$f.sql" 2>&1 | grep -v '^$'
done
