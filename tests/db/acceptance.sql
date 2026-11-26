insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003'),('00000000-0000-0000-0000-000000000004'),
 ('00000000-0000-0000-0000-000000000005'),('00000000-0000-0000-0000-000000000006'),
 ('00000000-0000-0000-0000-000000000007'),('00000000-0000-0000-0000-000000000008'),
 ('00000000-0000-0000-0000-000000000009'),('00000000-0000-0000-0000-000000000010'),
 ('00000000-0000-0000-0000-000000000100'),('00000000-0000-0000-0000-000000000101');
insert into public.leagues(id,invite_code,name,owner_id,max_teams)
values ('10000000-0000-0000-0000-000000000001','OLD12345','Legacy league','00000000-0000-0000-0000-000000000100',2);
insert into public.league_members(league_id,user_id,team_name,seat)
values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000100','Legacy owner',0);

set role authenticated;
do $$
declare
  v_two uuid;
  v_eight uuid;
  v_league uuid;
  v_legacy uuid := '10000000-0000-0000-0000-000000000001';
  v_users uuid[];
  v_user uuid;
  v_wrong uuid;
  v_code text;
  v_slug text;
  v_pos text;
  v_round integer;
  v_pick integer;
  v_i integer;
  v_seat integer;
  v_team_count integer;
  v_picks integer;
begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  v_two := public.create_league('Two teams','Team One',2);
  if (select char_length(invite_code) from public.leagues where id=v_two) <> 12 then
    raise exception 'create_league did not create a 12-character invite code';
  end if;
  v_slug := (select invite_code from public.leagues where id=v_two);
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
  if public.join_league(lower(v_slug),'Team Two') <> v_two then raise exception 'lowercase invite join failed'; end if;
  if public.join_league('old12345','Legacy member') <> v_legacy then raise exception '8-character legacy code join failed'; end if;

  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
  v_eight := public.create_league('Eight teams','Team Three',8);
  select invite_code into v_code from public.leagues where id=v_eight;
  v_users := array[
    '00000000-0000-0000-0000-000000000003'::uuid,'00000000-0000-0000-0000-000000000004'::uuid,
    '00000000-0000-0000-0000-000000000005'::uuid,'00000000-0000-0000-0000-000000000006'::uuid,
    '00000000-0000-0000-0000-000000000007'::uuid,'00000000-0000-0000-0000-000000000008'::uuid,
    '00000000-0000-0000-0000-000000000009'::uuid,'00000000-0000-0000-0000-000000000010'::uuid];
  for v_pick in 2..8 loop
    perform set_config('request.jwt.claim.sub',v_users[v_pick]::text,true);
    -- Join via the lowercase code as well as exercising invite normalization.
    perform public.join_league(lower(v_code), 'Team '||v_pick);
  end loop;

  for v_i in 1..2 loop
    if v_i=1 then v_team_count:=2; v_league:=v_two; else v_team_count:=8; v_league:=v_eight; end if;
    v_picks := v_team_count*8;
    if v_team_count=2 then
      v_users := array['00000000-0000-0000-0000-000000000001'::uuid,'00000000-0000-0000-0000-000000000002'::uuid];
    else
      v_users := array[
        '00000000-0000-0000-0000-000000000003'::uuid,'00000000-0000-0000-0000-000000000004'::uuid,
        '00000000-0000-0000-0000-000000000005'::uuid,'00000000-0000-0000-0000-000000000006'::uuid,
        '00000000-0000-0000-0000-000000000007'::uuid,'00000000-0000-0000-0000-000000000008'::uuid,
        '00000000-0000-0000-0000-000000000009'::uuid,'00000000-0000-0000-0000-000000000010'::uuid];
    end if;
    perform set_config('request.jwt.claim.sub',v_users[1]::text,true);
    if (select owner_id from public.leagues where id=v_league) is distinct from auth.uid() then
      raise exception 'test commissioner mismatch: league %, two %, eight %, user %, member rows %, owner %',v_league,v_two,v_eight,auth.uid(),(select count(*) from public.league_members where league_id=v_league),(select owner_id from public.leagues where id=v_league);
    end if;
    perform public.start_draft(v_league);
    if v_team_count=2 then
      perform set_config('request.jwt.claim.sub',v_users[1]::text,true);
      select slug into v_slug from public.assets where active and position<>'DFIR' order by slug limit 1;
      begin
        perform public.make_pick(v_league,v_slug);
        raise exception 'round eligibility accepted the wrong position';
      exception when others then
        if sqlerrm='round eligibility accepted the wrong position' then raise; end if;
      end;
    end if;
    -- Pick 1 belongs to seat 0; reject a different member before progressing.
    perform set_config('request.jwt.claim.sub',v_users[2]::text,true);
    begin
      perform public.make_pick(v_league,(select slug from public.assets where active order by slug limit 1));
      raise exception 'turn enforcement accepted the wrong member';
    exception when others then
      if sqlerrm='turn enforcement accepted the wrong member' then raise; end if;
    end;
    for v_pick in 0..v_picks-1 loop
      v_round := v_pick / v_team_count;
      v_seat := case when mod(v_round,2)=0 then mod(v_pick,v_team_count) else v_team_count-mod(v_pick,v_team_count)-1 end;
      v_user := v_users[v_seat+1];
      perform set_config('request.jwt.claim.sub',v_user::text,true);
      v_pos := case v_round when 0 then 'DFIR' when 1 then 'SOCIAL' when 2 then 'SOC'
        when 3 then 'VULN' when 4 then 'DEF' when 5 then 'LANG' when 6 then 'AI' else null end;
      select a.slug into v_slug from public.assets a
       where a.active and (v_pos is null or a.position=v_pos)
         and not exists(select 1 from public.draft_picks d where d.league_id=v_league and d.asset_slug=a.slug)
       order by a.slug limit 1;
      if v_slug is null then raise exception 'no candidate for team count %, pick %',v_team_count,v_pick+1; end if;
      perform public.make_pick(v_league,v_slug);
      if not exists(select 1 from public.draft_picks where league_id=v_league and pick_no=v_pick+1 and member_id=v_user) then
        raise exception 'snake order mismatch at pick %',v_pick+1;
      end if;
    end loop;
    if (select status from public.leagues where id=v_league)<>'live' then raise exception 'draft did not reach live'; end if;
    if (select count(*) from public.draft_picks where league_id=v_league)<>v_picks then raise exception 'wrong final pick count'; end if;
  end loop;

  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  if (select count(*) from public.leagues where name='Eight teams')<>0 then raise exception 'league RLS leaked another league'; end if;
  begin
    perform * from public.league_week_scores(v_eight);
    raise exception 'non-member read league scores';
  exception when others then
    if sqlerrm='non-member read league scores' then raise; end if;
  end;
end $$;
reset role;

-- Rankings use only the four latest closed weeks, falling back to the open week.
do $$
declare v_pos text;v_assets text[];v_week date;v_rank integer;v_avg numeric;v_weeks integer;
begin
 v_pos:=(select a.position from public.assets a where a.active group by a.position having not exists(select 1 from public.asset_week_scores s join public.assets x on x.slug=s.asset_slug where x.position=a.position and s.week_start<date_trunc('week',now() at time zone 'utc')::date) order by a.position limit 1);
 select array_agg(slug order by sort_order) into v_assets from (select slug,sort_order from public.assets where active and position=v_pos order by sort_order limit 5) a;
 v_week:=date_trunc('week',now() at time zone 'utc')::date;
 delete from public.asset_week_scores where asset_slug in (select slug from public.assets where position=v_pos);
 insert into public.asset_week_scores(asset_slug,week_start,points,source_url)
 values
 (v_assets[1],v_week-7,100,'https://test.invalid'),(v_assets[1],v_week-14,100,'https://test.invalid'),
 (v_assets[1],v_week-21,100,'https://test.invalid'),(v_assets[1],v_week-28,100,'https://test.invalid'),
 (v_assets[1],v_week-35,500,'https://test.invalid'),(v_assets[2],v_week-7,24,'https://test.invalid'),
 (v_assets[3],v_week,10,'https://test.invalid'),(v_assets[4],v_week+7,900,'https://test.invalid');
 select rank,avg_points,weeks_scored into v_rank,v_avg,v_weeks from public.asset_rankings where asset_slug=v_assets[1];
 if (v_rank,v_avg,v_weeks) is distinct from (1,100.0::numeric,4) then raise exception 'four closed week average incorrect: %, %, %',v_rank,v_avg,v_weeks;end if;
 if (select rank from public.asset_rankings where asset_slug=v_assets[2])<>2 then raise exception 'scored ranking order incorrect';end if;
 if (select (rank,avg_points,weeks_scored) from public.asset_rankings where asset_slug=v_assets[3]) is distinct from (3,10.0::numeric,1) then raise exception 'open week fallback incorrect';end if;
 if (select avg_points from public.asset_rankings where asset_slug=v_assets[4]) is not null or (select rank from public.asset_rankings where asset_slug=v_assets[4])<=3 then raise exception 'future score should remain unscored';end if;
 if (select avg_points from public.asset_rankings where asset_slug=v_assets[5]) is not null or (select rank from public.asset_rankings where asset_slug=v_assets[5])<=3 then raise exception 'missing score treated as zero';end if;
end $$;

-- Draft clock, timeout authorization, autodraft, and automatic lineups.
set role authenticated;
do $$
declare v_league uuid;v_code text;v_slug text;v_deadline timestamptz;v_result boolean;v_zero uuid;v_auto uuid;v_pick integer;v_week date;v_lineup text[];
begin
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 v_league:=public.create_league('Clocked draft','Clock One',2,30);
 select invite_code into v_code from public.leagues where id=v_league;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);perform public.join_league(v_code,'Clock Two');
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);perform public.start_draft(v_league);
 select pick_deadline into v_deadline from public.leagues where id=v_league;
 if v_deadline is null or public.draft_clock(v_league) not between 1 and 30 then raise exception 'start_draft did not set a working timer';end if;
 if public.auto_pick(v_league,1) then raise exception 'auto_pick ran before deadline';end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
 if public.auto_pick(v_league,2) then raise exception 'auto_pick accepted wrong pick number';end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
 if public.auto_pick(v_league,1) then raise exception 'auto_pick accepted non-member';end if;
end $$;
reset role;
update public.leagues set pick_deadline=now()-interval '1 second' where name='Clocked draft';
set role authenticated;
do $$
declare v_league uuid;v_deadline timestamptz;v_slug text;v_result boolean;v_code text;v_auto uuid;v_zero uuid;v_week date;v_lineup text[];v_count integer;
begin
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 select id into v_league from public.leagues where name='Clocked draft';
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
 if not public.auto_pick(v_league,1) then raise exception 'auto_pick failed after deadline';end if;
 if not (select auto from public.draft_picks where league_id=v_league and pick_no=1) then raise exception 'timeout pick not marked auto';end if;
 select pick_deadline into v_deadline from public.leagues where id=v_league;
 if v_deadline<=now() then raise exception 'pick did not reset timer';end if;
 perform public.set_autodraft(v_league,true);
 if not (select auto from public.draft_picks where league_id=v_league and pick_no=2) then raise exception 'autodraft toggle on current turn did not pick';end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 select slug into v_slug from public.assets a where a.active and a.position='SOCIAL' and not exists(select 1 from public.draft_picks d where d.league_id=v_league and d.asset_slug=a.slug) order by a.slug limit 1;
 perform public.make_pick(v_league,v_slug);
 if (select pick_deadline from public.leagues where id=v_league)<=now() then raise exception 'manual pick did not reset timer';end if;

 -- Every team on autodraft completes the draft at start; auto-lineup is applied at completion.
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
 v_auto:=public.create_league('Autodraft all','Auto One',2,0);select invite_code into v_code from public.leagues where id=v_auto;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);perform public.join_league(v_code,'Auto Two');perform public.set_autodraft(v_auto,true);perform public.set_autodraft(v_auto,false);
 if (select autodraft from public.league_members where league_id=v_auto and user_id=auth.uid()) then raise exception 'autodraft toggle off did not persist';end if;
 perform public.set_autodraft(v_auto,true);
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);perform public.set_auto_lineup(v_auto,true);perform public.set_autodraft(v_auto,true);perform public.start_draft(v_auto);
 if (select status from public.leagues where id=v_auto)<>'live' or (select count(*) from public.draft_picks where league_id=v_auto and auto)<>16 then raise exception 'all-autodraft league did not complete automatically';end if;
 if (select count(*) from public.lineup_entries where league_id=v_auto and member_id='00000000-0000-0000-0000-000000000003' and effective_week=(select start_on from public.leagues where id=v_auto))<>7 then raise exception 'auto lineup missing at draft completion';end if;
 if public.refresh_auto_lineups(v_auto)<>0 then raise exception 'auto lineup refresh was not idempotent';end if;
 select array_agg(asset_slug order by slot) into v_lineup from public.lineup_entries where league_id=v_auto and member_id='00000000-0000-0000-0000-000000000003' and effective_week=(select start_on from public.leagues where id=v_auto);
 perform public.set_lineup(v_auto,v_lineup);
 if (select auto_lineup from public.league_members where league_id=v_auto and user_id=auth.uid()) then raise exception 'manual lineup save did not disable auto lineup';end if;

 -- Zero seconds means no deadline and clock returns null.
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
 v_zero:=public.create_league('No timer','No Timer One',2,0);select invite_code into v_code from public.leagues where id=v_zero;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);perform public.join_league(v_code,'No Timer Two');
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);perform public.start_draft(v_zero);
 if public.draft_clock(v_zero) is not null or (select pick_deadline from public.leagues where id=v_zero) is not null then raise exception 'pick_seconds=0 created a timer';end if;
end $$;
reset role;

-- Every introduced public function is explicitly protected from anon and clients for internals.
do $$
declare f text;r text;
begin
 foreach f in array array['create_league(text,text,integer,integer)','auto_pick(uuid,integer)','draft_clock(uuid)','set_autodraft(uuid,boolean)','set_auto_lineup(uuid,boolean)','refresh_auto_lineups(uuid)','_best_asset(uuid,integer)','_record_pick(uuid,uuid,integer,boolean)','_record_completion(uuid)','_run_autodraft(uuid)','_apply_auto_lineups(uuid,date)'] loop
  if has_function_privilege('anon','public.'||f,'EXECUTE') then raise exception 'anon can execute %',f;end if;
  if f like '\_%' then
   if has_function_privilege('authenticated','public.'||f,'EXECUTE') or has_function_privilege('service_role','public.'||f,'EXECUTE') then raise exception 'client/service role can execute internal %',f;end if;
  else
   if not has_function_privilege('authenticated','public.'||f,'EXECUTE') then raise exception 'authenticated cannot execute %',f;end if;
  end if;
 end loop;
 if has_function_privilege('anon','public.is_league_member(uuid)','EXECUTE') then raise exception 'anon can execute RPC';end if;
end $$;

-- Feed each auto-created lineup seven one-point rows so score aggregation has a known result.
insert into public.asset_week_scores(asset_slug,week_start,points,event_count,source_url)
select distinct x.asset_slug,l.start_on,1,1,'https://test.invalid/score'
from public.lineup_entries x join public.leagues l on l.id=x.league_id
where l.name in ('Two teams','Eight teams') and x.effective_week=l.start_on
on conflict(asset_slug,week_start) do update set points=excluded.points,event_count=excluded.event_count;

set role authenticated;
do $$
declare
  v_two uuid;
  v_eight uuid;
  v_lineup text[];
  v_bad text[];
  v_start date;
  v_slug text;
  v_count integer;
  v_points integer;
  t text;
  role_name text;
begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  select id into v_two from public.leagues where name='Two teams';
  select id into v_eight from public.leagues where name='Eight teams';
  select array_agg(asset_slug order by slot) into v_lineup
    from public.lineup_entries where league_id=v_two and member_id='00000000-0000-0000-0000-000000000001'
      and effective_week=(select start_on from public.leagues where id=v_two);
  v_bad := v_lineup;
  select a.slug into v_slug from public.assets a where a.position='DFIR'
    and not exists(select 1 from public.draft_picks d where d.league_id=v_two and d.member_id='00000000-0000-0000-0000-000000000001' and d.asset_slug=a.slug)
    order by a.slug limit 1;
  v_bad[1] := v_slug;
  begin
    perform public.set_lineup(v_two,v_bad);
    raise exception 'set_lineup accepted an asset outside the member roster';
  exception when others then
    if sqlerrm='set_lineup accepted an asset outside the member roster' then raise; end if;
  end;
  v_start := public.set_lineup(v_two,v_lineup);
  select count(*) into v_count from public.lineup_entries where league_id=v_two and member_id='00000000-0000-0000-0000-000000000001' and effective_week=v_start;
  if v_count<>7 then raise exception 'set_lineup did not save seven slots'; end if;
  select count(*),max(points) into v_count,v_points from public.league_week_scores(v_two) where member_id='00000000-0000-0000-0000-000000000001';
  if v_count<>7 or v_points<>7 then raise exception 'league_week_scores expected seven weeks with seven points'; end if;
  if (select count(*) from public.league_members where league_id=v_eight)<>0 then raise exception 'RLS leaked another league roster'; end if;

  foreach role_name in array array['anon','authenticated'] loop
    foreach t in array array['assets','asset_week_scores','kev_events','ai_snapshots','leagues','league_members','draft_picks','lineup_entries'] loop
      if has_table_privilege(role_name,'public.'||t,'INSERT') or has_table_privilege(role_name,'public.'||t,'UPDATE')
       or has_table_privilege(role_name,'public.'||t,'DELETE') or has_table_privilege(role_name,'public.'||t,'TRUNCATE') then
        raise exception '% has write/truncate privilege on %',role_name,t;
      end if;
    end loop;
  end loop;
end $$;
reset role;
