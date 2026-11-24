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
