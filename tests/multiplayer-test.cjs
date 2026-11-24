'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../site/multiplayer.js','utf8').replace('void init();','/* init omitted for isolated tests */');
const assets=JSON.parse(fs.readFileSync(__dirname+'/../site/data/assets.json','utf8'));
const nodes={};const element=id=>nodes[id]||(nodes[id]={innerHTML:'',textContent:'',addEventListener(){},classList:{add(){},remove(){},toggle(){}},append(){}});
const ctx={console,window:{CIPHER_CONFIG:{supabaseUrl:'https://test.supabase.co',supabaseAnonKey:'anon-key'},scrollTo(){},addEventListener(){}},document:{getElementById:element,addEventListener(){},createElement(){return {className:'',textContent:'',remove(){}}}},location:{hash:'',origin:'https://game.test',pathname:'/app/',search:''},navigator:{},URL,URLSearchParams,Date,Set,Map,setTimeout(){}};
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
assert(run('draftPage()').includes('Source for Volatility 3'));
assert(run('draftPage()').includes('33 available'));
assert(!run('draftPage()').includes('<strong>Python</strong>'));
run(`S.picks=[{pick_no:1,member_id:'user0',asset_slug:'volatility'}, {pick_no:2,member_id:'user1',asset_slug:'autopsy'}]`);
assert(run('draftPage()').includes('Red is picking'));
assert(run('draftPage()').includes('Ways attackers trick people'));
assert(run('draftPage()').includes('<strong>Phishing</strong>'));
assert(!run('draftPage()').includes('Source for Volatility 3'));
assert.strictEqual(run('nextPicker().user_id'),'user1','Reverse order in snake round two');
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
assert((aiBench.match(/aria-label="Source for |Taken by /g)||[]).length>=36);
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
 const mockForm = {elements:[mockInput, mockInput2]};
 nodes['create-league'] = mockForm;
 nodes['create-league-name'] = mockInput;
 nodes['create-team-name'] = mockInput2;
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
 run(`S.league={id:'l_other',name:'Other League',invite_code:'DIFFCODE99',status:'lobby'}; S.invite='TARGETINVITE';`);
 const joinReach = run('leaguesPage()');
 assert(joinReach.includes('join-league'), 'Reaches join form when invite is for a different league');
 assert(joinReach.includes('TARGETINVITE'), 'Join form has target invite code prefilled');
 assert(joinReach.includes('You have been invited'));
 assert(!joinReach.includes('Other League'), 'Does not trap user in other league room');

 // 4. Forms are labelled; owner of a lobby gets one next action; finished season offers no lineup save
 assert(joinReach.includes('for="create-league-name"') && joinReach.includes('id="create-league-name"'));
 assert(joinReach.includes('for="join-invite"') && joinReach.includes('id="join-invite"'));
 run(`S.invite=''; S.session={user:{id:'user0'}}; S.members=[{user_id:'user0',team_name:'Blue',seat:0}];
 S.league={id:'l',name:'Test League',status:'lobby',invite_code:'ABCD1234',owner_id:'user0',max_teams:2};`);
 assert(!run('playPage()').includes('data-action="start-draft"'),'cannot start alone');
 assert(run('leaguesPage()').includes('Open seat'));
 run(`S.members.push({user_id:'user1',team_name:'Red',seat:1});`);
 assert(run('playPage()').includes('data-action="start-draft"'));
 run(`S.league={id:'l',status:'live',start_on:'2020-01-06',max_teams:2};`);
 assert(!run('playPage()').includes('save-lineup'),'no lineup save after the season');
 assert(run('playPage()').includes('The season is over'));

 // 5. Team names are escaped everywhere they are printed
 run(`S.league={id:'l',status:'draft',max_teams:2}; S.picks=[]; S.members[1].team_name='<img src=x>';`);
 assert(!run('draftPage()').includes('<img'), 'team names are escaped');

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
})().catch(e=>{console.error(e);process.exit(1);});
