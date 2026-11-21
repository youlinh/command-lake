import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {BlockList} from 'node:net';
import {networkInterfaces} from 'node:os';

const args=process.argv.slice(2);
const flag=(key)=>args.includes(key)?args[args.indexOf(key)+1]:undefined;
const port=Number(flag('--port')??process.env.PORT)||5173;
const host=flag('--host')??'127.0.0.1';
const lanEnabled=args.includes('--lan')||args.includes('--lan-ip');
let lan,lanSubnet;
if(lanEnabled){
  const interfaces=Object.values(networkInterfaces()).flat().filter(({family,internal,address,cidr})=>
    family==='IPv4'&&!internal&&cidr&&/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(address));
  if(args.includes('--lan-ip')){
    lan=interfaces.find(({address})=>address===flag('--lan-ip'));
    if(!lan)throw new Error('--lan-ip must name a private IPv4 address on this computer.');
  }else if(interfaces.length===1){
    [lan]=interfaces;
  }else{
    const addresses=interfaces.map(({address})=>address).join(', ');
    console.warn(addresses?'Multiple LAN addresses: '+addresses+'. Restart with --lan-ip <address>.':
      'No private IPv4 address detected. Connect to Wi-Fi or Ethernet and restart for LAN play.');
  }
  if(lan){
    lanSubnet=new BlockList();
    lanSubnet.addSubnet(lan.address,Number(lan.cidr.split('/')[1]));
  }
}

execFileSync(process.execPath,['scripts/build.mjs'],{stdio:'inherit'});
const {default:worker}=await import('../dist/server/index.js');
const db=new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../drizzle/0000_rooms.sql',import.meta.url),'utf8'));
const DB={prepare(sql){
  const statement=db.prepare(sql.replace(/\?\d+/g,'?'));
  return {bind(...args){return {first:()=>statement.get(...args),run:()=>({meta:statement.run(...args)})};}};
}};
const handle=async(req,res)=>{
  try{
    if(lan&&req.socket.localAddress===lan.address&&!lanSubnet.check(req.socket.remoteAddress)){
      res.writeHead(403).end('LAN access only');
      return;
    }
    const chunks=[];
    let size=0;
    for await(const chunk of req.iterator({destroyOnReturn:false})){
      size+=chunk.length;
      if(size>16384){
        res.writeHead(413,{'Content-Type':'application/json; charset=utf-8','Connection':'close'});
        res.end(JSON.stringify({error:'请求过长。'}));
        return;
      }
      chunks.push(chunk);
    }
    const url=new URL(req.url,'http://localhost');
    const request=new Request(url,{method:req.method,headers:req.headers,body:chunks.length?Buffer.concat(chunks):undefined});
    const out=await worker.fetch(request,{DB});
    const headers=Object.fromEntries(out.headers);
    const advertise=lan&&req.method==='GET'&&headers['content-type']?.startsWith('text/html');
    const body=advertise
      ?(await out.text()).replace('</head>','<meta name="command-lake-lan" content="'+lan.address+'">\n</head>')
      :Buffer.from(await out.arrayBuffer());
    res.writeHead(out.status,headers);
    res.end(body);
  }catch(error){
    console.error(error);res.writeHead(500);res.end('Server error');
  }
};
const hosts=[...new Set(lan?[host,lan.address]:[host])];
await Promise.all(hosts.map(address=>new Promise((resolve,reject)=>{
  createServer(handle).once('error',reject).listen(port,address,resolve);
})));
for(const address of hosts){
  const urlHost=address.includes(':')?'['+address+']':address;
  console.log((address===lan?.address?'LAN invite address: ':'Command Lake running at ')+'http://'+urlHost+':'+port);
}
