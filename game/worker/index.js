import {roomApi} from './rooms.js';
import {files} from '__ASSET_MODULE__';

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/api/rooms'){
      try{return await roomApi(request,env);}
      catch(error){
        console.error('room API error',error);
        return Response.json({error:'联机服务暂时不可用。'},{status:503,headers:{'Cache-Control':'no-store'}});
      }
    }
    if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
    const asset=files[url.pathname==='/'?'/index.html':url.pathname];
    if(!asset)return new Response('Not found',{status:404});
    const [type,value,binary]=asset;
    const payload=binary?Uint8Array.from(atob(value),char=>char.charCodeAt(0)):value;
    return new Response(request.method==='HEAD'?null:payload,{headers:{
      'Content-Type':type,
      'Cache-Control':url.pathname.startsWith('/vendor/')||url.pathname.startsWith('/assets/')?'public, max-age=86400':'no-cache',
      'X-Content-Type-Options':'nosniff'
    }});
  }
};
