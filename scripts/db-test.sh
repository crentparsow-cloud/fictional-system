#!/usr/bin/env bash
# Apply every migration to a fresh database and run the RLS tests.
# Works against plain Postgres (CI service container) or a local Supabase.
#
#   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres scripts/db-test.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DATABASE_URL:?set DATABASE_URL}"
DB="akana_test_$(date +%s)"
ADMIN_URL="$DATABASE_URL"
BASE_URL="${DATABASE_URL%/*}"

psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "create database $DB"
trap 'psql "$ADMIN_URL" -q -c "drop database if exists $DB (force)" >/dev/null' EXIT
TEST_URL="$BASE_URL/$DB"

psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/_shim.sql
for f in supabase/migrations/*.sql; do
  echo "apply $f"
  psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
for f in supabase/tests/[0-9]*.sql; do
  echo "test  $f"
  psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
echo "database tests passed"
