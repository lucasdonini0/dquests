import { useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { activeDebuffs, useGame, type Hero } from './game/store';
import { ATTR, titleText, type IconId } from './game/data';
import { dayKey, fmt, hhmm, need, MAX_LEVEL } from './game/rules';
import { configureSound, play } from './fx/sound';
import { configureHaptics } from './fx/haptics';
import { Icon } from './ui/Icon';
import { PortraitView, Sheet } from './ui/parts';
import { QuestsScreen } from './ui/Quests';
import { HabitsScreen } from './ui/Habits';
import { BossScreen } from './ui/Boss';
import { HeroForm, HeroScreen } from './ui/Hero';
import { SettingsSheet } from './ui/Settings';
import { FxLayer } from './ui/Fx';
import { XpBar } from './ui/XpBar';
import logo from './logo.png';
import { FinanceScreen } from './ui/Finance';
import { WorkoutScreen } from './ui/Workout';
import { MesaScreen } from './ui/Mesa';
import { useSingleAdd } from './ui/AddFab';
import { UpdateSheet } from './ui/Update';
import { WhatsNew } from './ui/Changelog';
import { autoCheck, setToken, type Release } from './fx/updater';
import { setSyncEnabled, startSync, syncNow, useSync } from './sync/sync';
import { SyncBadge, SyncChoice } from './ui/Sync';
import { startReminders } from './fx/reminders';

type Tab = 'quests' | 'mesa' | 'habits' | 'treino' | 'boss' | 'financas' | 'hero';
const TABS: { id: Tab; label: string; icon: IconId }[] = [
  { id: 'quests', label: 'Missões', icon: 'scroll' },
  { id: 'mesa', label: 'Mesa', icon: 'shield' },
  { id: 'habits', label: 'Hábitos', icon: 'flame' },
  { id: 'treino', label: 'Treino', icon: 'heart' },
  { id: 'boss', label: 'Chefe', icon: 'skull' },
  { id: 'financas', label: 'Finanças', icon: 'coin' },
  { id: 'hero', label: 'Herói', icon: 'person' },
];

function useWide() {
  const q = '(min-width: 900px)';
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

/** Roda quando o app volta pro primeiro plano (celular) ou ganha foco (PC). */
function onWake(fn: () => void) {
  const sub = CapApp.addListener('resume', fn).catch(() => null);
  const vis = () => { if (document.visibilityState === 'visible') fn(); };
  document.addEventListener('visibilitychange', vis);
  window.addEventListener('focus', fn);
  return () => {
    void sub.then(h => h?.remove());
    document.removeEventListener('visibilitychange', vis);
    window.removeEventListener('focus', fn);
  };
}

function useHydrated() {
  const [ok, setOk] = useState(useGame.persist.hasHydrated());
  useEffect(() => {
    const off = useGame.persist.onFinishHydration(() => setOk(true));
    setOk(useGame.persist.hasHydrated());
    return off;
  }, []);
  return ok;
}

interface Aura { key: string; icon: IconId; cls: string; badge: string; text: string }

function useAuras(): Aura[] {
  const s = useGame();
  const today = dayKey();
  const list: Aura[] = [];
  if (s.rested > 0) list.push({ key: 'rested', icon: 'moon', cls: 'c-rested', badge: String(s.rested), text: `Descansado: suas próximas missões rendem o dobro de XP até gastar ${s.rested} de bônus.` });
  if (s.pendingRested > 0) list.push({ key: 'pending', icon: 'moon', cls: 'c-rested dim', badge: `+${s.pendingRested}`, text: `Lazer de hoje: amanhã você acorda com +${s.pendingRested} de XP descansado.` });
  if (s.hearth.protectedDays.includes(today)) list.push({ key: 'hearth', icon: 'hearth', cls: 'c-rested', badge: 'hoje', text: 'Dia de imprevisto: as diárias e os hábitos de hoje não geram debuff.' });
  const best = s.habits.reduce((m, h) => Math.max(m, h.streak), 0);
  if (best > 0) list.push({ key: 'streak', icon: 'flame', cls: 'c-legend', badge: `${best}d`, text: `Seu maior streak ativo: ${best} dias seguidos.` });
  if (s.hero.focus) list.push({ key: 'focus', icon: 'eye', cls: 'c-gold', badge: '+10%', text: `Foco em ${ATTR[s.hero.focus].label}: missões desse atributo rendem +10% de XP.` });
  for (const d of activeDebuffs(s, today)) list.push({ key: d.id, icon: 'skull', cls: 'debuff', badge: `−${Math.round(d.pct * 100)}%`, text: d.label });
  return list;
}

/** Modo 24h no topo, ao lado da nuvem: liga com um toque; desligar pede confirmação. */
function DayModeButton() {
  const start = useGame(st => st.settings.dayStartMin);
  const setDayMode = useGame(st => st.setDayMode);
  const [ask, setAsk] = useState(false);
  const on = start !== undefined;
  return (
    <>
      <button className={`icon-btn day24-btn${on ? ' on' : ''}`} title={on ? `Modo 24h: o dia vira às ${hhmm(start)}` : 'Ligar modo 24h'}
        aria-label={on ? `Modo 24h ligado, o dia vira às ${hhmm(start)}` : 'Ligar modo 24h'}
        onClick={() => { if (on) setAsk(true); else { setDayMode(true); void play('day24'); } }}>
        <Icon id="clock" size={18} />{on && <small>{hhmm(start)}</small>}
      </button>
      {ask && on && (
        <Sheet title="Modo 24h" onClose={() => setAsk(false)}
          footer={<>
            <button className="btn ghost" onClick={() => setAsk(false)}>Manter ligado</button>
            <button className="btn red" onClick={() => { setDayMode(false); setAsk(false); }}>Desligar</button>
          </>}>
          <p>O dia está virando às <b>{hhmm(start)}</b>. Desligando, ele volta a virar à meia-noite; se já passou da meia-noite, o dia vira na hora.</p>
        </Sheet>
      )}
    </>
  );
}

function Onboarding() {
  const s = useGame();
  const [draft, setDraft] = useState<Hero>({ ...s.hero, name: '' });
  return (
    <div className="onboard">
      <div className="onboard-h">
        <img className="onboard-logo" src={logo} alt="" width={128} height={128} />
        <span className="eyebrow">Uma nova jornada</span>
        <h1>dQuests</h1>
        <p>Crie seu herói. Do nível 1 ao 60, cada tarefa da vida real vira XP.</p>
      </div>
      <HeroForm value={draft} onChange={setDraft} achievements={s.achievements} />
      <button className="btn gold big" disabled={!draft.name.trim()} onClick={() => s.createHero({ ...draft, name: draft.name.trim() })}>Começar a jornada</button>
      <CloudStart />
    </div>
  );
}

/** No primeiro uso, puxa o herói que já existe em outro aparelho. */
function CloudStart() {
  const [open, setOpen] = useState(false);
  const [token, setTok] = useState('');
  const { phase, error } = useSync();
  if (!open) return <button className="link-btn" onClick={() => setOpen(true)}>Já jogo em outro aparelho</button>;
  return (
    <div className="reward">
      <span className="eyebrow">Continuar de outro aparelho</span>
      <p>Cole o token do GitHub que você usa no outro aparelho. O herói da nuvem é baixado para cá.</p>
      <input id="onboard-token" className="backup" type="password" value={token} onChange={e => setTok(e.target.value)} placeholder="github_pat_..." autoComplete="off" />
      <button className="btn gold" disabled={!token.trim() || phase === 'syncing'} onClick={async () => { await setToken(token.trim()); await setSyncEnabled(true); }}>
        {phase === 'syncing' ? 'Baixando…' : 'Baixar meu herói'}
      </button>
      {phase === 'error' && <p className="err">{error}</p>}
      {phase === 'ok' && <p className="q-meta">Não há herói salvo na nuvem ainda. Crie o seu acima e ele vai ser enviado.</p>}
    </div>
  );
}

export default function App() {
  const hydrated = useHydrated();
  const s = useGame();
  const [tab, setTab] = useState<Tab>('quests');
  const [settings, setSettings] = useState(false);
  const openSettings = () => { setSettings(true); void play('menuOpen'); };
  const [auraInfo, setAuraInfo] = useState<string | null>(null);
  const [update, setUpdate] = useState<Release | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const auras = useAuras();
  const wide = useWide();
  const theme = useGame(st => st.settings.theme ?? 'log'); // visual: diário de missões (novo) ou escuro (antigo)
  const singleAdd = useSingleAdd();
  const [ready, setReady] = useState(false);

  useEffect(() => { configureSound(s.settings.sound, s.settings.volume); configureHaptics(s.settings.haptics); }, [s.settings]);

  useEffect(() => {
    if (!hydrated) return;
    let stop = () => {};
    // Baixa o save da nuvem antes de processar o dia, para a virada não acontecer duas vezes
    void startSync().then(() => {
      startReminders();
      useGame.getState().rollover();
      setReady(true);
      const t = setInterval(() => useGame.getState().rollover(), 60_000);
      const off = onWake(() => { void syncNow(false).then(() => useGame.getState().rollover()); });
      stop = () => { clearInterval(t); off(); };
    });
    return () => stop();
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const run = () => void autoCheck().then(r => { if (r) setUpdate(r); });
    run();
    return onWake(run);
  }, [hydrated]);

  useEffect(() => {
    // tarefa que ficou por fazer na virada do dia: alerta de raide; outros debuffs: o som de maldição
    if (s.report?.some(l => /Exaustão|não cumprid|Chama Apagada|Prazo estourado|Missão perdida|Maldição/.test(l))) void play('raidWarning');
    else if (s.report?.some(l => /escapou/.test(l))) void play('curse');
  }, [s.report]);

  if (!hydrated || !ready) return <div className="screen" id="screen" />;
  if (!s.hero.created) return <div className="screen" id="screen"><Onboarding /><SyncChoice /></div>;

  const n = need(s.level);
  const atMax = s.level >= MAX_LEVEL;
  const xpPct = atMax ? 100 : (s.xp / n) * 100;
  const restPct = atMax ? 0 : (Math.min(s.rested, n - s.xp) / n) * 100;
  const title = titleText(s.hero.title, s.hero.gender);
  // No PC, missões e hábitos ficam lado a lado na mesma aba
  const view: Tab = wide && tab === 'habits' ? 'quests' : tab;

  return (
    <div className={`screen${wide ? ' wide' : ''} theme-${theme}`} id="screen">
      <header className="unit">
        <button className="portrait" onClick={() => setTab('hero')} aria-label="Abrir ficha do herói">
          <PortraitView p={s.hero.portrait} size={58} />
          <span className="lvl">{s.level}</span>
        </button>
        <div className="unit-info">
          <div className="unit-name">{s.hero.name}</div>
          <div className="unit-title">{title ?? 'Herói'}</div>
          <div className="auras">
            {auras.map(a => (
              <button key={a.key} className={`aura ${a.cls.includes('debuff') ? 'debuff' : ''}`} onClick={() => setAuraInfo(a.text)} aria-label={a.text}>
                <Icon id={a.icon} size={16} className={a.cls} />
                <small>{a.badge}</small>
              </button>
            ))}
          </div>
        </div>
        <DayModeButton />
        <SyncBadge onClick={openSettings} />
        <button className="icon-btn" onClick={openSettings} aria-label="Opções"><Icon id="gear" /></button>
      </header>

      {update && (
        <button className="update-banner" onClick={() => setUpdateOpen(true)}>
          <Icon id="star" size={16} /> Nova versão {update.version} disponível <b>Ver</b>
        </button>
      )}
      {update && updateOpen && <UpdateSheet rel={update} onClose={() => setUpdateOpen(false)} />}

      <main className="tabs-body" key={view}>
        {view === 'quests' && (wide
          ? <div className="duo"><section className="col"><QuestsScreen /></section><section className="col"><HabitsScreen fab={!singleAdd} /></section></div>
          : <QuestsScreen />)}
        {view === 'habits' && <HabitsScreen />}
        {view === 'boss' && <div className="narrow"><BossScreen /></div>}
        {view === 'mesa' && <div className="narrow"><MesaScreen /></div>}
        {view === 'treino' && <div className="narrow"><WorkoutScreen /></div>}
        {view === 'financas' && <div className="narrow"><FinanceScreen /></div>}
        {view === 'hero' && <div className="narrow"><HeroScreen /></div>}
      </main>

      <div className="xpbar-wrap">
        <XpBar level={s.level} pct={xpPct} restPct={restPct} />
        <div className="xptext">
          <span>{atMax ? 'Nível máximo' : <>XP <b>{fmt(s.xp)} / {fmt(n)}</b> ({Math.floor(xpPct)}%)</>}</span>
          {s.rested > 0 && <span className="c-rested">Descansado {s.rested}</span>}
        </div>
      </div>
      <nav className="actionbar" role="tablist">
        {TABS.filter(t => !(wide && t.id === 'habits')).map(t => (
          <button key={t.id} className="ab" role="tab" aria-selected={view === t.id}
            onClick={e => { setTab(t.id); e.currentTarget.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' }); }}>
            <Icon id={t.icon} size={20} />{t.label}
          </button>
        ))}
      </nav>

      {auraInfo && <div className="aura-pop" onClick={() => setAuraInfo(null)}>{auraInfo}</div>}

      {s.report && (
        <Sheet title="Enquanto você estava fora" onClose={s.dismissReport}
          footer={<button className="btn gold" onClick={s.dismissReport}>Continuar a jornada</button>}>
          <ul className="report">{s.report.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </Sheet>
      )}
      {settings && <SettingsSheet onClose={() => { setSettings(false); void play('menuClose'); }} />}
      {!s.report && <WhatsNew />}
      <SyncChoice />
      <FxLayer />
    </div>
  );
}
