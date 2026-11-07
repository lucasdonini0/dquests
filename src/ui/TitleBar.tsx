import { useGame } from '../game/store';
import { fmt, need, MAX_LEVEL } from '../game/rules';
import logo from '../logo.png';

/** Barra de título do app de PC: arrastável, com o logo e o nível; os botões do Windows ficam à direita. */
export function TitleBar() {
  const hero = useGame(s => s.hero);
  const level = useGame(s => s.level);
  const xp = useGame(s => s.xp);
  const pct = level >= MAX_LEVEL ? 100 : Math.floor((xp / need(level)) * 100);
  return (
    <div className="titlebar">
      <img src={logo} alt="" width={20} height={20} />
      <b>dQuests</b>
      {hero.created && <span className="tb-hero">{hero.name} · nível {level} · {pct}% <small>({fmt(xp)} XP)</small></span>}
    </div>
  );
}
