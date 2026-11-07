// Processo principal do dQuests para PC: abre a janela e cuida da atualização pelo instalador.
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Pasta do save (DQUESTS_USERDATA troca, útil para testes)
// DQUESTS_USERDATA: pasta separada, só para testes (não mexe no save real)
app.setPath('userData', process.env.DQUESTS_USERDATA || path.join(app.getPath('appData'), 'dQuests'));

if (!app.requestSingleInstanceLock()) app.quit();

let win;

const TITLEBAR_HEIGHT = 36;

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 420,
    minHeight: 640,
    backgroundColor: '#0b0a08',
    title: 'dQuests',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    // Barra de título própria (desenhada pelo app); os botões do Windows ficam por cima, nas cores do app
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0b0a08', symbolColor: '#d4ac52', height: TITLEBAR_HEIGHT },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.removeMenu();

  // Ao fechar, o app sobe o save pendente antes; sem resposta em 10 s, fecha assim mesmo
  let closing = false;
  win.on('close', e => {
    if (closing) return;
    e.preventDefault();
    closing = true;
    win.webContents.send('app:closing');
    setTimeout(() => { if (!win.isDestroyed()) win.destroy(); }, 10_000);
  });
  const dev = process.env.DQUESTS_DEV_URL;
  if (dev) win.loadURL(dev);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // Links externos abrem no navegador, não dentro do app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

const UPDATE_FILE = path.join(os.tmpdir(), 'dQuests-Setup-update.exe');

app.whenReady().then(() => {
  // Apaga o instalador que sobrou da última atualização
  fs.rm(UPDATE_FILE, { force: true }, () => {});
  createWindow();
});
app.on('window-all-closed', () => app.quit());

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.on('app:close-ready', () => { if (win && !win.isDestroyed()) win.destroy(); });

// ---------- leitura de páginas do YouTube (foto do canal do cliente) ----------
const ALLOWED_HOSTS = /(^|\.)(youtube\.com|youtu\.be|googleusercontent\.com|ggpht\.com)$/i;
ipcMain.handle('net:get', async (_e, url, as) => {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.test(u.hostname)) throw new Error('Endereço não permitido');
  const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36', 'Accept-Language': 'pt-BR,pt;q=0.9' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (as === 'image') return { base64: Buffer.from(await res.arrayBuffer()).toString('base64'), type: res.headers.get('content-type') || 'image/jpeg' };
  return res.text();
});

// ---------- armazenamento em arquivo ----------
// Cada chave vira um arquivo JSON. Grava numa cópia temporária e só depois troca pelo original,
// guardando a versão anterior em .bak: um fechamento no meio da gravação nunca deixa o save pela metade.
const storeDir = () => path.join(app.getPath('userData'), 'dados');
const keyFile = key => path.join(storeDir(), `${encodeURIComponent(key)}.json`);

ipcMain.handle('store:get', (_e, key) => {
  for (const f of [keyFile(key), `${keyFile(key)}.bak`]) {
    try { return fs.readFileSync(f, 'utf8'); } catch { /* tenta o próximo */ }
  }
  return null;
});
ipcMain.handle('store:set', (_e, key, value) => {
  fs.mkdirSync(storeDir(), { recursive: true });
  const file = keyFile(key);
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  fs.writeSync(fd, value);
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
  fs.renameSync(tmp, file);
});
ipcMain.handle('store:remove', (_e, key) => {
  for (const f of [keyFile(key), `${keyFile(key)}.bak`]) fs.rmSync(f, { force: true });
});
ipcMain.handle('store:keys', () => {
  try {
    return fs.readdirSync(storeDir()).filter(f => f.endsWith('.json')).map(f => decodeURIComponent(f.slice(0, -5)));
  } catch { return []; }
});

/** Baixa o instalador do release (repo privado, com token) e roda em modo silencioso. */
ipcMain.handle('update:install', async (event, { url, token }) => {
  const headers = { Accept: 'application/octet-stream', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = `Bearer ${token}`;
  // A API responde com redirect para um link assinado, que não pode receber o token
  let res = await fetch(url, { headers, redirect: 'manual' });
  if (res.status >= 300 && res.status < 400) res = await fetch(res.headers.get('location'));
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const total = Number(res.headers.get('content-length')) || 0;
  const file = UPDATE_FILE;
  const out = fs.createWriteStream(file);
  const reader = res.body.getReader();
  let done = 0;
  let last = -1;
  for (;;) {
    const { done: end, value } = await reader.read();
    if (end) break;
    out.write(Buffer.from(value));
    done += value.length;
    const pct = total ? Math.floor((done * 100) / total) : 0;
    if (pct !== last) { last = pct; event.sender.send('update:progress', pct); }
  }
  await new Promise((ok, fail) => out.end(err => (err ? fail(err) : ok())));

  // Instala por cima sem perguntas e reabre o app no fim
  // O instalador começa desligado do app e o app fecha na hora, normalmente (leva ~0,1 s),
  // antes de o instalador procurar processos abertos; assim ele não precisa fechar o app à força.
  spawn(file, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
  app.quit();
});
