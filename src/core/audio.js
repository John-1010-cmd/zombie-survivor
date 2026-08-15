/**
 * 音效模块（DOM 层，禁止被纯逻辑模块 import）
 *
 * - 素材：assets/audio/*（CC0，来源与许可证见 assets/audio/CREDITS.md）
 * - 懒加载：fetch + decodeAudioData 缓存 AudioBuffer；播放失败仅 console.warn，不抛错
 * - heli 为循环音：重复调用不叠加（正在播放则忽略）；提供 stop(id) 停止循环（集成用）
 * - 首次用户手势前不自动播放：play 由游戏事件（点击/按键/游戏循环）触发，
 *   若 AudioContext 处于 suspended 会尝试 resume 解锁
 * - Node 环境（无 window/AudioContext）下返回空实现，import 不炸
 */

const AUDIO_FILES = {
  shoot: 'assets/audio/shoot.ogg',
  shootMG: 'assets/audio/shootMG.ogg',
  explosion: 'assets/audio/explosion.ogg',
  coin: 'assets/audio/coin.ogg',
  buy: 'assets/audio/buy.ogg',
  hurt: 'assets/audio/hurt.ogg',
  click: 'assets/audio/click.ogg',
  alarm: 'assets/audio/alarm.ogg',
  heli: 'assets/audio/heli.mp3',
};

/** 循环播放的音效 id 集合 */
const LOOP_IDS = new Set(['heli']);

const DEFAULT_VOLUME = 0.8;

function clamp01(v) {
  if (typeof v !== 'number' || Number.isNaN(v)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, v));
}

/**
 * 创建音频播放器。
 * @param {object} settings - 含 volume（0–1，初始主音量）
 * @returns {{ play(id), stop(id), setVolume(v), isReady }}
 */
export function createAudio(settings = {}) {
  const hasWebAudio =
    typeof window !== 'undefined' &&
    (typeof window.AudioContext === 'function' ||
      typeof window.webkitAudioContext === 'function');

  if (!hasWebAudio) {
    // 无 WebAudio 环境（Node 测试/不支持的环境）：空实现，保证调用不炸
    return { play() {}, stop() {}, setVolume() {}, isReady: false };
  }

  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  master.gain.value = clamp01(settings.volume);

  /** id -> AudioBuffer（已解码缓存） */
  const buffers = new Map();
  /** id -> Promise<AudioBuffer>（加载中） */
  const pending = new Map();
  /** id -> AudioBufferSourceNode（正在循环播放） */
  const activeLoops = new Map();

  let ready = false;

  function load(id) {
    if (buffers.has(id)) return Promise.resolve(buffers.get(id));
    if (pending.has(id)) return pending.get(id);
    const p = fetch(AUDIO_FILES[id])
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .then((buf) => {
        buffers.set(id, buf);
        return buf;
      })
      .catch((err) => {
        console.warn('[audio] 加载失败:', id, err);
        pending.delete(id);
        throw err;
      });
    pending.set(id, p);
    return p;
  }

  // 后台预加载全部素材（懒加载：不阻塞启动，逐条失败仅 warn）
  const loads = Object.keys(AUDIO_FILES).map(load);
  Promise.all(loads)
    .then(() => { ready = true; })
    .catch(() => {});

  function play(id) {
    if (!AUDIO_FILES[id]) {
      console.warn('[audio] 未知音效 id:', id);
      return;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (LOOP_IDS.has(id)) {
      // 循环音：正在播放则忽略，不叠加
      if (activeLoops.has(id)) return;
      load(id)
        .then((buf) => {
          if (activeLoops.has(id)) return; // 等待期间已被播放
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.loop = true;
          src.connect(master);
          src.onended = () => {
            if (activeLoops.get(id) === src) activeLoops.delete(id);
          };
          activeLoops.set(id, src);
          src.start();
        })
        .catch(() => {});
      return;
    }
    load(id)
      .then((buf) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(master);
        src.start();
      })
      .catch(() => {});
  }

  /** 停止循环音（如 heli）；非循环音无需停止 */
  function stop(id) {
    const src = activeLoops.get(id);
    if (src) {
      activeLoops.delete(id);
      try { src.stop(); } catch (e) { /* 已停止 */ }
    }
  }

  function setVolume(v) {
    const vol = clamp01(v);
    master.gain.value = vol;
    if (settings && typeof settings === 'object') settings.volume = vol;
  }

  return {
    play,
    stop,
    setVolume,
    get isReady() { return ready; },
  };
}
