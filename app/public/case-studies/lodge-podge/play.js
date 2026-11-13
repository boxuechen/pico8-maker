import { createPico8Player } from '../../player/main/player.mjs';
const status = document.querySelector('#status');
const versions = document.querySelector('#version');
let player;
try {
  player = await createPico8Player({root: document.querySelector('#player'), execution:'worker', commandTimeoutMs:12000});
  player.on('fault', event => { status.textContent = event.error.message; });
  player.on('state', event => {
    if (event.state === 'running') status.textContent = '点击画面后，用方向键和 X 游玩。';
    if (event.state === 'ready') status.textContent = '点击 Play 开始游戏。';
  });
  async function load() {
    versions.disabled = true;
    try {
      const name = versions.value === 'baseline' ? 'baseline' : 'final';
      const response = await fetch(`./${name}.p8`);
      if (!response.ok) throw new Error(`卡带加载失败 (${response.status})`);
      await player.loadCart(new Uint8Array(await response.arrayBuffer()), {displayName: `lodge-podge-${name}.p8`});
      document.querySelector('#download').href = `./${name}.p8`;
      document.querySelector('#version-note').textContent = name === 'baseline' ? '首版只需要收集 12 根木棍，完成后按 X 重开。' : '收集 6 根木棍、3 份泥、3 份树叶。完成后按 X 重开。';
      status.textContent = '点击 Play 开始游戏。';
    } catch(error) { status.textContent = error.message; }
    finally { versions.disabled = false; }
  }
  versions.addEventListener('change', load);
  await load();
} catch(error) { status.textContent = error.message; }
window.addEventListener('pagehide', event => { if(!event.persisted) void player?.dispose(); });
