import { useRef, useState } from 'react';
import { useGame } from '../game/store';
import { Icon } from './Icon';
import { play } from '../fx/sound';
import { hhmm } from '../game/rules';
import { PanelHeader, Sheet } from './parts';
import { UpdateSettings } from './Update';
import { SyncSettings } from './Sync';
import { ChangelogSheet } from './Changelog';
import { debugOn, setDebugOn, DebugPanel, VersionTapper } from './Debug';

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const s = useGame();
  const [debug, setDebug] = useState(debugOn);
  const [backup, setBackup] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [changelog, setChangelog] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const exportSave = async () => {
    const json = s.exportJson();
    setBackup(json);
    try {
      await navigator.clipboard.writeText(json);
      setMsg('Backup copiado. Cole num lugar seguro, tipo uma nota ou e-mail para você mesmo.');
    } catch {
      setMsg('Não deu para copiar sozinho. Selecione o texto abaixo e copie.');
      setTimeout(() => areaRef.current?.select(), 50);
    }
  };
  const importSave = () => {
    if (s.importJson(backup.trim())) { setMsg('Backup restaurado.'); setBackup(''); }
    else setMsg('Esse texto não é um backup válido do dQuests. Cole o texto completo que o app gerou.');
  };

  return (
    <Sheet title="Opções" onClose={onClose}>
      <UpdateSettings />
      <SyncSettings />
      <button className="btn" onClick={() => setChangelog(true)}><Icon id="scroll" size={14} /> Novidades e histórico de versões</button>
      {changelog && <ChangelogSheet onClose={() => setChangelog(false)} />}

      <PanelHeader right={s.settings.dayStartMin !== undefined ? `dia vira às ${hhmm(s.settings.dayStartMin)}` : 'dia vira à meia-noite'}>Modo 24h</PanelHeader>
      <label className="toggle"><input id="opt-day24" type="checkbox" checked={s.settings.dayStartMin !== undefined}
        onChange={e => { s.setDayMode(e.target.checked); if (e.target.checked) void play('day24'); }} /> Modo 24h</label>
      <p className="q-meta">{s.settings.dayStartMin !== undefined
        ? `O dia de hoje só termina às ${hhmm(s.settings.dayStartMin)} de amanhã, e os próximos dias também viram nesse horário. Desligando, o dia volta a virar à meia-noite (se já passou da meia-noite, ele vira na hora).`
        : 'Ligando agora, o dia de hoje não termina à meia-noite: ele dura até 24h depois deste momento. Bom para virar a noite sem perder as diárias.'}</p>

      <PanelHeader>Visual</PanelHeader>
      <div className="seg">
        <button className={(s.settings.theme ?? 'log') === 'log' ? 'on' : ''} onClick={() => s.setSettings({ theme: 'log' })}>Warcraft</button>
        <button className={s.settings.theme === 'dark' ? 'on' : ''} onClick={() => s.setSettings({ theme: 'dark' })}>RPG - Default</button>
      </div>

      <PanelHeader>Botão de adicionar</PanelHeader>
      <div className="seg">
        <button className={(s.settings.addMode ?? 'ask') === 'ask' ? 'on' : ''} onClick={() => s.setSettings({ addMode: 'ask' })}>Um só (escolho na hora)</button>
        <button className={s.settings.addMode === 'split' ? 'on' : ''} onClick={() => s.setSettings({ addMode: 'split' })}>Um para cada</button>
      </div>
      <p className="q-meta">Um só: o + abre a escolha entre missão e hábito. Um para cada: missões e hábitos têm seu próprio +.</p>

      <PanelHeader>Som e vibração</PanelHeader>
      <label className="toggle"><input id="opt-sound" type="checkbox" checked={s.settings.sound} onChange={e => s.setSettings({ sound: e.target.checked })} /> Sons</label>
      <label className="field"><span>Volume</span>
        <input id="opt-volume" type="range" min={0} max={1} step={0.05} value={s.settings.volume} onChange={e => s.setSettings({ volume: Number(e.target.value) })} />
      </label>
      <label className="toggle"><input id="opt-haptics" type="checkbox" checked={s.settings.haptics} onChange={e => s.setSettings({ haptics: e.target.checked })} /> Vibrar ao concluir</label>
      <label className="toggle"><input id="opt-reminders" type="checkbox" checked={s.settings.reminders} onChange={e => s.setSettings({ reminders: e.target.checked })} /> Lembretes de prazo (véspera às 18h e no dia)</label>

      <PanelHeader right="só toca efeitos, não mexe no save">Debug</PanelHeader>
      <label className="toggle"><input id="opt-debug" type="checkbox" checked={debug} onChange={e => setDebug(setDebugOn(e.target.checked))} /> Modo debug (testar efeitos e sons)</label>
      {debug && <DebugPanel />}

      <PanelHeader>Backup</PanelHeader>
      <p className="q-meta pad">Seu progresso fica salvo só neste celular. Faça backup de vez em quando.</p>
      <div className="row-btns">
        <button className="btn" onClick={exportSave}>Copiar backup</button>
        <button className="btn" disabled={!backup.trim()} onClick={importSave}>Restaurar do texto</button>
      </div>
      <textarea id="opt-backup" ref={areaRef} className="backup" value={backup} onChange={e => setBackup(e.target.value)} placeholder="Cole aqui um backup para restaurar" rows={3} />
      {msg && <p className="q-meta pad">{msg}</p>}

      <PanelHeader>Zona de perigo</PanelHeader>
      {confirmReset
        ? <button className="btn red" onClick={() => { s.resetAll(); onClose(); }}>Apagar tudo e começar do nível 1</button>
        : <button className="btn ghost" onClick={() => setConfirmReset(true)}>Recomeçar a jornada</button>}

      <VersionTapper onToggle={setDebug} />
    </Sheet>
  );
}
