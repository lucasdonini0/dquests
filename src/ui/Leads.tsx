// Leads da Mesa (só no app de PC): em que estágio está cada um e qual mensagem pronta foi usada,
// para não repetir sempre a mesma.
import { useState } from 'react';
import { fetchYoutubeChannel, isYoutubeUrl, normalizeYoutube, AvatarError } from '../fx/youtube';
import { LEAD_STAGES, MSG_KINDS, msgUsage, useGame, type Lead, type LeadMsg, type LeadStage, type MsgKind } from '../game/store';
import { Icon } from './Icon';
import { Empty, PanelHeader, Sheet } from './parts';

/** Leads é coisa do PC: no app de desktop (e no navegador de desenvolvimento) aparece; no celular, não. */
export const leadsAvailable = () => /Electron\//.test(navigator.userAgent) || import.meta.env.DEV;

const stageOf = (id: LeadStage) => LEAD_STAGES.find(s => s.id === id)!;
const kindLabel = (k: MsgKind) => MSG_KINDS.find(x => x.id === k)!.label;

function ago(at: number) {
  if (!at) return 'nunca';
  const d = Math.floor((Date.now() - at) / 86_400_000);
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
}

function copy(text: string, done: () => void) {
  void navigator.clipboard.writeText(text).then(done).catch(() => {});
}

export function StagePill({ stage }: { stage: LeadStage }) {
  return <span className={`lead-pill lead-${stage}`}>{stageOf(stage).label}</span>;
}

// ---------- lista ----------
export function LeadsTab({ onOpen, onMessages }: { onOpen: (id: string) => void; onMessages: () => void }) {
  const leads = useGame(s => s.leads);
  const [filter, setFilter] = useState<LeadStage | 'all'>('all');
  const count = (st: LeadStage) => leads.filter(l => l.stage === st).length;
  const shown = [...leads].filter(l => filter === 'all' || l.stage === filter).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      <PanelHeader right={<button className="link-btn" onClick={onMessages}><Icon id="scroll" size={13} /> Mensagens prontas</button>}>Leads</PanelHeader>
      {leads.length === 0 ? (
        <Empty icon="person" title="Nenhum lead ainda" text="Cadastre os leads e marque em que estágio cada um está. Ao mandar uma mensagem, escolha qual das prontas você usou." />
      ) : (
        <>
          <div className="exp-filter lead-filter">
            <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>Todos {leads.length}</button>
            {LEAD_STAGES.filter(st => count(st.id) > 0).map(st => (
              <button key={st.id} className={`lead-f-${st.id}${filter === st.id ? ' on' : ''}`} onClick={() => setFilter(st.id)}>{st.label} {count(st.id)}</button>
            ))}
          </div>
          {shown.map(l => {
            const last = l.history[l.history.length - 1];
            const msg = last?.msgId ? useGame.getState().leadMsgs.find(m => m.id === last.msgId) : null;
            return (
              <button key={l.id} className={`lead-row lead-${l.stage}`} onClick={() => onOpen(l.id)}>
                <LeadAvatar lead={l} />
                <span className="lead-main">
                  <b>{l.name}</b>
                  <small>{[l.contact, last ? `${stageOf(last.stage).label} ${ago(last.at)}` : 'sem contato ainda', msg ? `msg: ${msg.title}` : ''].filter(Boolean).join(' · ')}</small>
                </span>
                <StagePill stage={l.stage} />
              </button>
            );
          })}
        </>
      )}
    </>
  );
}

function LeadAvatar({ lead, size = 36 }: { lead: { name: string; avatar?: string }; size?: number }) {
  if (lead.avatar) return <img className="cl-avatar" src={lead.avatar} width={size} height={size} alt="" />;
  return <span className="cl-avatar cl-letter" style={{ width: size, height: size, fontSize: size * 0.42 }}>{(lead.name.trim()[0] ?? '?').toUpperCase()}</span>;
}

// ---------- escolher a mensagem usada ----------
function MsgPicker({ kind, value, onChange }: { kind: MsgKind; value: string | null | undefined; onChange: (id: string | null) => void }) {
  const s = useGame();
  const [copied, setCopied] = useState<string | null>(null);
  // a menos usada (e há mais tempo) primeiro: é a que convém mandar agora
  const list = s.leadMsgs.filter(m => m.kind === kind)
    .map(m => ({ m, u: msgUsage(s.leads, m.id) }))
    .sort((a, b) => a.u.count - b.u.count || a.u.last - b.u.last);
  return (
    <div className="msg-pick">
      {list.length === 0 && <p className="q-meta">Nenhuma mensagem pronta de {kindLabel(kind)}. Cadastre em Mensagens prontas.</p>}
      {list.map(({ m, u }, i) => (
        <div key={m.id} className={`msg-opt${value === m.id ? ' on' : ''}`}>
          <button type="button" className="msg-opt-main" onClick={() => onChange(m.id)}>
            <b>{m.title}{i === 0 && list.length > 1 && <em> menos usada</em>}</b>
            <span>{m.text}</span>
            <small>usada {u.count}× · última {ago(u.last)}</small>
          </button>
          <button type="button" className="btn small" onClick={() => copy(m.text, () => { setCopied(m.id); onChange(m.id); })}>
            <Icon id={copied === m.id ? 'check' : 'scroll'} size={14} /> {copied === m.id ? 'Copiada' : 'Copiar'}
          </button>
        </div>
      ))}
      <button type="button" className={`msg-none${value === null ? ' on' : ''}`} onClick={() => onChange(null)}>Não usei nenhuma dessas</button>
    </div>
  );
}

// ---------- ficha do lead ----------
export function LeadSheet({ id: startId, onClose }: { id: string | null; onClose: () => void }) {
  const s = useGame();
  const [id, setId] = useState(startId);
  const lead = s.leads.find(l => l.id === id) as Lead | undefined;
  const [name, setName] = useState(lead?.name ?? '');
  const [contact, setContact] = useState(lead?.contact ?? '');
  const [avatar, setAvatar] = useState(lead?.avatar);
  const [yt, setYt] = useState<{ busy: boolean; msg: string; from: string }>({ busy: false, msg: '', from: '' });
  // link do YouTube no contato: puxa o nome e a foto do canal (o nome só entra se o campo estiver vazio ou com o nome puxado antes)
  const pullYoutube = async (text: string) => {
    const link = normalizeYoutube(text);
    if (!isYoutubeUrl(link) || yt.busy) return;
    if (link !== text) setContact(link);
    setYt({ busy: true, msg: 'Buscando o canal…', from: yt.from });
    try {
      const ch = await fetchYoutubeChannel(link);
      setAvatar(ch.avatar);
      setName(n => (!n.trim() || n === yt.from ? ch.name : n));
      setYt({ busy: false, msg: `Canal encontrado: ${ch.name}`, from: ch.name });
    } catch (e) {
      setYt({ busy: false, msg: e instanceof AvatarError ? e.message : 'Não deu para puxar o canal.', from: yt.from });
    }
  };
  const [note, setNote] = useState(lead?.note ?? '');
  const [pending, setPending] = useState<LeadStage | null>(null);
  const [msgId, setMsgId] = useState<string | null | undefined>(undefined);
  const [confirmDel, setConfirmDel] = useState(false);
  const dirty = !lead || name !== lead.name || contact !== lead.contact || note !== lead.note || avatar !== lead.avatar;
  const pendingKind = pending ? stageOf(pending).msg : undefined;

  const save = () => { const nid = s.saveLead({ id: id ?? undefined, name, avatar, contact, note }); setId(nid); };
  const pick = (st: LeadStage) => {
    if (!lead) return;
    if (!stageOf(st).msg) { s.setLeadStage(lead.id, st, null); setPending(null); return; }
    setPending(st); setMsgId(undefined);
  };
  const confirm = () => { if (lead && pending && msgId !== undefined) { s.setLeadStage(lead.id, pending, msgId); setPending(null); } };

  return (
    <Sheet title={lead ? lead.name : 'Novo lead'} onClose={onClose}
      footer={<>
        {lead && (confirmDel
          ? <button className="btn red" onClick={() => { s.deleteLead(lead.id); onClose(); }}>Confirmar exclusão</button>
          : <button className="btn ghost" onClick={() => setConfirmDel(true)}>Excluir</button>)}
        <button className="btn gold" disabled={!name.trim() || !dirty} onClick={save}>{lead ? 'Salvar' : 'Criar lead'}</button>
      </>}>
      {(avatar || yt.busy) && (
        <div className="lead-head">
          <LeadAvatar lead={{ name, avatar }} size={64} />
          {avatar && <button type="button" className="link-btn left" onClick={() => setAvatar(undefined)}>Tirar foto</button>}
        </div>
      )}
      <label className="field"><span>Nome</span><input id="lead-name" value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Canal do Fulano" maxLength={80} autoFocus={!lead} /></label>
      <label className="field"><span>Contato</span><input id="lead-contact" value={contact} onChange={e => setContact(e.target.value)} placeholder="@perfil, e-mail ou link" maxLength={200}
        onBlur={e => void pullYoutube(e.target.value)}
        onPaste={e => { const t = e.clipboardData.getData('text'); if (isYoutubeUrl(normalizeYoutube(t))) setTimeout(() => void pullYoutube(t), 0); }} />
        {isYoutubeUrl(normalizeYoutube(contact)) && (
          <span className="lead-yt">
            <button type="button" className="btn small" disabled={yt.busy} onClick={() => void pullYoutube(contact)}><Icon id="undo" size={13} /> {yt.busy ? 'Buscando…' : 'Puxar do YouTube'}</button>
            {yt.msg && !yt.busy && <small className="q-meta">{yt.msg}</small>}
          </span>
        )}
      </label>
      <label className="field"><span>Notas</span><textarea id="lead-note" className="backup" rows={2} value={note} onChange={e => setNote(e.target.value)} /></label>

      {lead && (
        <>
          <div className="field"><span>Estágio</span>
            <div className="lead-stages">
              {LEAD_STAGES.map(st => (
                <button key={st.id} type="button" className={`lead-st lead-${st.id}${(pending ?? lead.stage) === st.id ? ' on' : ''}`} onClick={() => pick(st.id)}>{st.label}</button>
              ))}
            </div>
          </div>
          {pending && pendingKind && (
            <div className="reward">
              <span className="eyebrow">Qual mensagem de {kindLabel(pendingKind)} você mandou?</span>
              <MsgPicker kind={pendingKind} value={msgId} onChange={setMsgId} />
              <div className="row-btns">
                <button className="btn ghost small" onClick={() => setPending(null)}>Cancelar</button>
                <button className="btn gold small" disabled={msgId === undefined} onClick={confirm}>Marcar como {stageOf(pending).label}</button>
              </div>
            </div>
          )}
          {lead.history.length > 0 && (
            <>
              <PanelHeader>Histórico</PanelHeader>
              <ul className="lead-hist">
                {[...lead.history].reverse().map((h, i) => {
                  const m = h.msgId ? s.leadMsgs.find(x => x.id === h.msgId) : null;
                  return (
                    <li key={i}>
                      <StagePill stage={h.stage} />
                      <span>{new Date(h.at).toLocaleDateString('pt-BR')}{stageOf(h.stage).msg ? ` · ${m ? m.title : h.msgId === null ? 'mensagem própria' : 'mensagem apagada'}` : ''}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

// ---------- mensagens prontas ----------
export function MessagesSheet({ onClose }: { onClose: () => void }) {
  const s = useGame();
  const [kind, setKind] = useState<MsgKind>('cold');
  const [edit, setEdit] = useState<LeadMsg | 'new' | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const list = s.leadMsgs.filter(m => m.kind === kind).map(m => ({ m, u: msgUsage(s.leads, m.id) })).sort((a, b) => a.u.count - b.u.count || a.u.last - b.u.last);

  if (edit) return <MsgEditor msg={edit === 'new' ? null : edit} kind={kind} onClose={() => setEdit(null)} />;
  return (
    <Sheet title="Mensagens prontas" onClose={onClose}
      footer={<button className="btn gold" onClick={() => setEdit('new')}><Icon id="plus" size={16} /> Nova mensagem de {kindLabel(kind)}</button>}>
      <div className="seg">
        {MSG_KINDS.map(k => <button key={k.id} className={kind === k.id ? 'on' : ''} onClick={() => setKind(k.id)}>{k.label} ({s.leadMsgs.filter(m => m.kind === k.id).length})</button>)}
      </div>
      <p className="q-meta">Ordenadas da menos usada para a mais usada. Ter várias de cada tipo ajuda a não mandar sempre a mesma.</p>
      {list.length === 0 && <p className="q-meta">Nenhuma mensagem de {kindLabel(kind)} ainda.</p>}
      {list.map(({ m, u }) => (
        <div key={m.id} className="msg-opt">
          <button type="button" className="msg-opt-main" onClick={() => setEdit(m)}>
            <b>{m.title}</b>
            <span>{m.text}</span>
            <small>usada {u.count}× · última {ago(u.last)}</small>
          </button>
          <button type="button" className="btn small" onClick={() => copy(m.text, () => setCopied(m.id))}>
            <Icon id={copied === m.id ? 'check' : 'scroll'} size={14} /> {copied === m.id ? 'Copiada' : 'Copiar'}
          </button>
        </div>
      ))}
    </Sheet>
  );
}

function MsgEditor({ msg, kind: startKind, onClose }: { msg: LeadMsg | null; kind: MsgKind; onClose: () => void }) {
  const s = useGame();
  const [kind, setKind] = useState<MsgKind>(msg?.kind ?? startKind);
  const [title, setTitle] = useState(msg?.title ?? '');
  const [text, setText] = useState(msg?.text ?? '');
  const [confirmDel, setConfirmDel] = useState(false);
  const ok = title.trim() && text.trim();
  return (
    <Sheet title={msg ? 'Editar mensagem' : 'Nova mensagem'} onClose={onClose}
      footer={<>
        {msg && (confirmDel
          ? <button className="btn red" onClick={() => { s.deleteLeadMsg(msg.id); onClose(); }}>Confirmar exclusão</button>
          : <button className="btn ghost" onClick={() => setConfirmDel(true)}>Excluir</button>)}
        <button className="btn gold" disabled={!ok} onClick={() => { s.saveLeadMsg({ id: msg?.id, kind, title, text }); onClose(); }}>Salvar</button>
      </>}>
      <div className="field"><span>Tipo</span>
        <div className="seg">{MSG_KINDS.map(k => <button key={k.id} type="button" className={kind === k.id ? 'on' : ''} onClick={() => setKind(k.id)}>{k.label}</button>)}</div>
      </div>
      <label className="field"><span>Nome curto</span><input id="msg-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex.: Elogio + proposta" maxLength={60} autoFocus={!msg} /></label>
      <label className="field"><span>Mensagem</span><textarea id="msg-text" className="backup" rows={8} value={text} onChange={e => setText(e.target.value)} placeholder="O texto que você manda" /></label>
    </Sheet>
  );
}
