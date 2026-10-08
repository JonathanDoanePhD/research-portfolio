// Optional local API reference. The hosted demo uses the same engine in-browser.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEngine} from '../dist/engine.mjs';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
export async function createServer(){
 const engine=createEngine(JSON.parse(await fs.readFile(path.join(root,'corpus.json'),'utf8')),JSON.parse(await fs.readFile(path.join(root,'model.json'),'utf8')));
 const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
 const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value))};
 return http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  const start=performance.now();const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/health')return send(res,200,{status:'ok',records:engine.corpus.length,version:'2.0.0'});
  if(url.pathname==='/api/search'){
   if(req.method!=='POST')return send(res,405,{error:'Use POST.'});
   if(!req.headers['content-type']?.startsWith('application/json'))return send(res,415,{error:'Use application/json.'});
   let bytes=0,body='';
   try{
    for await(const chunk of req){bytes+=chunk.length;if(bytes>16384){send(res,413,{error:'Request too large.'});return}body+=chunk}
    const input=JSON.parse(body);if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.query!=='string')throw new Error('Supply a query string.');
    const options=input.options??{};if(typeof options!=='object'||!options||Array.isArray(options))throw new Error('Invalid options.');
    const allowed=['mode','gentle','lessReligion','short','liked','dismissed','limit'];if(Object.keys(options).some(k=>!allowed.includes(k)))throw new Error('Unknown option.');
    for(const k of ['gentle','lessReligion','short'])if(options[k]!==undefined&&typeof options[k]!=='boolean')throw new Error('Preference must be boolean.');
    for(const k of ['liked','dismissed'])if(options[k]!==undefined&&(!Array.isArray(options[k])||options[k].length>200||options[k].some(v=>typeof v!=='string')))throw new Error('Invalid feedback.');
    const results=engine.search(input.query,options);const latencyMs=performance.now()-start;
    send(res,200,{results,latencyMs,version:'2.0.0'});
    // Log operational signals only, never query text or returned narratives.
    console.log(JSON.stringify({event:'search',method:options.mode??'hybrid',resultCount:results.length,latencyMs:+latencyMs.toFixed(2)}));
   }catch(e){send(res,400,{error:e.message})}return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{error:'Method not allowed.'});
  const filename=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(filename.includes('..')||filename.includes('%')||filename.includes('\\'))return send(res,400,{error:'Invalid path.'});
  try{const data=await fs.readFile(path.join(root,filename));res.writeHead(200,{'Content-Type':mime[path.extname(filename)]??'application/octet-stream'});res.end(req.method==='HEAD'?undefined:data)}catch{send(res,404,{error:'Not found.'})}
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=await createServer();server.listen(Number(process.env.RESONANCE_PORT||8000),'127.0.0.1',()=>console.log('Finding Resonance is available on http://127.0.0.1:'+server.address().port));
}
