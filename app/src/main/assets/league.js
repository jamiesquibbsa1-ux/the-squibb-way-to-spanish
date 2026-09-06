/* The Squibb Way to Spanish - shared league module */
const SQUIBB_CLOUD=window.SQUIBB_CLOUD_CONFIG||{};
const CLOUD_AUTH_KEY="squibbCloudAuthV1",CLOUD_META_KEY="squibbCloudMetaV1",CLOUD_LEAGUE_KEY="squibbActiveLeagueV1";
const cloud={auth:null,leagues:[],table:[],activity:[],activeLeagueId:localStorage.getItem(CLOUD_LEAGUE_KEY)||"",busy:false,error:""};

function cloudConfigured(){return /^https:\/\/.+\.supabase\.co$/i.test(SQUIBB_CLOUD.url||"")&&SQUIBB_CLOUD.anon&&!String(SQUIBB_CLOUD.anon).includes("__SUPABASE");}
function setCloudStatus(label,kind=""){const d=document.getElementById("cloudDot"),t=document.getElementById("cloudStatus");if(t)t.textContent=label;if(d)d.className="sync-dot"+(kind?" "+kind:"");}
function readCloudAuth(){try{return JSON.parse(localStorage.getItem(CLOUD_AUTH_KEY)||"null");}catch(e){return null;}}
function storeCloudAuth(a){cloud.auth=a;localStorage.setItem(CLOUD_AUTH_KEY,JSON.stringify(a));}

async function rawCloud(path,{method="GET",body=null,auth=true,headers={}}={}){
  if(!cloudConfigured())throw new Error("Online league is not configured in this build.");
  if(auth)await ensureCloudAuth();
  const h={apikey:SQUIBB_CLOUD.anon,"Content-Type":"application/json",...headers};
  if(auth&&cloud.auth?.access_token)h.Authorization=`Bearer ${cloud.auth.access_token}`;
  const res=await fetch(SQUIBB_CLOUD.url+path,{method,headers:h,body:body===null?undefined:JSON.stringify(body)});
  const raw=await res.text();let data=null;try{data=raw?JSON.parse(raw):null;}catch(e){data=raw;}
  if(!res.ok){const msg=(data&&typeof data==="object"&&(data.message||data.msg||data.error_description||data.error))||raw||`Cloud error ${res.status}`;throw new Error(msg);}
  return data;
}
async function ensureCloudAuth(){
  if(!cloudConfigured())throw new Error("Cloud not configured");
  if(!cloud.auth)cloud.auth=readCloudAuth();
  const now=Math.floor(Date.now()/1000);
  if(cloud.auth?.access_token&&(!cloud.auth.expires_at||cloud.auth.expires_at>now+90))return cloud.auth;
  if(cloud.auth?.refresh_token){try{const r=await rawCloud("/auth/v1/token?grant_type=refresh_token",{method:"POST",auth:false,body:{refresh_token:cloud.auth.refresh_token}});if(r?.access_token){storeCloudAuth(r);return r;}}catch(e){localStorage.removeItem(CLOUD_AUTH_KEY);cloud.auth=null;}}
  const r=await rawCloud("/auth/v1/signup",{method:"POST",auth:false,body:{data:{app:"the_squibb_way_to_spanish"}}});
  if(!r?.access_token)throw new Error("Anonymous player sign-in is not enabled.");storeCloudAuth(r);return r;
}
function myCloudUserId(){return cloud.auth?.user?.id||readCloudAuth()?.user?.id||"";}
function cloudProfilePayload(){return{id:myCloudUserId(),display_name:state.name||"Player",club_name:`${state.name||"Player"} FC`,course_pct:completionPct(),current_week:Math.min(26,Math.floor(state.completed.length/7)+1),points:state.points||0,streak:state.streak||0,stars:totalStars(),goals:state.goals||0,match_wins:state.matchWins||0,last_active:today(),updated_at:new Date().toISOString()};}
async function syncCloudProfile(){await ensureCloudAuth();await rawCloud("/rest/v1/profiles?on_conflict=id",{method:"POST",body:cloudProfilePayload(),headers:{Prefer:"resolution=merge-duplicates,return=minimal"}});}
async function loadMyLeagues(){const rows=await rawCloud("/rest/v1/rpc/my_leagues",{method:"POST",body:{}});cloud.leagues=Array.isArray(rows)?rows:[];if(cloud.leagues.length&&!cloud.leagues.some(x=>x.id===cloud.activeLeagueId)){cloud.activeLeagueId=cloud.leagues[0].id;localStorage.setItem(CLOUD_LEAGUE_KEY,cloud.activeLeagueId);}return cloud.leagues;}
async function loadLeagueTable(){if(!cloud.activeLeagueId){cloud.table=[];return[];}const rows=await rawCloud("/rest/v1/rpc/league_table",{method:"POST",body:{p_league_id:cloud.activeLeagueId}});cloud.table=Array.isArray(rows)?rows:[];return cloud.table;}
async function loadLeagueActivity(){if(!cloud.activeLeagueId){cloud.activity=[];return[];}const rows=await rawCloud(`/rest/v1/activity_feed?league_id=eq.${encodeURIComponent(cloud.activeLeagueId)}&select=id,user_id,event_type,message,created_at&order=created_at.desc&limit=25`);cloud.activity=Array.isArray(rows)?rows:[];return cloud.activity;}
async function postCloudActivity(message,eventType="progress",leagueId=null){const uid=myCloudUserId();if(!uid)return;const ids=leagueId?[leagueId]:cloud.leagues.map(x=>x.id);for(const id of ids){try{await rawCloud("/rest/v1/activity_feed",{method:"POST",body:{league_id:id,user_id:uid,event_type:eventType,message},headers:{Prefer:"return=minimal"}});}catch(e){}}}
function cloudMeta(){try{return JSON.parse(localStorage.getItem(CLOUD_META_KEY)||'{"completed":0,"matchWins":0,"finalWon":false}');}catch(e){return{completed:0,matchWins:0,finalWon:false};}}
async function publishNewMilestones(){if(!cloud.leagues.length)return;const m=cloudMeta();if(state.completed.length>m.completed){const last=state.completed[state.completed.length-1]??0,w=Math.floor(last/7)+1,d=(last%7)+1;await postCloudActivity(`${state.name} completed Week ${w}, Day ${d}.`,"lesson");}if((state.matchWins||0)>m.matchWins)await postCloudActivity(`${state.name} won a Spanish match and moved up the table.`,"match");if(state.finalWon&&!m.finalWon)await postCloudActivity(`🏆 ${state.name} won the Champions League Final!`,"trophy");localStorage.setItem(CLOUD_META_KEY,JSON.stringify({completed:state.completed.length,matchWins:state.matchWins||0,finalWon:!!state.finalWon}));}

async function fullCloudSync({refreshUI=false}={}){
  if(!cloudConfigured()){setCloudStatus("Setup needed","error");cloud.error="Shared progress needs the connected Supabase project.";if(refreshUI)drawSharedLeague();return;}
  if(cloud.busy)return;cloud.busy=true;setCloudStatus("Syncing","syncing");
  try{await syncCloudProfile();await loadMyLeagues();await publishNewMilestones();if(cloud.activeLeagueId)await Promise.all([loadLeagueTable(),loadLeagueActivity()]);cloud.error="";setCloudStatus("Synced","online");}
  catch(e){cloud.error=e.message||String(e);setCloudStatus("Sync error","error");}
  finally{cloud.busy=false;if(refreshUI)drawSharedLeague();}
}
let cloudSyncTimer=null;window.scheduleCloudSync=()=>{clearTimeout(cloudSyncTimer);cloudSyncTimer=setTimeout(()=>fullCloudSync({refreshUI:!document.getElementById("league")?.classList.contains("hidden")}),1800);};

async function createSharedLeague(){const name=document.getElementById("newLeagueName").value.trim()||"Squibb League",fb=document.getElementById("createLeagueFeedback");fb.textContent="Creating league…";try{await syncCloudProfile();const r=await rawCloud("/rest/v1/rpc/create_squibb_league",{method:"POST",body:{p_name:name}}),league=Array.isArray(r)?r[0]:r;await loadMyLeagues();if(league?.id){cloud.activeLeagueId=league.id;localStorage.setItem(CLOUD_LEAGUE_KEY,league.id);}await postCloudActivity(`${state.name} created ${league?.name||name}.`,"league",league?.id||cloud.activeLeagueId);await fullCloudSync({refreshUI:true});fb.textContent="";toast("League created");}catch(e){fb.textContent=e.message;}}
async function joinSharedLeague(code,feedbackId){const fb=document.querySelector(feedbackId);if(fb)fb.textContent="Joining league…";try{await syncCloudProfile();const r=await rawCloud("/rest/v1/rpc/join_squibb_league",{method:"POST",body:{p_code:String(code||"").trim().toUpperCase()}}),league=Array.isArray(r)?r[0]:r;await loadMyLeagues();if(league?.id){cloud.activeLeagueId=league.id;localStorage.setItem(CLOUD_LEAGUE_KEY,league.id);}await postCloudActivity(`${state.name} joined ${league?.name||"the league"}.`,"league",league?.id||cloud.activeLeagueId);await fullCloudSync({refreshUI:true});if(fb)fb.textContent="";toast("League joined");}catch(e){if(fb)fb.textContent=e.message;}}
function activeCloudLeague(){return cloud.leagues.find(x=>x.id===cloud.activeLeagueId)||null;}
function rankIcon(i){return i===0?"🥇":i===1?"🥈":i===2?"🥉":String(i+1);}
function niceActivityTime(iso){const d=new Date(iso),mins=Math.round((Date.now()-d.getTime())/60000);if(mins<1)return"just now";if(mins<60)return`${mins}m ago`;if(mins<1440)return`${Math.floor(mins/60)}h ago`;return d.toLocaleDateString();}
function drawSharedLeague(){
  const setup=document.getElementById("leagueSetup"),dash=document.getElementById("leagueDashboard");
  if(!cloudConfigured()){setup.classList.remove("hidden");dash.classList.add("hidden");document.getElementById("createLeagueFeedback").textContent="Shared progress is ready, but the online project still needs to be connected.";document.getElementById("createLeagueBtn").disabled=true;document.getElementById("joinLeagueBtn").disabled=true;return;}
  document.getElementById("createLeagueBtn").disabled=false;document.getElementById("joinLeagueBtn").disabled=false;
  if(!cloud.leagues.length){setup.classList.remove("hidden");dash.classList.add("hidden");return;}setup.classList.add("hidden");dash.classList.remove("hidden");
  const active=activeCloudLeague()||cloud.leagues[0];if(active){document.getElementById("activeLeagueName").textContent=active.name;document.getElementById("activeInviteCode").textContent=active.invite_code;}
  const sel=document.getElementById("leagueSelector");sel.innerHTML="";cloud.leagues.forEach(l=>{const o=document.createElement("option");o.value=l.id;o.textContent=l.name;o.selected=l.id===cloud.activeLeagueId;sel.appendChild(o);});
  document.getElementById("leaguePlayerCount").textContent=`${cloud.table.length} player${cloud.table.length===1?"":"s"}`;
  const body=document.getElementById("sharedLeagueBody");body.innerHTML="";const me=myCloudUserId();cloud.table.forEach((p,i)=>{const tr=document.createElement("tr");if(p.player_id===me)tr.className="me";tr.innerHTML=`<td class="position-medal">${rankIcon(i)}</td><td><b>${esc(p.club_name||p.display_name)}</b></td><td>${p.current_week}</td><td>${p.course_pct}%</td><td>${p.streak}</td><td>${p.stars}</td><td>${Number(p.points||0).toLocaleString()}</td>`;body.appendChild(tr);});if(!cloud.table.length)body.innerHTML='<tr><td colspan="7" class="muted">No standings yet.</td></tr>';
  const feed=document.getElementById("leagueActivity");feed.innerHTML="";cloud.activity.forEach(a=>{const d=document.createElement("div");d.className="activity-item";d.innerHTML=`<div>${esc(a.message)}</div><div class="activity-time">${niceActivityTime(a.created_at)}</div>`;feed.appendChild(d);});if(!cloud.activity.length)feed.innerHTML='<div class="notice">Activity appears as players complete lessons and matches.</div>';
}
async function renderSharedLeague(){renderTop();drawSharedLeague();await fullCloudSync({refreshUI:true});}

document.getElementById("refreshLeague").addEventListener("click",()=>fullCloudSync({refreshUI:true}));
document.getElementById("createLeagueBtn").addEventListener("click",createSharedLeague);
document.getElementById("joinLeagueBtn").addEventListener("click",()=>joinSharedLeague(document.getElementById("joinLeagueCode").value,"#joinLeagueFeedback"));
document.getElementById("joinAnotherBtn").addEventListener("click",()=>joinSharedLeague(document.getElementById("joinAnotherCode").value,"#joinAnotherFeedback"));
document.getElementById("leagueSelector").addEventListener("change",async e=>{cloud.activeLeagueId=e.target.value;localStorage.setItem(CLOUD_LEAGUE_KEY,cloud.activeLeagueId);await fullCloudSync({refreshUI:true});});
document.getElementById("copyLeagueCode").addEventListener("click",async()=>{const code=activeCloudLeague()?.invite_code||"";try{await navigator.clipboard.writeText(code);toast("Invite code copied");}catch(e){toast(code);}});
document.getElementById("shareLeagueCode").addEventListener("click",async()=>{const l=activeCloudLeague();if(!l)return;const msg=`Join my ${l.name} on The Squibb Way to Spanish. League code: ${l.invite_code}`;try{if(navigator.share)await navigator.share({title:"The Squibb Way to Spanish",text:msg});else{await navigator.clipboard.writeText(msg);toast("Invite copied");}}catch(e){}});
setTimeout(()=>fullCloudSync({refreshUI:false}),700);
