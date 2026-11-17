'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../site/multiplayer.js','utf8').replace('void init();','/* init omitted for isolated tests */');
const assets=JSON.parse(fs.readFileSync(__dirname+'/../site/data/assets.json','utf8'));
const nodes={};const element=id=>nodes[id]||(nodes[id]={innerHTML:'',textContent:'',addEventListener(){},classList:{add(){},remove(){},toggle(){}},append(){}});
const ctx={console,window:{CIPHER_CONFIG:{},scrollTo(){}},document:{getElementById:element,addEventListener(){},createElement(){return {className:'',textContent:'',remove(){}}}},location:{hash:'',origin:'https://game.test',pathname:'/app/',search:''},navigator:{},URL,URLSearchParams,Date,Set,Map,setTimeout(){}};
vm.createContext(ctx);
vm.runInContext(source,ctx);
const run=s=>vm.runInContext(s,ctx);
run('S.assets='+JSON.stringify(assets));
assert.strictEqual(run('POSITIONS.length'),7);
assert(run('poolPage()').includes('268 candidates match'));
assert.strictEqual((run('poolPage()').match(/class=\"asset-card\"/g)||[]).length,48,'48 guest catalog entries initially');
assert(run('poolPage()').includes('SHOW 48 MORE'));
run("S.poolPosition='DEF'");
assert(run('poolPage()').includes('45 of 268 candidates match'));
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
assert(run('draftPage()').includes('DFIR / Forensics'));
assert(run('draftPage()').includes('Volatility 3'));
assert(run('draftPage()').includes('REAL-WORLD SOURCE'));
assert(run('draftPage()').includes('33 MATCHES')); 
assert(!run('draftPage()').includes('<h3>Python</h3>'));
run(`S.picks=[{pick_no:1,member_id:'user0',asset_slug:'volatility'}, {pick_no:2,member_id:'user1',asset_slug:'autopsy'}]`);
assert(run('draftPage()').includes('SOCIAL / Social Engineering'));
assert(run('draftPage()').includes('<h3>Phishing</h3>'));
assert(!run('draftPage()').includes('<h3>Volatility 3</h3>'));
assert.strictEqual(run('nextPicker().user_id'),'user1','Reverse order in snake round two');
// Last round has 268 possible bench choices; pagination and position filtering keep it usable.
const picks=[];
for(let i=0;i<7;i++)for(let j=0;j<2;j++){
 const a=assets.filter(x=>x.position===['DFIR','SOCIAL','SOC','VULN','DEF','LANG','AI'][i])[j];
 picks.push({pick_no:picks.length+1,member_id:'user'+j,asset_slug:a.slug});
}
run('S.picks='+JSON.stringify(picks));
assert(run('draftPage()').includes('ANY POSITION / BENCH'));
assert(run('draftPage()').includes('SHOW 36 MORE CANDIDATES'));
run("S.draftPosition='AI'");
const aiBench=run('draftPage()');
assert(aiBench.includes('All seven positions'));
assert(aiBench.includes('40 MATCHES'));
assert(!aiBench.includes('<h3>Phishing</h3>'));

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
assert(run('rulesPage()').includes('Social Engineering'));
assert(run('rulesPage()').includes('Stock'));
console.log('PASS: 268 assets; pagination and bench filters;  seven positions; ordered snake draft; 8-team schedule; byes; lineup and missing-score detection');
