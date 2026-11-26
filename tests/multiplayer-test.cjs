'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../site/multiplayer.js','utf8').replace('void init();','/* init omitted for isolated tests */');
const assets=JSON.parse(fs.readFileSync(__dirname+'/../site/data/assets.json','utf8'));
const nodes={};const element=id=>nodes[id]||(nodes[id]={innerHTML:'',textContent:'',addEventListener(){},classList:{add(){},remove(){},toggle(){}},append(){}});
const windowListeners={};
const storage=new Map();
const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k),clear:()=>storage.clear()};
class MockFormData {
  constructor(form){
    this.map = new Map();
    if(form?.elements){
      for(const el of form.elements){
        if(el.name) this.map.set(el.name, el.value);
      }
    }
  }
  get(k){ return this.map.has(k) ? this.map.get(k) : null; }
}
const ctx={console,window:{CIPHER_CONFIG:{supabaseUrl:'https://test.supabase.co',supabaseAnonKey:'anon-key'},scrollTo(){},addEventListener(name,fn){windowListeners[name]=fn;},localStorage},document:{getElementById:element,addEventListener(){},createElement(){return {className:'',textContent:'',remove(){}}},querySelector(){return null}},location:{hash:'',origin:'https://game.test',pathname:'/app/',search:''},navigator:{},URL,URLSearchParams,Date,Set,Map,setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},FormData:MockFormData,localStorage};
for(const id of ['main','navigation','who'])element(id).querySelectorAll=()=>[];
vm.createContext(ctx);
vm.runInContext(source,ctx);
const run=s=>vm.runInContext(s,ctx);
run('S.assets='+JSON.stringify(assets));
assert.strictEqual(run('POSITIONS.length'),7);
assert(run('playersTab()').includes('268 of 268 players'));
assert.strictEqual((run('playersTab()').match(/<li class="player">/g)||[]).length,48,'48 guest catalog entries initially');
assert(run('playersTab()').includes('Show 48 more'));
run("S.poolPosition='DEF'");
assert(run('playersTab()').includes('45 of 268 players'));
run("S.poolPosition='ALL'");

assert.strictEqual(assets.length,268);
assert(assets.every(a=>a.source_url.startsWith('https://')));
for(const position of ['DFIR','SOCIAL','SOC','VULN','DEF','LANG','AI']){
 const matches=assets.filter(a=>a.position===position);
 assert(matches.length>=32,`At least 32 sourced assets in ${position}`);
 assert.strictEqual(new Set(matches.map(a=>a.slug)).size,matches.length);
}
run(`S.session={user:{id:'user0'}}; S.league={id:'l',name:'Test League',status:'draft',start_on:null,max_teams:2};
S.leagueId='l';S.members=[{user_id:'user0',team_name:'Blue',seat:0},{user_id:'user1',team_name:'Red',seat:1}];`);
assert(run('draftPage()').includes('Your pick: forensics'));
assert(run('draftPage()').includes('class="route"'),'draft route drawn');
assert(run('draftPage()').includes('Volatility 3'));
assert(run('draftPage()').includes('href="https://github.com/volatilityfoundation/volatility3" target="_blank" rel="noopener noreferrer">Volatility 3</a>'),'a player name links to its source');
assert(run('draftPage()').includes('33 available'));
assert(!run('draftPage()').includes('>Python</a>'));
run(`S.picks=[{pick_no:1,member_id:'user0',asset_slug:'volatility'}, {pick_no:2,member_id:'user1',asset_slug:'autopsy'}]`);
assert(run('draftPage()').includes('Red is picking'));
assert(run('draftPage()').includes('Ways attackers trick people'));
assert(run('draftPage()').includes('>Phishing</a></strong>'));
// Topics and vendors link to their own search, not a shared home page.
assert(run("playerUrl(asset('smishing'))").includes('mode=artlist'));
assert(run("playerUrl(asset('smishing'))").includes('SMS+phishing'));
assert(run("playerUrl(asset('cisco-kev'))").endsWith('?search_api_fulltext=Cisco'));
assert.strictEqual(run("playerLink(asset('no-such-player'))"),'no-such-player');
assert.strictEqual(run('nextPicker().user_id'),'user1','Reverse order in snake round two');
const socialAsset=assets.find(a=>a.position==='SOCIAL');
run(`S.publicWeekScores=[{asset_slug:'volatility',week_start:'2026-11-16',points:14},{asset_slug:'autopsy',week_start:'2026-11-09',points:8},{asset_slug:${JSON.stringify(socialAsset.slug)},week_start:'2026-11-16',points:14}];`);
assert.strictEqual(run("assetScoreLabel('volatility')"),'14 points, week of Nov 16');
assert.strictEqual(run("assetScoreLabel('unknown')"),'No score yet');
assert(run('playersTab()').includes('14 points, week of Nov 16'),'Explore includes a public latest score');
assert(run('draftPage()').includes('14 points, week of Nov 16'),'Draft includes a public latest score');
const langAsset=assets.find(a=>a.position==='LANG');
run(`S.publicWeekScores=[{asset_slug:'volatility',week_start:'2026-11-16',points:14},{asset_slug:${JSON.stringify(langAsset.slug)},week_start:'2026-11-09',points:10}];`);
const srcTab=run('sourcesTab()');
assert(srcTab.includes('Forensics · week of Nov 16'),'Forensics uses its own latest week');
assert(srcTab.includes('Languages · week of Nov 9'),'Languages uses its own latest week independently');
run("S.invite='TARGET'; S.leagues=[{id:'owned',invite_code:'TARGET'}];");
assert.strictEqual(run('inviteLeague().id'),'owned','An invite for a league already joined resolves to that league');
assert.strictEqual(run("normalizeInvite(' abcd-1234 ' )"),'ABCD1234','Invite codes ignore spaces and separators');
assert.strictEqual(run("normalizeInvite('https://game.test/app/?invite=abcd-1234')"),'ABCD1234','Invite URLs are accepted in the code field');
run("S.page='scores';location.hash='';");windowListeners.hashchange();
assert.strictEqual(run('S.page'),'play','Back to a URL without a hash returns to Play');
run("S.league={id:'l',status:'lobby',owner_id:'user0',max_teams:2};S.confirmStartDraft=false;S.members=[{user_id:'user0',team_name:'Blue',seat:0},{user_id:'user1',team_name:'Red',seat:1}];");
assert(run('lobbyPage()').includes('data-action="start-draft"'));
run("void act({dataset:{action:'start-draft'}})");
assert(run('lobbyPage()').includes('data-action="confirm-start-draft"'),'Starting a draft opens an inline confirmation');
run("S.league={id:'l',status:'draft'};S.picks=[];S.confirmPick='';");
run("void act({dataset:{action:'pick',slug:'volatility'}})");
assert.strictEqual(run('S.confirmPick'),'volatility','The first draft tap only opens confirmation');
assert(run('draftPage()').includes('data-action="confirm-pick"'));
run("S.confirmPick='volatility'; S.confirmStartDraft=true;");
run("goto('explore')");
assert.strictEqual(run('S.confirmPick'),'','confirmPick reset on page change');
assert.strictEqual(run('S.confirmStartDraft'),false,'confirmStartDraft reset on page change');
run("S.confirmPick='volatility'; S.confirmStartDraft=true;");
windowListeners.hashchange();
assert.strictEqual(run('S.confirmPick'),'','confirmPick reset on hashchange');
assert.strictEqual(run('S.confirmStartDraft'),false,'confirmStartDraft reset on hashchange');
// Last round has 268 possible bench choices; pagination and position filtering keep it usable.
const picks=[];
for(let i=0;i<7;i++)for(let j=0;j<2;j++){
 const a=assets.filter(x=>x.position===['DFIR','SOCIAL','SOC','VULN','DEF','LANG','AI'][i])[j];
 picks.push({pick_no:picks.length+1,member_id:'user'+j,asset_slug:a.slug});
}
run('S.picks='+JSON.stringify(picks));
assert(run('draftPage()').includes('Choose from any position'));
assert(run('draftPage()').includes('Show 36 more'));
run("S.draftPosition='AI'");
const aiBench=run('draftPage()');
assert(aiBench.includes('All positions'));
assert((aiBench.match(/class="player-link"|Taken by /g)||[]).length>=36);
assert(!aiBench.includes('Source for Phishing'));

const all=[];
for(let w=0;w<7;w++){
 run(`S.members=${JSON.stringify(Array.from({length:8},(_,i)=>({user_id:'u'+i,team_name:'T'+i,seat:i})))}`);
 const pairs=JSON.parse(run(`JSON.stringify(schedule(${w}))`));
 assert.strictEqual(pairs.length,4,'4 matchups for 8 teams');
 for(const pair of pairs){assert.notStrictEqual(pair[0],pair[1]);all.push(pair.slice().sort().join('/'));}
}
assert.strictEqual(new Set(all).size,28,'7-week full round-robin');
run(`S.members=[{user_id:'u0',team_name:'T0',seat:0},{user_id:'u1',team_name:'T1',seat:1},{user_id:'u2',team_name:'T2',seat:2}];`);
for(let w=0;w<7;w++) assert.strictEqual(run(`schedule(${w}).length`),1,'Odd team count has a bye');
run(`S.members=[{user_id:'user0',team_name:'Blue',seat:0},{user_id:'user1',team_name:'Red',seat:1}];S.league={id:'l',status:'live',start_on:'2026-11-02',max_teams:2};
S.lineups=[];S.picks=[];S.weekScores=[];S.scores=[];
`);
const date='2026-11-02';const lineups=[];const scores=[];
for(let user of ['user0','user1']){
 for(let i=0;i<7;i++){
  const a=assets.find(x=>x.position===['DFIR','SOCIAL','SOC','VULN','DEF','LANG','AI'][i]&&(user==='user0'?true:x.slug!==assets.find(y=>y.position===x.position).slug));
  assert(a);
  lineups.push({member_id:user,slot:i+1,effective_week:date,asset_slug:a.slug});
  scores.push({asset_slug:a.slug,week_start:date,points:user==='user0'?10:6,event_count:1,source_url:'https://example.com',detail:'Fixture'});
 }
}
// Different people need unique assets; exclude conflicting duplicate asset-week scores.
run('S.lineups='+JSON.stringify(lineups));
run('S.weekScores='+JSON.stringify(scores));
assert.strictEqual(run('weekReady(0)'),true);
assert.strictEqual(run('weekReady(1)'),false);
assert.strictEqual(run("weekStarters('user0','2026-11-02').length"),7);
run("S.weekScores=S.weekScores.filter(x=>asset(x.asset_slug).position!=='DEF');S.defScores=[];");
assert.strictEqual(run('weekReady(0)'),true,'A week can finalize without any DEF data');
run("S.defScores=[{asset_slug:'nvidia',week_start:'2026-11-02'}];");
assert.strictEqual(run('weekReady(0)'),false,'Any DEF score makes each drafted DEF score required');
run('S.weekScores='+JSON.stringify(scores));
assert.strictEqual(run('weekReady(0)'),true,'A week finalizes when DEF data exists and all drafted starters scored');
run('S.weekScores=S.weekScores.slice(0,13)');
assert.strictEqual(run('weekReady(0)'),false,'Incomplete provider data blocks final scores');
assert(run('rulesTab()').includes('Social engineering'));
assert(run('rulesTab()').includes('Tech stocks'));
// A score that has not arrived is pending, never zero.
assert.strictEqual(run("JSON.stringify(weekTotal('user1',1))"),'{"points":0,"measured":0}');
run("S.week=1;");
const pendingWeek=run('scoresPage()');
assert(pendingWeek.includes('>Pending</span>'),'missing scores show as Pending');
assert(!pendingWeek.includes('class="total">0<'),'missing scores never total to zero');
assert(pendingWeek.includes('class="sr">Pending'),'pending score has screen reader indication');
assert(pendingWeek.includes('class="legend"'),'score legend is rendered on pending/bye weeks');
run('S.weekScores='+JSON.stringify(scores)+'; S.week=0;');
const finalWeek=run('scoresPage()');
assert(finalWeek.includes('class="sr">Final'),'final score has screen reader indication');
run(`S.members=[{user_id:'user0',team_name:'Blue',seat:0},{user_id:'user1',team_name:'Red',seat:1},{user_id:'user2',team_name:'Gold',seat:2}]; S.week=0;`);
const byePage=run('scoresPage()');
assert(byePage.includes('you have no match'),'bye week detected in scores');
assert(byePage.includes('class="legend"'),'score legend displayed on bye week');
assert(byePage.includes('total'),'player picks and total shown on bye week');
// A week that has not started shows who plays, with nothing pending or left out yet.
run("S.members=S.members.slice(0,2);S.week=0;S.weekScores=[];S.defScores=[];S.savedStart=S.league.start_on;S.savedLineups=S.lineups;S.league.start_on='2099-01-05';S.lineups=S.lineups.map(x=>({...x,effective_week:'2099-01-05'}));");
const upcomingWeek=run('scoresPage()');
assert(upcomingWeek.includes('Starts Monday Jan 5'));
for(const text of ['Pending','Not counted','scores in','class="legend"','No tech stock scores','except tech stocks'])
 assert(!upcomingWeek.includes(text),`upcoming week does not mention: ${text}`);
assert(upcomingWeek.includes('class="compare"'),'upcoming week still lists both lineups');
run("S.league.start_on=S.savedStart;S.lineups=S.savedLineups;");
console.log('PASS: 268 assets; pagination and bench filters;  seven positions; ordered snake draft; 8-team schedule; byes; lineup and missing-score detection');

// Anonymous sign-in: no email flow, session minted lazily on create/join.
assert(!source.includes('signInWithOtp'),'email OTP flow removed');
run(`S.session=null;var __signins=0;S.client={auth:{signInAnonymously:async()=>{__signins++;return {data:{session:{user:{id:'anon1'}}},error:null};}}};`);
Promise.resolve(run('ensureSession().then(()=>[S.session.user.id,__signins])')).then(r=>{
 assert.strictEqual(JSON.stringify(r),'["anon1",1]','session minted once, reused after');
 run(`S.client={auth:{signInAnonymously:async()=>({data:null,error:{message:'Anonymous sign-ins are disabled'}})}};S.session=null;`);
 return run('ensureSession()').then(()=>{throw Error('should fail');},e=>assert(/Supabase/.test(e.message)));
}).then(()=>{
 console.log('PASS: anonymous sign-in flow');

 // 1. Form inputs and focus preserved across render()
 let focusedField = null;
 const mockInput = {id:'create-league-name',name:'leagueName',value:'Test Redux',selectionStart:4,selectionEnd:4,focus(){focusedField=this.id;},setSelectionRange(s,e){this.selStart=s;this.selEnd=e;}};
 const mockInput2 = {id:'create-team-name',name:'teamName',value:'Cyber Defenders',selectionStart:0,selectionEnd:0,focus(){focusedField=this.id;}};
 const mockInput3 = {id:'create-pick-seconds',name:'pickSeconds',value:'90',focus(){focusedField=this.id;}};
 const mockForm = {elements:[mockInput, mockInput2, mockInput3]};
 nodes['create-league'] = mockForm;
 nodes['create-league-name'] = mockInput;
 nodes['create-team-name'] = mockInput2;
 nodes['create-pick-seconds'] = mockInput3;
 ctx.document.activeElement = mockInput;
 run('render()');
 assert.strictEqual(mockInput.value, 'Test Redux', 'Form input value preserved across render');
 assert.strictEqual(mockInput2.value, 'Cyber Defenders', 'Second form input preserved');
 assert.strictEqual(focusedField, 'create-league-name', 'Focus restored to active element');
 assert.strictEqual(mockInput.selStart, 4, 'Selection range restored');

 // 2. Four destinations, old links still land, one current page marked
 run("S.page='scores'; nav();");
 assert.strictEqual((nodes['navigation'].innerHTML.match(/data-page=/g)||[]).length,4);
 assert(nodes['navigation'].innerHTML.includes('data-page="scores" aria-current="page"'));
 for(const [hash,page,tab] of [['#pool','explore','players'],['#rules','explore','rules'],['#events','explore','sources'],['#roster','play',null],['#standings','scores',null],['#explore/sources','explore','sources']]){
  ctx.location.hash=hash; assert.strictEqual(run('readHash()'),true,hash); assert.strictEqual(run('S.page'),page,hash); if(tab)assert.strictEqual(run('S.tab'),tab,hash);
 }

 // 3. Opening ?invite=CODE while already in a different league lets user reach join form
 run(`S.sessionLoading=false;S.league={id:'l_other',name:'Other League',invite_code:'DIFFCODE99',status:'lobby'}; S.invite='TARGETINVITE';`);
 const joinReach = run('leaguesPage()');
 assert(joinReach.includes('join-league'), 'Reaches join form when invite is for a different league');
 assert(joinReach.includes('TARGETINVITE'), 'Join form has target invite code prefilled');
 assert(joinReach.includes('You have been invited'));
 assert(!joinReach.includes('Other League'), 'Does not trap user in other league room');

 // 4. Forms are labelled; owner of a lobby gets one next action; finished season offers no lineup save
 assert(joinReach.includes('for="create-league-name"') && joinReach.includes('id="create-league-name"'));
 assert(joinReach.includes('for="join-invite"') && joinReach.includes('id="join-invite"'));
 run(`S.confirmStartDraft=false;S.invite=''; S.session={user:{id:'user0'}}; S.members=[{user_id:'user0',team_name:'Blue',seat:0}];
 S.league={id:'l',name:'Test League',status:'lobby',invite_code:'ABCD1234',owner_id:'user0',max_teams:2};`);
 assert(!run('playPage()').includes('data-action="start-draft"'),'cannot start alone');
 assert(run('leaguesPage()').includes('Open seat'));
 run(`S.members.push({user_id:'user1',team_name:'Red',seat:1});`);
 assert(run('playPage()').includes('data-action="start-draft"'));
 const samplePicks = [
  {pick_no:1,member_id:'user0',asset_slug:'volatility'},
  {pick_no:2,member_id:'user0',asset_slug:'autopsy'}
 ];
 run(`S.league={id:'l',status:'live',start_on:'2020-01-06',max_teams:2}; S.picks=${JSON.stringify(samplePicks)};`);
 assert(!run('playPage()').includes('save-lineup'),'no lineup save after the season');
 assert(run('playPage()').includes('The season is over'));
 assert(run('playPage()').includes('Starters') && run('playPage()').includes('Bench'),'starters and bench visible read-only under notice');

 // 5. Team names are escaped everywhere they are printed
 run(`S.league={id:'l',status:'draft',max_teams:2}; S.picks=[]; S.members[1].team_name='<img src=x>';`);
 assert(!run('draftPage()').includes('<img'), 'team names are escaped');

 // 6. Guest immediate intro vs stored session loading (Item A)
 run("S.sessionLoading=false; S.leagues=[]; S.league=null;");
 const guestIntro=run('introPage()');
 assert(guestIntro.includes('A fantasy league for cybersecurity'),'guests see intro immediately');
 assert(!guestIntro.includes('Loading your leagues'),'guests do not see loading state');
 run("S.sessionLoading=true;");
 assert(run('introPage()').includes('Loading your leagues'),'loading state shown when session exists');
 assert.strictEqual(run('hasStoredSession()'),false,'no stored session initially');
 storage.set('sb-test-auth-token',JSON.stringify({access_token:'fake_token'}));
 assert.strictEqual(run('hasStoredSession()'),true,'stored session detected in localStorage');
 storage.clear();

 // 7. Join/create error appears only with the form that failed (Item B)
 run("S.sessionLoading=false; S.invite=''; S.league=null; S.leagues=[];");
 run("S.formError='Invalid invite code'; S.formErrorFor='join-league';");
 const joinErrPage=run('setupPage()');
 assert(joinErrPage.includes('Invalid invite code'),'join error shown');
 assert(joinErrPage.slice(0,joinErrPage.indexOf('Start a new league')).includes('Invalid invite code'),'error placed before join form');
 assert(!joinErrPage.slice(joinErrPage.indexOf('Start a new league')).includes('Invalid invite code'),'error not shown on create form');
 run("S.formError='League name is taken'; S.formErrorFor='create-league';");
 const createErrPage=run('setupPage()');
 assert(createErrPage.includes('League name is taken'),'create error shown');
 assert(!createErrPage.slice(0,createErrPage.indexOf('Start a new league')).includes('League name is taken'),'create error not shown with join form');
 assert(createErrPage.slice(createErrPage.indexOf('Start a new league')).includes('League name is taken'),'create error placed with create form');
 run("S.formError=''; S.formErrorFor='';");

 // 8. Remember last open league id and show league list on Scores if 2+ leagues (Item E)
 run("setSavedLeagueId('saved_league_42');");
 assert.strictEqual(run('getSavedLeagueId()'),'saved_league_42','league id remembered');
 run("setSavedLeagueId('');");
 assert.strictEqual(run('getSavedLeagueId()'),'','remembered league cleared');
 run("S.league=null; S.leagues=[{id:'l1',name:'League 1',status:'live',team_name:'T1'},{id:'l2',name:'League 2',status:'live',team_name:'T2'}];");
 const multiScores=run('scoresPage()');
 assert(multiScores.includes('Choose a league'),'Scores shows league chooser when 2+ leagues and none open');
 assert(multiScores.includes('League 1') && multiScores.includes('League 2'),'All leagues listed on Scores');

 console.log('PASS: form preservation, navigation, invite handling, states and escaping');
});

// Switching leagues while another league is still loading must not leave the new one empty,
// and a change that arrives during a load triggers one more load.
(async()=>{
 await new Promise(r=>setImmediate(r)); // let the earlier async checks finish first
 const held={};let loads={};
 const result=(table,id)=>table==='leagues'?{id,name:id,status:'lobby',invite_code:'X',owner_id:'me',max_teams:2}:[];
 ctx.__client={from(table){let id;const q={select:()=>q,order:()=>q,single:()=>q,eq:(_k,v)=>{id=v;return q;},
   then(resolve){if(table==='leagues')loads[id]=(loads[id]||0)+1;const send=()=>resolve({data:result(table,id),error:null});if(id==='A'&&table==='leagues'&&!held.A)held.A=send;else send();}};return q;}};
 run("S.client=__client;S.session={user:{id:'me'}};S.league=null;S.refreshing=null;S.leagueId='A';");
 const first=run('roomRefresh()');
 await Promise.resolve();
 run("S.leagueId='B'");
 assert.strictEqual(await run('roomRefresh()'),true,'league B loads while A is in flight');
 held.A();await first;
 assert.strictEqual(run('S.league.id'),'B','stale league A response ignored');
 delete held.A;run("S.leagueId='A';S.league=null;");
 const again=run('roomRefresh()');await Promise.resolve();
 await run('roomRefresh()');
 held.A();await again;await new Promise(r=>setImmediate(r));
 assert.strictEqual(loads.A,3,'a change during a load causes one follow-up load');
 console.log('PASS: league switching and mid-load changes');

 // A pick made elsewhere (another tab) cancels a half-confirmed pick, even in the same round.
 ctx.__client={from(table){const q={select:()=>q,order:()=>q,single:()=>q,eq:()=>q,
   then(resolve){resolve({error:null,data:table==='leagues'?{id:'C',status:'draft',owner_id:'me',max_teams:2}:table==='league_members'?[{user_id:'me',seat:0,team_name:'Me'},{user_id:'you',seat:1,team_name:'You'}]:table==='draft_picks'?[{pick_no:1,member_id:'me',asset_slug:'volatility'}]:[]});}};return q;}};
 run("S.client=__client;S.leagueId='C';S.league=null;S.picks=[];S.members=[];S.refreshing=null;S.confirmPick='autopsy';");
 await run('roomRefresh()');
 assert.strictEqual(run('S.confirmPick'),'','stale pick confirmation is cleared');
 console.log('PASS: stale confirmation cleared');

 // 9. Rank labels and ordering (Contract: rankings, draft clock, autodraft, auto lineup)
 run(`
 S.rankings = [
   {asset_slug:'volatility',position:'DFIR',rank:3,avg_points:12.5,weeks_scored:2},
   {asset_slug:'autopsy',position:'DFIR',rank:9,avg_points:null,weeks_scored:0},
   {asset_slug:'plaso',position:'DFIR',rank:1,avg_points:10,weeks_scored:1}
 ];
 `);
 assert.strictEqual(run("assetScoreLabel('volatility')"),'Rank 3 · averages 12.5 points over 2 weeks','Rank with multiple weeks');
 assert.strictEqual(run("assetScoreLabel('autopsy')"),'Rank 9 · no score yet','Unscored rank');
 assert.strictEqual(run("assetScoreLabel('plaso')"),'Rank 1 · averages 10 points over 1 week','Rank with 1 week');

 // Draft ordering in round 1 (DFIR): Plaso (rank 1) < Volatility 3 (rank 3) < Autopsy (rank 9)
 run("S.league={id:'l',status:'draft',pick_seconds:90,max_teams:2}; S.picks=[]; S.draftRound=0; S.query=''; S.confirmPick='';");
 const draftDFIR = run('draftPage()');
 const idxPlaso = draftDFIR.indexOf('Plaso');
 const idxVol = draftDFIR.indexOf('Volatility 3');
 const idxAutopsy = draftDFIR.indexOf('Autopsy');
 assert(idxPlaso !== -1 && idxVol !== -1 && idxAutopsy !== -1, 'All DFIR assets present in draft');
 assert(idxPlaso < idxVol && idxVol < idxAutopsy, 'Draft candidates sorted by rank');

 // Explore ordering: one position selected sorts by rank
 run("S.poolPosition='DFIR'; S.poolQuery='';");
 const exploreDFIR = run('playersTab()');
 const expPlaso = exploreDFIR.indexOf('Plaso');
 const expVol = exploreDFIR.indexOf('Volatility 3');
 const expAutopsy = exploreDFIR.indexOf('Autopsy');
 assert(expPlaso < expVol && expVol < expAutopsy, 'Explore position filter sorts by rank');

 // Explore ordering: ALL positions selected preserves catalog order
 run("S.poolPosition='ALL'; S.poolQuery='';");
 const exploreAll = run('playersTab()');
 assert(exploreAll.includes('268 of 268 players'));

 // Bench round ordering: sorted by average descending, unscored last
 const benchPicks=[];
 for(let i=0;i<7;i++)for(let j=0;j<2;j++){
  const a=assets.filter(x=>x.position===['DFIR','SOCIAL','SOC','VULN','DEF','LANG','AI'][i])[10+j];
  benchPicks.push({pick_no:benchPicks.length+1,member_id:'user'+j,asset_slug:a.slug});
 }
 run('S.picks='+JSON.stringify(benchPicks)+'; S.draftRound=7; S.draftPosition="ALL"; S.query="";');
 const benchDraft = run('draftPage()');
 const bPlaso = benchDraft.indexOf('Plaso'); // avg 10
 const bVol = benchDraft.indexOf('Volatility 3'); // avg 12.5
 const bAutopsy = benchDraft.indexOf('Autopsy'); // unscored
 assert(bVol < bPlaso, 'Higher avg points (12.5) comes before lower avg points (10) in bench round');
 assert(bPlaso < bAutopsy, 'Scored assets come before unscored assets in bench round');

 // Fallback when rankings cannot be loaded (S.rankings = null)
 run("S.rankings=null;");
 assert.strictEqual(run("assetScoreLabel('volatility')"),'14 points, week of Nov 16','fallback to latest public score');
 assert.strictEqual(run("assetScoreLabel('unknown')"),'No score yet','fallback to No score yet');
 console.log('PASS: rank labels, draft ordering, explore ordering, and fallback');

 // 10. The time-per-pick form value and lobby choice
 run("S.invite=''; S.league=null; S.leagues=[];");
 const setupHtml = run('setupPage()');
 assert(setupHtml.includes('name="pickSeconds"'), 'Pick seconds select in create league form');
 assert(setupHtml.includes('value="90" selected'), '90s is the default time per pick');
 for(const [val, lbl] of [['30','30 seconds'],['60','60 seconds'],['90','90 seconds'],['120','2 minutes'],['300','5 minutes'],['3600','1 hour'],['28800','8 hours'],['0','No timer']]){
  assert(setupHtml.includes(`value="${val}"`), `Option value ${val} present`);
  assert(setupHtml.includes(`>${lbl}<`), `Option label ${lbl} present`);
 }

 // Lobby shows the choice
 run("S.session={user:{id:'user0'}}; S.league={id:'l',name:'Test League',status:'lobby',owner_id:'user0',max_teams:2,pick_seconds:90}; S.members=[{user_id:'user0',team_name:'Blue',seat:0}];");
 assert(run('lobbyPage()').includes('Time per pick: 90 seconds.'), 'Lobby shows the time per pick as a sentence');
 run("S.league.pick_seconds=0;");
 assert(run('lobbyPage()').includes('Picks are not timed.'), 'Lobby says picks are untimed');
 run("S.league.pick_seconds=3600;");
 assert(run('lobbyPage()').includes('Time per pick: 1 hour.'), 'Lobby shows 1 hour');
 console.log('PASS: time-per-pick form value and lobby choice');

 // 11. Countdown rendering
 run("S.league={id:'l',name:'Test League',status:'draft',pick_seconds:90,max_teams:2}; S.picks=[]; S.clockSeconds=90;");
 assert(run('draftPage()').includes('id="draft-clock"'), 'Draft page renders draft clock element');
 assert(run('draftPage()').includes('1:30'), 'Draft page displays 1:30 for 90s');
 run("S.clockSeconds=75;");
 assert(run('draftPage()').includes('1:15'), 'Draft page displays 1:15 for 75s');
 run("S.clockSeconds=5;");
 assert(run('draftPage()').includes('0:05'), 'Draft page displays 0:05 for 5s');
 run("S.clockSeconds=3600;");
 assert(run('draftPage()').includes('1:00:00'), 'Draft page displays 1:00:00 for 3600s');
 console.log('PASS: countdown rendering');

 // 12. Auto_pick called once at zero with right pick number
 let rpcCalls = [];
 ctx.__client={
   from(table){
     let isSingle=false;
     const q={select:()=>q,order:()=>q,single:()=>{isSingle=true;return q;},eq:()=>q,in:()=>q,gte:()=>q,lt:()=>q,limit:()=>q,
     then(resolve){
       const lg=run('S.league')||{id:'l',status:'lobby',max_teams:2};
       const mb=run('S.members')||[];
       const pk=run('S.picks')||[];
       const data = table==='leagues'?(isSingle?lg:[lg]):table==='league_members'?mb:table==='draft_picks'?pk:[];
       resolve({error:null,data});
     }};
     return q;
   },
   rpc(name, args){
     rpcCalls.push({name, args});
     if(name==='draft_clock') return Promise.resolve({data: 90, error: null});
     if(name==='league_week_scores') return Promise.resolve({data: [], error: null});
     return Promise.resolve({data: true, error: null});
   }
 };
 run("S.client=__client; S.leagueId='l'; S.league={id:'l',status:'draft',pick_seconds:90,max_teams:2}; S.picks=[{pick_no:1,member_id:'user0',asset_slug:'volatility'}]; S.members=[{user_id:'user0',seat:0,team_name:'Blue'},{user_id:'user1',seat:1,team_name:'Red'}];");
 run("S.session={user:{id:'user1'}};"); // user1 is the picker on the clock (round 0, seat 1)
 assert.strictEqual(run('nextPicker().user_id'),'user1','user1 is on the clock');
 rpcCalls = [];
 await run('doAutoPick(2)');
 const autoPickCalls = rpcCalls.filter(c => c.name === 'auto_pick');
 assert.strictEqual(autoPickCalls.length, 1, 'auto_pick called once');
 assert.strictEqual(autoPickCalls[0].args.p_league_id, 'l');
 assert.strictEqual(autoPickCalls[0].args.p_pick_no, 2, 'auto_pick called with next pick number 2');
 console.log('PASS: auto_pick called once at zero with right pick number');

 // 13. Both toggles calling their RPC
 // Toggle 1: Autodraft toggle in lobby & draft
 run("S.session={user:{id:'user0'}}; S.league={id:'l',status:'lobby',pick_seconds:90,max_teams:2}; S.members=[{user_id:'user0',seat:0,team_name:'Blue',autodraft:false}];");
 assert(run('lobbyPage()').includes('id="toggle-autodraft"'), 'Autodraft toggle rendered in lobby');
 rpcCalls = [];
 await run("act({dataset:{action:'toggle-autodraft'}})");
 const autoDraftOn = rpcCalls.filter(c => c.name === 'set_autodraft');
 assert.strictEqual(autoDraftOn.length, 1);
 assert.strictEqual(autoDraftOn[0].args.p_league_id, 'l');
 assert.strictEqual(autoDraftOn[0].args.p_on, true, 'Autodraft turned ON');
 assert.strictEqual(run("myMember().autodraft"), true);

 rpcCalls = [];
 await run("act({dataset:{action:'toggle-autodraft'}})");
 const autoDraftOff = rpcCalls.filter(c => c.name === 'set_autodraft');
 assert.strictEqual(autoDraftOff.length, 1);
 assert.strictEqual(autoDraftOff[0].args.p_on, false, 'Autodraft turned OFF');
 assert.strictEqual(run("myMember().autodraft"), false);

 // Toggle 2: Auto lineup toggle in lineup
 run("S.league={id:'l',status:'live',pick_seconds:90,start_on:'2026-11-02',max_teams:2}; S.members=[{user_id:'user0',seat:0,team_name:'Blue',auto_lineup:false}]; S.picks=S.picks; S.lineups=[];");
 assert(run('lineupPage()').includes('id="toggle-auto-lineup"'), 'Auto lineup toggle rendered');
 rpcCalls = [];
 await run("act({dataset:{action:'toggle-auto-lineup'}})");
 const autoLineupOn = rpcCalls.filter(c => c.name === 'set_auto_lineup');
 assert.strictEqual(autoLineupOn.length, 1);
 assert.strictEqual(autoLineupOn[0].args.p_league_id, 'l');
 assert.strictEqual(autoLineupOn[0].args.p_on, true, 'Auto lineup turned ON');
 assert.strictEqual(run("myMember().auto_lineup"), true);
 const autoLineupHtml = run('lineupPage()');
 assert(autoLineupHtml.includes('Turn automatic lineups off to choose your own.'), 'Notice when auto lineup is on');

 // Auto picks marked as auto in draft route table and latest picks
 run("S.picks=[{pick_no:1,member_id:'user0',asset_slug:'volatility',auto:true},{pick_no:2,member_id:'user1',asset_slug:'autopsy',auto:false}];");
 run("S.league.status='draft';");
 const routeHtml = run('route()');
 assert(routeHtml.includes('class="auto">auto</span>'), 'auto badge present in draft route');
 const latestPicksHtml = run('latestPicks()');
 assert(latestPicksHtml.includes('class="auto">auto</span>'), 'auto badge present in latest picks');

 // On room refresh in a live league where team has auto_lineup on, refresh_auto_lineups is called
 run("S.league.status='live';");
 rpcCalls = [];
 await run('roomRefresh()');
 const refCall = rpcCalls.find(c => c.name === 'refresh_auto_lineups');
 assert(refCall, 'refresh_auto_lineups called during roomRefresh for live auto_lineup team');
 assert.strictEqual(refCall.args.p_league_id, 'l');
 console.log('PASS: both toggles call their RPCs and refresh_auto_lineups runs');

 // 14. Not-yet-upgraded database fallback
 // When pick_seconds is undefined on league: new controls are hidden
 run("S.league={id:'l',status:'lobby',max_teams:2,owner_id:'user0'}; S.members=[{user_id:'user0',seat:0,team_name:'Blue'}];"); // pick_seconds undefined
 assert(!run('lobbyPage()').includes('per pick'), 'no timer shown in lobby for un-upgraded league');
 assert(!run('lobbyPage()').includes('id="toggle-autodraft"'), 'no autodraft toggle in un-upgraded lobby');
 run("S.league.status='draft'; S.clockSeconds=90;");
 assert(!run('draftPage()').includes('id="draft-clock"'), 'no clock in un-upgraded draft');
 assert(!run('draftPage()').includes('id="toggle-autodraft"'), 'no autodraft toggle in un-upgraded draft');
 run("S.league.status='live'; S.league.start_on='2026-11-02';");
 assert(!run('lineupPage()').includes('id="toggle-auto-lineup"'), 'no auto lineup toggle in un-upgraded live league');

 // create_league PGRST202 retry without p_pick_seconds
 let createCalls = [];
 ctx.__client.rpc = (name, args) => {
   if (name === 'create_league') {
     createCalls.push({name, args});
     if (args.p_pick_seconds !== undefined) {
       return Promise.resolve({data: null, error: {code: 'PGRST202', message: 'function not found'}});
     }
     return Promise.resolve({data: 'new_league_id', error: null});
   }
   return Promise.resolve({data: true, error: null});
 };
 run("S.client=__client; S.session={user:{id:'user0'}};");
 await run(`formSubmit({
   target: {
     id: 'create-league',
     querySelector: () => ({disabled: false}),
     elements: [
       {name: 'leagueName', value: 'Fallback League'},
       {name: 'teamName', value: 'Fallback Team'},
       {name: 'maxTeams', value: '4'},
       {name: 'pickSeconds', value: '60'}
     ]
   },
   preventDefault: () => {}
 })`);
 assert.strictEqual(createCalls.length, 2, 'create_league called twice (initial + retry)');
 assert.strictEqual(createCalls[0].args.p_pick_seconds, 60, 'Initial call had p_pick_seconds');
 assert.strictEqual(createCalls[1].args.p_pick_seconds, undefined, 'Retry call omitted p_pick_seconds on PGRST202');
 console.log('PASS: not-yet-upgraded database fallbacks');
})().catch(e=>{console.error(e);process.exit(1);});
