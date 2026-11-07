// Sons do app: arquivos em src/assets/sfx e, para o resto, sons sintetizados na hora.

export type SoundSlot = 'quest' | 'objective' | 'crit' | 'levelup' | 'rested' | 'hearthCast' | 'hearthDone' | 'boss' | 'achievement' | 'curse' | 'questNew' | 'questDelete' | 'day24' | 'click' | 'raidWarning' | 'menuOpen' | 'menuClose' | 'objOpen' | 'objClose' | 'bossHit';

export const SOUND_SLOTS: { id: SoundSlot; label: string }[] = [
  { id: 'quest', label: 'Missão concluída' },
  { id: 'objective', label: 'Objetivo concluído' },
  { id: 'crit', label: 'XP crítico' },
  { id: 'levelup', label: 'Subiu de nível' },
  { id: 'rested', label: 'Lazer / descanso' },
  { id: 'hearthCast', label: 'Pedra de Regresso (conjurando)' },
  { id: 'hearthDone', label: 'Pedra de Regresso (chegou)' },
  { id: 'boss', label: 'Chefe derrotado' },
  { id: 'achievement', label: 'Conquista obtida' },
  { id: 'curse', label: 'Relatório com debuff' },
  { id: 'questNew', label: 'Missão criada' },
  { id: 'questDelete', label: 'Missão apagada' },
  { id: 'day24', label: 'Modo 24h ligado' },
  { id: 'click', label: 'Clique em botão' },
  { id: 'raidWarning', label: 'Virada do dia com tarefa por fazer' },
  { id: 'menuOpen', label: 'Abrir opções' },
  { id: 'menuClose', label: 'Fechar opções' },
  { id: 'objOpen', label: 'Abrir objetivos da missão' },
  { id: 'objClose', label: 'Fechar objetivos da missão' },
  { id: 'bossHit', label: 'Golpe final no chefe' },
];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.7;
let enabled = true;

function ac() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function configureSound(on: boolean, vol: number) {
  enabled = on;
  volume = vol;
  if (master) master.gain.value = vol;
}

// os sons próprios saíram na 0.19.5: apaga os arquivos que ficaram guardados
try { indexedDB.deleteDatabase('dquests-sounds'); } catch { /* sem IndexedDB */ }

// ---------- sons que vêm com o app (src/assets/sfx/<slot>.mp3) ----------
// Uma pasta (src/assets/sfx/<pasta>/) vira várias opções e cada vez toca uma delas, sorteada.
const FOLDER_SLOT: Record<string, SoundSlot> = { death: 'boss' };
const BUNDLED: Partial<Record<SoundSlot, string[]>> = {};
for (const [path, url] of Object.entries(import.meta.glob('../assets/sfx/**/*.{mp3,ogg,wav,m4a}', { eager: true, query: '?url', import: 'default' }))) {
  const parts = path.replace('../assets/sfx/', '').split('/');
  const slot = (parts.length > 1 ? FOLDER_SLOT[parts[0]] ?? parts[0] : parts[0].replace(/\.\w+$/, '')) as SoundSlot;
  (BUNDLED[slot] ??= []).push(url as string);
}
const bundled = new Map<string, Promise<AudioBuffer | null>>();
function bundledBuffer(slot: SoundSlot) {
  const urls = BUNDLED[slot];
  if (!urls?.length) return Promise.resolve(null);
  const url = urls[Math.floor(Math.random() * urls.length)];
  if (!bundled.has(url)) {
    bundled.set(url, fetch(url).then(r => r.arrayBuffer()).then(b => ac().decodeAudioData(b)).catch(() => null));
  }
  return bundled.get(url)!;
}

// ---------- síntese ----------
function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.3, endFreq?: number) {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + start);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, c.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(master!);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
  return o;
}
function bell(freq: number, start: number, dur = 1.2, gain = 0.25) {
  tone(freq, start, dur, 'sine', gain);
  tone(freq * 2.01, start, dur * 0.6, 'sine', gain * 0.35);
  tone(freq * 3.02, start, dur * 0.35, 'sine', gain * 0.15);
}
function noise(start: number, dur: number, from: number, to: number, gain = 0.15) {
  const c = ac();
  const len = Math.ceil(c.sampleRate * dur);
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = b;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 6;
  f.frequency.setValueAtTime(from, c.currentTime + start);
  f.frequency.exponentialRampToValueAtTime(to, c.currentTime + start + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(c.currentTime + start);
  return src;
}

const SYNTH: Record<SoundSlot, () => void> = {
  // missão inteira: arpejo subindo, acorde que fica soando e um brilho agudo por cima
  quest: () => {
    tone(262, 0, 1.1, 'triangle', 0.07);
    [523, 659, 784].forEach((f, i) => bell(f, i * 0.07, 0.7, 0.17));
    bell(1047, 0.22, 1.5, 0.2);
    bell(1319, 0.24, 1.3, 0.1);
    [2093, 2637, 3136].forEach((f, i) => tone(f, 0.3 + i * 0.05, 0.45, 'sine', 0.045));
    noise(0.18, 0.9, 5000, 11000, 0.035);
  },
  objective: () => { bell(784, 0, 0.5, 0.22); bell(1175, 0.09, 0.7, 0.2); },
  crit: () => { tone(180, 0, 0.25, 'square', 0.15, 90); bell(1568, 0.05, 0.6, 0.18); bell(2093, 0.12, 0.8, 0.14); },
  levelup: () => {
    [523, 659, 784, 1047].forEach((f, i) => bell(f, i * 0.09, 1.6, 0.22));
    bell(1568, 0.42, 2.2, 0.16);
    noise(0, 1.6, 2000, 9000, 0.05);
  },
  rested: () => { [392, 494, 587].forEach((f, i) => tone(f, i * 0.04, 1.4, 'sine', 0.1)); },
  hearthCast: () => {
    noise(0, 3, 300, 4000, 0.12);
    tone(220, 0, 3, 'sine', 0.08, 880);
    tone(330, 0.2, 2.8, 'triangle', 0.05, 1320);
  },
  hearthDone: () => { noise(0, 0.5, 6000, 600, 0.2); bell(988, 0.05, 1.4, 0.2); bell(1319, 0.15, 1.6, 0.16); },
  boss: () => { tone(98, 0, 2.5, 'sine', 0.35); tone(147, 0, 2.2, 'sine', 0.18); noise(0, 1.2, 200, 80, 0.2); [392, 523, 659, 784].forEach((f, i) => bell(f, 0.4 + i * 0.12, 1.4, 0.18)); },
  achievement: () => { [392, 523, 659].forEach((f, i) => bell(f, i * 0.11, 0.9, 0.2)); bell(784, 0.36, 1.6, 0.22); },
  // os arquivos de src/assets/sfx tocam no lugar destes
  questNew: () => { bell(659, 0, 0.6, 0.18); bell(988, 0.08, 0.9, 0.16); },
  questDelete: () => { tone(330, 0, 0.5, 'triangle', 0.15, 165); },
  click: () => { tone(1800, 0, 0.03, 'square', 0.04); },
  day24: () => { tone(110, 0, 1.8, 'sine', 0.2, 220); [440, 554, 659, 880].forEach((f, i) => bell(f, 0.2 + i * 0.1, 1.4, 0.16)); },
  raidWarning: () => { [0, 0.25].forEach(t => { tone(880, t, 0.18, 'square', 0.08); tone(660, t + 0.1, 0.18, 'square', 0.08); }); },
  menuOpen: () => { tone(520, 0, 0.12, 'triangle', 0.1, 780); },
  menuClose: () => { tone(780, 0, 0.12, 'triangle', 0.1, 520); },
  objOpen: () => { noise(0, 0.25, 1500, 4000, 0.06); },
  objClose: () => { noise(0, 0.25, 4000, 1500, 0.06); },
  bossHit: () => { tone(120, 0, 0.3, 'square', 0.2, 60); noise(0, 0.2, 3000, 500, 0.2); },
  curse: () => { tone(220, 0, 0.9, 'sawtooth', 0.06, 110); tone(233, 0, 0.9, 'sawtooth', 0.05, 116); },
};

let current: AudioBufferSourceNode | null = null;

let pendingClick: ReturnType<typeof setTimeout> | undefined;
/** Clique em qualquer botão: toca um instante depois, e só se o botão não tocou outro som. */
export function clickSound() {
  clearTimeout(pendingClick);
  pendingClick = setTimeout(() => void play('click'), 40);
}

/** Toca o som e devolve quanto ele dura, em segundos (0 se não tocou). */
export async function play(slot: SoundSlot): Promise<number> {
  if (slot !== 'click') clearTimeout(pendingClick);
  if (!enabled) return 0;
  try {
    // o arquivo que vem com o app; sem ele, o sintetizado
    const buf = await bundledBuffer(slot);
    const c = ac();
    if (buf) {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(master!);
      src.start();
      if (slot === 'hearthCast') current = src;
      return buf.duration;
    }
    SYNTH[slot]();
    return 0.3;
  } catch { return 0; /* sem áudio disponível */ }
}

/** Um som logo depois do outro. */
export async function playThen(first: SoundSlot, then: SoundSlot) {
  const d = await play(first);
  setTimeout(() => void play(then), d * 1000);
}

/** Corta o som de conjuração quando a Pedra é cancelada. */
export function stopCast() {
  try { current?.stop(); } catch { /* já parou */ }
  current = null;
}
