import {readFileSync,readdirSync,mkdirSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {extname,join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=new URL('../',import.meta.url);
const read=(path)=>readFileSync(new URL(path,root),'utf8');
const mime={'.js':'text/javascript; charset=utf-8','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp'};
const directory=fileURLToPath(new URL('web/',root));
const assets={};
for(const entry of readdirSync(directory,{recursive:true,withFileTypes:true})){
  if(!entry.isFile())continue;
  const path=join(entry.parentPath,entry.name);
  const assetPath=relative(directory,path).split(sep).map(encodeURIComponent).join('/');
  const type=mime[extname(path)]??'text/plain; charset=utf-8';
  const bin=type==='image/webp';
  assets['/'+assetPath]=[type,readFileSync(path,bin?'base64':'utf8'),bin];
}
const rules=read('web/rules.js').replace(/^export /gm,'');
const physics=read('web/physics.js').replace(/^import .*\r?\n/gm,'').replace(/^export /gm,'');
const rooms=read('worker/rooms.js').replace(/^import .*\r?\n/gm,'').replace(/^export /gm,'');
const worker=read('worker/index.js').replace(/^import .*\r?\n/gm,'');
const folder=new URL('dist/server/',root);
mkdirSync(folder,{recursive:true});
writeFileSync(new URL('index.js',folder),[
  'const files = '+JSON.stringify(assets)+';',
  rules,physics,rooms,worker
].join('\n'));
const hosting=new URL('.openai/hosting.json',root);
if(existsSync(hosting)){
  mkdirSync(new URL('dist/.openai/',root),{recursive:true});
  copyFileSync(hosting,new URL('dist/.openai/hosting.json',root));
}
