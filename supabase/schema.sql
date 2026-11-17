-- Cipher League v3: fresh Supabase SQL installation.
-- Run this, then seed.sql, on a NEW project. Do not run against an active v2 league.
-- Browser clients only read protected state or execute permission-checked RPC functions.
create table if not exists public.assets (
 slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
 name text not null, position text not null check (position in ('DFIR','SOCIAL','SOC','VULN','DEF','LANG','AI')),
 source_url text not null, active boolean not null default true
);
create table if not exists public.asset_week_scores (
 asset_slug text not null references public.assets(slug),
 week_start date not null,
 points integer not null check (points between -5000 and 5000),
 event_count integer not null default 0 check (event_count >= 0),
 metric text not null default '', detail text not null default '',
 source_url text not null, updated_at timestamptz not null default now(),
 primary key (asset_slug,week_start)
);
create index if not exists asset_week_scores_week_idx on public.asset_week_scores(week_start);
create table if not exists public.kev_events (
 cve_id text primary key check (cve_id ~ '^CVE-[0-9]{4}-[0-9]{4,}$'),
 date_added date not null, asset_slug text not null references public.assets(slug),
 vendor text not null, product text not null, title text not null,
 ransomware boolean not null default false,
 source_url text generated always as ('https://nvd.nist.gov/vuln/detail/' || cve_id) stored
);
create index if not exists kev_events_week_idx on public.kev_events(date_added,asset_slug);
-- Private importer-only snapshots: public scores use changes in model likes, not invented events.
create table if not exists public.ai_snapshots (
 asset_slug text not null references public.assets(slug), sampled_on date not null,
 likes integer not null check (likes >= 0), primary key(asset_slug,sampled_on)
);
create table if not exists public.leagues (
 id uuid primary key default gen_random_uuid(),
 invite_code text not null unique, name text not null check (char_length(name) between 3 and 48),
 owner_id uuid not null references auth.users(id), max_teams integer not null default 6 check (max_teams between 2 and 8),
 status text not null default 'lobby' check (status in ('lobby','draft','live')),
 start_on date, created_at timestamptz not null default now()
);
create table if not exists public.league_members (
 league_id uuid not null references public.leagues(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 team_name text not null check (char_length(team_name) between 3 and 32),
 seat integer not null check (seat between 0 and 7),joined_at timestamptz not null default now(),
 primary key(league_id,user_id), unique(league_id,seat)
);
create index if not exists league_members_user_idx on public.league_members(user_id);
create table if not exists public.draft_picks (
 league_id uuid not null references public.leagues(id) on delete cascade,
 member_id uuid not null, asset_slug text not null references public.assets(slug),
 pick_no integer not null check (pick_no between 1 and 64),picked_at timestamptz not null default now(),
 primary key(league_id,pick_no),unique(league_id,asset_slug),unique(league_id,member_id,asset_slug),
 foreign key(league_id,member_id) references public.league_members(league_id,user_id) on delete cascade
);
create table if not exists public.lineup_entries (
 league_id uuid not null, member_id uuid not null, effective_week date not null,
 slot integer not null check (slot between 1 and 7),asset_slug text not null,
 primary key(league_id,member_id,effective_week,slot),
 unique(league_id,member_id,effective_week,asset_slug),
 foreign key(league_id,member_id,asset_slug) references public.draft_picks(league_id,member_id,asset_slug) on delete cascade
);
create or replace function public.is_league_member(p_league uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.league_members where league_id=p_league and user_id=auth.uid());
$$;
alter table public.assets enable row level security;
alter table public.asset_week_scores enable row level security;
alter table public.kev_events enable row level security;
alter table public.ai_snapshots enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.draft_picks enable row level security;
alter table public.lineup_entries enable row level security;
drop policy if exists assets_public on public.assets;
create policy assets_public on public.assets for select to anon,authenticated using(true);
drop policy if exists week_scores_public on public.asset_week_scores;
create policy week_scores_public on public.asset_week_scores for select to anon,authenticated using(true);
drop policy if exists events_public on public.kev_events;
create policy events_public on public.kev_events for select to anon,authenticated using(true);
drop policy if exists leagues_members_only on public.leagues;
create policy leagues_members_only on public.leagues for select to authenticated using(public.is_league_member(id));
drop policy if exists member_rosters_visible on public.league_members;
create policy member_rosters_visible on public.league_members for select to authenticated using(public.is_league_member(league_id));
drop policy if exists picks_members_only on public.draft_picks;
create policy picks_members_only on public.draft_picks for select to authenticated using(public.is_league_member(league_id));
drop policy if exists lineups_members_only on public.lineup_entries;
create policy lineups_members_only on public.lineup_entries for select to authenticated using(public.is_league_member(league_id));
-- Never grant write access to the client, even if it knows asset IDs.
revoke insert,update,delete on public.assets,public.asset_week_scores,public.kev_events,public.ai_snapshots,
 public.leagues,public.league_members,public.draft_picks,public.lineup_entries from anon,authenticated;
grant select on public.assets,public.asset_week_scores,public.kev_events to anon,authenticated;
grant select on public.leagues,public.league_members,public.draft_picks,public.lineup_entries to authenticated;
revoke all on public.ai_snapshots from anon,authenticated;

create or replace function public.create_league(p_name text,p_team_name text,p_max_teams integer default 6)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_code text;i integer;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 p_name:=btrim(p_name);p_team_name:=btrim(p_team_name);
 if char_length(p_name) not between 3 and 48 or char_length(p_team_name) not between 3 and 32 then
  raise exception 'League name 3-48 characters and team name 3-32 required';end if;
 if p_max_teams not between 2 and 8 then raise exception 'Choose 2-8 teams';end if;
 if (select count(*) from public.league_members where user_id=auth.uid())>=15 then raise exception 'League limit reached';end if;
 for i in 1..10 loop
  v_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  begin
   insert into public.leagues(invite_code,name,owner_id,max_teams)values(v_code,p_name,auth.uid(),p_max_teams) returning id into v_id;
   exit;
  exception when unique_violation then null;
  end;
 end loop;
 if v_id is null then raise exception 'Could not generate invite';end if;
 insert into public.league_members(league_id,user_id,team_name,seat)values(v_id,auth.uid(),p_team_name,0);
 return v_id;
end $$;
create or replace function public.join_league(p_code text,p_team_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare l public.leagues%rowtype;v_seat integer;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 p_team_name:=btrim(p_team_name);
 if char_length(p_team_name) not between 3 and 32 then raise exception 'Team name must be 3-32 characters';end if;
 select * into l from public.leagues where invite_code=upper(btrim(p_code)) for update;
 if l.id is null then raise exception 'Invite code not found';end if;
 if exists(select 1 from public.league_members where league_id=l.id and user_id=auth.uid())then return l.id;end if;
 if l.status<>'lobby' then raise exception 'League draft already started';end if;
 if (select count(*)from public.league_members where user_id=auth.uid())>=15 then raise exception 'League limit reached';end if;
 select coalesce(max(seat)+1,0) into v_seat from public.league_members where league_id=l.id;
 if v_seat>=l.max_teams then raise exception 'League full';end if;
 insert into public.league_members(league_id,user_id,team_name,seat)values(l.id,auth.uid(),p_team_name,v_seat);
 return l.id;
end $$;
create or replace function public.start_draft(p_league_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare l public.leagues%rowtype;v_count int;
begin
 select * into l from public.leagues where id=p_league_id for update;
 if l.id is null or l.owner_id is distinct from auth.uid() then raise exception 'Commissioner only';end if;
 if l.status<>'lobby' then raise exception 'Draft already started';end if;
 select count(*) into v_count from public.league_members where league_id=p_league_id;
 if v_count<2 then raise exception 'Invite at least one other human player';end if;
 -- Require enough unique assets for each fixed-category draft round.
 if exists(select 1 from (values('DFIR'),('SOCIAL'),('SOC'),('VULN'),('DEF'),('LANG'),('AI')) p(pos)
  where (select count(*) from public.assets a where a.position=p.pos and a.active)<v_count) then
  raise exception 'Not enough active candidates to draft each position';end if;
 update public.leagues set status='draft' where id=p_league_id;
end $$;
create or replace function public.make_pick(p_league_id uuid,p_asset_slug text)
returns void language plpgsql security definer set search_path='' as $$
declare l public.leagues%rowtype;v_count int;v_total int;v_round int;v_offset int;v_seat int;v_user uuid;v_start date;v_position text;v_required text;
begin
 select * into l from public.leagues where id=p_league_id for update;
 if l.id is null or l.status<>'draft' then raise exception 'Draft not active';end if;
 select count(*) into v_total from public.league_members where league_id=p_league_id;
 select count(*) into v_count from public.draft_picks where league_id=p_league_id;
 if v_count>=v_total*8 then raise exception 'Draft complete';end if;
 v_round:=v_count/v_total;v_offset:=mod(v_count,v_total);
 v_seat:=case when mod(v_round,2)=0 then v_offset else v_total-v_offset-1 end;
 select user_id into v_user from public.league_members where league_id=p_league_id and seat=v_seat;
 if v_user is distinct from auth.uid() then raise exception 'Not your turn';end if;
 select position into v_position from public.assets where slug=p_asset_slug and active;
 if v_position is null then raise exception 'Invalid candidate';end if;
 v_required:=case v_round when 0 then 'DFIR' when 1 then 'SOCIAL' when 2 then 'SOC'
  when 3 then 'VULN' when 4 then 'DEF' when 5 then 'LANG' when 6 then 'AI' else null end;
 if v_required is not null and v_position<>v_required then
  raise exception 'This round requires the % position',v_required;end if;
 if exists(select 1 from public.draft_picks where league_id=p_league_id and asset_slug=p_asset_slug) then raise exception 'Already drafted';end if;
 insert into public.draft_picks(league_id,member_id,asset_slug,pick_no)
 values(p_league_id,auth.uid(),p_asset_slug,v_count+1);
 if v_count+1=v_total*8 then
  v_start:=date_trunc('week',now() at time zone 'utc')::date+7;
  update public.leagues set status='live',start_on=v_start where id=p_league_id;
  insert into public.lineup_entries(league_id,member_id,effective_week,slot,asset_slug)
   select p_league_id,dp.member_id,v_start,
   case a.position when 'DFIR' then 1 when 'SOCIAL' then 2 when 'SOC' then 3 when 'VULN' then 4
    when 'DEF' then 5 when 'LANG' then 6 when 'AI' then 7 end,dp.asset_slug
   from public.draft_picks dp join public.assets a on a.slug=dp.asset_slug
   where dp.league_id=p_league_id and dp.pick_no<=v_total*7;
 end if;
end $$;
create or replace function public.set_lineup(p_league_id uuid,p_slugs text[])
returns date language plpgsql security definer set search_path='' as $$
declare l public.leagues%rowtype;v_effective date;v_i int;v_expected text;v_actual text;
begin
 select * into l from public.leagues where id=p_league_id for update;
 if l.id is null or l.status<>'live' or l.start_on is null then raise exception 'Season not ready';end if;
 if not exists(select 1 from public.league_members where league_id=p_league_id and user_id=auth.uid())then raise exception 'Not a member';end if;
 if coalesce(array_length(p_slugs,1),0)<>7 then raise exception 'Choose exactly one asset for each of the seven positions';end if;
 for v_i in 1..7 loop
  v_expected:=case v_i when 1 then 'DFIR' when 2 then 'SOCIAL' when 3 then 'SOC' when 4 then 'VULN'
   when 5 then 'DEF' when 6 then 'LANG' else 'AI' end;
  select a.position into v_actual from public.draft_picks dp join public.assets a on a.slug=dp.asset_slug
   where dp.league_id=p_league_id and dp.member_id=auth.uid() and dp.asset_slug=p_slugs[v_i];
  if v_actual is distinct from v_expected then raise exception 'Slot % requires your drafted % asset',v_i,v_expected;end if;
 end loop;
 if (select count(distinct slug)from unnest(p_slugs) slug)<>7 then raise exception 'Duplicate asset in lineup';end if;
 v_effective:=greatest(l.start_on,date_trunc('week',now() at time zone 'utc')::date+7);
 if v_effective>=l.start_on+49 then raise exception 'Season is over';end if;
 delete from public.lineup_entries where league_id=p_league_id and member_id=auth.uid() and effective_week=v_effective;
 insert into public.lineup_entries(league_id,member_id,effective_week,slot,asset_slug)
  select p_league_id,auth.uid(),v_effective,n::int,p_slugs[n] from generate_subscripts(p_slugs,1)n;
 return v_effective;
end $$;
create or replace function public.league_week_scores(p_league_id uuid)
returns table(member_id uuid,week_start date,points integer,event_count integer)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_league_member(p_league_id) then raise exception 'Not a member';end if;
 return query
 select m.user_id,(l.start_on+g.w*7)::date,
  coalesce(sum(coalesce(s.points,0)),0)::integer,
  coalesce(sum(coalesce(s.event_count,0)),0)::integer
 from public.leagues l join public.league_members m on m.league_id=l.id
 cross join generate_series(0,6) as g(w)
 left join public.lineup_entries x on x.league_id=l.id and x.member_id=m.user_id
  and x.effective_week=(select max(y.effective_week) from public.lineup_entries y
    where y.league_id=l.id and y.member_id=m.user_id and y.effective_week<=l.start_on+g.w*7)
 left join public.asset_week_scores s on s.asset_slug=x.asset_slug and s.week_start=l.start_on+g.w*7
 where l.id=p_league_id and l.status='live' and l.start_on is not null
 group by m.user_id,l.start_on,g.w order by g.w,m.user_id;
end $$;
revoke all on function public.is_league_member(uuid),public.create_league(text,text,integer),
 public.join_league(text,text),public.start_draft(uuid),public.make_pick(uuid,text),
 public.set_lineup(uuid,text[]),public.league_week_scores(uuid) from public,anon;
grant execute on function public.is_league_member(uuid),public.create_league(text,text,integer),
 public.join_league(text,text),public.start_draft(uuid),public.make_pick(uuid,text),
 public.set_lineup(uuid,text[]),public.league_week_scores(uuid) to authenticated;
-- Postgres Changes realtime is private, with row-level-security read checks.
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='leagues')then
  alter publication supabase_realtime add table public.leagues;end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='league_members')then
  alter publication supabase_realtime add table public.league_members;end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='draft_picks')then
  alter publication supabase_realtime add table public.draft_picks;end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='lineup_entries')then
  alter publication supabase_realtime add table public.lineup_entries;end if;
end $$;
