// Replay a saved input route against an unmodified cart in the bundled WASM runtime.
// Usage: node scripts/evaluation/replay-case.mjs CART.p8 INPUTS.json OUTPUT_PREFIX
import fs from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import {createPico8Session} from '../../public/player/main/player.mjs';
const [cartPath,planPath,prefix]=process.argv.slice(2);
const input=b=>({controllers:[b,0,0,0,0,0,0,0],devkit:{mouseXRaw:0,mouseYRaw:0,mouseButtons:0,wheelRaw:0,movementXRaw:0,movementYRaw:0,keypresses:[]}});
function png(rgba){
 const crc=b=>{let n=-1;for(const v of b){n^=v;for(let j=0;j<8;j++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^-1)>>>0;};
 const chunk=(type,b)=>{const t=Buffer.from(type),s=Buffer.alloc(4),c=Buffer.alloc(4);s.writeUInt32BE(b.length);c.writeUInt32BE(crc(Buffer.concat([t,b])));return Buffer.concat([s,t,b,c]);};
 const h=Buffer.alloc(13);h.writeUInt32BE(128,0);h.writeUInt32BE(128,4);h[8]=8;h[9]=6;
 const rows=Buffer.alloc(128*513);for(let y=0;y<128;y++)rows.set(rgba.slice(y*512,y*512+512),y*513+1);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
const steps=JSON.parse(await fs.readFile(planPath,'utf8'));
const s=await createPico8Session();
const record=[];
try{
 const loaded=await s.loadCart(new Uint8Array(await fs.readFile(cartPath)));
 if(loaded.state!=='ready')throw new Error(JSON.stringify(loaded));
 let frame;
 for(let i=0;i<steps.length;i++){
  const step=steps[i];const r=await s.advance({frames:step.frames,input:input(step.buttons)});
  if(r.outcome!=='completed')throw new Error(JSON.stringify(r.observation.diagnostics));
  frame=r.observation.frame;
  if(step.capture)await fs.writeFile(`${prefix}-${step.capture}.png`,png(frame.rgba));
  record.push({step,frameId:frame.frameId,outcome:r.outcome,diagnostics:r.observation.diagnostics});
 }
 await fs.writeFile(`${prefix}-latest.png`,png(frame.rgba));
 await fs.writeFile(`${prefix}-evidence.json`,JSON.stringify({cartPath,steps:record},null,2));
 console.log(JSON.stringify({steps:steps.length,frames:steps.reduce((n,x)=>n+x.frames,0),image:`${prefix}-latest.png`,faults:record.filter(x=>x.diagnostics.length).length}));
}finally{await s.dispose();}
