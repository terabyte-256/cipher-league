const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync(__dirname+'/../site/app.js','utf8');
const nodes = new Map();
const node = (id)=>{if(!nodes.has(id))nodes.set(id,{id,innerHTML:'',textContent:'',classList:{add(){},remove(){}},value:'',addEventListener(){},append(){}});return nodes.get(id);};
const saves=new Map();
const ctx = {
  console,
  document:{getElementById:node, querySelectorAll:()=>[], addEventListener:()=>{}, body:{append(){}},createElement:()=>({click(){},remove(){},append(){},className:'',textContent:'',href:'',download:''})},
  window:{addEventListener(){},scrollTo(){}},
  location:{hash:'',href:'https://example.net/game/'},
  localStorage:{getItem:k=>saves.get(k),setItem:(k,v)=>saves.set(k,v)},
  navigator:{},URL:{createObjectURL:()=>'',revokeObjectURL(){}},Blob:class {}, setTimeout(){},
};
vm.createContext(ctx);
vm.runInContext(source,ctx);
vm.runInContext(`
(function(){
  function okay(test,msg){if(!test)throw new Error(msg);}
  okay(PLAYER_POOL.length===100,'100 playable players');
  okay(new Set(PLAYER_POOL.map(p=>p.id)).size===100,'unique player ids');
  okay(game.teams.length===8,'8 teams');
  okay(game.teams.every(t=>t.roster.length===8),'initial 8 slots each');
  okay(new Set(game.teams.flatMap(t=>t.roster)).size===64,'initial rosters unique');
  okay(game.teams.every(t=>SLOTS.every(s=>validForSlot(t.lineup[s],s))),'all starting lineups valid');
  okay(renderOverview().includes('YOUR OPERATION'),'overview renders');
  okay(renderRoster().includes('My Roster'),'roster renders');
  okay(renderLeaderboard().includes('Leaderboard'),'leaderboard renders');
  okay(renderMarket().includes('Free Agents'),'market renders');
  okay(renderHowto().includes('How to Play'),'guide renders');
  okay(renderSettings().includes('League Settings'),'settings render');
  okay(renderMatchups().includes('Matchups'),'matchups renders');
  for(let w=1;w<=7;w++){
    let pairs=roundRobin(w);
    okay(pairs.length===4 && new Set(pairs.flat()).size===8,'valid regular schedule');
  }
  let allPairs=Array.from({length:7},(_,i)=>roundRobin(i+1)).flat().map(pair=>pair.sort((a,b)=>a-b).join('-'));
  okay(new Set(allPairs).size===28,'everyone plays all others once');
  startDraft();
  okay(game.draft.active && game.draft.pick===0,'new draft started');
  for(let i=0;i<8;i++){
    let pid=availablePlayers().sort((a,b)=>b.rating-a.rating)[0].id;
    draftPlayer(pid);
  }
  okay(!game.draft.active && game.draft.pick===64,'snake draft completed');
  okay(game.teams.every(t=>t.roster.length===8),'draft fills teams');
  okay(new Set(game.teams.flatMap(t=>t.roster)).size===64,'draft unique selections');
  okay(game.week===1,'draft resets season');
  let available=availablePlayers()[0].id, old=userTeam().roster[7];
  signPlayer(available,old);
  okay(userTeam().roster.includes(available)&&!userTeam().roster.includes(old),'free agent signing works');
  for(let w=1;w<=9;w++){
    playWeek();
    okay(game.week===w+1,'week advancement '+w);
    okay(game.results[w].length===(w<=7?4:2),'match results '+w);
  }
  okay(game.results[9]&&winnerId(game.results[9][0])>=0,'championship winner');
  okay(leagueTable().reduce((n,t)=>n+t.wins,0)===28,'regular season total wins');
  okay(leagueTable().reduce((n,t)=>n+t.losses,0)===28,'regular season total losses');
  okay(validateSave(JSON.parse(JSON.stringify(game))),'saved state validates');
  console.log('PASSED: 100 players, 8 teams, 7-week round robin, draft, trades, full 9-week season, UI renderer, save schema.');
})();`,ctx);
