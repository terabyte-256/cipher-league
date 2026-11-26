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
# A league already drafting when the upgrade lands.
psql <<'SQL'
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000900');
insert into public.leagues(id,invite_code,name,owner_id,status)
values ('10000000-0000-0000-0000-000000000900','MIDDRAFT','Mid draft','00000000-0000-0000-0000-000000000900','draft');
SQL
psql < "$root/supabase/schema.sql"
psql < "$root/supabase/seed.sql"
psql < "$root/supabase/schema.sql"
psql < "$root/supabase/seed.sql"
psql < "$root/tests/db/acceptance.sql"
psql <<'SQL'
do $$ begin
 if (select pick_seconds from public.leagues where name='Mid draft')<>0 then raise exception 'upgrade put a clock on an existing draft';end if;
 if (select column_default from information_schema.columns where table_schema='public' and table_name='leagues' and column_name='pick_seconds')<>'90' then
  raise exception 'new leagues should default to 90 seconds';end if;
end $$;
SQL
echo "PASS: schema upgrade/rerun, league RPCs, drafts, RLS, client write denial"
