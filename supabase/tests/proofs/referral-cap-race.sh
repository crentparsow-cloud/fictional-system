#!/usr/bin/env bash
# The yearly referral cap under a race (review finding M14, red team RT-04).
#
# Two friends of one referrer qualify at the same moment. The referrer already
# holds 11 rewards against a cap of 12. Before migration 0074 each claim
# counted 11 and both were rewarded, 13 in all. With the lock on the referrer
# the second claim waits for the first and is blocked by the cap.
#
# A plain SQL test file runs in one session, so this needs a shell.
#
#   TEST_URL=postgres://.../a_database_with_every_migration bash supabase/tests/proofs/referral-cap-race.sh
#   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres bash supabase/tests/proofs/referral-cap-race.sh
#
# With TEST_URL it uses that database (scripts/db-test.sh does this) and
# removes its rows afterwards. With DATABASE_URL alone it builds a throwaway
# database first. Exits 0 when the cap holds, 1 when it is passed.
set -euo pipefail
cd "$(dirname "$0")/../../.."

if [ -z "${TEST_URL:-}" ]; then
  : "${DATABASE_URL:?set TEST_URL or DATABASE_URL}"
  DB="akana_race_$(date +%s)_$$"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "create database $DB"
  trap 'psql "$DATABASE_URL" -q -c "drop database if exists $DB (force)" >/dev/null' EXIT
  TEST_URL="${DATABASE_URL%/*}/$DB"
  export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
  psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/_shim.sql
  for f in supabase/migrations/*.sql; do
    psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
  done
fi

q() { psql "$TEST_URL" -q -At -v ON_ERROR_STOP=1 "$@"; }
R=74750000-0000-0000-0000-00000000000a
FRIEND=74751000-0000-0000-0000-0000000000
AS_SERVICE="select set_config('request.jwt.claims', '{\"role\": \"service_role\"}', true); set local role service_role;"
cleanup() {
  q -c "delete from public.referrals where referrer_id = '$R'" -c "delete from auth.users where id = '$R' or id::text like '74751000-%'" >/dev/null
}
cleanup

q <<SQL
insert into auth.users (id, email) values ('$R', 'referrer75@test');
insert into auth.users (id, email)
select ('$FRIEND' || lpad(n::text, 2, '0'))::uuid, 'friend75-' || n || '@test' from generate_series(1, 13) n;
insert into public.referrals (referrer_id, referred_id, code, status, qualified_at, rewarded_at, reward_kind, reward_value, reward_currency, card_fingerprint)
select '$R', ('$FRIEND' || lpad(n::text, 2, '0'))::uuid, 'TSTSEVFIVE', 'rewarded', now() - interval '10 days', now() - interval '10 days', 'credit', 500, 'GBP', 'fp75_old_' || n
  from generate_series(1, 11) n;
insert into public.referrals (referrer_id, referred_id, code) values
  ('$R', '${FRIEND}12', 'TSTSEVFIVE'),
  ('$R', '${FRIEND}13', 'TSTSEVFIVE');
SQL

# Session 1 claims and holds its transaction open for three seconds. Session 2
# claims one second in, while the first reward is not yet committed.
q -c "begin; $AS_SERVICE select count(*) from public.referral_claim_reward('${FRIEND}12', 'fp75_new_1', '{}', false, 'GBP'); select pg_sleep(3); commit;" >/dev/null &
P1=$!
sleep 1
q -c "begin; $AS_SERVICE select count(*) from public.referral_claim_reward('${FRIEND}13', 'fp75_new_2', '{}', false, 'GBP'); commit;" >/dev/null &
P2=$!
wait "$P1"
wait "$P2"

CAP=$(q -c "select coalesce((app.referral_config() ->> 'annual_cap')::int, 12)")
N=$(q -c "select count(*) from public.referrals where referrer_id = '$R' and status in ('rewarding', 'rewarded') and qualified_at > now() - interval '1 year'")
BLOCKED=$(q -c "select count(*) from public.referrals where referrer_id = '$R' and status = 'blocked' and block_reason = 'cap_reached'")
cleanup
if [ "$N" -ne "$CAP" ] || [ "$BLOCKED" -ne 1 ]; then
  echo "referral cap race: FAILED, $N rewards against a cap of $CAP ($BLOCKED blocked by the cap)"
  exit 1
fi
echo "referral cap race: the cap held ($N rewards against a cap of $CAP)"
