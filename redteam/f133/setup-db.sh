#!/usr/bin/env bash
# Build a persistent throwaway DB "akana_rt" with shim + all migrations (no tests run).
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL:=postgres://postgres:postgres@localhost:5432/postgres}"
BASE="${DATABASE_URL%/*}"
psql "$DATABASE_URL" -q -c "drop database if exists akana_rt (force)" -c "create database akana_rt"
psql "$BASE/akana_rt" -v ON_ERROR_STOP=1 -q -f supabase/tests/_shim.sql
for f in supabase/migrations/*.sql; do psql "$BASE/akana_rt" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null; done
echo "akana_rt ready"
