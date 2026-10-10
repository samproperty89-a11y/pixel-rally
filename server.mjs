import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {length,position,cutRatio,tracks} from './public/track.js';
const rooms=new Map(), sessions=new Map(), streams=new Map();
const token=()=>randomBytes(18).toString('hex');
const now=()=>Date.now();
function trackFor(r){return tracks[r.stage||0]}
function publicRoom(r){let {length}=trackFor(r);return{stage:r.stage||0,trackId:trackFor(r).id,trackName:trackFor(r).name,nextStageAt:r.nextStageAt||0,stageResults:r.stageResults||[],code:r.code,host:r.host,phase:r.phase,start:r.start,time:now(),laps:3,trackLength:length,rulesVersion:7,events:r.events.slice(-15),projectiles:r.projectiles||[],traps:r.traps||[],players:r.players.map(p=>({...p,token:undefined,lap:Math.max(1,Math.min(3,Math.floor(p.distance/length)+1))})).sort((a,b)=>(a.finish||Infinity)-(b.finish||Infinity)||b.distance-a.distance)}}
function broadcast(r){let data=`data: ${JSON.stringify(publicRoom(r))}\n\n`;for(let [key,s] of streams)if(s.room===r)s.res.write(data)}
function fail(message,status=400){throw Object.assign(new Error(message),{status})}
function event(r,text,fx=null){r.events.push({text,time:now(),fx});r.events=r.events.slice(-20)}
function player(r,name,color,model,bot=false,skin=null){let p={skin:Number.isInteger(skin)&&skin>=0&&skin<20?skin:bot?Math.floor(Math.random()*20):8,id:token(),name:String(name||'Racer').slice(0,18),color:/^#[0-9a-f]{6}$/i.test(color)?color:'#fbce47',model:['sport','buggy','van'].includes(model)?model:'sport',distance:0,lane:trafficLanes[r.players.length%4],charges:{...raceCharges},cd:{nitro:0,missile:0,shield:0,emp:0,oil:0,freeze:0},boost:0,shield:0,slow:0,finish:0,connected:true,bot};r.players.push(p);return p}
const cooldowns={nitro:6500,missile:8500,shield:10000,emp:12000,oil:9000,freeze:11000};
function ahead(r,p,range){return r.players.filter(q=>q!==p&&!q.finish&&q.distance>p.distance&&q.distance-p.distance<range).sort((a,b)=>a.distance-b.distance)[0]}
function skill(r,p,type){
 const {position}=trackFor(r);
 if(r.phase!=='racing'||p.finish||!Object.hasOwn(cooldowns,type)||now()<p.cd[type]||!(p.charges[type]>0))return false;
 p.charges[type]--;p.cd[type]=now()+cooldowns[type];
 if(type==='nitro')p.boost=now()+1400;
 if(type==='shield')p.shield=now()+3000;
 if(type==='missile'){let q=ahead(r,p,460);if(q){(r.projectiles??=[]).push({id:token(),from:p.id,to:q.id,start:now(),end:now()+650});event(r,p.name+' MISSILE',{kind:'launch',from:p.id,to:q.id})}else event(r,p.name+' MISSILE · MISS')}
 if(type==='freeze'){let q=ahead(r,p,400);if(q){if(q.shield<now()){q.slow=now()+2800;q.frozen=now()+2800}event(r,p.name+' FREEZE → '+q.name,{kind:'freeze',from:p.id,to:q.id})}}
 if(type==='emp'){let origin=position(p.distance,p.lane);for(let q of r.players){let other=position(q.distance,q.lane);if(q!==p&&!q.finish&&Math.hypot(origin.x-other.x,origin.y-other.y)<150&&q.shield<now()){q.slow=now()+1100;q.emp=now()+1100}}event(r,p.name+' EMP',{kind:'emp',from:p.id})}
 if(type==='oil'){(r.traps??=[]).push({id:token(),distance:p.distance,lane:p.lane,owner:p.id,end:now()+9000,hit:[]});event(r,p.name+' OIL TRAP',{kind:'oil',from:p.id})}
 return true;
}
function resolveEffects(r,t){
 const {length}=trackFor(r);
 for(let m of r.projectiles||[]){if(t<m.end)continue;let q=r.players.find(p=>p.id===m.to);if(q&&!q.finish){if(q.shield<t){q.slow=t+1800;event(r,q.name+' HIT!',{kind:'explosion',to:q.id})}else event(r,q.name+' BLOCK!',{kind:'block',to:q.id})}}
 r.projectiles=(r.projectiles||[]).filter(m=>m.end>t);
 r.traps=(r.traps||[]).filter(o=>o.end>t);
 for(let o of r.traps){for(let p of r.players){let delta=((p.distance-o.distance)%length+length)%length;if(p.id!==o.owner&&!p.finish&&!o.hit.includes(p.id)&&delta<26&&Math.abs(p.lane-o.lane)<25){o.hit.push(p.id);if(p.shield<t){p.slow=t+1900;p.spin=t+950;event(r,p.name+' SLIPPED',{kind:'oilhit',to:p.id})}}}}
}
const server=http.createServer(async(req,res)=>{try{let u=new URL(req.url,'http://local');res.setHeader('X-Content-Type-Options','nosniff');if(u.pathname==='/events'){let s=sessions.get(u.searchParams.get('token'));if(!s)fail('Session expired',401);res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});let key=token();streams.set(key,{...s,res});if(s.player)s.player.connected=true;res.write(`data: ${JSON.stringify(publicRoom(s.room))}\n\n`);req.on('close',()=>{streams.delete(key);if(s.player)s.player.connected=[...streams.values()].some(x=>x.player===s.player)});return}
if(u.pathname==='/api'){if(req.method!=='POST')fail('POST required',405);let body='';for await(let chunk of req){body+=chunk;if(body.length>8192)fail('Request too large',413)}let b=JSON.parse(body),s=sessions.get(b.token),r=s?.room,p=s?.player,result={};if(b.action==='create'||b.action==='join'){p=undefined;if(rooms.size>200&&b.action==='create')fail('Server busy',503);r=b.action==='create'?{code:randomBytes(3).toString('hex').toUpperCase(),players:[],phase:'lobby',host:null,start:0,events:[],updated:now()}:rooms.get(String(b.code).toUpperCase());if(!r)fail('房间不存在',404);if(!b.spectate){if(r.phase!=='lobby')fail('比赛已开始，请选择观战');if(r.players.filter(x=>!x.bot).length>=12)fail('房间已满');p=player(r,b.name,b.color,b.model,false,b.skin);if(!r.host)r.host=p.id}let key=token();sessions.set(key,{room:r,player:p});rooms.set(r.code,r);result={token:key,id:p?.id,code:r.code}}
else{if(!s)fail('请重新加入房间',401);r.updated=now();if(b.action==='start'){if(p?.id!==r.host)fail('只有房主可以开始',403);if(r.phase!=='lobby'&&r.phase!=='results')fail('比赛正在进行');r.stage=0;r.stageResults=[];startStage(r,now());}else if(b.action==='skill'){if(!p)fail('观众无法施放技能',403);result={used:skill(r,p,b.skill)}}else if(b.action==='resume')result={id:p?.id,code:r.code};else fail('Unknown action')}
broadcast(r);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));return}
let file=u.pathname==='/'?'index.html':u.pathname.slice(1);if(!['index.html','app.js','style.css','track.js','engine.mp3'].includes(file))fail('Not found',404);let data=await readFile(new URL('./public/'+file,import.meta.url));res.setHeader('Content-Type',file.endsWith('.mp3')?'audio/mpeg':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(data)
}catch(e){res.writeHead(e.status||400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}))}});
function startStage(r,t){
 while(r.players.length<12)player(r,['NOVA','GHOST','PIXEL','BOLT','ECHO','DASH','COMET','FROST','ACE','SPARK','RUSH','DRIFT'][r.players.length%12],['#fc618d','#51e3d4','#aaa1ff','#f4d35c'][r.players.length%4],['sport','buggy','van'][r.players.length%3],true);
 r.players.forEach((q,i)=>{q.distance=-Math.floor(i/4)*48;q.lane=trafficLanes[i%4];q.targetLane=q.lane;q.speed=0;q.charges={...raceCharges};q.finish=0;q.cd=Object.fromEntries(Object.keys(cooldowns).map(k=>[k,0]));q.boost=q.slow=q.shield=q.frozen=q.emp=q.spin=0;q.shortcut=false});
 r.phase='countdown';r.start=t+3000;r.nextStageAt=0;r.events=[];r.projectiles=[];r.traps=[];r.updated=t;
}
function completeStage(r,t){
 r.phase='results';r.stageResults??=[];r.stageResults[r.stage||0]=r.players.map(p=>({id:p.id,name:p.name,time:p.finish})).sort((a,b)=>a.time-b.time);
 if(!r.stage)r.nextStageAt=t+8000;
}
const raceCharges=Object.freeze({nitro:3,missile:3,shield:2,emp:1,oil:2,freeze:2});
const trafficLanes=[-66,-22,22,66],safeGap=38,safeSide=26;
function trafficGap(a,b,lapLength=length){let gap=((b.distance-a.distance)%lapLength+lapLength)%lapLength;return gap<lapLength/2?gap:gap-lapLength}
function sameRoad(a,b){return !!a.shortcut===!!b.shortcut}
function advanceRace(r,t,dt){
 const {length,position,cutRatio}=trackFor(r),gapBetween=(a,b)=>trafficGap(a,b,length);
 const active=r.players.filter(p=>!p.finish),lead=Math.max(...active.map(p=>p.distance));
 const plans=active.map((p,index)=>{
  if(p.bot&&Math.random()<.01){let attack=ahead(r,p,460),choices=['nitro','shield','oil'];if(attack)choices.push('missile','freeze','emp');let usable=choices.filter(k=>p.charges[k]>0&&p.cd[k]<=t);if(usable.length)skill(r,p,usable[Math.floor(Math.random()*usable.length)])}
  const loc=position(p.distance),gap=Math.max(0,lead-p.distance),home=trafficLanes[r.players.indexOf(p)%4];
  // Recovery only activates after a real gap. It never forces an already-close pack together.
  p.catchup=Math.min(.18,Math.max(0,gap-140)/500);
  let front=active.filter(q=>q!==p&&sameRoad(p,q)&&gapBetween(p,q)>0&&gapBetween(p,q)<130&&Math.abs(q.lane-p.lane)<safeSide).sort((a,b)=>gapBetween(p,a)-gapBetween(p,b))[0];
  p.drafting=!!front&&gapBetween(p,front)>48&&gapBetween(p,front)<125;
  const laneFree=lane=>!active.some(q=>q!==p&&sameRoad(p,q)&&Math.abs(gapBetween(p,q))<65&&Math.abs(q.lane-lane)<safeSide);
  let target=p.targetLane??home;
  if(front&&gapBetween(p,front)<85){let options=trafficLanes.filter(laneFree).sort((a,b)=>Math.abs(a-p.lane)-Math.abs(b-p.lane));if(options.length)target=options[0]}
  else if(laneFree(home))target=home;
  p.targetLane=target;
  let lane=p.lane+Math.max(-70*dt,Math.min(70*dt,target-p.lane));
  if(active.some(q=>q!==p&&sameRoad(p,q)&&Math.abs(gapBetween(p,q))<safeGap&&Math.abs(q.lane-p.lane)>=safeSide&&Math.abs(q.lane-lane)<safeSide))lane=p.lane;
  let style=[.988,1.006,1.018,.997,1.011,.992][r.players.indexOf(p)%6];
  let speed=(340+(p.model==='buggy'?3:p.model==='van'?-3:0))*style*(1+Math.max(p.catchup,p.drafting?.08:0));
  if([7,8,17,18].includes(loc.segment))speed*=.86;
  if(loc.segment===1||(loc.segment===10&&!p.shortcut))speed*=1.22;
  if(p.boost>t)speed*=1.55;if(p.slow>t)speed*=.55;
  if(loc.segment===9&&p.boost>t&&!p.shortcut){p.shortcut=true;event(r,p.name+' NITRO SHORTCUT')}
  if(p.shortcut&&loc.segment>=12)p.shortcut=false;if(p.shortcut)speed*=cutRatio;
  if(loc.segment===14&&lane>0&&p.shield<t)speed*=.7;
  return{p,previous:p.distance,distance:p.distance+speed*dt,lane,speed};
 });
 // Resolve predicted movement together, so neither update order nor a boost can drive through a car.
 for(let pass=0;pass<3;pass++){
  plans.sort((a,b)=>b.distance-a.distance||r.players.indexOf(a.p)-r.players.indexOf(b.p));
  for(let i=1;i<plans.length;i++){let back=plans[i];for(let j=0;j<i;j++){let front=plans[j];if(!sameRoad(front.p,back.p)||Math.abs(front.lane-back.lane)>=safeSide)continue;let gap=front.distance-back.distance;if(gap<safeGap){back.distance=front.distance-safeGap;back.speed=Math.max(0,(back.distance-back.previous)/dt)}}}
 }
 // Include cars a lap apart when enforcing physical road occupancy.
 for(let i=0;i<plans.length;i++)for(let j=i+1;j<plans.length;j++){let a=plans[i],b=plans[j];if(!sameRoad(a.p,b.p)||Math.abs(a.lane-b.lane)>=safeSide)continue;let delta=((a.distance-b.distance)%length+length)%length;if(delta>0&&delta<safeGap)b.distance-=safeGap-delta;else if(delta>length-safeGap)a.distance-=safeGap-(length-delta)}
 for(let move of plans){let p=move.p;p.lane=move.lane;p.distance=move.distance;p.speed=Math.max(0,(p.distance-move.previous)/dt);if(p.distance>=length*3){p.distance=length*3;p.finish=t-r.start;p.speed=0;event(r,p.name+' FINISHED')}}
}

let last=now();setInterval(()=>{let t=now(),dt=Math.min((t-last)/1000,.15);last=t;for(let r of rooms.values()){if(r.phase==='results'&&r.nextStageAt&&t>=r.nextStageAt){r.stage=1;startStage(r,t)}if(r.phase==='countdown'&&t>=r.start)r.phase='racing';if(r.phase==='racing'){resolveEffects(r,t);advanceRace(r,t,dt);if(r.players.every(p=>p.finish))completeStage(r,t)}broadcast(r);if(t-r.updated>3600000){rooms.delete(r.code);for(let [key,s] of sessions)if(s.room===r)sessions.delete(key);for(let [key,s] of streams)if(s.room===r){s.res.end();streams.delete(key)}}}},50);
server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Pixel Rally ready: http://localhost:'+(process.env.PORT||3000)));
