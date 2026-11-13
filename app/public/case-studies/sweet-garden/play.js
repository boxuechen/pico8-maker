import { createPico8Player } from '../../player/main/player.mjs';
const status=document.querySelector('#status'), versions=document.querySelector('#version');
let player;
try {
 player=await createPico8Player({root:document.querySelector('#player'),execution:'worker',commandTimeoutMs:12000});
 player.on('fault',e=>{status.textContent=e.error.message;});
 player.on('state',e=>{if(e.state==='running')status.textContent='点击画面后，用键盘游玩。';});
 async function load(){
  versions.disabled=true;
  try {
   const name=versions.value==='baseline'?'baseline':'final';
   const r=await fetch(`./${name}.p8`);if(!r.ok)throw new Error(`加载失败 (${r.status})`);
   await player.loadCart(new Uint8Array(await r.arrayBuffer()),{displayName:`sweet-garden-${name}.p8`});
   document.querySelector('#download').href=`./${name}.p8`;
   status.textContent='点击 Play 开始游戏。';
  } catch(e){status.textContent=e.message;} finally{versions.disabled=false;}
 }
 versions.addEventListener('change',load);await load();
}catch(e){status.textContent=e.message;}
window.addEventListener('pagehide',e=>{if(!e.persisted)void player?.dispose();});
