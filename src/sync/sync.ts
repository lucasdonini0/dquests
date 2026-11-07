// Sincroniza o save com um repositório privado no GitHub (arquivo save.json).
// O repositório vem de VITE_SAVE_REPO ("usuario/repositorio") no arquivo .env.
import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '../storage';
import { App as CapApp } from '@capacitor/app';
import { dataOf, useGame, type GameData } from '../game/store';
import { desktop, getToken } from '../fx/updater';
import { applyTuning, TUNING_DEFAULTS } from '../game/rules';

export const SAVE_REPO: string = import.meta.env.VITE_SAVE_REPO || 'seu-usuario/dquests-save';
const PATH = 'save.json';
const REPO_API = `https://api.github.com/repos/${SAVE_REPO}`;
const API = `${REPO_API}/contents/${PATH}`;
const NO_ACCESS = `O token não tem acesso ao repositório ${SAVE_REPO}. No GitHub, edite o token: em Repository access marque esse repositório e em Contents escolha Read and write.`;

const K = { enabled: 'sync-enabled', sha: 'sync-sha', rev: 'sync-rev', at: 'sync-at' };

export type SyncPhase = 'off' | 'idle' | 'syncing' | 'ok' | 'error';
export interface RemoteInfo { name: string; level: number; rev: number }
interface SyncState {
  phase: SyncPhase; at: number | null; error: string;
  choice: RemoteInfo | null; // primeira vez: existe save na nuvem e neste aparelho
}
export const useSync = create<SyncState>(() => ({ phase: 'off', at: null, error: '', choice: null }));

class SyncError extends Error {}
class Conflict extends Error {}

const device = () => (Capacitor.isNativePlatform() ? 'Android' : (window as unknown as { dquestsDesktop?: unknown }).dquestsDesktop ? 'PC' : 'Navegador');

// ---------- base64 com UTF-8 ----------
function toB64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromB64(b64: string) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ---------- API do GitHub ----------
async function call(token: string, init: RequestInit & { accept?: string } = {}, url = API) {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      cache: 'no-store',
      headers: { Accept: init.accept ?? 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers ?? {}) },
    });
  } catch {
    throw new SyncError('Sem conexão. As mudanças ficam guardadas e sobem quando a internet voltar.');
  }
  if (res.status === 401) throw new SyncError('Token inválido ou expirado.');
  if (res.status === 403) throw new SyncError(NO_ACCESS);
  if (res.status === 409 || res.status === 422) throw new Conflict();
  return res;
}

async function getRemote(token: string): Promise<{ sha: string; data: GameData } | null> {
  const res = await call(token);
  if (res.status === 404) {
    // 404 pode ser "ainda não há save" ou "o token não enxerga o repositório"
    const repo = await call(token, {}, REPO_API);
    if (repo.status === 404) throw new SyncError(NO_ACCESS);
    return null;
  }
  if (!res.ok) throw new SyncError(`O GitHub respondeu com erro ${res.status}.`);
  const j = await res.json();
  let text: string;
  if (j.content && j.encoding === 'base64') text = fromB64(j.content);
  else text = await (await call(token, { accept: 'application/vnd.github.raw+json' })).text(); // arquivos acima de 1 MB
  return { sha: j.sha, data: JSON.parse(text) as GameData };
}

async function putRemote(token: string, data: GameData, sha: string | null) {
  const res = await call(token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `sync: ${device()} · nível ${data.level} · ${new Date().toLocaleString('pt-BR')}`,
      content: toB64(JSON.stringify(data)),
      ...(sha ? { sha } : {}),
    }),
  });
  if (res.status === 404) throw new SyncError(NO_ACCESS);
  if (!res.ok) throw new SyncError(`Não deu para enviar o save (erro ${res.status}).`);
  const j = await res.json();
  await Preferences.set({ key: K.sha, value: j.content.sha });
  await Preferences.set({ key: K.rev, value: String(data.rev) });
}

const pref = async (k: string) => (await Preferences.get({ key: k })).value;

// ---------- balanceamento (config.json no mesmo repositório) ----------
// Muda XP, curva, descanso e chefe sem atualizar o app. Sem o arquivo, valem os padrões.
const TUNING = { cfg: 'tuning', curve: 'tuning-curve' };
async function setTuning(cfg: unknown) {
  const t = applyTuning(cfg);
  const curve = JSON.stringify(t.curva);
  // a curva mudou: refaz nível e XP a partir do total para o nível bater com a curva nova
  if (curve !== ((await pref(TUNING.curve)) ?? JSON.stringify(TUNING_DEFAULTS.curva))) useGame.getState().retune();
  await Preferences.set({ key: TUNING.curve, value: curve });
}
/** Frases da tela de abertura que vieram do config.json ("frases"), do último que foi baixado. */
export async function cachedQuotes(): Promise<string[]> {
  try {
    const c = await pref(TUNING.cfg);
    const list = c ? (JSON.parse(c) as { frases?: unknown }).frases : null;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
  } catch { return []; }
}
async function fetchTuning(token: string) {
  try {
    const res = await call(token, {}, `${REPO_API}/contents/config.json`);
    if (res.status === 404) { await Preferences.remove({ key: TUNING.cfg }); await setTuning(null); return; }
    if (!res.ok) return;
    const j = await res.json();
    const text = fromB64(j.content);
    const cfg = JSON.parse(text);
    await Preferences.set({ key: TUNING.cfg, value: text });
    await setTuning(cfg);
  } catch { /* sem internet ou JSON quebrado: fica o último que funcionou */ }
}

// ---------- ciclo de sincronização ----------
let running: Promise<void> | null = null;
let again: boolean | null = null; // outra rodada pedida durante esta (true = com envio)

/** push false: só baixa; as mudanças deste aparelho esperam o envio (ocioso, fechar ou botão). */
async function cycle(push: boolean, attempt = 0): Promise<void> {
  const token = await getToken();
  if (!token) throw new SyncError('Cole o token do GitHub em Opções → Atualizações.');
  await fetchTuning(token);
  const remote = await getRemote(token);
  const local = dataOf(useGame.getState());
  const syncedSha = await pref(K.sha);
  const dirty = String(local.rev) !== (await pref(K.rev));

  try {
    if (!remote) {
      if (local.hero.created && push) await putRemote(token, local, null);
    } else if (!local.hero.created) {
      // Este aparelho não tem herói: nunca envia; sempre baixa o da nuvem
      await adopt(remote.sha, remote.data);
    } else if (remote.sha === syncedSha) {
      if (dirty && push) await putRemote(token, local, remote.sha);
    } else if (!syncedSha) {
      // Primeira sincronização deste aparelho
      if (!local.hero.created) await adopt(remote.sha, remote.data);
      else useSync.setState({ choice: { name: remote.data.hero.name, level: remote.data.level, rev: remote.data.rev } });
      return;
    } else if (!dirty) {
      await adopt(remote.sha, remote.data);
    } else {
      // A mescla é por eventos: refazer na hora do envio não duplica nada
      useGame.getState().mergeRemote(remote.data);
      if (push) await putRemote(token, dataOf(useGame.getState()), remote.sha);
    }
  } catch (e) {
    if (e instanceof Conflict && attempt < 2) return cycle(push, attempt + 1);
    throw e;
  }
}

async function adopt(sha: string, data: GameData) {
  await Preferences.set({ key: K.sha, value: sha });
  await Preferences.set({ key: K.rev, value: String(data.rev) });
  useGame.getState().adoptRemote(data);
}

/** Roda uma sincronização agora (ou agenda outra logo depois, se já houver uma rodando). push false só baixa. */
export function syncNow(push = true): Promise<void> {
  if (useSync.getState().phase === 'off') return Promise.resolve();
  if (running) { again = !!again || push; return running; }
  useSync.setState({ phase: 'syncing' });
  running = (async () => {
    try {
      await cycle(push);
      const at = Date.now();
      await Preferences.set({ key: K.at, value: String(at) });
      useSync.setState(s => ({ phase: s.choice ? 'idle' : 'ok', at, error: '' }));
    } catch (e) {
      useSync.setState({ phase: 'error', error: e instanceof Error ? e.message : 'Falha na sincronização.' });
    } finally {
      running = null;
      if (again !== null) { const p = again; again = null; void syncNow(p); }
    }
  })();
  return running;
}

/** Resolve a primeira sincronização quando os dois lados já têm um herói. */
export async function resolveChoice(use: 'remote' | 'local') {
  const token = await getToken();
  const remote = await getRemote(token);
  useSync.setState({ choice: null });
  if (!remote) return syncNow();
  if (use === 'remote') await adopt(remote.sha, remote.data);
  else await putRemote(token, dataOf(useGame.getState()), remote.sha);
  await Preferences.set({ key: K.at, value: String(Date.now()) });
  useSync.setState({ phase: 'ok', at: Date.now(), error: '' });
}

export async function setSyncEnabled(on: boolean) {
  await Preferences.set({ key: K.enabled, value: on ? '1' : '' });
  // Ligar ou desligar sempre esquece a marcação antiga: ligar começa do zero (baixa ou pergunta qual save fica)
  await Preferences.remove({ key: K.sha });
  await Preferences.remove({ key: K.rev });
  if (!on) {
    useSync.setState({ phase: 'off', choice: null, error: '' });
    return;
  }
  useSync.setState({ phase: 'idle' });
  await syncNow();
}

const IDLE_MS = 5 * 60_000;
let started = false;

/** Envia o que ficou pendente (até 8 s). Usado ao fechar o app. */
async function flush() {
  if (!pending) return;
  pending = false;
  const send = async () => {
    // se uma rodada só de baixar estiver no meio, o envio vem depois dela, e é por ele que o fechar espera
    if (running) await running;
    await syncNow(true);
    if (useSync.getState().phase === 'error') pending = true; // no celular o app pode voltar: tenta de novo depois
  };
  await Promise.race([send(), new Promise(r => setTimeout(r, 8000))]);
}
let pending = false; // há mudanças deste aparelho que ainda não subiram

/** Liga a sincronização ao abrir o app. Espera o primeiro download (até 5 s) para não processar o dia duas vezes. */
export async function startSync() {
  if (started) return;
  started = true;
  // o último config baixado vale já ao abrir, mesmo offline
  try { const c = await pref(TUNING.cfg); await setTuning(c ? JSON.parse(c) : null); } catch { /* config salvo quebrado: padrões */ }
  const on = !!(await pref(K.enabled));
  const at = Number((await pref(K.at)) ?? 0) || null;
  useSync.setState({ phase: on ? 'idle' : 'off', at });

  // Envia só depois de 5 min sem mexer no app (ou ao fechar); antes disso as mudanças ficam no aparelho
  let lastRev = useGame.getState().rev;
  let lastTouch = Date.now();
  pending = !!on && String(lastRev) !== (await pref(K.rev)); // sobrou do último uso
  const touch = () => { lastTouch = Date.now(); };
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, touch, { passive: true, capture: true });
  // Mexer conta só pelo toque/teclado: a mescla do que vem da nuvem também muda o rev e não pode zerar a espera
  useGame.subscribe(st => {
    if (st.rev === lastRev) return;
    lastRev = st.rev;
    pending = true;
  });
  setInterval(() => {
    if (!pending || Date.now() - lastTouch < IDLE_MS) return;
    pending = false;
    void syncNow(true).then(() => {
      // falhou (sem internet etc.): tenta de novo depois de mais 5 min
      if (useSync.getState().phase === 'error') { pending = true; lastTouch = Date.now(); }
    });
  }, 10_000);
  // De tempos em tempos só baixa o que veio dos outros aparelhos
  setInterval(() => { if (document.visibilityState === 'visible') void syncNow(false); }, 120_000);

  // Fechar o app: PC avisa antes de fechar a janela; no celular, sair do app pode ser o fim dele
  desktop?.onClose?.(flush);
  void CapApp.addListener('pause', () => void flush()).catch(() => null);
  if (!desktop) document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush(); });

  if (on) await Promise.race([syncNow(false), new Promise(r => setTimeout(r, 5000))]);
}
