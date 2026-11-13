export const SHIMS = {
  path: `const norm=(p)=>{const abs=p.startsWith("/");const out=[];for(const s of p.split("/")){if(!s||s===".")continue;if(s==="..")out.pop();else out.push(s);}return (abs?"/":"")+out.join("/")||(abs?"/":".");};
const path={sep:"/",delimiter:":",normalize:norm,join:(...a)=>norm(a.filter(Boolean).join("/")),resolve:(...a)=>{let r="";for(const p of a){if(!p)continue;r=p.startsWith("/")?p:r+"/"+p;}return norm(r||"/");},
dirname:(p)=>{const n=norm(p);const i=n.lastIndexOf("/");return i<=0?(n.startsWith("/")?"/":"."):n.slice(0,i);},basename:(p,e)=>{let b=norm(p).split("/").pop()||"";if(e&&b.endsWith(e))b=b.slice(0,-e.length);return b;},
extname:(p)=>{const b=p.split("/").pop()||"";const i=b.lastIndexOf(".");return i>0?b.slice(i):"";},isAbsolute:(p)=>p.startsWith("/"),relative:(a,b)=>{const x=norm(a).split("/").filter(Boolean),y=norm(b).split("/").filter(Boolean);let i=0;while(i<x.length&&x[i]===y[i])i++;return [...x.slice(i).map(()=>".."),...y.slice(i)].join("/");},parse:(p)=>({root:p.startsWith("/")?"/":"",dir:path.dirname(p),base:path.basename(p),ext:path.extname(p),name:path.basename(p,path.extname(p))}),format:(o)=>(o.dir?o.dir+"/":"")+(o.base??(o.name??"")+(o.ext??""))};
path.posix=path;path.win32=path;module.exports=path;`,
  url: `module.exports={fileURLToPath:(u)=>decodeURIComponent(new URL(String(u)).pathname),pathToFileURL:(p)=>new URL("file://"+p),URL,URLSearchParams};`,
  os: `module.exports={homedir:()=>"/home",tmpdir:()=>"/tmp",platform:()=>"browser",arch:()=>"wasm",type:()=>"Browser",release:()=>"0",hostname:()=>"browser",EOL:"\\n",cpus:()=>[],totalmem:()=>0,freemem:()=>0,userInfo:()=>({username:"user",homedir:"/home"}),constants:{signals:{}}};`,
};
const NOENT = `const noent=(p)=>Object.assign(new Error("ENOENT: no such file or directory, open '"+p+"'"),{code:"ENOENT"});`;
Object.assign(SHIMS, {
  fs: NOENT + `const t=(p)=>{throw noent(p)};const r=(p)=>Promise.reject(noent(p));const promises={readFile:r,writeFile:r,stat:r,lstat:r,readdir:r,mkdir:r,access:r,open:r,rm:r,unlink:r,realpath:r,appendFile:r,rename:r,copyFile:r,mkdtemp:r};
module.exports={existsSync:()=>false,readFileSync:t,writeFileSync:t,appendFileSync:t,statSync:t,lstatSync:t,readdirSync:()=>[],mkdirSync:()=>{},realpathSync:(p)=>p,accessSync:t,openSync:t,closeSync:()=>{},unlinkSync:()=>{},rmSync:()=>{},renameSync:t,copyFileSync:t,mkdtempSync:t,createReadStream:t,createWriteStream:t,watch:()=>({close(){}}),constants:{F_OK:0,R_OK:4,W_OK:2,X_OK:1},promises};`,
  "fs/promises": NOENT + `const r=(p)=>Promise.reject(noent(p));module.exports={readFile:r,writeFile:r,stat:r,lstat:r,readdir:r,mkdir:r,access:r,open:r,rm:r,unlink:r,realpath:r,appendFile:r,rename:r,copyFile:r,mkdtemp:r,constants:{F_OK:0,R_OK:4,W_OK:2,X_OK:1}};`,
  child_process: `const no=()=>{throw new Error("child processes are not available in the browser")};module.exports={spawn:no,spawnSync:no,exec:no,execSync:no,execFile:no,execFileSync:no,fork:no};`,
  crypto: `module.exports={randomUUID:()=>crypto.randomUUID(),randomBytes:(n)=>crypto.getRandomValues(new Uint8Array(n)),createHash:()=>{throw new Error("createHash is not available")},webcrypto:crypto};`,
  events: `class EventEmitter{constructor(){this._e={}}on(n,f){(this._e[n]??=[]).push(f);return this}addListener(n,f){return this.on(n,f)}once(n,f){const g=(...a)=>{this.off(n,g);f(...a)};return this.on(n,g)}off(n,f){this._e[n]=(this._e[n]??[]).filter(x=>x!==f);return this}removeListener(n,f){return this.off(n,f)}removeAllListeners(n){if(n)delete this._e[n];else this._e={};return this}emit(n,...a){for(const f of [...(this._e[n]??[])])f(...a);return !!this._e[n]?.length}setMaxListeners(){return this}listenerCount(n){return (this._e[n]??[]).length}}
module.exports=EventEmitter;module.exports.EventEmitter=EventEmitter;module.exports.once=(em,n)=>new Promise(r=>em.once(n,(...a)=>r(a)));`,
  util: `module.exports={promisify:(f)=>(...a)=>new Promise((res,rej)=>f(...a,(e,v)=>e?rej(e):res(v))),inspect:(v)=>{try{return JSON.stringify(v)}catch{return String(v)}},format:(...a)=>a.join(" "),inherits:(c,p)=>Object.setPrototypeOf(c.prototype,p.prototype),types:{isPromise:(v)=>v instanceof Promise},TextDecoder,TextEncoder,deprecate:(f)=>f,stripVTControlCharacters:(s)=>s.replace(/\x1b\[[0-9;]*m/g,"")};`,
  "util/types": `module.exports={isPromise:(v)=>v instanceof Promise};`,
  module: `const absent=(id)=>new Proxy({},{get:(t,k)=>k==="existsSync"?()=>false:k==="__esModule"?false:()=>{throw Object.assign(new Error(id+"."+String(k)+" is not available in the browser"),{code:"ENOENT"})}});
module.exports={createRequire:()=>(id)=>absent(id),builtinModules:[]};`,
  perf_hooks: `module.exports={performance:globalThis.performance};`,
  worker_threads: `module.exports={isMainThread:true,parentPort:null,Worker:class{constructor(){throw new Error("worker_threads unavailable")}}};`,
  zlib: `const no=()=>{throw new Error("zlib is not available in the browser")};module.exports={gzipSync:no,gunzipSync:no,deflateSync:no,inflateSync:no,createGzip:no,createGunzip:no,constants:{}};`,
});
export const GENERIC = "const s=new Proxy(function(){},{get:(t,k)=>k==='__esModule'?true:k===Symbol.toPrimitive?(()=>''):s,apply:()=>s,construct:()=>s}); module.exports=s;";
