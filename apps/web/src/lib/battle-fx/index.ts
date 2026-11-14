import { fxAnimations } from './animations';
import { FX_H, FX_W, buildAnimation, renderFrame, type Built, type Env, type Frame, type FxAnimation } from './engine';
import { fxTypes, palettes, type FxType } from './glyphs';

export { fxAnimations, fxTypes, palettes, FX_W, FX_H };
export type { FxAnimation, FxType, Frame };

export type MoveCategory = 'physical' | 'special' | 'status';
export interface MoveRef { slug: string; type: string; category: MoveCategory }

/** Posições (em pixels lógicos 300x200) dos pés de cada lado, iguais às da arena. */
export const feet = { jogador: { x: 73, y: 115 }, adversario: { x: 229, y: 111 } } as const;
const bodyOffset = { jogador: 26, adversario: 21 } as const;

export function animationsOf(type: FxType, kind?: MoveCategory): FxAnimation[] {
  return fxAnimations.filter((a) => a.type === type && (!kind || a.kind === kind));
}

export function makeEnv(attacker: 'jogador' | 'adversario', type: FxType, seed: number): Env {
  const defender = attacker === 'jogador' ? 'adversario' : 'jogador';
  const body = (side: 'jogador' | 'adversario') => ({ x: feet[side].x, y: feet[side].y - bodyOffset[side] });
  return {
    src: body(attacker), tgt: body(defender), srcFeet: { ...feet[attacker] }, tgtFeet: { ...feet[defender] },
    dir: attacker === 'jogador' ? 1 : -1, pal: palettes[type], seed,
  };
}

/** Palavras do nome do golpe que escolhem uma animação específica (sufixo do id). */
const keywords: Partial<Record<FxType, Array<[RegExp, string]>>> = {
  normal: [[/scratch|arranh|claw|slash/, 'arranhao'], [/quick|rapid|fury|combo|comet|double/, 'golpes-rapidos'], [/slam|body|giga-impact|pancada|take-?down|strength/, 'pancada'], [/hyper-?beam|hiper|boom|blast|beam/, 'hiper-raio'], [/screech|roar|sing|growl|grito|howl|supersonic/, 'grito'], [/swift|star|estrela/, 'estrelas'], [/swords|harden|focus|sharpen|howl|work|growth|belly|energ/, 'energizar'], [/stare|glare|leer|tail|baby|charm|encar|scary|tickle/, 'encarar']],
  fire: [[/punch|soco/, 'soco-de-fogo'], [/wheel|charge|flare|blitz|flame-?charge|investida/, 'investida-flamejante'], [/claw|garra|fang|slash/, 'garra-incandescente'], [/ember|fire-?ball|ball|shot|bola|sacred|mystical|inferno/, 'bola-de-fogo'], [/thrower|flamethrower|lanca|heat|overheat|blast/, 'lanca-chamas'], [/blast|blitz|rajada|fire-?blast/, 'rajada-de-fogo'], [/spin|vortex|redemoinho|whirl|swirl/, 'redemoinho-de-fogo'], [/rain|sun|eruption|lava|shower/, 'chuva-de-brasas'], [/will|wisp|fatuo/, 'fogo-fatuo'], [/sunny|inner|flare|dance|boost|bulk/, 'chama-interior']],
  water: [[/tackle|headbutt|cabec|crabhammer|aqua-?jet|liquid/, 'cabecada-aquatica'], [/fall|cascata|waterfall/, 'cascata'], [/dive|surf-?dive|mergulho/, 'mergulho-aquatico'], [/gun|jato|pistol|squirt|water-?sport|spout/, 'jato-d-agua'], [/pump|hydro|cannon|bomba/, 'hidro-bomba'], [/surf|tidal|wave|onda/, 'surfar'], [/bubble|bolha|beam/, 'bolhas'], [/whirl|pool|redemoinho|vortex/, 'redemoinho-d-agua'], [/rain|chuva/, 'chuva'], [/dance|dança/, 'dança-da-chuva'], [/soak|encharc|withdraw/, 'encharcar']],
  electric: [[/punch|soco/, 'soco-trovao'], [/tackle|charge|bolt|volt|wild|investida|nuzzle/, 'investida-eletrica'], [/fang|bite|presa|crunch/, 'presa-eletrica'], [/thunder(?!-?wave)|storm|tempest/, 'tempestade-eletrica'], [/shock|choque|spark/, 'choque-do-trovao'], [/beam|raio|zap|cannon/, 'raio'], [/wave|onda|discharge|eerie/, 'onda-de-choque'], [/ball|bola/, 'bola-eletrica'], [/charge|carga|agility|magnet|rise/, 'carga'], [/thunder-?wave|glare|stun/, 'onda-trovao']],
  grass: [[/whip|vine|chicote|power-?whip/, 'chicote-de-vinha'], [/tackle|leaf-?blade|wood|investida/, 'investida-de-folhas'], [/root|ingrain|raiz|bind|leech-?seed/, 'raizes'], [/razor|navalha|cutter|blade/, 'folha-navalha'], [/solar|sol/, 'raio-solar'], [/storm|tempestade|leaf-?storm|cyclone/, 'tempestade-de-folhas'], [/seed|bomb|bomba|energy-?ball|apple/, 'bomba-de-sementes'], [/drain|giga|absorb|mega|dreno|horn-?leech/, 'dreno-de-vida'], [/petal|dance|blizzard|flor/, 'chuva-de-petalas'], [/growth|crescer|synthes|cotton-?guard/, 'crescer'], [/spore|powder|sleep|stun|poder/, 'esporos']],
  ice: [[/punch|soco/, 'soco-de-gelo'], [/icicle|spear|crash|estalac|rock-?climb/, 'estalactite'], [/headbutt|fang|cabec|tackle|ice-?ball/, 'cabecada-glacial'], [/beam|raio|aurora|psywave/, 'raio-de-gelo'], [/blizzard|nevasca|avalanche/, 'nevasca'], [/ball|bola|snowball/, 'bola-de-neve'], [/hail|granizo/, 'granizo'], [/wind|vento|powder|breath/, 'vento-gelado'], [/shard|prisma|freeze|crystal/, 'prisma-congelante'], [/snow|neve|mist|haze/, 'neve'], [/freeze|congel|glaciate/, 'congelar']],
  fighting: [[/punch|soco|jab|focus-?punch|dynamic/, 'soco-direto'], [/kick|chute|spin|tornado|roll/, 'chute-giratorio'], [/comet|barrage|combo|mach|arm-?thrust|double/, 'combo-de-socos'], [/chop|karate|cross|slash|hand|sacred|brick/, 'golpe-de-karate'], [/jump|flying|voadora|hi-?jump|axe/, 'voadora'], [/aura|sphere|esfera|focus-?blast|blast/, 'esfera-de-aura'], [/wave|onda|force|vacuum/, 'onda-de-forca'], [/chi|explosao|close|superpower|storm/, 'explosao-de-chi'], [/bulk|dobrar|bulk-?up|work|bulk/, 'dobrar-forca'], [/focus|foco|detect|protect|counter/, 'foco']],
  poison: [[/sting|ferrao|needle|barb|twineedle/, 'ferrao-venenoso'], [/claw|garra|fang|jab|cross/, 'garra-venenosa'], [/tail|cauda|poison-?tail|cross-?poison/, 'cauda-de-veneno'], [/bomb|sludge|bomba|gunk/, 'bomba-de-lodo'], [/acid|acido|armor|venoshock/, 'acido'], [/fog|nevoa|smog|mist|haze/, 'nevoa-toxica'], [/wave|onda|gunk/, 'onda-venenosa'], [/needle|agulha|spike|barrage|pin/, 'agulhas'], [/toxic|toxico|swag|dire/, 'toxico'], [/gas|poison-?gas|powder|poison-?powder/, 'gas']],
  ground: [[/punch|soco|mud-?bomb|drill|bonemerang|horn/, 'soco-de-terra'], [/dig|escav|burrow|mud-?slap/, 'escavar'], [/bone|osso|rush|bonemerang|club/, 'batida-de-osso'], [/quake|terremoto|earth/, 'terremoto'], [/shot|lama|mud|tiro|slap/, 'tiro-de-lama'], [/sand-?storm|tempestade|storm|spikes/, 'tempestade-de-areia'], [/power|poder|earth-?power|bulldoze|stomp/, 'poder-da-terra'], [/fissure|fissura|crack|drill|rock/, 'fissura'], [/attack|sand|areia|sand-?attack/, 'ataque-areia'], [/harden|endurec|magnet|spikes/, 'endurecer-terra']],
  flying: [[/peck|bicada|beak|drill|pluck|bounce/, 'bicada'], [/wing|asa|steel|aerial|slash/, 'ataque-de-asa'], [/dive|mergulho|sky|fly|brave|hurricane|dive/, 'mergulho-aereo'], [/cutter|cortante|air|aeroblast/, 'ar-cortante'], [/hurricane|furacao|twister/, 'furacao'], [/gust|rajada|tailwind/, 'rajada'], [/cyclone|ciclone|whirlwind|twister/, 'ciclone'], [/feather|pena|dance|razor/, 'chuva-de-penas'], [/dance|danca|roost|mirror/, 'dança-do-vento'], [/sand|mud|attack|growl|sky-?drop/, 'rajada-fraca']],
  psychic: [[/headbutt|cabec|zen|tackle/, 'cabecada-zen'], [/strike|golpe|psycho-?cut|psyshock|cut/, 'golpe-psiquico'], [/rush|investida|extrasensory|mind/, 'investida-mental'], [/psychic|psiquico|future|dream/, 'psiquico'], [/confus|chatter|wring|swagger/, 'confusao'], [/beam|psi|raio|psybeam|signal/, 'psiraio'], [/wave|onda|psywave|shock/, 'onda-mental'], [/shower|chuva|stone|cosmic|comet|meteor/, 'chuva-de-estrelas-psi'], [/calm|meditacao|agility|amnesia|rest|cosmic-?power/, 'meditacao'], [/hypno|hipnose|sleep|stun|yawn/, 'hipnose']],
  bug: [[/twin|double|ferrao|sting|pin|fury|pounce/, 'ferrao-duplo'], [/leech|sugar|vida|drain|absorb|megahorn/, 'sugar-vida'], [/tackle|investida|lunge|cut|u-?turn|horn/, 'investida-de-inseto'], [/buzz|zumbido|bug-?buzz|hum/, 'zumbido'], [/swarm|enxame|attack-?order|storm|swift/, 'enxame'], [/web|teia|string|spider|silk/, 'teia'], [/signal|sinal|struggle|bug-?bite|bite/, 'sinal-de-inseto'], [/powder|po|spore|dust/, 'nuvem-de-po'], [/sticky|pegajosa|cotton|string-?shot/, 'teia-pegajosa'], [/dance|borboleta|quiver|tail/, 'danca-da-borboleta']],
  rock: [[/head|cabec|smash|clap/, 'cabecada-de-pedra'], [/throw|pedrada|rock-?throw|rock-?tomb|ancient/, 'pedrada'], [/blade|lamina|axe|cut|slash|stone-?edge/, 'lamina-de-pedra'], [/slide|desab|fall|collapse|rolling/, 'desabamento'], [/slide|desliza|wrecker|rock-?slide/, 'deslizamento-de-pedras'], [/power|rocha|sharp|stone|pointed/, 'rocha-afiada'], [/gem|joia|diamond|power-?gem/, 'joia-de-poder'], [/storm|tempestade|sand|wind|blast/, 'tempestade-de-pedras'], [/polish|afiar|sharpen|harden|iron/, 'afiar-pedra'], [/dust|poeira|sand|smack/, 'rolar-e-poeira']],
  ghost: [[/lick|lamb|tongue|ice/, 'lambida'], [/claw|garra|shadow-?claw|slash|punch/, 'garra-sombria'], [/sneak|surpresa|ambush|force|phantom/, 'ataque-surpresa'], [/ball|bola|shadow-?ball|sphere/, 'bola-sombria'], [/will|wisp|fatuo|flame|fire/, 'fogo-fatuo-sombrio'], [/curse|maldic|hex|spite/, 'maldicao'], [/nightmare|pesadelo|dream|night|grudge/, 'pesadelo'], [/scream|grito|shriek|screech|moan/, 'grito-fantasma'], [/haunt|assom|confuse|ray/, 'assombrar'], [/disappear|sumi|invis|astonish|teleport/, 'invisibilidade']],
  dragon: [[/claw|garra|rage|rush|slash/, 'garra-de-dragao'], [/tail|cauda|dragon-?tail|outrage/, 'cauda-de-dragao'], [/rush|charge|dive|assault|dragon-?rush/, 'investida-draconica'], [/breath|sopro|fire|flame|dragon-?breath/, 'sopro-do-dragao'], [/pulse|pulso|dragon-?pulse|wave/, 'pulso-do-dragao'], [/meteor|draco|comet/, 'meteoro-draconico'], [/fury|furia|rage|outrage/, 'furia-do-dragao'], [/storm|tempestade|twister|cyclone/, 'tempestade-draconica'], [/dance|danca|dragon-?dance/, 'danca-do-dragao'], [/roar|rugido|scary|growl/, 'rugido']],
  dark: [[/bite|mordida|crunch|fang|thief/, 'mordida'], [/low|baixo|pursuit|knock|pay/, 'golpe-baixo'], [/pursuit|persegui|chase|faint|assurance/, 'perseguicao'], [/night-?slash|corte|slash|cut|punish|brutal/, 'corte-noturno'], [/pulse|pulso|dark-?pulse|ball/, 'pulso-negro'], [/beam|rajada|foul|eruption|roar/, 'rajada-sombria'], [/malice|maldade|snarl|fling|torment/, 'maldade'], [/void|vazio|black-?hole|nasty|dark-?void/, 'vazio'], [/trick|truque|taunt|swindle|torment/, 'truque-sujo'], [/threat|ameaca|growl|howl|flatter/, 'ameaca']],
  steel: [[/head|cabeca|iron-?head|smash|zen/, 'cabeca-de-ferro'], [/claw|garra|metal-?claw|slash|wing/, 'garra-metalica'], [/punch|soco|bullet-?punch|meteor-?mash|mash/, 'soco-de-aco'], [/tail|cauda|iron-?tail|slam/, 'cauda-de-ferro'], [/flash|canhao|cannon|luz|doom|beam/, 'canhao-de-luz'], [/bullet|bala|gyro|shot|ball/, 'bala-de-aco'], [/shard|lasca|spike|bit|gear/, 'lasca-metalica'], [/gear|engrenagem|grind|spin|rain/, 'chuva-de-engrenagens'], [/harden|endurec|defense|curtain|iron-?defense|iron/, 'endurecer-ferro'], [/shine|brilho|polish|metal-?sound|autotomize/, 'brilho-metalico']],
  fairy: [[/play|brinca|rough|draining/, 'brincadeira'], [/claw|garra|fairy|slash/, 'garra-de-fada'], [/tackle|cabec|baby|fofa|love/, 'cabecada-fofa'], [/moon|lunar|brilho|geomancy|blast/, 'brilho-lunar'], [/wind|vento|vent|breeze/, 'ventania-de-fadas'], [/star|estrela|magical|dazzling|shot/, 'estrelas-magicas'], [/kiss|beijo|drain|sweet|lick/, 'beijo-drenador'], [/voice|voz|song|sing|disarming/, 'voz-encantada'], [/charm|charme|fake|baby|tears|cute/, 'charme'], [/heal|cura|light|wish|moonlight|aromatherapy/, 'luz-curativa']],
};

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const isFxType = (t: string): t is FxType => (fxTypes as readonly string[]).includes(t);

/** Escolhe a animação de um golpe: palavra-chave do nome > categoria do golpe > sorteio estável pelo nome. */
export function pickAnimation(move: MoveRef): FxAnimation {
  const type: FxType = isFxType(move.type) ? move.type : 'normal';
  const pool = animationsOf(type);
  const slug = move.slug.toLowerCase();
  const signature = pool.find((animation) => animation.id === `${type}-${slug}` && animation.kind === move.category);
  if (signature) return signature;
  for (const [re, suffix] of keywords[type] ?? []) {
    if (!re.test(slug)) continue;
    const found = pool.find((a) => a.id === `${type}-${suffix}`);
    if (found && found.kind === move.category) return found;
  }
  const same = pool.filter((a) => a.kind === move.category);
  const list = same.length ? same : pool;
  return list[hash(slug) % list.length]!;
}

/* ----------------------------------------------------------------- reprodução */

export interface FxStage {
  /** canvas 300x200 que cobre a arena */
  canvas: HTMLCanvasElement;
  /** elemento que treme (a própria arena) */
  scene: HTMLElement;
  /** elementos dos Pokémon, por lado */
  actors: { jogador: HTMLElement | null; adversario: HTMLElement | null };
}

const PIXEL = 1; // pixels reais de canvas por pixel lógico (o canvas é escalado em CSS com pixelated)

export function prepareCanvas(canvas: HTMLCanvasElement) {
  canvas.width = FX_W * PIXEL;
  canvas.height = FX_H * PIXEL;
}

function applyFrame(stage: FxStage, frame: Frame, attacker: 'jogador' | 'adversario') {
  const defender = attacker === 'jogador' ? 'adversario' : 'jogador';
  const scale = stage.scene.clientWidth / FX_W;
  const set = (el: HTMLElement | null, a: Frame['src']) => {
    if (!el) return;
    const idle = a.dx === 0 && a.dy === 0 && a.rot === 0 && a.sx === 1 && a.sy === 1 && a.alpha === 1 && a.flash === 0;
    if (idle) {
      el.style.transform = '';
      el.style.opacity = '';
      el.style.filter = '';
      return;
    }
    el.style.transform = `translate(${a.dx * scale}px, ${a.dy * scale}px) rotate(${a.rot}deg) scale(${a.sx}, ${a.sy})`;
    el.style.opacity = String(a.alpha);
    el.style.filter = a.flash > 0 ? `brightness(${1 + a.flash * 2.2}) saturate(${1 - a.flash * 0.6})` : '';
  };
  set(stage.actors[attacker], frame.src);
  set(stage.actors[defender], frame.tgt);
  stage.scene.style.transform = frame.screen.x || frame.screen.y ? `translate(${frame.screen.x * scale}px, ${frame.screen.y * scale}px)` : '';
}

export function clearStage(stage: FxStage) {
  const g = stage.canvas.getContext('2d');
  g?.clearRect(0, 0, stage.canvas.width, stage.canvas.height);
  for (const el of [stage.actors.jogador, stage.actors.adversario]) {
    if (!el) continue;
    el.style.transform = '';
    el.style.opacity = '';
    el.style.filter = '';
  }
  stage.scene.style.transform = '';
}

export interface FxPlayback { done: Promise<void>; cancel: () => void; duration: number }

/** Toca a animação sobre a arena. A promessa resolve ao terminar (ou ao cancelar). */
export function playAnimation(stage: FxStage, animation: FxAnimation, attacker: 'jogador' | 'adversario', seed = 1, speed = 1): FxPlayback {
  prepareCanvas(stage.canvas);
  const g = stage.canvas.getContext('2d');
  const built: Built = buildAnimation(animation, makeEnv(attacker, animation.type, seed));
  const total = built.duration + 80;
  if (!g) return { done: Promise.resolve(), cancel: () => {}, duration: total };
  g.imageSmoothingEnabled = false;
  let raf = 0;
  let cancelled = false;
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });
  const t0 = performance.now();
  const finish = () => { cancelAnimationFrame(raf); clearStage(stage); resolveDone(); };
  const tick = (now: number) => {
    if (cancelled) return finish();
    const t = (now - t0) * speed;
    if (t >= total) return finish();
    const frame = renderFrame(built, g, t);
    applyFrame(stage, frame, attacker);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return { done, cancel: () => { cancelled = true; }, duration: total / speed };
}

export { buildAnimation, renderFrame };
