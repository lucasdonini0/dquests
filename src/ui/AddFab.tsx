// O + das missões e dos hábitos. No modo "um só" (padrão) ele pergunta o que criar; no "um para cada" cria direto.
import { useState } from 'react';
import { useGame } from '../game/store';
import { Icon } from './Icon';
import { Sheet } from './parts';

export type AddKind = 'quest' | 'habit';

export function AddFab({ own, onPick }: { own: AddKind; onPick: (k: AddKind) => void }) {
  const ask = (useGame(s => s.settings.addMode) ?? 'ask') === 'ask';
  const [open, setOpen] = useState(false);
  const pick = (k: AddKind) => { setOpen(false); onPick(k); };
  return (
    <>
      <div className="fab-space" />
      <button className="fab" onClick={() => (ask ? setOpen(true) : onPick(own))} aria-label={ask ? 'Adicionar' : own === 'quest' ? 'Nova missão' : 'Novo hábito'}>
        <Icon id="plus" size={26} />
      </button>
      {open && (
        <Sheet title="Adicionar" onClose={() => setOpen(false)}>
          <div className="choice-grid">
            <button className="choice" onClick={() => pick('quest')}>
              <small><Icon id="scroll" size={12} /> Missão</small>
              <b>Nova missão</b>
              <span>Diária, semanal ou avulsa, com prazo e objetivos.</span>
            </button>
            <button className="choice" onClick={() => pick('habit')}>
              <small><Icon id="flame" size={12} /> Hábito</small>
              <b>Novo hábito</b>
              <span>Coisa pequena de todo dia, que acumula streak.</span>
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

/** Com um só +, o lado dos hábitos no PC não precisa do seu. */
export const useSingleAdd = () => (useGame(s => s.settings.addMode) ?? 'ask') === 'ask';
