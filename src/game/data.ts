// Tabelas fixas do jogo: categorias, atributos, facções, conquistas e chefes.

export type Quality = 'poor' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legend' | 'rested';
export type AttrId = 'forca' | 'intelecto' | 'maestria' | 'fortuna' | 'vigor' | 'espirito' | 'carisma';
export type FactionId = 'carreira' | 'mente' | 'lar' | 'corpo' | 'lacos';
export type CatId =
  | 'trabalho' | 'futuro' | 'estudo' | 'saude' | 'social'
  | 'casa' | 'autocuidado' | 'recados' | 'lazer';
export type Diff = 'facil' | 'normal' | 'dificil' | 'heroico';
export type IconId =
  | 'sword' | 'coin' | 'book' | 'heart' | 'people' | 'house' | 'scissors' | 'scroll' | 'beer'
  | 'sprout' | 'car' | 'food' | 'flame' | 'skull' | 'hearth' | 'helm' | 'chest' | 'person' | 'moon' | 'star' | 'gear'
  | 'plus' | 'edit' | 'check' | 'shield' | 'trophy' | 'eye' | 'music' | 'x' | 'undo' | 'clock';

/** Cor própria de uma categoria; sem ela, a categoria usa a cor da raridade. */
export type CatColor = 'gold' | 'red' | 'white' | 'sky' | 'pink';
export interface Category {
  id: CatId; label: string; quality: Quality; color?: CatColor; base: number;
  attr: AttrId; faction: FactionId | null; icon: IconId;
}

export const CATEGORIES: Category[] = [
  { id: 'trabalho', label: 'Trabalho', quality: 'epic', base: 60, attr: 'maestria', faction: 'carreira', icon: 'sword' },
  { id: 'estudo', label: 'Estudo', quality: 'rare', base: 45, attr: 'intelecto', faction: 'mente', icon: 'book' },
  { id: 'saude', label: 'Saúde', quality: 'rare', color: 'red', base: 40, attr: 'forca', faction: 'corpo', icon: 'heart' },
  { id: 'social', label: 'Social', quality: 'uncommon', color: 'sky', base: 30, attr: 'carisma', faction: 'lacos', icon: 'people' },
  { id: 'casa', label: 'Casa', quality: 'uncommon', base: 25, attr: 'vigor', faction: 'lar', icon: 'house' },
  { id: 'autocuidado', label: 'Autocuidado', quality: 'uncommon', color: 'pink', base: 20, attr: 'espirito', faction: 'corpo', icon: 'scissors' },
  { id: 'futuro', label: 'Futuro', quality: 'rare', color: 'gold', base: 40, attr: 'fortuna', faction: 'carreira', icon: 'sprout' },
  { id: 'recados', label: 'Recados', quality: 'common', base: 15, attr: 'vigor', faction: 'lar', icon: 'scroll' },
  { id: 'lazer', label: 'Lazer', quality: 'rested', color: 'white', base: 0, attr: 'espirito', faction: null, icon: 'beer' },
];
// ---------- gastos ----------
export type ExpCatId = 'trabalho' | 'comida' | 'casa' | 'transporte' | 'investimento' | 'autocuidado' | 'familia' | 'lazer' | 'outros';
export interface ExpCategory { id: ExpCatId; label: string; color: string; icon: IconId }
export const EXP_CATS: ExpCategory[] = [
  { id: 'comida', label: 'Comida', color: '#ff9d4a', icon: 'food' },
  { id: 'casa', label: 'Casa e contas', color: '#1eff00', icon: 'house' },
  { id: 'transporte', label: 'Transporte', color: '#c9c9c9', icon: 'car' },
  { id: 'trabalho', label: 'Trabalho', color: '#b14cf5', icon: 'scroll' },
  { id: 'investimento', label: 'Investimento', color: '#f5c542', icon: 'sprout' },
  { id: 'autocuidado', label: 'Autocuidado e saúde mental', color: '#f7a8c4', icon: 'heart' },
  { id: 'familia', label: 'Amigos e família', color: '#7fd3ff', icon: 'people' },
  { id: 'lazer', label: 'Lazer', color: '#f2f2f2', icon: 'music' },
  { id: 'outros', label: 'Outros', color: '#9d9d9d', icon: 'coin' },
];
export const EXP_CAT: Record<ExpCatId, ExpCategory> = new Proxy(
  Object.fromEntries(EXP_CATS.map(c => [c.id, c])) as Record<ExpCatId, ExpCategory>,
  { get: (t, k) => t[k as ExpCatId] ?? t.outros },
);

// ---------- ganhos ----------
export type IncCatId = 'salario' | 'freela' | 'rendimentos' | 'presente' | 'reembolso' | 'outros';
export interface IncCategory { id: IncCatId; label: string; color: string; icon: IconId }
export const INC_CATS: IncCategory[] = [
  { id: 'salario', label: 'Salário', color: '#5fe04a', icon: 'coin' },
  { id: 'freela', label: 'Freela e extras', color: '#b14cf5', icon: 'sword' },
  { id: 'rendimentos', label: 'Rendimentos', color: '#f5c542', icon: 'sprout' },
  { id: 'presente', label: 'Presente', color: '#f7a8c4', icon: 'chest' },
  { id: 'reembolso', label: 'Reembolso', color: '#7fd3ff', icon: 'undo' },
  { id: 'outros', label: 'Outros', color: '#9d9d9d', icon: 'coin' },
];
export const INC_CAT: Record<IncCatId, IncCategory> = new Proxy(
  Object.fromEntries(INC_CATS.map(c => [c.id, c])) as Record<IncCatId, IncCategory>,
  { get: (t, k) => t[k as IncCatId] ?? t.outros },
);
export type FinKind = 'out' | 'in';
export type FinCatId = ExpCatId | IncCatId;
/** Categoria de um lançamento, de gasto ou de ganho. */
export function finCat(kind: FinKind, id: string): { id: string; label: string; color: string; icon: IconId } {
  return kind === 'in' ? INC_CAT[id as IncCatId] : EXP_CAT[id as ExpCatId];
}
export const finCats = (kind: FinKind) => (kind === 'in' ? INC_CATS : EXP_CATS) as { id: FinCatId; label: string; color: string; icon: IconId }[];

/** Classe de cor (sem o "c-") para mostrar uma categoria. */
export function catTone(c: Category): string {
  return c.color ? `cat-${c.color}` : c.quality;
}

// Categoria desconhecida (vinda de um aparelho com versão mais nova) vira Recados em vez de quebrar o app
export const CAT: Record<CatId, Category> = new Proxy(
  Object.fromEntries(CATEGORIES.map(c => [c.id, c])) as Record<CatId, Category>,
  { get: (t, k) => t[k as CatId] ?? t.recados },
);

export const DIFFS: { id: Diff; label: string; mult: number }[] = [
  { id: 'facil', label: 'Fácil', mult: 0.5 },
  { id: 'normal', label: 'Normal', mult: 1 },
  { id: 'dificil', label: 'Difícil', mult: 1.5 },
  { id: 'heroico', label: 'Heroico', mult: 2 },
];
export const DIFF: Record<Diff, { label: string; mult: number }> = Object.fromEntries(DIFFS.map(d => [d.id, d])) as never;

export interface Attribute { id: AttrId; label: string; color: string; hint: string }
export const ATTRIBUTES: Attribute[] = [
  { id: 'maestria', label: 'Maestria', color: 'var(--q-epic)', hint: 'Trabalho e carreira' },
  { id: 'fortuna', label: 'Fortuna', color: 'var(--gold)', hint: 'Dinheiro e futuro; aumenta a sorte' },
  { id: 'intelecto', label: 'Intelecto', color: 'var(--q-rare)', hint: 'Estudo e leitura' },
  { id: 'forca', label: 'Força', color: 'var(--hp)', hint: 'Exercício e saúde' },
  { id: 'carisma', label: 'Carisma', color: 'var(--q-legend)', hint: 'Amigos, família, social' },
  { id: 'vigor', label: 'Vigor', color: 'var(--q-uncommon)', hint: 'Casa e recados' },
  { id: 'espirito', label: 'Espírito', color: 'var(--rested)', hint: 'Autocuidado, descanso e lazer' },
];
export const ATTR: Record<AttrId, Attribute> = Object.fromEntries(ATTRIBUTES.map(a => [a.id, a])) as never;

export const FACTIONS: { id: FactionId; label: string; desc: string }[] = [
  { id: 'carreira', label: 'Liga da Carreira', desc: 'Trabalho e futuro' },
  { id: 'mente', label: 'Círculo da Mente', desc: 'Estudo' },
  { id: 'lar', label: 'Guardiões do Lar', desc: 'Casa e recados' },
  { id: 'corpo', label: 'Ordem do Corpo', desc: 'Saúde e autocuidado' },
  { id: 'lacos', label: 'Irmandade dos Laços', desc: 'Vida social' },
];

// Faixas de reputação no estilo do jogo
export const REP_LEVELS = [
  { id: 'odiado', label: 'Odiado', min: -42000, color: '#cc2222' },
  { id: 'hostil', label: 'Hostil', min: -6000, color: '#ff3a1a' },
  { id: 'inamistoso', label: 'Inamistoso', min: -3000, color: '#ee6622' },
  { id: 'neutro', label: 'Neutro', min: 0, color: '#e8c838' },
  { id: 'amistoso', label: 'Amistoso', min: 3000, color: '#1eff00' },
  { id: 'honrado', label: 'Honrado', min: 9000, color: '#1eff00' },
  { id: 'reverenciado', label: 'Reverenciado', min: 21000, color: '#1eff00' },
  { id: 'exaltado', label: 'Exaltado', min: 42000, color: '#2affe0' },
] as const;
export type RepLevelId = typeof REP_LEVELS[number]['id'];

export function repLevel(points: number) {
  let i = 0;
  for (let k = 0; k < REP_LEVELS.length; k++) if (points >= REP_LEVELS[k].min) i = k;
  const cur = REP_LEVELS[i];
  const next = REP_LEVELS[i + 1];
  const span = next ? next.min - cur.min : 1;
  const into = next ? points - cur.min : 1;
  return { ...cur, index: i, progress: Math.max(0, Math.min(1, into / span)), into, span: next ? span : 0 };
}

// Títulos: "m|f" — o herói escolhe a forma na ficha
export interface TitleDef { id: string; text: string }
export const TITLES: TitleDef[] = [
  { id: 'aventureiro', text: 'o Aventureiro|a Aventureira' },
  { id: 'veterano', text: 'o Veterano|a Veterana' },
  { id: 'lenda', text: 'a Lenda Viva|a Lenda Viva' },
  { id: 'leitor', text: 'o Devorador de Livros|a Devoradora de Livros' },
  { id: 'incansavel', text: 'o Incansável|a Incansável' },
  { id: 'tesoureiro', text: 'o Tesoureiro|a Tesoureira' },
  { id: 'atleta', text: 'o Atleta|a Atleta' },
  { id: 'carismatico', text: 'o Carismático|a Carismática' },
  { id: 'louca', text: 'Matador de Louça|Matadora de Louça' },
  { id: 'zen', text: 'o Sereno|a Serena' },
  { id: 'visionario', text: 'o Visionário|a Visionária' },
  { id: 'chama', text: 'da Chama Eterna|da Chama Eterna' },
  { id: 'matachefe', text: 'Matador de Chefes|Matadora de Chefes' },
  { id: 'viajante', text: 'o Viajante|a Viajante' },
  { id: 'boavida', text: 'o Boa-Vida|a Boa-Vida' },
  { id: 'imortal', text: 'o Imortal|a Imortal' },
  { id: 'rep_carreira', text: 'Executivo da Liga|Executiva da Liga' },
  { id: 'rep_mente', text: 'Arquimago do Círculo|Arquimaga do Círculo' },
  { id: 'rep_lar', text: 'Guardião do Lar|Guardiã do Lar' },
  { id: 'rep_corpo', text: 'Campeão da Ordem|Campeã da Ordem' },
  { id: 'rep_lacos', text: 'Coração da Irmandade|Coração da Irmandade' },
  { id: 'exaltado_todos', text: 'o Exaltado|a Exaltada' },
];
export const TITLE: Record<string, TitleDef> = Object.fromEntries(TITLES.map(t => [t.id, t]));
export function titleText(id: string | null, gender: 'm' | 'f') {
  if (!id || !TITLE[id]) return null;
  const [m, f] = TITLE[id].text.split('|');
  return gender === 'f' ? f : m;
}

// Contadores que as conquistas leem
export interface Counters {
  quests: number;
  perCat: Partial<Record<CatId, number>>;
  bossKills: number;
  hearthUses: number;
  leisure: number;
  bestStreak: number;
  crits: number;
  paid: number;
}

export interface AchievementDef {
  id: string; name: string; desc: string; points: number; icon: IconId; quality: Quality;
  title?: string;
  test: (s: { level: number; c: Counters; rep: Record<FactionId, number> }) => boolean;
}

const cat = (c: Counters, id: CatId) => c.perCat[id] ?? 0;
const exalted = (r: number) => r >= 42000;
const revered = (r: number) => r >= 21000;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'q1', name: 'Primeiros Passos', desc: 'Conclua sua primeira missão', points: 5, icon: 'scroll', quality: 'common', test: s => s.c.quests >= 1 },
  { id: 'q50', name: 'Aventureiro', desc: 'Conclua 50 missões', points: 10, icon: 'scroll', quality: 'uncommon', title: 'aventureiro', test: s => s.c.quests >= 50 },
  { id: 'q500', name: 'Veterano', desc: 'Conclua 500 missões', points: 25, icon: 'scroll', quality: 'rare', title: 'veterano', test: s => s.c.quests >= 500 },
  { id: 'q2000', name: 'Lenda Viva', desc: 'Conclua 2.000 missões', points: 50, icon: 'scroll', quality: 'legend', title: 'lenda', test: s => s.c.quests >= 2000 },
  { id: 'l10', name: 'Nível 10', desc: 'Alcance o nível 10', points: 10, icon: 'star', quality: 'common', test: s => s.level >= 10 },
  { id: 'l20', name: 'Nível 20', desc: 'Alcance o nível 20', points: 10, icon: 'star', quality: 'uncommon', test: s => s.level >= 20 },
  { id: 'l30', name: 'Nível 30', desc: 'Alcance o nível 30', points: 10, icon: 'star', quality: 'uncommon', test: s => s.level >= 30 },
  { id: 'l40', name: 'Nível 40', desc: 'Alcance o nível 40', points: 10, icon: 'star', quality: 'rare', test: s => s.level >= 40 },
  { id: 'l50', name: 'Nível 50', desc: 'Alcance o nível 50', points: 10, icon: 'star', quality: 'rare', test: s => s.level >= 50 },
  { id: 'l60', name: 'Nível 60', desc: 'Alcance o nível máximo', points: 50, icon: 'star', quality: 'legend', title: 'imortal', test: s => s.level >= 60 },
  { id: 'estudo100', name: 'Rato de Biblioteca', desc: 'Conclua 100 missões de Estudo', points: 15, icon: 'book', quality: 'rare', title: 'leitor', test: s => cat(s.c, 'estudo') >= 100 },
  { id: 'trab100', name: 'Hora Extra', desc: 'Conclua 100 missões de Trabalho', points: 15, icon: 'sword', quality: 'epic', title: 'incansavel', test: s => cat(s.c, 'trabalho') >= 100 },
  { id: 'fin50', name: 'Cofre Cheio', desc: 'Conclua 50 missões de Trabalho que te dão dinheiro', points: 15, icon: 'coin', quality: 'rare', title: 'tesoureiro', test: s => s.c.paid >= 50 },
  { id: 'saude100', name: 'Corpo de Ferro', desc: 'Conclua 100 missões de Saúde', points: 15, icon: 'heart', quality: 'rare', title: 'atleta', test: s => cat(s.c, 'saude') >= 100 },
  { id: 'social50', name: 'Alma da Festa', desc: 'Conclua 50 missões Sociais', points: 15, icon: 'people', quality: 'uncommon', title: 'carismatico', test: s => cat(s.c, 'social') >= 50 },
  { id: 'casa100', name: 'Pia Vazia', desc: 'Conclua 100 missões de Casa', points: 15, icon: 'house', quality: 'uncommon', title: 'louca', test: s => cat(s.c, 'casa') >= 100 },
  { id: 'futuro50', name: 'Semeador', desc: 'Conclua 50 missões de Futuro', points: 15, icon: 'sprout', quality: 'rare', title: 'visionario', test: s => cat(s.c, 'futuro') >= 50 },
  { id: 'auto50', name: 'Paz Interior', desc: 'Conclua 50 missões de Autocuidado', points: 10, icon: 'scissors', quality: 'uncommon', title: 'zen', test: s => cat(s.c, 'autocuidado') >= 50 },
  { id: 's7', name: 'Faísca', desc: 'Chegue a 7 dias seguidos num hábito', points: 5, icon: 'flame', quality: 'common', test: s => s.c.bestStreak >= 7 },
  { id: 's30', name: 'Fogueira', desc: 'Chegue a 30 dias seguidos num hábito', points: 15, icon: 'flame', quality: 'rare', test: s => s.c.bestStreak >= 30 },
  { id: 's100', name: 'Chama Eterna', desc: 'Chegue a 100 dias seguidos num hábito', points: 30, icon: 'flame', quality: 'legend', title: 'chama', test: s => s.c.bestStreak >= 100 },
  { id: 'b1', name: 'Primeiro Sangue', desc: 'Derrote um chefe semanal', points: 10, icon: 'skull', quality: 'uncommon', test: s => s.c.bossKills >= 1 },
  { id: 'b10', name: 'Caçador', desc: 'Derrote 10 chefes semanais', points: 20, icon: 'skull', quality: 'epic', title: 'matachefe', test: s => s.c.bossKills >= 10 },
  { id: 'b52', name: 'Um Ano de Raide', desc: 'Derrote 52 chefes semanais', points: 50, icon: 'skull', quality: 'legend', test: s => s.c.bossKills >= 52 },
  { id: 'h10', name: 'Casa é Onde a Pedra Está', desc: 'Use a Pedra de Regresso 10 vezes', points: 10, icon: 'hearth', quality: 'uncommon', title: 'viajante', test: s => s.c.hearthUses >= 10 },
  { id: 'lz100', name: 'Pausa Merecida', desc: 'Registre lazer 100 vezes', points: 10, icon: 'beer', quality: 'uncommon', title: 'boavida', test: s => s.c.leisure >= 100 },
  { id: 'crit25', name: 'Golpe de Sorte', desc: 'Tire 25 críticos de XP', points: 10, icon: 'star', quality: 'rare', test: s => s.c.crits >= 25 },
  { id: 'rc', name: 'Exaltado com a Liga da Carreira', desc: 'Chegue a Exaltado na Liga da Carreira', points: 25, icon: 'shield', quality: 'epic', title: 'rep_carreira', test: s => exalted(s.rep.carreira) },
  { id: 'rm', name: 'Exaltado com o Círculo da Mente', desc: 'Chegue a Exaltado no Círculo da Mente', points: 25, icon: 'shield', quality: 'epic', title: 'rep_mente', test: s => exalted(s.rep.mente) },
  { id: 'rl', name: 'Exaltado com os Guardiões do Lar', desc: 'Chegue a Exaltado nos Guardiões do Lar', points: 25, icon: 'shield', quality: 'epic', title: 'rep_lar', test: s => exalted(s.rep.lar) },
  { id: 'rco', name: 'Exaltado com a Ordem do Corpo', desc: 'Chegue a Exaltado na Ordem do Corpo', points: 25, icon: 'shield', quality: 'epic', title: 'rep_corpo', test: s => exalted(s.rep.corpo) },
  { id: 'rla', name: 'Exaltado com a Irmandade dos Laços', desc: 'Chegue a Exaltado na Irmandade dos Laços', points: 25, icon: 'shield', quality: 'epic', title: 'rep_lacos', test: s => exalted(s.rep.lacos) },
  { id: 'rrev', name: 'Diplomata', desc: 'Chegue a Reverenciado com todas as facções', points: 25, icon: 'shield', quality: 'rare', test: s => Object.values(s.rep).every(revered) },
  { id: 'rall', name: 'Embaixador de Azeroth da Vida', desc: 'Chegue a Exaltado com todas as facções', points: 100, icon: 'trophy', quality: 'legend', title: 'exaltado_todos', test: s => Object.values(s.rep).every(exalted) },
];

export const BOSSES = [
  { name: 'Lorde Procrastinus', quote: 'Amanhã eu faço.' },
  { name: 'A Pilha de Louça Ancestral', quote: 'Eu cresço enquanto você dorme.' },
  { name: 'Hidra das Notificações', quote: 'Corte uma, surgem três.' },
  { name: 'Barão do Sofá', quote: 'Só mais um episódio.' },
  { name: 'Rainha dos Boletos', quote: 'O vencimento chega para todos.' },
  { name: 'Golem da Roupa Suja', quote: 'Eu já fui uma cadeira.' },
  { name: 'Espectro do E-mail Não Lido', quote: '(37.412)' },
  { name: 'Dragão do Doomscroll', quote: 'Rola. Rola. Rola.' },
];

export const PORTRAITS: { id: string; icon: IconId; from: string; to: string; color: string }[] = [
  { id: 'paladino', icon: 'helm', from: '#5a4630', to: '#1a140d', color: '#d4ac52' },
  { id: 'mago', icon: 'star', from: '#2a3a7a', to: '#0c0f22', color: '#8fb8ff' },
  { id: 'druida', icon: 'moon', from: '#2e5a2a', to: '#0c1a0b', color: '#9fe07a' },
  { id: 'ladino', icon: 'eye', from: '#3a3a3a', to: '#0b0b0b', color: '#f0e070' },
  { id: 'bruxo', icon: 'skull', from: '#4a1f5a', to: '#140818', color: '#c880ff' },
  { id: 'xama', icon: 'flame', from: '#1f3f5a', to: '#081420', color: '#5ad0ff' },
  { id: 'guerreiro', icon: 'sword', from: '#5a2020', to: '#1a0808', color: '#ff8a6a' },
  { id: 'bardo', icon: 'music', from: '#5a4a1a', to: '#1a1406', color: '#ffd08a' },
];
