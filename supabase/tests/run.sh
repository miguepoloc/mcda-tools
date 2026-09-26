#!/usr/bin/env bash
# Corre TODAS las migraciones y supabase/tests/{geo_rls,account_status}.sql en un PostgreSQL 17 temporal (initdb en /tmp,
# puerto 54329). Requiere los binarios de PostgreSQL (brew install postgresql@17). No toca ninguna base real.
set -euo pipefail
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@17/bin}"
HERE="$(cd "$(dirname "$0")" && pwd)"
DIR="$(mktemp -d /tmp/mcda-pg.XXXXXX)"
PORT="${PGPORT_TEST:-54329}"
cleanup() { "$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
"$PGBIN/initdb" -D "$DIR/data" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null
P=("$PGBIN/psql" -h "$DIR" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${P[@]}" -c "create database t" >/dev/null
P+=(-d t)
"${P[@]}" -f "$HERE/stubs.sql" >/dev/null
for f in "$HERE"/../migrations/*.sql; do
  echo "→ $(basename "$f")"
  "${P[@]}" -f "$f" >/dev/null
done
# Idempotencia: pegar las migraciones (10 en adelante) dos veces en el SQL Editor no debe romper nada.
for f in "$HERE"/../migrations/2024010100001{0,1,2,3,4,5}_*.sql; do "${P[@]}" -f "$f" >/dev/null; done
echo "→ migraciones 10–15 re-aplicadas sin error (idempotentes)"
for T in geo_rls account_status; do
  "${P[@]}" -f "$HERE/$T.sql" 2>&1 | sed -e 's/^psql:[^ ]* //' | grep -E "ok  |FALLA|Todo OK|ERROR" | sed 's/^NOTICE:  //'
done
