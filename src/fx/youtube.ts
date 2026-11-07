// Busca a foto de perfil de um canal do YouTube a partir do link (sem chave de API):
// lê a página do canal, pega a imagem de "og:image" e guarda uma cópia pequena.
import { Capacitor, CapacitorHttp } from '@capacitor/core';

type NetGet = (url: string, as: 'text' | 'image') => Promise<string | { base64: string; type: string }>;
const desktopGet = (window as unknown as { dquestsDesktop?: { netGet?: NetGet } }).dquestsDesktop?.netGet ?? null;
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36';

export class AvatarError extends Error {}

/** Completa "youtube.com/@canal" (sem https://) para um link que dá para abrir. */
export function normalizeYoutube(text: string) {
  const t = text.trim();
  return /^(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(t) ? `https://${t}` : t;
}

/** Aceita youtube.com/@canal, /channel/..., /c/..., /user/... e youtu.be. */
export function isYoutubeUrl(url: string) {
  try { return /(^|\.)(youtube\.com|youtu\.be)$/i.test(new URL(url).hostname); } catch { return false; }
}

async function getText(url: string) {
  if (desktopGet) return (await desktopGet(url, 'text')) as string;
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.get({ url, headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9' }, responseType: 'text' });
    if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
    return String(r.data);
  }
  return (await fetch(url)).text(); // navegador: só funciona se o site permitir (normalmente não)
}

async function getImage(url: string): Promise<string> {
  if (desktopGet) {
    const r = (await desktopGet(url, 'image')) as { base64: string; type: string };
    return `data:${r.type};base64,${r.base64}`;
  }
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.get({ url, responseType: 'blob' });
    if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
    return `data:image/jpeg;base64,${r.data}`;
  }
  const blob = await (await fetch(url)).blob();
  return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(blob); });
}

/** Reduz para 256 px em quadrado (centralizado) para não pesar no save. */
function shrink(dataUrl: string): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const size = 256, k = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d')!.drawImage(img, (img.width - k) / 2, (img.height - k) / 2, k, k, 0, 0, size, size);
      res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => rej(new AvatarError('A imagem do canal não abriu.'));
    img.src = dataUrl;
  });
}

const decode = (s: string) => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; };

async function channelPage(link: string) {
  if (!isYoutubeUrl(link)) throw new AvatarError('Esse link não é do YouTube.');
  try { return await getText(link); }
  catch { throw new AvatarError('Não deu para abrir a página do canal. Confira o link e a internet.'); }
}

/** Nome e foto do canal, para preencher o lead. */
export async function fetchYoutubeChannel(link: string): Promise<{ name: string; avatar: string }> {
  const html = await channelPage(link);
  const t = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  if (!t) throw new AvatarError('Não achei o canal nessa página. Use o link do canal (ex.: youtube.com/@nome).');
  return { name: decode(t[1]).trim(), avatar: await avatarFrom(html) };
}

export async function fetchYoutubeAvatar(link: string): Promise<string> {
  return avatarFrom(await channelPage(link));
}

async function avatarFrom(html: string): Promise<string> {
  const m = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
    ?? html.match(/"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/);
  if (!m) throw new AvatarError('Não achei a foto nessa página. Use o link do canal (ex.: youtube.com/@nome).');
  const url = m[1].replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
  try { return await shrink(await getImage(url)); }
  catch (e) { throw e instanceof AvatarError ? e : new AvatarError('Não deu para baixar a foto do canal.'); }
}
