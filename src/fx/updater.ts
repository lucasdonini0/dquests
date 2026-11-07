// Verificador de atualização: lê o último release do repositório privado no GitHub.
import { App as CapApp } from '@capacitor/app';
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { Preferences } from '../storage';

/** Repositório dos releases, de VITE_UPDATE_REPO ("usuario/repositorio") no arquivo .env. */
export const REPO: string = import.meta.env.VITE_UPDATE_REPO || 'seu-usuario/dquests';
const TOKEN_KEY = 'gh-token';
const LAST_CHECK_KEY = 'update-last-check';

interface UpdaterPlugin {
  canInstall(): Promise<{ value: boolean }>;
  openInstallSettings(): Promise<void>;
  downloadAndInstall(o: { url: string; token: string }): Promise<void>;
  addListener(ev: 'progress', fn: (e: { percent: number }) => void): Promise<PluginListenerHandle>;
}
const Updater = registerPlugin<UpdaterPlugin>('Updater');

export interface Release { version: string; notes: string; assetUrl: string; size: number; date: string }

export async function getToken() { return (await Preferences.get({ key: TOKEN_KEY })).value ?? ''; }
export async function setToken(t: string) {
  if (t) await Preferences.set({ key: TOKEN_KEY, value: t });
  else await Preferences.remove({ key: TOKEN_KEY });
}

interface DesktopBridge {
  version(): Promise<string>;
  installUpdate(url: string, token: string, onProgress: (pct: number) => void): Promise<void>;
  /** Chamado antes de a janela fechar; ela espera a promessa (até 10 s). Ausente em versões antigas do app de PC. */
  onClose?(fn: () => Promise<void>): void;
}
/** Presente só no app de PC (Electron). */
export const desktop = (window as unknown as { dquestsDesktop?: DesktopBridge }).dquestsDesktop ?? null;

export async function currentVersion() {
  if (desktop) return desktop.version();
  if (!Capacitor.isNativePlatform()) return __APP_VERSION__;
  try { return (await CapApp.getInfo()).version; } catch { return __APP_VERSION__; }
}

function parse(v: string) { return v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0); }
export function isNewer(remote: string, local: string) {
  const a = parse(remote), b = parse(local);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

export class UpdateError extends Error {}

/** Busca o último release. Devolve null quando o app já está na versão mais nova. */
export async function checkForUpdate(token: string): Promise<Release | null> {
  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
    });
  } catch {
    throw new UpdateError('Sem conexão com o GitHub. Confira a internet e tente de novo.');
  }
  if (res.status === 401) throw new UpdateError('Token inválido ou expirado. Gere um novo no GitHub e cole aqui.');
  if (res.status === 404) throw new UpdateError(`Repositório ou release não encontrado. O token precisa ter acesso ao repositório ${REPO}.`);
  if (!res.ok) throw new UpdateError(`O GitHub respondeu com erro ${res.status}.`);
  const r = await res.json();
  await Preferences.set({ key: LAST_CHECK_KEY, value: String(Date.now()) });
  const ext = desktop ? '.exe' : '.apk';
  const asset = (r.assets ?? []).find((a: { name: string }) => a.name.endsWith(ext));
  if (!asset) throw new UpdateError(`O release ${r.tag_name} não tem o arquivo ${ext} anexado.`);
  const local = await currentVersion();
  if (!isNewer(r.tag_name, local)) return null;
  return { version: r.tag_name.replace(/^v/, ''), notes: r.body ?? '', assetUrl: asset.url, size: asset.size, date: r.published_at };
}

/** Checagem automática ao abrir o app: no máximo a cada 6 horas e só com token salvo. */
export async function autoCheck(): Promise<Release | null> {
  if (!Capacitor.isNativePlatform() && !desktop) return null;
  const token = await getToken();
  if (!token) return null;
  const last = Number((await Preferences.get({ key: LAST_CHECK_KEY })).value ?? 0);
  if (Date.now() - last < 6 * 3600_000) return null;
  try { return await checkForUpdate(token); } catch { return null; }
}

export async function installUpdate(rel: Release, onProgress: (pct: number) => void) {
  if (desktop) {
    try { await desktop.installUpdate(rel.assetUrl, await getToken(), onProgress); }
    catch (e) { throw new UpdateError(`Não deu para baixar o instalador: ${(e as Error).message}`); }
    return;
  }
  if (!Capacitor.isNativePlatform()) throw new UpdateError('A instalação só funciona no celular ou no app de PC.');
  const { value } = await Updater.canInstall();
  if (!value) {
    await Updater.openInstallSettings();
    throw new UpdateError('Permita "instalar apps desconhecidos" para o dQuests e toque em Atualizar de novo.');
  }
  const sub = await Updater.addListener('progress', e => onProgress(e.percent));
  try {
    await Updater.downloadAndInstall({ url: rel.assetUrl, token: await getToken() });
  } finally {
    await sub.remove();
  }
}
