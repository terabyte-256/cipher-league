#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
docker="/usr/local/bin/docker"
name="cipher-league-db-test-$$"

if ! "$docker" info >/dev/null 2>&1; then
  echo "Docker daemon is not running; start it and rerun tests/db/run.sh." >&2
  exit 2
fi

cleanup() { "$docker" rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"$docker" run --rm -d --name "$name" -e POSTGRES_PASSWORD=test postgres:16-alpine -c wal_level=logical >/dev/null
for attempt in {1..60}; do
  if "$docker" exec "$name" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  if [[ "$attempt" == 60 ]]; then echo "Postgres container did not become ready." >&2; exit 1; fi
  sleep 1
done

psql() { "$docker" exec -i "$name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

psql < "$root/tests/db/bootstrap.sql"
git -C "$root" show 6004ace:supabase/schema.sql | psql
psql < "$root/supabase/schema.sql"
psql < "$root/supabase/seed.sql"
psql < "$root/supabase/schema.sql"
psql < "$root/supabase/seed.sql"
psql < "$root/tests/db/acceptance.sql"
echo "PASS: schema upgrade/rerun, league RPCs, drafts, RLS, client write denial"
