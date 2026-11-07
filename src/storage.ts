// Onde o app guarda dados: no PC, em arquivos (via Electron); no celular e no navegador, no Capacitor Preferences.
// Mesma forma de uso do Capacitor Preferences, para os módulos não precisarem saber a diferença.
import { Preferences as CapPreferences } from '@capacitor/preferences';

interface DesktopStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}
const desktop = (window as unknown as { dquestsDesktop?: { store?: DesktopStore } }).dquestsDesktop?.store ?? null;

const OLD_PREFIX = 'CapacitorStorage.';
let migrated: Promise<void> | null = null;

/** Primeira vez no armazenamento em arquivo: copia o que existia no localStorage (versões até 0.11). */
function migrate() {
  migrated ??= (async () => {
    if (!desktop || (await desktop.keys()).length) return;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(OLD_PREFIX)) await desktop.set(k.slice(OLD_PREFIX.length), localStorage.getItem(k) ?? '');
    }
  })().catch(() => {});
  return migrated;
}

export const Preferences = {
  async get({ key }: { key: string }): Promise<{ value: string | null }> {
    if (!desktop) return CapPreferences.get({ key });
    await migrate();
    return { value: await desktop.get(key) };
  },
  async set({ key, value }: { key: string; value: string }): Promise<void> {
    if (!desktop) return CapPreferences.set({ key, value });
    await migrate();
    await desktop.set(key, value);
  },
  async remove({ key }: { key: string }): Promise<void> {
    if (!desktop) return CapPreferences.remove({ key });
    await migrate();
    await desktop.remove(key);
  },
};
