#!/usr/bin/env bash
# Re-run the pass 2 database proof after the fixes, without touching it.
#
# A copy is adapted in two ways and nothing else:
#   1. The fixture writes the tenant_sign_in flag rows directly, which RT-4
#      refuses, so the copy of the fixture sets the marker that
#      public.set_tenant_sign_in sets (as redteam/f133/rerun-after-fix.sh does).
#   2. The proof stops at the first error. Several of its plain statements
#      are now refused outright (a withdrawn consent given again, the
#      faith_consent and read_only columns that no longer exist), so the copy
#      lets psql carry on past an error: ON_ERROR_STOP off, ON_ERROR_ROLLBACK
#      on. Each such refusal is printed as a REFUSED line with the error.
#
# Prints every HELD, BROKEN and REFUSED line, then the BROKEN count. Exits 1
# if anything is BROKEN.
set -uo pipefail
cd "$(dirname "$0")/../../.."
: "${DATABASE_URL:=postgres://postgres:postgres@localhost:5432/postgres}"
BASE="${DATABASE_URL%/*}"
bash redteam/f133/setup-db.sh >/dev/null 2>&1 || { echo "could not build akana_rt"; exit 2; }
OUT=redteam/f133/pass2/after
mkdir -p "$OUT"
awk '/^insert into public.feature_flags/ { print "select set_config('"'"'akana.tenant_sign_in_switch'"'"', '"'"'on'"'"', true);"; inflag=1 }
     { print }
     inflag && /;$/ { print "select set_config('"'"'akana.tenant_sign_in_switch'"'"', '"'"''"'"', true);"; inflag=0 }' redteam/f133/_fixture.sql > "$OUT/_fixture.sql"
sed -e "s#redteam/f133/after-fix/_fixture.sql#$OUT/_fixture.sql#" \
    -e 's#^\\set ON_ERROR_STOP 1$#\\set ON_ERROR_STOP 0\n\\set ON_ERROR_ROLLBACK on#' \
    redteam/f133/pass2/01_db_pass2.sql > "$OUT/01_db_pass2.sql"
psql "$BASE/akana_rt" -q -f "$OUT/01_db_pass2.sql" > "$OUT/output.txt" 2>&1
grep -E '^ ?(HELD|BROKEN)|^== |ERROR:' "$OUT/output.txt" | sed -E 's/^psql:[^ ]+:([0-9]+): ERROR: +/REFUSED (proof line \1): /; s/^ //'
broken=$(grep -cE '^ ?BROKEN' "$OUT/output.txt")
echo "BROKEN lines: $broken"
[ "$broken" -eq 0 ]
