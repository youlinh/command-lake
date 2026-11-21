export const difficulties = [
  ['简单', .66, .72], ['普通', .88, .87], ['中等', 1, 1], ['困难', 1.2, 1.15],
  ['地狱', 1.44, 1.3], ['恶魔', 1.68, 1.45], ['满级', 1.93, 1.6], ['王者', 2.24, 1.8]
];

export const creatures = [
  { id:'cat', name:'橘猫', rank:'small', model:'cat', color:0xbf6f31, scale:.96, health:104, speed:7.5, temper:'灵敏', skill:'影袭', power:23 },
  { id:'fox', name:'赤狐', rank:'small', model:'fox', color:0xab4724, scale:1.06, health:107, speed:8, temper:'机警', skill:'炎尾突进', power:27 },
  { id:'hare', name:'雪兔', rank:'small', model:'hare', color:0xbeb7a4, scale:.78, health:96, speed:8.8, temper:'胆怯', skill:'跃影冲击', power:21 },
  { id:'otter', name:'河獭', rank:'small', model:'otter', color:0x725036, scale:.87, health:111, speed:7.7, temper:'好奇', skill:'回旋水刃', power:25 },
  { id:'badger', name:'獾', rank:'small', model:'badger', color:0x777474, scale:1, health:121, speed:6.7, temper:'莽撞', skill:'裂土反击', power:29 },
  { id:'lynx', name:'猞猁', rank:'small', model:'cat', color:0xa98552, scale:1.15, health:117, speed:7.9, temper:'凶猛', skill:'连环影爪', power:30 },
  { id:'wolf', name:'灰狼', rank:'large', model:'wolf', color:0x747771, scale:1.44, health:144, speed:7.3, temper:'警戒', skill:'狼嚎岩震', power:32 },
  { id:'boar', name:'野猪', rank:'large', model:'boar', color:0x5f4c3f, scale:1.44, health:161, speed:6.3, temper:'暴躁', skill:'獠牙掷岩', power:37 },
  { id:'bear', name:'棕熊', rank:'large', model:'bear', color:0x6e4932, scale:1.68, health:183, speed:5.9, temper:'凶猛', skill:'裂地巨岩', power:42 },
  { id:'stag', name:'马鹿', rank:'large', model:'stag', color:0x936240, scale:1.54, health:156, speed:7.2, temper:'谨慎', skill:'角锋落石', power:35 },
  { id:'tiger', name:'雷纹虎', rank:'divine', model:'cat', color:0xc88835, scale:1.64, health:184, speed:7.1, temper:'极凶', skill:'雷暴召唤', power:44, element:'雷', aura:0xb9acff },
  { id:'frost', name:'霜岭白狼', rank:'divine', model:'wolf', color:0xc1cdd0, scale:1.65, health:173, speed:7.6, temper:'极强', skill:'冰脊召唤', power:43, element:'冰', aura:0x80eaff },
  { id:'ember', name:'炎甲巨熊', rank:'divine', model:'bear', color:0x61443d, scale:1.85, health:207, speed:6, temper:'暴烈', skill:'烈焰召唤', power:48, element:'火', aura:0xff9355 },
  { id:'storm', name:'风角灵鹿', rank:'divine', model:'stag', color:0x8a9486, scale:1.64, health:170, speed:7.9, temper:'灵动', skill:'狂风召唤', power:42, element:'风', aura:0x8dffcc }
];
export const humans = [
  {id:'soldier',name:'军人',type:'human',model:'human',color:0x687452,health:124,speed:6.8,scale:1,skill:'护盾',power:26},
  {id:'police',name:'警察',type:'human',model:'human',color:0x2a4561,health:110,speed:7.8,scale:1,skill:'冲刺拦截',power:25},
  {id:'hunter',name:'猎人',type:'human',model:'human',color:0x805a3e,health:112,speed:6.6,scale:1,skill:'猎枪',power:30,range:10},
  {id:'thief',name:'小偷',type:'human',model:'human',color:0x49444b,health:96,speed:9,scale:1,skill:'闪身',power:22}
];
export const characters = Object.fromEntries([...creatures,...humans].map(c=>[c.id,c]));
export const ranks = {small:'小型',large:'大型',divine:'神级'};
export const prices = {small:2000,large:3000,divine:50000};
export const skins = [
  ['default','原生外观',0],['orange','橘色',150],['gold','鎏金',600],['silver','银铠',450],
  ['police','警察 · 警',320],['soldier','军人 · 军',320]
];
export const materials = [
  ['wood','木材',0x93704c,3,8], ['clay','土料',0xa47550,2,5], ['copper','铜矿',0xc68659,4,6],
  ['iron','铁矿',0xb0bfc0,5,6], ['gold','金矿',0xffc75b,6,6], ['amber','黄宝石',0xffc232,6,5],
  ['sapphire','蓝宝石',0x3bb8ff,7,5], ['ruby','红宝石',0xfd5469,7,5], ['emerald','绿宝石',0x60efa0,7,5]
];
export const waves = ['hare','fox','otter','wolf','badger','boar','lynx','stag','hunter','bear','frost','wolf','tiger','boar','ember','storm','bear','tiger'];
export const clamp = (n,low,high) => Math.max(low,Math.min(high,n));
export function reward(stage) {
  return 70n << (BigInt(stage) - 1n);
}
export function money(value) {
  const raw = String(value);
  return raw.length > 14 ? raw.slice(0,1)+'.'+raw.slice(1,3)+'e'+(raw.length-1) : BigInt(value).toLocaleString('zh-CN');
}
export function opponent(stage) {
  return characters[waves[(stage-1)%waves.length]];
}
export function dailyWeather(day = Math.floor((Date.now()+28800000)/86400000)) {
  const roll = ((Math.imul(day, 2654435761) >>> 0) % 101);
  if (roll < 27) return {name:'晴朗', effect:'sun', strength:0};
  if (roll < 50) return {name:'阵雨', effect:'rain', strength:0};
  if (roll < 79) return {name:'台风', effect:'storm', strength:2+roll%3};
  return {name:'轻震', effect:'quake', strength:2+roll%2};
}
export function unlocked(profile,id) {
  return characters[id]?.type==='human' ? profile.stage>2 : profile.owned.includes(id);
}
export function canMech(profile,id) {
  return profile.stage>18 && characters[id]?.rank && unlocked(profile,id);
}
export function clearStage(profile, foe) {
  const payment = reward(profile.stage);
  profile.coins = (BigInt(profile.coins)+payment).toString();
  if (foe.rank && !profile.owned.includes(foe.id)) profile.owned.push(foe.id);
  profile.stage++;
  return payment;
}
