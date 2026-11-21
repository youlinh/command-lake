import {creatures, humans, characters, difficulties, materials, prices, ranks, skins,
  clearStage, dailyWeather, reward, opponent, money, unlocked, clamp} from './rules.js';
import {LakeGame} from './game.js';

const $=id=>document.getElementById(id);
const all=(query,scope=document)=>[...scope.querySelectorAll(query)];
const show=(id,on)=>$(id).classList.toggle('hidden',!on);
const label=(id,text)=>{$(id).textContent=text;};
const staticSite=document.querySelector('meta[name="command-lake-mode"]')?.content==='static';
const storeKey='commandLake.profile.v1';
const fresh=()=>({coins:'0',stage:1,owned:['cat'],key:'cat',skins:{},purchased:{},inventory:{},home:null,difficulty:0,squad:1});
function readProfile(){
  try {
    const saved=JSON.parse(localStorage.getItem(storeKey));
    if(!saved||!Number.isSafeInteger(saved.stage)||saved.stage<1)return fresh();
    return {...fresh(),...saved};
  }catch{return fresh();}
}
const profile=readProfile();
profile.key=unlocked(profile,profile.key)?profile.key:'cat';
const dayId=()=>Math.floor((Date.now()+28800000)/86400000);
let weather=dailyWeather(), tab='home',game,mode='pve',roster='animals',shop='skins',squadPreset=String(profile.squad),toastTimer;
let room,roomSeat,roomTimer,roomBusy=false,roomOperation=0,roomFailure=0;
const dialog=$('modal');

function save(){try{localStorage.setItem(storeKey,JSON.stringify(profile))}catch{}}
function toast(text){
  label('toast',text);show('toast',true);clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>show('toast',false),2900);
}
function setActive(query,attr,value){
  all(query).forEach(el=>{
    const on=String(el.dataset[attr])===String(value);
    el.classList.toggle(query==='[data-tab]'?'selected':'active',on);
    el.setAttribute('aria-pressed',String(on));
  });
}
function goTab(next){
  tab=next;for(const t of ['home','roster','shop'])show(t,t===tab);
  all('.navigation button').forEach(el=>{
    const on=el.dataset.tab===tab;
    el.classList.toggle('selected',on);el.setAttribute('aria-pressed',String(on));
  });
  render();
}
function syncLobby(){
  label('coins',money(profile.coins));
  const current=characters[profile.key];
  label('current-character',current.name);
  label('deploy-character',current.name);
  const w=weather.name+(weather.strength?' · '+weather.strength+'级':'');
  label('weather',w);label('weather-short',w);
  label('weather-detail',weather.effect==='storm'?'需进避难所':weather.effect==='quake'?'注意地面震动':'每日变化');
  label('home-grade',profile.home?(materials.find(m=>m[0]===profile.home.material)?.[1]??'')+' · '+profile.home.level+'级':'待建造');
  label('mech-progress',profile.stage>18?'已开启机甲化':'第 18 关开启');
  label('stages-cleared','已通过 '+(profile.stage-1)+' 关');
  label('deploy-stage',mode==='pve'?'第 '+String(profile.stage).padStart(2,'0')+' 关':'邀请好友');
  $('deploy').firstElementChild.textContent=mode==='pve'?'进入 AI 战场':'创建真人房间';
  show('difficulty',mode==='pve');show('pvp-hint',mode==='pvp');
  $('custom-size').max=mode==='pvp'?'24':'';
  label('settings-label',mode==='pve'?'AI 难度':'邀请链接');
  label('squad-label',mode==='pve'?'队伍人数':'每队人数');
}
function render(){
  save();syncLobby();if(tab==='roster')renderRoster();if(tab==='shop')renderShop();
}
function rosterCard(spec,state,footer){
  const rank=spec.rank?ranks[spec.rank]:'人类';
  const color=spec.rank==='divine'?'amber':spec.rank==='large'?'blue':'';
  const description=spec.rank?spec.temper+' · 机甲技能 '+spec.skill:'职业技能 '+spec.skill;
  return '<article class="panel roster-card '+(state?'top':'')+'"><div class="card-title"><h2>'+spec.name+'</h2><span class="'+color+'">'+rank+'</span></div><p>'+description+'</p>'+footer+'</article>';
}
function renderRoster(){
  const set=roster==='animals'?creatures:humans;
  $('roster-list').innerHTML=set.map(spec=>{
    const active=profile.key===spec.id;
    const owned=unlocked(profile,spec.id);
    const button=owned?(active?'出战中':'选为出战'):spec.type==='human'?'通关第 2 关解锁':'未解锁';
    return rosterCard(spec,active,'<button class="secondary" data-character="'+spec.id+'" '+(owned&&!active?'':'disabled')+'>'+button+'</button>');
  }).join('');
}
const swatches={default:'#7d614a',orange:'#db7d39',gold:'#d1aa54',silver:'#bcccca',police:'#496fa3',soldier:'#647a51'};
function renderShop(){
  const spec=characters[profile.key];
  label('shop-character',shop==='skins'?'为 '+spec.name+' 更换皮肤':'使用金币解锁新动物');
  if(shop==='animals'){
    $('shop-list').innerHTML=creatures.map(c=>{
      const owned=profile.owned.includes(c.id);
      const cost=prices[c.rank];
      return rosterCard(c,false,'<button class="secondary" data-buy="'+c.id+'" '+(owned?'disabled':'')+'>'+(owned?'已解锁':money(cost)+' 金币')+'</button>');
    }).join('');
    return;
  }
  if(!spec.rank){
    $('shop-list').innerHTML='<article class="panel roster-card"><h2>请先选择动物</h2><p>动物的警察、军人和其他皮肤都在这里。</p><button class="secondary" data-tab="roster">切换角色</button></article>';
    return;
  }
  const bought=profile.purchased[spec.id]??['default'];
  const selected=profile.skins[spec.id]??'default';
  $('shop-list').innerHTML=skins.map(([key,name,cost])=>{
    const state=selected===key,owns=bought.includes(key);
    return '<article class="panel roster-card '+(state?'top':'')+'"><div class="card-title"><h2>'+name+'</h2></div><div class="skin-swatch" style="--swatch:'+swatches[key]+'"></div><button class="secondary" data-skin="'+key+'" '+(state?'disabled':'')+'>'+(state?'使用中':owns?'装备':money(cost)+' 金币')+'</button></article>';
  }).join('');
}
function spend(cost){
  if(BigInt(profile.coins)<BigInt(cost)){toast('金币不足。');return false;}
  profile.coins=(BigInt(profile.coins)-BigInt(cost)).toString();return true;
}
function buyAnimal(id){
  const spec=characters[id];
  if(!spec?.rank||profile.owned.includes(id)||!spend(prices[spec.rank]))return;
  profile.owned.push(id);render();toast('已永久解锁 '+spec.name);
}
function wearSkin(id){
  const [,,cost]=skins.find(s=>s[0]===id);
  const key=profile.key;
  const bought=profile.purchased[key]??=['default'];
  if(!bought.includes(id)){
    if(!spend(cost))return;
    bought.push(id);
  }
  profile.skins[key]=id;render();toast('已装备 '+skins.find(s=>s[0]===id)[1]);
}
function modal(title,body,closable=true){
  $('modal-body').innerHTML='<header class="modal-title"><h2>'+title+'</h2>'+(closable?'<button type="button" class="modal-close" aria-label="关闭" data-close>×</button>':'')+'</header>'+body;
  if(!dialog.open)dialog.showModal();
}
function closeDialog(){
  if(dialog.open)dialog.close();
}
function openBuild(){
  const next=(profile.home?.level??0)+1;
  const rows=materials.map(([key,name,,rating,cost])=>{
    const count=profile.inventory[key]??0;
    const needed=cost+(next-1)*2;
    return '<div class="modal-row"><strong>'+name+'</strong><span>'+count+' / '+needed+' · 最高 '+rating+' 级</span><button class="secondary" data-build="'+key+'" '+(next<=rating&&count>=needed?'':'disabled')+'>'+(profile.home?'加固':'使用')+'</button></div>';
  }).join('');
  modal('湖岸避难所','<p class="modal-copy">'+(profile.home?'现有避难所 '+profile.home.level+' 级。':'采集野外材料后建造。')+'最高级木屋可以抵御 3 级台风。每次建造或加固提升 1 级。</p><div class="modal-list">'+rows+'</div>');
}
function build(key){
  const [,name,,rating,cost]=materials.find(item=>item[0]===key);
  const next=(profile.home?.level??0)+1;
  const needed=cost+(next-1)*2;
  if(next>rating||(profile.inventory[key]??0)<needed)return;
  profile.inventory[key]-=needed;profile.home={material:key,level:next};
  render();game?.houseChanged();openBuild();toast(name+'避难所达到 '+next+' 级');
}
function groups(){
  const value=squadPreset==='custom'?Math.trunc(Number($('custom-size').value)):Number(squadPreset);
  return mode==='pvp'?clamp(value||2,1,24):clamp(value||2,1,Number.MAX_SAFE_INTEGER);
}
function enterGame(options){
  closeDialog();
  game?.dispose();
  game=null;
  show('app',false);show('game',true);
  try{
    game=new LakeGame({
      toast,save,build:openBuild,finished,
      paused:()=>Boolean(dialog.open),
      eventDone:()=>{profile.eventDay=dayId();save();}
    },{profile,squad:groups(),difficulty:profile.difficulty,weather,...options});
  }catch(error){
    console.error(error);show('app',true);show('game',false);
    modal('无法启动三维场景','<p class="modal-copy">游戏需要 WebGL 2。请在支持硬件加速的浏览器中重新打开。</p>');
    return false;
  }
  return true;
}
function enterWorld(){
  if(roomSeat)leaveRoom();
  const finishedToday=profile.eventDay===dayId()&&['storm','quake'].includes(weather.effect);
  enterGame({mode:'world',key:profile.key,...(finishedToday?{weather:{name:'晴朗',effect:'sun',strength:0}}:{})});
}
function enterAI(){
  if(game?.mode==='world'&&(game.weatherTimer>0||game.warning>0)){
    toast('等天气事件结束后再去战场。');return;
  }
  enterGame({mode:'pve',key:profile.key,stage:profile.stage,foe:opponent(profile.stage)});
}
function stopGame(){
  game?.dispose();
  game=null;show('game',false);show('app',true);render();
}
function finished({win,foe,mode,draw}){
  if(mode==='pve'){
    if(win){
      const stage=profile.stage;
      const isNew=foe.rank&&!profile.owned.includes(foe.id);
      const amount=clearStage(profile,foe);
      render();
      let caption=money(amount)+' 金币到账。';
      if(isNew)caption+=' 已永久解锁 '+foe.name+'。';
      if(stage===2)caption+=' 可以选择四种人类职业。';
      if(stage===18)caption+=' 全部已解锁动物现可机甲化。';
      modal('第 '+stage+' 关胜利','<p class="modal-copy">'+caption+'</p><div class="modal-actions"><button class="primary" data-next>下一关</button><button class="secondary" data-lobby>返回大厅</button></div>',false);
    }else modal('本场落败','<p class="modal-copy">当前进度已保留。</p><div class="modal-actions"><button class="primary" data-next>重试本关</button><button class="secondary" data-lobby>返回大厅</button></div>',false);
    return;
  }
  if(mode==='world'){
    modal('角色阵亡','<p class="modal-copy">已收集的材料和解锁的角色保留。</p><div class="modal-actions"><button class="primary" data-world>重返湖区</button><button class="secondary" data-lobby>返回大厅</button></div>',false);
    return;
  }
  const title=draw?'平局':win?'赢得对决':'本场落败';
  modal(title,'<p id="again-status" class="modal-copy">等双方都准备好，就能再打一场。</p><div class="modal-actions"><button class="primary" data-again>再战</button><button class="secondary" data-lobby>返回大厅</button></div>',false);
  scheduleRoom();
}
function selection(){
  return {key:profile.key,skin:profile.skins[profile.key]??'default',stage:profile.stage};
}
async function roomRequest(op,body={}){
  const result=await fetch('/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,...body}),signal:AbortSignal.timeout(6500)});
  let message;
  try{message=await result.json();}catch{throw new Error('联机服务暂时不可用。');}
  if(!result.ok){
    const error=new Error(message.error??'联机服务暂时不可用。');
    error.status=result.status;throw error;
  }
  return message;
}
function openRoom(data){
  room=data.room;roomSeat={token:data.token,slot:data.slot,team:data.team};
  sessionStorage.setItem('lakeRoom-'+room.id,data.token);
  const url=new URL(location.href);
  url.searchParams.set('room',room.id);
  history.replaceState(null,'',url);
  updateRoom(data);
}
function leaveRoom(){
  roomOperation++;clearTimeout(roomTimer);roomTimer=null;roomBusy=false;
  room=null;roomSeat=null;
  const url=new URL(location.href);
  if(url.searchParams.has('room')){
    url.searchParams.delete('room');history.replaceState(null,'',url);
  }
}
function inviteUI(){
  const url=new URL(location.href);
  url.searchParams.set('room',room.id);
  const lan=document.querySelector('meta[name="command-lake-lan"]')?.content;
  if(lan&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))url.hostname=lan;
  const teams=[room.players.filter(p=>p.team===0).length,room.players.filter(p=>p.team===1).length];
  const title=room.teamSize===1?'真人一对一':'真人团体对决';
  const summary=room.teamSize===1?'等待对手加入，满员后自动开始。':'甲队 '+teams[0]+' 人 · 乙队 '+teams[1]+' 人 · 每队上限 '+room.teamSize+' 人';
  modal(title,'<p class="modal-copy" id="room-summary">'+summary+'</p><input class="invite" id="invite-url" aria-label="房间邀请链接" readonly><div class="modal-actions"><button class="primary" data-copy>复制邀请链接</button><button class="secondary" data-room-start id="start-team" '+(room.teamSize>1&&roomSeat.slot==='p0'&&teams[1]>0?'':'hidden')+'>开始对决</button><button class="secondary" data-lobby>退出房间</button></div>',false);
  $('invite-url').value=url.href;
}
function updateRoom(data){
  room=data.room;
  if(room.phase==='waiting'){
    const summary=$('room-summary');
    if(summary&&dialog.open&&room.teamSize>1){
      const one=room.players.filter(p=>p.team===0).length,two=room.players.length-one;
      summary.textContent='甲队 '+one+' 人 · 乙队 '+two+' 人 · 每队上限 '+room.teamSize+' 人';
      $('start-team').hidden=roomSeat.slot!=='p0'||two===0;
    }else if(!summary||!dialog.open)inviteUI();
    scheduleRoom();
  }else if(room.phase==='active'){
    if(game?.mode==='pvp'&&game.options.round===room.round&&game.live){game.syncRemote(room);return;}
    clearTimeout(roomTimer);roomTimer=null;
    const self=room.players.find(a=>a.slot===roomSeat.slot);
    if(!self)return;
    const generation=roomOperation;
    const session={id:room.id,token:roomSeat.token};
    enterGame({mode:'pvp',key:self.key,room,slot:self.slot,team:self.team,round:room.round,actions:data.actions,
      poll:async input=>{
        try{
          const state=await roomRequest('state',{room:session.id,token:session.token,input});
          if(generation!==roomOperation)return state.room;
          roomFailure=0;
          room=state.room;
          return state.room;
        }catch(error){
          if(generation!==roomOperation)throw error;
          roomFailure++;
          if(roomFailure===3)toast('联机连接暂时中断，正在重试。');
          if([403,404].includes(error.status)){
            roomFailure=0;
            leaveRoom();stopGame();closeDialog();toast(error.message);
          }
          throw error;
        }
      }
    });
  }else{
    if(game?.mode==='pvp'&&game.running)game.syncRemote(room);
    const state=$('again-status');
    if(state){
      const ready=room.players.filter(p=>p.ready).length;
      state.textContent='已准备 '+ready+' / '+room.players.length+' 人。';
      const self=room.players.find(a=>a.slot===roomSeat.slot);
      document.querySelector('[data-again]').disabled=!!self?.ready;
    }else if(!game)modal('对决已结束','<div class="modal-actions"><button class="primary" data-lobby>返回大厅</button></div>',false);
    scheduleRoom();
  }
}
function scheduleRoom(){
  if(!roomSeat||roomTimer)return;
  const generation=roomOperation;
  roomTimer=setTimeout(async()=>{
    roomTimer=null;
    if(!roomSeat||roomBusy||generation!==roomOperation)return;
    try{
      const data=await roomRequest('state',{room:room.id,token:roomSeat.token});
      if(generation===roomOperation)updateRoom(data);
    }catch(error){
      if(generation!==roomOperation)return;
      if([403,404].includes(error.status)){leaveRoom();stopGame();closeDialog();toast(error.message);return;}
      scheduleRoom();
    }
  },900);
}
async function createOrJoin(id){
  if(roomBusy)return;
  roomBusy=true;
  const generation=++roomOperation;
  modal(id?'正在加入对决':'正在创建对决','<p class="modal-copy">正在连接真人竞技场。</p>',false);
  try{
    const data=id?await roomRequest('join',{room:id,token:sessionStorage.getItem('lakeRoom-'+id),selection:selection()}):
      await roomRequest('create',{teamSize:groups(),selection:selection()});
    if(generation===roomOperation)openRoom(data);
  }catch(error){
    if(generation!==roomOperation)return;
    leaveRoom();
    modal('无法进入真人竞技场','<p class="modal-copy" id="room-error"></p><div class="modal-actions"><button class="primary" data-lobby>返回大厅</button></div>',false);
    label('room-error',error.message);
  }finally{if(generation===roomOperation)roomBusy=false;}
}
async function roomAction(op,button){
  if(!roomSeat||roomBusy)return;
  roomBusy=true;button.disabled=true;
  const generation=roomOperation;
  try{
    const data=await roomRequest(op,{room:room.id,token:roomSeat.token});
    if(generation===roomOperation)updateRoom(data);
  }catch(error){if(generation===roomOperation){toast(error.message);button.disabled=false;}}
  finally{
    if(generation===roomOperation){
      roomBusy=false;
      if(room?.phase!=='active')scheduleRoom();
    }
  }
}
async function copyInvite(){
  const input=$('invite-url');
  try{await navigator.clipboard.writeText(input.value);toast('邀请链接已复制。');}
  catch{input.focus();input.select();toast('链接已选中，可以复制发送。');}
}
function lobby(){
  if(roomSeat||roomBusy)leaveRoom();
  closeDialog();stopGame();
}

$('difficulty').innerHTML=difficulties.map(([name],i)=>'<option value="'+i+'">'+name+'</option>').join('');
$('difficulty').value=profile.difficulty;
$('difficulty').onchange=e=>{profile.difficulty=Number(e.target.value);save();};
if(!['1','2','3','7'].includes(squadPreset)){
  $('custom-size').value=profile.squad;
  squadPreset='custom';show('custom-line',true);
}
$('custom-size').onchange=()=>{profile.squad=groups();save();};
setActive('[data-squad]','squad',squadPreset);

document.addEventListener('click',e=>{
  const b=e.target.closest('button');
  if(!b)return;
  const d=b.dataset;
  if(d.tab)goTab(d.tab);
  if(d.mode){mode=d.mode;setActive('[data-mode]','mode',mode);syncLobby();}
  if(d.squad){squadPreset=d.squad;setActive('[data-squad]','squad',squadPreset);show('custom-line',squadPreset==='custom');profile.squad=groups();save();}
  if(d.roster){roster=d.roster;setActive('[data-roster]','roster',roster);renderRoster();}
  if(d.shop){shop=d.shop;setActive('[data-shop]','shop',shop);renderShop();}
  if(d.character&&unlocked(profile,d.character)){profile.key=d.character;render();toast('已选择 '+characters[profile.key].name);}
  if(d.buy)buyAnimal(d.buy);
  if(d.skin)wearSkin(d.skin);
  if(d.build)build(d.build);
  if('close'in d)closeDialog();
  if('lobby'in d)lobby();
  if('next'in d)enterAI();
  if('world'in d)enterWorld();
  if('copy'in d)copyInvite();
  if('roomStart'in d)roomAction('start',b);
  if('again'in d)roomAction('again',b);
});
$('enter-world').onclick=enterWorld;
$('deploy').onclick=()=>mode==='pve'?enterAI():createOrJoin();
$('open-build').onclick=()=>modal('湖岸避难所','<p class="modal-copy">进入湖区，采集木材或矿石，在地图内的避难所地基上建造。</p><div class="modal-actions"><button class="primary" data-world>进入湖区</button></div>');
$('world-build').onclick=()=>game?.chooseBuild();
$('world-arena').onclick=enterAI;
$('world-event').onclick=()=>game?.startWeather(true);
$('leave-game').onclick=lobby;
dialog.addEventListener('cancel',e=>{if(!dialog.querySelector('[data-close]'))e.preventDefault();});
setInterval(()=>{weather=dailyWeather();syncLobby();},60000);
render();
if(staticSite){
  document.querySelector('[data-mode="pvp"]').hidden=true;
  $('pages-room-note').hidden=false;
}
const requestedRoom=new URLSearchParams(location.search).get('room');
if(requestedRoom&&!staticSite)createOrJoin(requestedRoom);
