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
alter table public.assets add column if not exists sort_order integer not null default 1000;
-- Leagues that exist at upgrade time stay untimed (0), so nobody's draft starts counting down
-- unannounced. Only leagues created afterwards default to 90 seconds.
alter table public.leagues add column if not exists pick_seconds integer not null default 0
 check (pick_seconds=0 or pick_seconds between 30 and 86400);
alter table public.leagues alter column pick_seconds set default 90;
alter table public.leagues add column if not exists pick_deadline timestamptz;
alter table public.league_members add column if not exists autodraft boolean not null default false;
alter table public.league_members add column if not exists auto_lineup boolean not null default false;
alter table public.draft_picks add column if not exists auto boolean not null default false;
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
revoke all on public.assets,public.asset_week_scores,public.kev_events,public.ai_snapshots,
 public.leagues,public.league_members,public.draft_picks,public.lineup_entries from anon,authenticated;
grant select on public.assets,public.asset_week_scores,public.kev_events to anon,authenticated;
grant select on public.leagues,public.league_members,public.draft_picks,public.lineup_entries to authenticated;
revoke all on public.ai_snapshots from anon,authenticated;

drop function if exists public.create_league(text,text,integer);
create or replace function public.create_league(p_name text,p_team_name text,p_max_teams integer default 6,p_pick_seconds integer default 90)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_code text;i integer;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 p_name:=btrim(p_name);p_team_name:=btrim(p_team_name);
 if char_length(p_name) not between 3 and 48 or char_length(p_team_name) not between 3 and 32 then
  raise exception 'League name 3-48 characters and team name 3-32 required';end if;
 if p_max_teams not between 2 and 8 then raise exception 'Choose 2-8 teams';end if;
 if p_pick_seconds is null or (p_pick_seconds<>0 and p_pick_seconds not between 30 and 86400) then raise exception 'Pick time must be 0 or 30-86400 seconds';end if;
 if (select count(*) from public.league_members where user_id=auth.uid())>=15 then raise exception 'League limit reached';end if;
 for i in 1..10 loop
  v_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  begin
   insert into public.leagues(invite_code,name,owner_id,max_teams,pick_seconds)values(v_code,p_name,auth.uid(),p_max_teams,p_pick_seconds) returning id into v_id;
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
create or replace view public.asset_rankings with (security_invoker=true) as
with closed as (
 select s.asset_slug,s.points,s.week_start,row_number() over(partition by s.asset_slug order by s.week_start desc) n
 from public.asset_week_scores s where s.week_start<date_trunc('week',now() at time zone 'utc')::date
), chosen as (
 select asset_slug,points,week_start from closed where n<=4
 union all
 select s.asset_slug,s.points,s.week_start from public.asset_week_scores s
 where s.week_start=date_trunc('week',now() at time zone 'utc')::date
 and not exists(select 1 from closed c where c.asset_slug=s.asset_slug)
), averages as (
 select asset_slug,round(avg(points)::numeric,1) avg_points,count(*)::integer weeks_scored from chosen group by asset_slug
), ranked as (
 select a.slug asset_slug,a.position,avg.avg_points,coalesce(avg.weeks_scored,0)::integer weeks_scored,a.sort_order,
 row_number() over(partition by a.position order by (avg.avg_points is null),avg.avg_points desc,a.sort_order,a.slug)::integer rank
 from public.assets a left join averages avg on avg.asset_slug=a.slug where a.active
)
select asset_slug,position,rank,avg_points,weeks_scored from ranked;
revoke all on public.asset_rankings from anon,authenticated;
grant select on public.asset_rankings to anon,authenticated;

create or replace function public._best_asset(p_league uuid,p_pick_no integer)
returns text language sql stable security definer set search_path='' as $$
 select a.slug from public.assets a left join public.asset_rankings r on r.asset_slug=a.slug
 where a.active and not exists(select 1 from public.draft_picks d where d.league_id=p_league and d.asset_slug=a.slug)
 and (p_pick_no>(select count(*) from public.league_members where league_id=p_league)*7 or a.position=
  case ((p_pick_no-1)/(select count(*) from public.league_members where league_id=p_league))
   when 0 then 'DFIR' when 1 then 'SOCIAL' when 2 then 'SOC' when 3 then 'VULN' when 4 then 'DEF' when 5 then 'LANG' when 6 then 'AI' else a.position end)
 order by case when p_pick_no>(select count(*) from public.league_members where league_id=p_league)*7 then (r.avg_points is null)::int else 0 end,
  case when p_pick_no>(select count(*) from public.league_members where league_id=p_league)*7 then r.avg_points end desc,
  r.rank,a.sort_order,a.slug limit 1
$$;

create or replace function public._record_pick(p_league uuid,p_member uuid,p_pick_no integer,p_auto boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_total integer;v_slug text;
begin
 v_total:=(select count(*) from public.league_members where league_id=p_league);
 v_slug:=public._best_asset(p_league,p_pick_no);
 if v_slug is null then raise exception 'No active candidate available';end if;
 insert into public.draft_picks(league_id,member_id,asset_slug,pick_no,auto) values(p_league,p_member,v_slug,p_pick_no,p_auto);
 if p_pick_no=v_total*8 then
  perform public._record_completion(p_league);
 else
  update public.leagues set pick_deadline=case when pick_seconds=0 then null else now()+make_interval(secs=>pick_seconds) end where id=p_league;
 end if;
end $$;

create or replace function public._record_completion(p_league uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_start date;
begin
 v_start:=date_trunc('week',now() at time zone 'utc')::date+7;
 update public.leagues set status='live',start_on=v_start,pick_deadline=null where id=p_league;
 insert into public.lineup_entries(league_id,member_id,effective_week,slot,asset_slug)
 select p_league,dp.member_id,v_start,case a.position when 'DFIR' then 1 when 'SOCIAL' then 2 when 'SOC' then 3 when 'VULN' then 4 when 'DEF' then 5 when 'LANG' then 6 when 'AI' then 7 end,dp.asset_slug
 from public.draft_picks dp join public.assets a on a.slug=dp.asset_slug join public.league_members m on m.league_id=dp.league_id and m.user_id=dp.member_id
 where dp.league_id=p_league and dp.pick_no<=(select count(*)*7 from public.league_members where league_id=p_league) and not m.auto_lineup;
 perform public._apply_auto_lineups(p_league,v_start);
end $$;

create or replace function public._run_autodraft(p_league uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_total integer;v_count integer;v_member uuid;v_round integer;v_offset integer;v_seat integer;
begin
 loop
  select count(*) into v_total from public.league_members where league_id=p_league;
  select count(*) into v_count from public.draft_picks where league_id=p_league;
  exit when v_count>=v_total*8;
  v_round:=v_count/v_total;v_offset:=mod(v_count,v_total);v_seat:=case when mod(v_round,2)=0 then v_offset else v_total-v_offset-1 end;
  select user_id into v_member from public.league_members where league_id=p_league and seat=v_seat and autodraft;
  exit when v_member is null;
  perform public._record_pick(p_league,v_member,v_count+1,true);
 end loop;
end $$;

create or replace function public._apply_auto_lineups(p_league uuid,p_week date)
returns integer language plpgsql security definer set search_path='' as $$
declare m record;v_changed integer:=0;v_old text[];v_new text[];v_slot integer;v_slug text;
begin
 for m in select user_id from public.league_members where league_id=p_league and auto_lineup loop
  v_new:=array[]::text[];
  for v_slot in 1..7 loop
   select d.asset_slug into v_slug from public.draft_picks d join public.assets a on a.slug=d.asset_slug left join public.asset_rankings r on r.asset_slug=a.slug
   where d.league_id=p_league and d.member_id=m.user_id and a.position=case v_slot when 1 then 'DFIR' when 2 then 'SOCIAL' when 3 then 'SOC' when 4 then 'VULN' when 5 then 'DEF' when 6 then 'LANG' else 'AI' end
   order by r.rank nulls last,a.sort_order,a.slug limit 1;
   v_new:=array_append(v_new,v_slug);
  end loop;
  -- Compare with the lineup already in effect for that week, so an unchanged one is not rewritten.
  select array_agg(asset_slug order by slot) into v_old from public.lineup_entries where league_id=p_league and member_id=m.user_id
   and effective_week=(select max(effective_week) from public.lineup_entries where league_id=p_league and member_id=m.user_id and effective_week<=p_week);
  if v_old is distinct from v_new then
   delete from public.lineup_entries where league_id=p_league and member_id=m.user_id and effective_week=p_week;
   insert into public.lineup_entries(league_id,member_id,effective_week,slot,asset_slug) select p_league,m.user_id,p_week,n,v_new[n] from generate_series(1,7)n;
   v_changed:=v_changed+1;
  end if;
 end loop;
 return v_changed;
end $$;

create or replace function public.start_draft(p_league_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare l public.leagues%rowtype;v_count integer;
begin
 select * into l from public.leagues where id=p_league_id for update;
 if l.id is null or l.owner_id is distinct from auth.uid() then raise exception 'Commissioner only';end if;
 if l.status<>'lobby' then raise exception 'Draft already started';end if;
 select count(*) into v_count from public.league_members where league_id=p_league_id;
 if v_count<2 then raise exception 'Invite at least one other human player';end if;
 if exists(select 1 from (values('DFIR'),('SOCIAL'),('SOC'),('VULN'),('DEF'),('LANG'),('AI')) p(pos) where (select count(*) from public.assets a where a.position=p.pos and a.active)<v_count) then raise exception 'Not enough active candidates to draft each position';end if;
 update public.leagues set status='draft',pick_deadline=case when pick_seconds=0 then null else now()+make_interval(secs=>pick_seconds) end where id=p_league_id;
 perform public._run_autodraft(p_league_id);
end $$;

create or replace function public.make_pick(p_league_id uuid,p_asset_slug text)
returns void language plpgsql security definer set search_path='' as $$
declare l public.leagues%rowtype;v_total integer;v_count integer;v_round integer;v_offset integer;v_seat integer;v_user uuid;v_pos text;v_need text;
begin
 select * into l from public.leagues where id=p_league_id for update;
 if l.id is null or l.status<>'draft' then raise exception 'Draft not active';end if;
 select count(*) into v_total from public.league_members where league_id=p_league_id;select count(*) into v_count from public.draft_picks where league_id=p_league_id;
 if v_count>=v_total*8 then raise exception 'Draft complete';end if;
 v_round:=v_count/v_total;v_offset:=mod(v_count,v_total);v_seat:=case when mod(v_round,2)=0 then v_offset else v_total-v_offset-1 end;
 select user_id into v_user from public.league_members where league_id=p_league_id and seat=v_seat;
 if v_user is distinct from auth.uid() then raise exception 'Not your turn';end if;
 select position into v_pos from public.assets where slug=p_asset_slug and active;if v_pos is null then raise exception 'Invalid candidate';end if;
 v_need:=case v_round when 0 then 'DFIR' when 1 then 'SOCIAL' when 2 then 'SOC' when 3 then 'VULN' when 4 then 'DEF' when 5 then 'LANG' when 6 then 'AI' else null end;
 if v_need is not null and v_pos<>v_need then raise exception 'This round requires the % position',v_need;end if;
 if exists(select 1 from public.draft_picks where league_id=p_league_id and asset_slug=p_asset_slug) then raise exception 'Already drafted';end if;
 insert into public.draft_picks(league_id,member_id,asset_slug,pick_no,auto) values(p_league_id,auth.uid(),p_asset_slug,v_count+1,false);
 if v_count+1=v_total*8 then perform public._record_completion(p_league_id); else update public.leagues set pick_deadline=case when pick_seconds=0 then null else now()+make_interval(secs=>pick_seconds) end where id=p_league_id;perform public._run_autodraft(p_league_id);end if;
end $$;

create or replace function public.auto_pick(p_league_id uuid,p_pick_no integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare l public.leagues%rowtype;v_total integer;v_count integer;v_round integer;v_offset integer;v_seat integer;v_member uuid;
begin
 select * into l from public.leagues where id=p_league_id for update;
 if l.id is null or l.status<>'draft' or not public.is_league_member(p_league_id) then return false;end if;
 select count(*) into v_total from public.league_members where league_id=p_league_id;select count(*) into v_count from public.draft_picks where league_id=p_league_id;
 if p_pick_no<>v_count+1 or l.pick_deadline is null or l.pick_deadline>now() then return false;end if;
 v_round:=v_count/v_total;v_offset:=mod(v_count,v_total);v_seat:=case when mod(v_round,2)=0 then v_offset else v_total-v_offset-1 end;
 select user_id into v_member from public.league_members where league_id=p_league_id and seat=v_seat;
 perform public._record_pick(p_league_id,v_member,p_pick_no,true);
 if p_pick_no<v_total*8 then perform public._run_autodraft(p_league_id);end if;
 return true;
end $$;

create or replace function public.draft_clock(p_league_id uuid)
returns integer language plpgsql stable security definer set search_path='' as $$
declare v_deadline timestamptz;begin
 if not public.is_league_member(p_league_id) then raise exception 'Not a member';end if;
 select pick_deadline into v_deadline from public.leagues where id=p_league_id;
 if v_deadline is null then return null;end if;
 return greatest(0,ceil(extract(epoch from (v_deadline-now())))::integer);
end $$;

create or replace function public.set_autodraft(p_league_id uuid,p_on boolean)
returns void language plpgsql security definer set search_path='' as $$
declare l public.leagues%rowtype;
begin
 select * into l from public.leagues where id=p_league_id for update;
 if l.id is null or not public.is_league_member(p_league_id) then raise exception 'Not a member';end if;
 update public.league_members set autodraft=p_on where league_id=p_league_id and user_id=auth.uid();
 if l.status='draft' then perform public._run_autodraft(p_league_id);end if;
end $$;

create or replace function public.set_auto_lineup(p_league_id uuid,p_on boolean)
returns void language plpgsql security definer set search_path='' as $$
declare l public.leagues%rowtype;v_week date;
begin
 select * into l from public.leagues where id=p_league_id for update;
 if l.id is null or not public.is_league_member(p_league_id) then raise exception 'Not a member';end if;
 update public.league_members set auto_lineup=p_on where league_id=p_league_id and user_id=auth.uid();
 if p_on and l.status='live' and l.start_on is not null then
  v_week:=greatest(l.start_on,date_trunc('week',now() at time zone 'utc')::date+7);
  if v_week<l.start_on+49 then perform public._apply_auto_lineups(p_league_id,v_week);end if;
 end if;
end $$;

create or replace function public.refresh_auto_lineups(p_league_id uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
declare l record;v_week date;v_total integer:=0;
begin
 if auth.role()='service_role' then
  for l in select id,start_on from public.leagues where status='live' and (p_league_id is null or id=p_league_id) order by id for update loop
   v_week:=greatest(l.start_on,date_trunc('week',now() at time zone 'utc')::date+7);
   if v_week<l.start_on+49 then v_total:=v_total+public._apply_auto_lineups(l.id,v_week);end if;
  end loop;
 else
  if p_league_id is null or not public.is_league_member(p_league_id) then raise exception 'League member required';end if;
  select * into l from public.leagues where id=p_league_id for update;
  if l.status='live' and l.start_on is not null then v_week:=greatest(l.start_on,date_trunc('week',now() at time zone 'utc')::date+7);if v_week<l.start_on+49 then v_total:=public._apply_auto_lineups(p_league_id,v_week);end if;end if;
 end if;
 return v_total;
end $$;

create or replace function public.set_lineup(p_league_id uuid,p_slugs text[])
returns date language plpgsql security definer set search_path='' as $$
declare l public.leagues%rowtype;v_effective date;v_i integer;v_expected text;v_actual text;
begin
 select * into l from public.leagues where id=p_league_id for update;
 if l.id is null or l.status<>'live' or l.start_on is null then raise exception 'Season not ready';end if;
 if not public.is_league_member(p_league_id) then raise exception 'Not a member';end if;
 if coalesce(array_length(p_slugs,1),0)<>7 then raise exception 'Choose exactly one asset for each of the seven positions';end if;
 for v_i in 1..7 loop
  v_expected:=case v_i when 1 then 'DFIR' when 2 then 'SOCIAL' when 3 then 'SOC' when 4 then 'VULN' when 5 then 'DEF' when 6 then 'LANG' else 'AI' end;
  select a.position into v_actual from public.draft_picks dp join public.assets a on a.slug=dp.asset_slug where dp.league_id=p_league_id and dp.member_id=auth.uid() and dp.asset_slug=p_slugs[v_i];
  if v_actual is distinct from v_expected then raise exception 'Slot % requires your drafted % asset',v_i,v_expected;end if;
 end loop;
 if (select count(distinct slug)from unnest(p_slugs) slug)<>7 then raise exception 'Duplicate asset in lineup';end if;
 v_effective:=greatest(l.start_on,date_trunc('week',now() at time zone 'utc')::date+7);
 if v_effective>=l.start_on+49 then raise exception 'Season is over';end if;
 delete from public.lineup_entries where league_id=p_league_id and member_id=auth.uid() and effective_week=v_effective;
 insert into public.lineup_entries(league_id,member_id,effective_week,slot,asset_slug) select p_league_id,auth.uid(),v_effective,n::int,p_slugs[n] from generate_subscripts(p_slugs,1)n;
 update public.league_members set auto_lineup=false where league_id=p_league_id and user_id=auth.uid();
 return v_effective;
end $$;
revoke all on function public.is_league_member(uuid),public.create_league(text,text,integer,integer),
 public.join_league(text,text),public.start_draft(uuid),public.make_pick(uuid,text),public.set_lineup(uuid,text[]),
 public.league_week_scores(uuid),public.auto_pick(uuid,integer),public.draft_clock(uuid),public.set_autodraft(uuid,boolean),
 public.set_auto_lineup(uuid,boolean),public.refresh_auto_lineups(uuid),public._best_asset(uuid,integer),
 public._record_pick(uuid,uuid,integer,boolean),public._record_completion(uuid),public._run_autodraft(uuid),
 public._apply_auto_lineups(uuid,date) from public,anon,authenticated,service_role;
grant execute on function public.is_league_member(uuid),public.create_league(text,text,integer,integer),
 public.join_league(text,text),public.start_draft(uuid),public.make_pick(uuid,text),public.set_lineup(uuid,text[]),
 public.league_week_scores(uuid),public.auto_pick(uuid,integer),public.draft_clock(uuid),public.set_autodraft(uuid,boolean),
 public.set_auto_lineup(uuid,boolean),public.refresh_auto_lineups(uuid) to authenticated;
grant execute on function public.refresh_auto_lineups(uuid) to service_role;
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
