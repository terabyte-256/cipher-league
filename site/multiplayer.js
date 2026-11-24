'use strict';
// Cipher League: a seven-position draft scored on externally collected public data.
// The browser never calculates, writes or invents authoritative scores.

// One definition per position, reused on every screen. The letter and colour never change.
const POSITIONS = [
  {code:'DFIR',letter:'F',name:'Forensics',tracks:'Tools investigators use to work out what happened on a computer.',how:'3 points per merged pull request and 8 per release on GitHub, up to 30.'},
  {code:'SOCIAL',letter:'S',name:'Social engineering',tracks:'Ways attackers trick people, such as phishing.',how:'2 × log₂(1 + English-language news articles), rounded, up to 30. Counts coverage, not attacks.'},
  {code:'SOC',letter:'D',name:'Detection',tracks:'Tools that watch systems and raise alerts.',how:'3 points per merged pull request and 8 per release on GitHub, up to 30.'},
  {code:'VULN',letter:'V',name:'Vulnerabilities',tracks:'Vendors whose software flaws attackers are using.',how:'12 points per new entry on CISA’s Known Exploited Vulnerabilities list, plus 6 if ransomware is known to use it.'},
  {code:'DEF',letter:'T',name:'Tech stocks',tracks:'Large technology and security companies.',how:'5 + 3 × the week’s percent price change, rounded, from −20 to 35.'},
  {code:'LANG',letter:'L',name:'Languages',tracks:'Programming languages.',how:'2 × log₂(1 + new public GitHub repositories that week), rounded, up to 30.'},
  {code:'AI',letter:'A',name:'AI models',tracks:'Models published on Hugging Face.',how:'1 point per 2 new likes during the week, up to 30.'}
];
const BENCH = {code:'BENCH',letter:'B',name:'Bench'};
const PAGES = [['play','Play'],['scores','Scores'],['explore','Explore'],['league','League']];
const TABS = [['players','Players'],['rules','How to play'],['sources','Sources']];
// Old links keep working.
const OLD_HASHES = {home:['play'],draft:['play'],roster:['play'],standings:['scores'],pool:['explore','players'],rules:['explore','rules'],events:['explore','sources']};
const ERRORS = {
  'Invite code not found':'No league has that invite code. Check it and try again.',
  'League draft already started':'That league has already started its draft, so no new teams can join.',
  'League full':'That league is full.',
  'League limit reached':'This device is already in 15 leagues, which is the limit.',
  'Not your turn':'It is not your turn yet.',
  'Already drafted':'Someone already drafted that one. Pick another.',
  'Invite at least one other human player':'The draft needs at least 2 teams.',
  'Season is over':'The seven-week season has ended.'
};
const CONFIG = window.CIPHER_CONFIG || {};
const CONFIGURED = /^https:\/\/[^/]+\.supabase\.co\/?$/.test(CONFIG.supabaseUrl||'') && !!CONFIG.supabaseAnonKey;
const S = {assets:[],feed:null,catalogError:'',client:null,session:null,leagues:[],league:null,leagueId:null,
  members:[],picks:[],lineups:[],scores:[],weekScores:[],kevs:[],page:'play',tab:'players',week:0,
  query:'',lineup:{},invite:(new URLSearchParams(location.search).get('invite')||'').trim().toUpperCase(),
  channel:null,refreshing:null,again:false,draftVisible:36,draftRound:-1,draftPosition:'ALL',poolPosition:'ALL',poolQuery:'',poolVisible:48};

const $ = id=>document.getElementById(id);
const esc = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateUTC = s=>Date.parse(s+'T00:00:00Z');
const plusDays = (s,n)=>new Date(dateUTC(s)+n*86400000).toISOString().slice(0,10);
const today = ()=>new Date().toISOString().slice(0,10);
const prettyDate = s=>s?new Date(dateUTC(s)).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}):'to be decided';
const asset = slug=>S.assets.find(a=>a.slug===slug)||{name:slug||'Unknown',position:'?',key:''};
const position = code=>POSITIONS.find(p=>p.code===code)||(code==='BENCH'?BENCH:{code,letter:'?',name:code,tracks:'',how:''});
const safeUrl = url=>{try {const u=new URL(url);return u.protocol==='https:'?u.href:'#';}catch{return '#';}};
const anchor = (url,text,label)=>`<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer"${label?` aria-label="${esc(label)}"`:''}>${esc(text)}</a>`;

// ---------- Shared pieces ----------
const bullet = code=>{const p=position(code);return `<span class="ln p-${esc(p.code)}" title="${esc(p.name)}" aria-hidden="true">${esc(p.letter)}</span>`;};
const button = (action,label,type='',disabled=false,extra='')=>`<button class="btn ${type}" type="button" data-action="${esc(action)}"${disabled?' disabled':''} ${extra}>${esc(label)}</button>`;
const go = (page,label,type='',tab='')=>`<button class="btn ${type}" type="button" data-page="${page}"${tab?` data-tab="${tab}"`:''}>${esc(label)}</button>`;
// Every screen opens with what to do next.
const next = (title,text='',actions='')=>`<div class="next"><h1>${esc(title)}</h1>${text?`<p>${esc(text)}</p>`:''}${actions?`<div class="actions">${actions}</div>`:''}</div>`;
const section = (title,inner,aside='')=>`<section><div class="head"><h2>${esc(title)}</h2>${aside}</div>${inner}</section>`;
const empty = text=>`<p class="empty">${esc(text)}</p>`;
const keyList = ()=>`<ul class="key">${POSITIONS.map(p=>`<li>${bullet(p.code)}<div><h3>${esc(p.name)} <span>${esc(p.code)}</span></h3><p>${esc(p.tracks)}</p></div><p class="how">${esc(p.how)}</p></li>`).join('')}</ul>`;

function notify(message,bad=false){const n=document.createElement('div');n.className='toast'+(bad?' bad':'');n.textContent=ERRORS[message]||message;if(bad&&n.setAttribute)n.setAttribute('role','alert');$('notifications').append(n);setTimeout(()=>n.remove(),6000);}

// ---------- League state ----------
const myId = ()=>S.session?.user?.id;
const myMember = ()=>S.members.find(m=>m.user_id===myId());
const member = id=>S.members.find(m=>m.user_id===id);
const myPicks = ()=>S.picks.filter(p=>p.member_id===myId()).sort((a,b)=>a.pick_no-b.pick_no);
const roundNo = ()=>S.members.length?Math.floor(S.picks.length/S.members.length):0;
function nextPicker(){const n=S.members.length,r=roundNo(),i=S.picks.length%n;if(!n||r>=8)return null;const seat=r%2?n-i-1:i;return S.members.find(m=>m.seat===seat);}
function weekStarters(memberId,weekStart){const choices=S.lineups.filter(x=>x.member_id===memberId&&x.effective_week<=weekStart);if(!choices.length)return [];const latest=choices.reduce((n,x)=>x.effective_week>n?x.effective_week:n,'');return choices.filter(x=>x.effective_week===latest).sort((a,b)=>a.slot-b.slot).map(x=>x.asset_slug);}
function nextLock(){const now=new Date(),day=(now.getUTCDay()+6)%7;const monday=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-day)).toISOString().slice(0,10);return S.league.start_on>monday?S.league.start_on:plusDays(monday,7);}
const currentWeek = ()=>S.league?.start_on?Math.min(6,Math.max(0,Math.floor((dateUTC(today())-dateUTC(S.league.start_on))/(7*86400000)))):0;
const seasonOver = ()=>!!S.league?.start_on&&today()>=plusDays(S.league.start_on,49);
function defaultSelections(){if(!S.league||S.league.status!=='live')return;const week=nextLock(),current=weekStarters(myId(),week);for(let i=0;i<7;i++){const p=POSITIONS[i].code;const owned=myPicks().map(x=>asset(x.asset_slug)).filter(x=>x.position===p);if(!owned.length)continue;if(S.lineup[p]&&owned.some(a=>a.slug===S.lineup[p]))continue;S.lineup[p]=current[i]&&owned.some(a=>a.slug===current[i])?current[i]:owned[0].slug;}}
const scoreRow = (slug,weekStart)=>S.weekScores.find(s=>s.asset_slug===slug&&s.week_start===weekStart);
function scoreFor(id,w){const date=plusDays(S.league.start_on,w*7);return S.scores.find(x=>x.member_id===id&&x.week_start===date)?.points??0;}
// A total only counts what has actually arrived: a missing score is pending, never zero.
function weekTotal(memberId,w){const start=plusDays(S.league.start_on,w*7),rows=weekStarters(memberId,start).map(slug=>scoreRow(slug,start)).filter(Boolean);return {points:rows.reduce((n,r)=>n+r.points,0),measured:rows.length};}
function schedule(w){const players=S.members.slice().sort((a,b)=>a.seat-b.seat).map(x=>x.user_id);if(players.length%2)players.push(null);const n=players.length;const rounds=n-1;let arr=players.slice();for(let i=0;i<w%rounds;i++)arr=[arr[0],arr[n-1],...arr.slice(1,n-1)];const pairs=[];for(let i=0;i<n/2;i++)if(arr[i]&&arr[n-i-1])pairs.push([arr[i],arr[n-i-1]]);return pairs;}
function weekReady(w){if(!S.league?.start_on)return false;const start=plusDays(S.league.start_on,w*7);return S.members.every(m=>weekStarters(m.user_id,start).length===7&&weekStarters(m.user_id,start).every(slug=>scoreRow(slug,start)));}
function weekStatus(w){const start=plusDays(S.league.start_on,w*7);if(today()<start)return 'upcoming';if(today()<plusDays(start,7))return 'live';return weekReady(w)?'final':'waiting';}
function standings(){const teams=S.members.map(m=>({id:m.user_id,name:m.team_name,w:0,l:0,t:0,pf:0,pa:0}));const get=id=>teams.find(x=>x.id===id);if(!S.league?.start_on)return teams;for(let w=0;w<7;w++){const end=plusDays(S.league.start_on,(w+1)*7);if(Date.now()<dateUTC(end)||!weekReady(w))continue;for(const [a,b] of schedule(w)){const x=get(a),y=get(b),sa=scoreFor(a,w),sb=scoreFor(b,w);x.pf+=sa;x.pa+=sb;y.pf+=sb;y.pa+=sa;if(sa>sb){x.w++;y.l++;}else if(sa<sb){y.w++;x.l++;}else{x.t++;y.t++;}}}return teams.sort((a,b)=>(b.w*2+b.t)-(a.w*2+a.t)||b.pf-a.pf||a.name.localeCompare(b.name));}

// ---------- Play ----------
function leagueList(){return `<ul class="rows">${S.leagues.map(l=>`<li><span class="grow"><strong>${esc(l.name)}</strong><small>Your team: ${esc(l.team_name)} · ${esc({lobby:'waiting to start',draft:'drafting',live:'season on'}[l.status]||l.status)}</small></span>${button('select-league','Open','alt',false,`data-id="${esc(l.id)}" aria-label="Open ${esc(l.name)}"`)}</li>`).join('')}</ul>`;}
function introPage(){
  if(S.leagues.length)return next('Choose a league','Open one of your leagues to carry on.')+section('Your leagues',leagueList(),go('league','Create or join another','quiet'));
  const actions=CONFIGURED?go('league',S.invite?'Join your league':'Create or join a league')+go('explore','Browse players','alt','players'):go('explore','Browse players','','players');
  return next('A fantasy league for cybersecurity','Draft real security tools, vendors, languages and AI models. Each week you score on public data about what your picks did.',actions)+section('Seven positions, one starter in each every week',keyList(),go('explore','How a season works','quiet','rules'));
}
function lobbyPage(){
  const l=S.league,n=S.members.length,owner=l.owner_id===myId(),joined=`${n} of ${l.max_teams} teams have joined.`;
  const head=owner&&n>=2?next('Start the draft when everyone is in',joined+' No one can join after you start.',button('start-draft','Start draft')+button('copy-invite','Copy invite link','alt'))
    :owner?next('Invite someone to play','The draft needs at least 2 teams.',button('copy-invite','Copy invite link'))
    :next('Waiting for the draft to start',joined+' The person who created the league starts it, and it opens here.',button('copy-invite','Copy invite link','alt'));
  return head+section('Get to know the positions',keyList());
}
const initials = name=>String(name).trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
// The snake draft drawn as one line that turns back at the end of every round.
function route(){
  const seats=S.members.slice().sort((a,b)=>a.seat-b.seat),n=seats.length,done=S.picks.length,live=S.league.status==='draft';
  const rows=Array.from({length:8},(_,r)=>{
    const code=POSITIONS[r]?.code||'BENCH',back=r%2===1,first=back?n-1:0,last=back?0:n-1;
    const cells=seats.map((m,s)=>{
      const no=r*n+(back?n-1-s:s)+1,pick=S.picks.find(p=>p.pick_no===no),now=live&&no===done+1;
      const cls=['p-'+code,pick?'done':now?'now':'ahead'];
      if(s===first){cls.push(back?'to-mid':'from-mid');if(r>0)cls.push('turn-in');}
      if(s===last){cls.push(back?'from-mid':'to-mid');if(r<7)cls.push('turn-down');}
      const label=pick?`<span class="picked">${esc(asset(pick.asset_slug).name)}</span>`:`<span class="sr">${now?'picking now':'not picked yet'}</span>`;
      return `<td class="${cls.join(' ')}"><span class="stop">${no}</span>${label}</td>`;
    }).join('');
    return `<tr><th scope="row">${bullet(code)}<span class="sr">Round ${r+1}, ${esc(position(code).name)}</span></th>${cells}</tr>`;
  }).join('');
  return `<table class="route${n>4?' crowded':''}"><caption><h2>Draft route</h2></caption><thead><tr><th class="corner"><span class="sr">Round</span></th>${seats.map(m=>`<th scope="col"${m.user_id===myId()?' class="me"':''}><span class="full">${esc(m.team_name)}</span><span class="short" aria-hidden="true">${esc(initials(m.team_name))}</span></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
}
function latestPicks(){const recent=S.picks.slice(-5).reverse();return recent.length?`<div class="phone-only"><h3>Latest picks</h3><ul class="rows">${recent.map(p=>`<li>${bullet(asset(p.asset_slug).position)}<span class="grow"><strong>${esc(asset(p.asset_slug).name)}</strong><small>${esc(member(p.member_id)?.team_name||'Unknown')}, pick ${esc(p.pick_no)}</small></span></li>`).join('')}</ul></div>`:'';}
function draftPage(){
  const n=S.members.length,round=Math.min(roundNo(),7),required=POSITIONS[round]||null,picker=nextPicker();
  if(n>0&&S.picks.length>=n*8)return next('The draft is finished','Your first lineup is being set up.',button('refresh-room','Refresh'))+route();
  const mine=picker?.user_id===myId(),taken=new Map(S.picks.map(p=>[p.asset_slug,p.member_id]));
  if(S.draftRound!==round){S.draftRound=round;S.draftVisible=36;S.draftPosition='ALL';S.query='';}
  const candidates=S.assets.filter(a=>(required?a.position===required.code:(S.draftPosition==='ALL'||a.position===S.draftPosition))&&(!S.query||`${a.name} ${a.key}`.toLowerCase().includes(S.query.toLowerCase())))
    .sort((a,b)=>Number(taken.has(a.slug))-Number(taken.has(b.slug))||a.name.localeCompare(b.name));
  const title=mine?`Your pick: ${required?required.name.replace(/^(?!AI)./,c=>c.toLowerCase()):'a bench player'}`:`${picker?.team_name||'Another team'} is picking`;
  const text=`Round ${round+1} of 8. `+(required?`${required.tracks} ${required.how}`:'Choose from any position. A bench player can only replace your starter in the same position.');
  const bench=required?'':`<select id="draft-pos-filter" aria-label="Filter by position"><option value="ALL">All positions</option>${POSITIONS.map(p=>`<option value="${p.code}"${S.draftPosition===p.code?' selected':''}>${esc(p.name)}</option>`).join('')}</select>`;
  const list=candidates.slice(0,S.draftVisible).map(a=>{const by=taken.get(a.slug);return `<li class="${by?'taken':''}">${bullet(a.position)}<span class="grow"><strong>${esc(a.name)}</strong>${by?`<small>Taken by ${esc(member(by)?.team_name||'another team')}</small>`:anchor(a.source_url,'Source',`Source for ${a.name}`)}</span>${!by&&mine?button('pick','Draft','',false,`data-slug="${esc(a.slug)}" aria-label="Draft ${esc(a.name)}"`):''}</li>`;}).join('');
  const more=candidates.length>S.draftVisible?`<div class="actions">${button('more-candidates',`Show ${Math.min(36,candidates.length-S.draftVisible)} more`,'alt')}</div>`:'';
  const choices=section(mine?'Choose one':'Who is in this round',`<div class="filters"><input id="asset-search" type="search" aria-label="Search players in this round" placeholder="Search by name" value="${esc(S.query)}">${bench}</div>${list?`<ul class="rows">${list}</ul>`:empty('Nothing matches that search.')}${more}`,`<span class="muted small">${candidates.filter(a=>!taken.has(a.slug)).length} available</span>`);
  return `${next(title,text)}<div class="draft${mine?'':' waiting'}">${choices}<div class="route-wrap">${route()}${latestPicks()}</div></div>`;
}
function lineupPage(){
  const owned=myPicks(),week=nextLock();
  if(week>=plusDays(S.league.start_on,49))return next(seasonOver()?'The season is over':'The last week is locked',seasonOver()?'':'There are no more lineup changes this season.',go('scores',seasonOver()?'See final standings':'Follow your match'));
  const saved=weekStarters(myId(),week);let dirty=false;
  const rows=POSITIONS.map((p,i)=>{
    const options=owned.map(o=>asset(o.asset_slug)).filter(a=>a.position===p.code);
    const selected=S.lineup[p.code]||options[0]?.slug||'';
    if(selected)S.lineup[p.code]=selected;
    if(saved[i]&&selected!==saved[i])dirty=true;
    return `<li>${bullet(p.code)}<label for="roster-slot-${p.code}">${esc(p.name)}<small>${esc(p.tracks)}</small></label><select id="roster-slot-${p.code}" data-slot="${p.code}">${options.map(a=>`<option value="${esc(a.slug)}"${a.slug===selected?' selected':''}>${esc(a.name)}</option>`).join('')}</select></li>`;
  }).join('');
  const chosen=new Set(Object.values(S.lineup));
  const bench=owned.filter(p=>!chosen.has(p.asset_slug)).map(o=>{const a=asset(o.asset_slug);return `<li>${bullet(a.position)}<span class="grow"><strong>${esc(a.name)}</strong><small>On the bench. It can only start as your ${esc(position(a.position).code)} pick.</small></span></li>`;}).join('');
  const playing=today()>=S.league.start_on?weekStarters(myId(),plusDays(S.league.start_on,currentWeek()*7)):[];
  const locked=playing.length?`<details><summary>Playing this week (locked)</summary><div><ul class="rows">${playing.map(slug=>`<li>${bullet(asset(slug).position)}<span class="grow"><strong>${esc(asset(slug).name)}</strong></span></li>`).join('')}</ul></div></details>`:'';
  return `${next(`Your lineup for the week of ${prettyDate(week)}`,`Locks Monday ${prettyDate(week)}, 00:00 UTC. Already filled in from your draft.`,button('save-lineup','Save lineup')+`<span class="muted small" role="status">${dirty?'Unsaved changes':''}</span>`)}<section class="starters"><ul class="lineup">${rows}</ul></section>${bench?section('Bench',`<ul class="rows">${bench}</ul>`):''}${locked}`;
}
function playPage(){
  if(!S.league)return introPage();
  if(S.league.status==='lobby')return lobbyPage();
  if(S.league.status==='draft')return draftPage();
  return lineupPage();
}

// ---------- Scores ----------
function side(slug,start,status){
  if(!slug)return '<div class="side"><small>No lineup</small></div>';
  const a=asset(slug),item=scoreRow(slug,start),width=item?Math.max(0,Math.min(35,item.points))/35*100:0;
  const cves=S.kevs.filter(e=>e.asset_slug===slug&&e.date_added>=start&&e.date_added<plusDays(start,7)).slice(0,3);
  const state=item?(status==='final'?'final':'live'):'pending';
  const links=item?[anchor(item.source_url,'Source',`Source for ${a.name}`),...cves.map(v=>anchor('https://nvd.nist.gov/vuln/detail/'+v.cve_id,v.cve_id))].join(' · '):'';
  return `<div class="side"><strong>${esc(a.name)}</strong><div class="bar ${state}"><span class="track">${item&&width?`<span class="fill" style="width:${width}%"></span>`:''}</span><span class="pts">${item?esc(item.points):'Pending'}</span></div>${item?`<small>${esc(item.detail)}</small><small>${links}</small>`:''}</div>`;
}
function totalBlock(id,w){const t=weekTotal(id,w);return `<div class="team"><strong>${esc(member(id)?.team_name)}${id===myId()?' (you)':''}</strong><span class="total${t.measured?'':' none'}">${t.measured?esc(t.points):'Pending'}</span><span class="muted small">${t.measured} of 7 scores in</span></div>`;}
function comparison(a,b,w){
  const start=plusDays(S.league.start_on,w*7),status=weekStatus(w),left=weekStarters(a,start),right=weekStarters(b,start);
  return `<div class="versus">${totalBlock(a,w)}<span></span>${totalBlock(b,w)}</div><ol class="compare">${POSITIONS.map((p,i)=>`<li>${side(left[i],start,status)}<div>${bullet(p.code)}<span class="sr">${esc(p.name)}</span></div>${side(right[i],start,status)}</li>`).join('')}</ol>`;
}
function scoresPage(){
  if(!S.league)return next('Scores appear inside a league','Join one to follow your matches. Recent scores for every player are public.',(CONFIGURED?go('league','Create or join a league'):'')+go('explore','See recent scores','alt','sources'));
  if(S.league.status!=='live')return next('No matches yet','The first match week starts the Monday after the draft ends.',go('play',S.league.status==='draft'?'Go to the draft':'Back to your league'));
  const w=S.week,start=plusDays(S.league.start_on,w*7),status=weekStatus(w);
  const pairs=schedule(w),mine=pairs.find(p=>p.includes(myId()));
  const ours=mine?(mine[0]===myId()?mine:[mine[1],mine[0]]):null;
  const others=pairs.filter(p=>p!==mine);
  const title=ours?`Week ${w+1} against ${member(ours[1])?.team_name}`:`Week ${w+1}: you have no match`;
  const text={upcoming:`Starts Monday ${prettyDate(start)}. Nothing is scored yet.`,live:`In progress until ${prettyDate(plusDays(start,6))}. Totals are provisional and change as data arrives.`,waiting:'The week has ended, but some scores have not arrived. It stays open until they do.',final:'Final.'}[status];
  const nav=`<button class="btn alt" type="button" id="week-prev" data-week="${w-1}"${w===0?' disabled':''}>Previous week</button><button class="btn alt" type="button" id="week-next" data-week="${w+1}"${w===6?' disabled':''}>Next week</button><span class="muted small">Week ${w+1} of 7</span>${button('refresh-room','Refresh scores','quiet')}`;
  const legend='<div class="legend"><span><i></i>Final</span><span><i class="live"></i>Provisional</span><span><i class="pending"></i>Pending: no data yet</span></div>';
  const table=`<table class="table"><thead><tr><th scope="col">#</th><th scope="col">Team</th><th scope="col">Won</th><th scope="col">Lost</th><th scope="col">Tied</th><th scope="col">Points</th></tr></thead><tbody>${standings().map((t,i)=>`<tr${t.id===myId()?' class="me"':''}><td>${i+1}</td><td>${esc(t.name)}</td><td>${t.w}</td><td>${t.l}</td><td>${t.t}</td><td>${t.pf}</td></tr>`).join('')}</tbody></table>`;
  return `${next(title,text,`<div class="weekbar">${nav}</div>`)}${ours?`<section>${comparison(ours[0],ours[1],w)}${legend}</section>`:''}${others.length?section('Other matches',others.map(([a,b])=>`<details><summary>${esc(member(a)?.team_name)} against ${esc(member(b)?.team_name)}</summary><div>${comparison(a,b,w)}</div></details>`).join('')):''}${section('Standings',table+'<p class="muted small">A week counts once it has ended and every starter in the league has a score.</p>')}`;
}

// ---------- Explore ----------
function playersTab(){
  const matches=S.assets.filter(a=>(S.poolPosition==='ALL'||a.position===S.poolPosition)&&`${a.name} ${a.key}`.toLowerCase().includes(S.poolQuery.toLowerCase()));
  const chips=[['ALL',`All ${S.assets.length}`],...POSITIONS.map(p=>[p.code,p.name])].map(([code,label])=>`<button type="button" class="chip" id="chip-${code}" data-pos="${code}" aria-pressed="${S.poolPosition===code}">${code==='ALL'?'':bullet(code)}${esc(label)}</button>`).join('');
  const about=S.poolPosition==='ALL'?'':`<p class="note explain">${esc(position(S.poolPosition).tracks)} ${esc(position(S.poolPosition).how)}</p>`;
  const list=matches.slice(0,S.poolVisible).map(a=>`<li class="player">${bullet(a.position)}<span class="grow"><strong>${esc(a.name)}</strong><small>${esc(S.poolPosition==='ALL'?position(a.position).name:a.key)}</small></span>${anchor(a.source_url,'Source',`Source for ${a.name}`)}</li>`).join('');
  return `<div class="chips" role="group" aria-label="Filter by position">${chips}</div>${about}<div class="filters"><input id="pool-search" type="search" aria-label="Search players" placeholder="Search by name" value="${esc(S.poolQuery)}"></div><p class="muted small">${matches.length} of ${S.assets.length} players</p>${list?`<ul class="rows">${list}</ul>`:empty('Nothing matches that search.')}${matches.length>S.poolVisible?`<div class="actions">${button('more-pool',`Show ${Math.min(48,matches.length-S.poolVisible)} more`,'alt')}</div>`:''}`;
}
function rulesTab(){
  const steps=[['Join','Create a league or enter an invite code. 2 to 8 teams, no account or email.'],['Draft','Eight rounds, and the order reverses every round (a snake draft). Rounds 1 to 7 fill one position each; round 8 is a bench pick from any position. No two teams can own the same player.'],['Set your lineup','One starter per position. The bench player can replace only a starter in its own position. Lineups lock Monday at 00:00 UTC.'],['Play seven weeks','Head to head. Ties are allowed and there are no playoffs.']];
  const terms=[['CVE','A public ID number for one security flaw.'],['KEV','CISA’s list of flaws that attackers are known to be using.'],['DFIR','Digital forensics and incident response: investigating a security incident and recovering from it.'],['SOC','Security operations center: the team and tools that watch for attacks.'],['Pull request','A proposed change to a software project. It is merged once the maintainers accept it.'],['GDELT','An open index of news from around the world.']];
  return `${section('A season in four steps',`<ol class="rows">${steps.map(([title,body],i)=>`<li><span class="stop" aria-hidden="true">${i+1}</span><span class="grow"><strong>${esc(title)}</strong><small>${esc(body)}</small></span></li>`).join('')}</ol>`)}${section('Positions and scoring',keyList())}${section('Words you will see',`<dl>${terms.map(([t,d])=>`<dt><strong>${esc(t)}</strong></dt><dd>${esc(d)}</dd>`).join('')}</dl>`)}`;
}
function sourcesTab(){
  const recent=S.weekScores.slice().sort((a,b)=>b.week_start.localeCompare(a.week_start)||String(b.updated_at).localeCompare(String(a.updated_at))).slice(0,40);
  const about=`<p>Scores come from ${anchor('https://www.cisa.gov/known-exploited-vulnerabilities-catalog','CISA')}, ${anchor('https://docs.github.com/en/rest','GitHub')}, ${anchor('https://www.gdeltproject.org/','GDELT')}, ${anchor('https://huggingface.co/docs/hub/en/api','Hugging Face')} and a licensed stock-price provider. They measure public activity, not whether a tool or vendor is secure. A source that has not reported shows as pending. Stock points are part of a game, not investment advice.</p>`;
  const scores=recent.length?`<ul class="rows">${recent.map(e=>`<li>${bullet(asset(e.asset_slug).position)}<span class="grow"><strong>${esc(asset(e.asset_slug).name)}: ${esc(e.points)} points</strong><small>Week of ${esc(prettyDate(e.week_start))}. ${esc(e.detail)}</small></span>${anchor(e.source_url,'Source',`Source for ${asset(e.asset_slug).name}`)}</li>`).join('')}</ul>`:empty('No scores have been recorded yet.');
  const events=(S.feed?.events||[]).slice(0,30);
  const kev=events.length?`<ul class="rows">${events.map(e=>`<li>${bullet('VULN')}<span class="grow"><strong>${esc(asset(e.asset_slug).name)}: ${esc(e.cve_id)}</strong><small>Added ${esc(prettyDate(e.date_added))}. ${esc(e.product)}: ${esc(e.title)}</small></span>${anchor('https://nvd.nist.gov/vuln/detail/'+e.cve_id,'Details',`Details for ${e.cve_id}`)}</li>`).join('')}</ul>`:empty('No vulnerability entries have been imported yet.');
  return section('Where scores come from',about)+section('Recent scores',scores)+section('Newly exploited vulnerabilities',kev);
}
function explorePage(){
  const tabs=`<div class="tabs" role="group" aria-label="Explore sections">${TABS.map(([key,label])=>`<button type="button" id="tab-${key}" data-page="explore" data-tab="${key}" aria-pressed="${S.tab===key}">${label}</button>`).join('')}</div>`;
  const title={players:'Who you can draft',rules:'How to play',sources:'Where points come from'}[S.tab];
  return next(title)+tabs+({players:playersTab,rules:rulesTab,sources:sourcesTab}[S.tab]||playersTab)();
}

// ---------- League ----------
const inviteLink = ()=>location.origin+location.pathname+'?invite='+encodeURIComponent(S.league.invite_code);
function setupPage(){
  const join=`<section><h2>Join with a code</h2><form id="join-league"><div class="field"><label for="join-invite">Invite code</label><input id="join-invite" class="code-input" name="invite" minlength="8" maxlength="12" value="${esc(S.invite)}" required autocomplete="off" autocapitalize="characters" spellcheck="false"></div><div class="field"><label for="join-team-name">Your team name</label><input id="join-team-name" name="teamName" maxlength="32" minlength="3" required></div><button class="btn" type="submit">Join league</button></form></section>`;
  const create=`<section><h2>Start a new league</h2><form id="create-league"><div class="field"><label for="create-league-name">League name</label><input id="create-league-name" name="leagueName" maxlength="48" minlength="3" required></div><div class="field"><label for="create-team-name">Your team name</label><input id="create-team-name" name="teamName" maxlength="32" minlength="3" required></div><div class="field"><label for="create-max-teams">Most teams allowed</label><select id="create-max-teams" name="maxTeams">${[2,3,4,5,6,7,8].map(n=>`<option value="${n}"${n===6?' selected':''}>${n}</option>`).join('')}</select></div><button class="btn alt" type="submit">Create league</button></form></section>`;
  const title=S.invite?'You have been invited':'Join a league, or start one';
  const text=S.invite?'Pick a team name to join. No account or email needed.':'No account or email needed. Your team is saved in this browser only.';
  return `${next(title,text)}${S.leagues.length?section('Your leagues',leagueList()):''}${S.invite?`<div class="forms">${join}</div><details><summary>Start your own league instead</summary><div>${create}</div></details>`:`<div class="forms">${join}${create}</div>`}${S.session?`<div class="actions">${button('refresh-leagues','Refresh','quiet')}${button('logout','Leave this device','quiet')}</div>`:''}`;
}
function leagueRoom(){
  const l=S.league,n=S.members.length,owner=l.owner_id===myId(),lobby=l.status==='lobby';
  const text=lobby?`Waiting to start. ${n} of ${l.max_teams} teams have joined.`:l.status==='draft'?'The draft is on.':`The season ${today()<l.start_on?'starts':'started'} Monday ${prettyDate(l.start_on)}.`;
  const action=lobby?(owner&&n>=2?button('start-draft','Start draft'):button('copy-invite','Copy invite link'))
    :l.status==='draft'?go('play','Go to the draft'):seasonOver()?go('scores','See final standings'):go('play','Set your lineup');
  const seats=Array.from({length:lobby?l.max_teams:n},(_,i)=>{const m=S.members.find(x=>x.seat===i);return m?`<li><span class="stop">${i+1}</span><span class="grow"><strong>${esc(m.team_name)}</strong><small>${[m.user_id===myId()?'You':'',m.user_id===l.owner_id?'Created the league':''].filter(Boolean).join(' · ')}</small></span></li>`:`<li class="open"><span class="stop">${i+1}</span><span class="muted">Open seat</span></li>`;}).join('');
  const other=S.invite&&l.invite_code!==S.invite?`<p class="note">You opened an invite for another league. ${button('exit-league','Join it','quiet')}</p>`:'';
  const invite=lobby?`<section><h2>Invite code</h2><span class="invite">${esc(l.invite_code)}</span><p class="muted small">Share the code or the link. Joining closes when the draft starts.</p>${owner&&n>=2?`<div class="actions">${button('copy-invite','Copy invite link','alt')}</div>`:''}</section>`:'';
  return `${next(l.name,text,action)}${other}<div class="room">${section('Teams',`<ol class="seats">${seats}</ol>`)}${invite}</div><div class="actions">${button('refresh-room','Refresh','quiet')}${button('exit-league','All my leagues','quiet')}${button('logout','Leave this device','quiet')}</div>`;
}
function leaguesPage(){
  if(!CONFIGURED)return next('Leagues are not available on this copy of the site','You can still browse the players and the rules.',go('explore','Browse players','','players'));
  if(S.league&&(!S.invite||S.league.invite_code===S.invite))return leagueRoom();
  return setupPage();
}

// ---------- Rendering and navigation ----------
function nav(){
  $('navigation').innerHTML=PAGES.map(([key,text])=>`<button type="button" class="tab" id="nav-${key}" data-page="${key}"${S.page===key?' aria-current="page"':''}>${text}</button>`).join('');
  $('who').textContent=S.league?(myMember()?.team_name||''):'';
  document.title=`${PAGES.find(p=>p[0]===S.page)?.[1]||'Play'} · Cipher League`;
}
function pageBody(){
  if(S.catalogError)return next('The player list did not load',S.catalogError,button('retry','Try again'));
  if(!S.assets.length)return '<p class="muted" role="status">Loading players…</p>';
  return ({play:playPage,scores:scoresPage,explore:explorePage,league:leaguesPage}[S.page]||playPage)();
}
const KEPT_FORMS = ['create-league','join-league'];
// Re-rendering (live updates arrive at any moment) keeps what the player typed and where they were.
function render(){
  nav();
  const act=document.activeElement,focusId=act?.id||null,focusField=!focusId&&act?.name&&act?.form?.id?[act.form.id,act.name]:null,from=act?.selectionStart,to=act?.selectionEnd,saved={};
  for(const id of KEPT_FORMS)for(const el of Array.from($(id)?.elements||[]))if(el.name)saved[id+':'+el.name]=el.value;
  $('main').innerHTML=pageBody();
  for(const id of KEPT_FORMS)for(const el of Array.from($(id)?.elements||[]))if(el.name&&saved[id+':'+el.name]!==undefined)el.value=saved[id+':'+el.name];
  const again=!focusId&&act?.dataset?.action?`[data-action="${act.dataset.action}"]`+(act.dataset.slug?`[data-slug="${act.dataset.slug}"]`:'')+(act.dataset.id?`[data-id="${act.dataset.id}"]`:''):'';
  const lost=!!act?.dataset&&(!!act.dataset.action||!!act.dataset.page);
  const target=(focusId?$(focusId):focusField?$(focusField[0])?.elements?.[focusField[1]]:again?document.querySelector?.(again):null)||(lost?$('main'):null);
  if(typeof target?.focus==='function'){target.focus({preventScroll:true});if(typeof from==='number')try{target.setSelectionRange?.(from,to);}catch{}}
}
function readHash(){
  const [name,tab]=location.hash.replace('#','').split('/');
  const [page,oldTab]=OLD_HASHES[name]||[name,tab];
  if(!PAGES.some(p=>p[0]===page))return false;
  S.page=page;
  if(TABS.some(t=>t[0]===oldTab))S.tab=oldTab;
  return true;
}
const hashFor = ()=>S.page==='explore'?`explore/${S.tab}`:S.page;
function goto(page,tab){S.page=page;if(tab)S.tab=tab;location.hash=hashFor();render();window.scrollTo({top:0,behavior:'instant'});if(page==='scores')void roomRefresh();}

// ---------- Data ----------
function clearInvite(){if(!S.invite)return;S.invite='';if(typeof history!=='undefined')history.replaceState(null,'',location.pathname+location.hash);}
async function requireOK(q){const {data,error}=await q;if(error)throw error;return data;}
async function loadLeagues(){if(!S.client||!S.session)return;const joined=await requireOK(S.client.from('league_members').select('league_id,team_name').eq('user_id',myId()));if(!joined.length){S.leagues=[];return;}const ls=await requireOK(S.client.from('leagues').select('*').in('id',joined.map(x=>x.league_id)));S.leagues=ls.map(l=>({...l,team_name:joined.find(m=>m.league_id===l.id)?.team_name})).sort((a,b)=>b.created_at.localeCompare(a.created_at));}
async function roomRefresh(){
  const lid=S.leagueId;
  if(!S.client||!S.session||!lid)return false;
  if(S.refreshing===lid){S.again=true;return false;}
  S.refreshing=lid;
  try{
    const [league,members,picks,lineups]=await Promise.all([
      requireOK(S.client.from('leagues').select('*').eq('id',lid).single()),
      requireOK(S.client.from('league_members').select('*').eq('league_id',lid).order('seat')),
      requireOK(S.client.from('draft_picks').select('*').eq('league_id',lid).order('pick_no')),
      requireOK(S.client.from('lineup_entries').select('*').eq('league_id',lid))]);
    if(lid!==S.leagueId)return false;
    const firstLoad=!S.league;
    S.league=league;S.members=members;S.picks=picks;S.lineups=lineups;
    if(league.status==='live'){
      const end=plusDays(league.start_on,49);
      const [scores,weekly,kevs]=await Promise.all([
        requireOK(S.client.rpc('league_week_scores',{p_league_id:lid})),
        requireOK(S.client.from('asset_week_scores').select('*').gte('week_start',league.start_on).lt('week_start',end).in('asset_slug',[...new Set(picks.map(p=>p.asset_slug))]).limit(1000)),
        requireOK(S.client.from('kev_events').select('*').gte('date_added',league.start_on).lt('date_added',end).limit(1000))]);
      S.scores=scores;S.weekScores=weekly;S.kevs=kevs;defaultSelections();
      if(firstLoad)S.week=currentWeek();
    }
    render();
    return true;
  }catch(e){notify(e.message||String(e),true);return false;}
  finally{if(S.refreshing===lid){S.refreshing=null;if(S.again){S.again=false;void roomRefresh();}}}
}
async function changeRoom(id){
  if(S.channel&&S.client){await S.client.removeChannel(S.channel);S.channel=null;}
  S.leagueId=id;S.league=null;S.members=[];S.picks=[];S.lineups=[];S.scores=[];S.weekScores=[];S.kevs=[];S.lineup={};S.week=0;S.draftRound=-1;
  if(!id){await publicScores();render();return;}
  await roomRefresh();
  if(S.client){S.channel=S.client.channel('cipher-room-'+id);
    for(const table of ['leagues','league_members','draft_picks','lineup_entries'])S.channel.on('postgres_changes',{event:'*',schema:'public',table,filter:table==='leagues'?`id=eq.${id}`:`league_id=eq.${id}`},()=>roomRefresh());
    S.channel.subscribe();}
  render();
}
async function publicScores(){if(!S.client)return;try{const after=plusDays(today(),-42);S.weekScores=await requireOK(S.client.from('asset_week_scores').select('*').gte('week_start',after).order('week_start',{ascending:false}).limit(650));}catch(e){console.warn('Public score fetch',e.message);}}
async function runRPC(name,args){if(!S.client)throw Error('Leagues are not available right now.');return requireOK(S.client.rpc(name,args));}
async function act(el){
  const action=el.dataset.action;if(el.disabled)return;
  if(['pick','save-lineup','start-draft'].includes(action))el.disabled=true;
  try{
    if(action==='logout'){if(!confirm('Leave this device? Your team is saved only in this browser. If you leave, you cannot get back into your leagues.'))return;await S.client.auth.signOut();S.session=null;S.leagues=[];await changeRoom(null);goto('league');return;}
    if(action==='retry'){S.catalogError='';render();await loadCatalog();return;}
    if(action==='refresh-leagues'){await loadLeagues();render();notify('Leagues updated.');return;}
    if(action==='select-league'){clearInvite();await changeRoom(el.dataset.id);goto('play');return;}
    if(action==='exit-league'){await changeRoom(null);await loadLeagues();goto('league');return;}
    if(action==='refresh-room'){if(await roomRefresh())notify('Up to date.');return;}
    if(action==='copy-invite'){try{await navigator.clipboard.writeText(inviteLink());notify('Invite link copied.');}catch{notify('Could not copy. The link is '+inviteLink(),true);}return;}
    if(action==='more-pool'){S.poolVisible+=48;render();return;}
    if(action==='more-candidates'){S.draftVisible+=36;render();return;}
    if(action==='start-draft'){await runRPC('start_draft',{p_league_id:S.leagueId});await roomRefresh();goto('play');return;}
    if(action==='pick'){await runRPC('make_pick',{p_league_id:S.leagueId,p_asset_slug:el.dataset.slug});await roomRefresh();notify(`You drafted ${asset(el.dataset.slug).name}.`);return;}
    if(action==='save-lineup'){const slugs=POSITIONS.map(p=>S.lineup[p.code]);if(slugs.some(v=>!v))throw Error('Choose one starter for each of the seven positions.');const result=await runRPC('set_lineup',{p_league_id:S.leagueId,p_slugs:slugs});await roomRefresh();notify(`Lineup saved for the week of ${prettyDate(result)}.`);return;}
  }catch(e){el.disabled=false;notify(e.message||String(e),true);}
}
async function ensureSession(){if(S.session)return;const {data,error}=await S.client.auth.signInAnonymously();if(error){throw Error(/anonymous/i.test(error.message)?'Joining is switched off: anonymous sign-ins are disabled in Supabase. Tell whoever runs this site.':error.message);}S.session=data.session;}
async function formSubmit(e){
  const form=e.target;if(!KEPT_FORMS.includes(form.id))return;e.preventDefault();
  if(!S.client)return notify('Still connecting. Try again in a moment.',true);
  const f=new FormData(form),btn=form.querySelector('button[type=submit]');if(btn)btn.disabled=true;
  try{
    await ensureSession();
    const creating=form.id==='create-league';
    const id=creating
      ?await runRPC('create_league',{p_name:String(f.get('leagueName')),p_team_name:String(f.get('teamName')),p_max_teams:Number(f.get('maxTeams'))})
      :await runRPC('join_league',{p_code:String(f.get('invite')).trim().toUpperCase(),p_team_name:String(f.get('teamName'))});
    clearInvite();await loadLeagues();await changeRoom(id);goto('league');notify(creating?'League created. Share the invite link.':'You joined the league.');
  }catch(err){notify(err.message||String(err),true);}finally{if(btn)btn.disabled=false;}
}
async function loadCatalog(){
  try{
    const [assets,feed]=await Promise.all([fetch('./data/assets.json').then(r=>r.json()),fetch('./data/events.json').then(r=>r.json())]);
    S.assets=assets;S.feed=feed;
  }catch{S.catalogError='Check your connection and try again.';}
  render();
}
async function init(){
  if(S.invite)S.page='league';else readHash();
  render();
  await loadCatalog();
  if(!CONFIGURED)return;
  try{
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
    S.client=createClient(CONFIG.supabaseUrl,CONFIG.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    const {data,error}=await S.client.auth.getSession();if(error)throw error;S.session=data.session;
    S.client.auth.onAuthStateChange((_event,session)=>{const changed=S.session?.user?.id!==session?.user?.id;S.session=session;if(changed){if(!session){S.leagues=[];changeRoom(null);}else loadLeagues().then(render).catch(e=>notify(e.message,true));}render();});
    await publicScores();
    if(S.session){await loadLeagues();if(S.leagues.length===1&&!S.invite)await changeRoom(S.leagues[0].id);}
    render();
  }catch(e){notify('Could not reach the league server. Reload to try again.',true);console.error(e);}
}

// ---------- Events ----------
document.addEventListener('click',e=>{
  const page=e.target.closest('[data-page]');if(page){e.preventDefault();goto(page.dataset.page,page.dataset.tab);return;}
  const week=e.target.closest('[data-week]');if(week){S.week=Number(week.dataset.week);render();return;}
  const pos=e.target.closest('[data-pos]');if(pos){S.poolPosition=pos.dataset.pos;S.poolVisible=48;render();return;}
  const action=e.target.closest('[data-action]');if(action)void act(action);
});
window.addEventListener('hashchange',()=>{const before=hashFor();if(readHash()&&hashFor()!==before)render();});
document.addEventListener('submit',e=>{void formSubmit(e);});
document.addEventListener('change',e=>{
  if(e.target.matches('[data-slot]')){S.lineup[e.target.dataset.slot]=e.target.value;render();}
  if(e.target.id==='draft-pos-filter'){S.draftPosition=e.target.value;S.draftVisible=36;render();}
});
document.addEventListener('input',e=>{
  if(e.target.id==='pool-search'){S.poolQuery=e.target.value;S.poolVisible=48;render();}
  if(e.target.id==='asset-search'){S.query=e.target.value;S.draftVisible=36;render();}
});
void init();
