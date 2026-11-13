import bundledFiles from './trainer-sprite-files.json';

const spritesUrl = `${import.meta.env.BASE_URL}recursos/Treinadores`;

export type TrainerGender = 'male' | 'female';

// Nomes sem marcação explícita precisam de identificação antes de entrar no sorteio.
const female = new Set('aroma_lady artist arena_tycoon_greta battle_girl battle_girl_dp beauty cassidy cowgirl crush_girl cynthia delia_ketchum elite_four_glacia elite_four_phoebe hex_maniac hilda hoenn_mom hoenn_nurse_bow hoenn_nurse jessie lady lass leader_flannery leader_liza leader_roxanne leader_winona lorelei lyra_default lyra_run maribel_default maribel_run may_oras_default may_oras_run may_run middle_aged_woman misty nurse_bow nurse_no_cap_bow nurse_no_cap nurse officer_jenny picnicker pike_maid pike_queen_lucy prof_ivy renko_default renko_run sabrina salon_maiden_anabel schoolgirl socialite teala twins young_woman'.split(' '));
const male = new Set('archie bird_keeper black_belt blaine_in_disguise breeder brendan_default brendan_oras_default brendan_oras_run brendan_run brock_father brock bruno bug_catcher bug_maniac burglar butch cameraman_02 cameraman camper collector dome_ace_tucker dragon_tamer earl elite_four_drake elite_four_sidney engineer ethan_default ethan_run factory_head_noland firebreather fisherman gary_oak gentleman guitarist hiker hilbert james juggler kindler koi_default koi_gifting koi_looking koi_run kurt leader_brawly leader_juan leader_norman leader_tate leader_wallace leader_wattson maxie middle_aged_man officer painter palace_maven_spencer poke_maniac prof_birch prof_elm pyramid_king_brandon rancher rich_boy rocker roughneck_02_v1 roughneck_v1 roughneck_v1a roughneck ruin_maniac safari_sentry sage sailor salesman samuel_oak samurai schoolboy_02 schoolboy scientist scott silver steven super_nerd tamer tracy wally worker_02 worker young_man youngster'.split(' '));

export function isTrainerGender(value: unknown): value is TrainerGender {
  return value === 'male' || value === 'female';
}

function spriteGender(id: string): TrainerGender | null {
  const name = id.replace(/^player_/, '');
  if (name.endsWith('_female') || female.has(name)) return 'female';
  if (name.endsWith('_male') || male.has(name)) return 'male';
  return null;
}

export type TrainerSprite = { id: string; label: string; url: string; gender: TrainerGender | null };

/** As imagens de treinador ficam em recursos/Treinadores e são servidas em /recursos/Treinadores/ (vite ou launcher). */
export const trainerSprites: TrainerSprite[] = [];
const spritesById = new Map<string, TrainerSprite>();

/** Troca a lista de sprites (o array e o mapa são atualizados no lugar, pois outros módulos guardam a referência). */
export function setTrainerSpriteFiles(files: readonly string[]) {
  const sprites = [...new Set(files.filter((file) => /^player_.+\.png$/i.test(file)))].map((file) => {
    const id = file.slice(0, -4);
    const label = id.replace(/^player_/, '').split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    return { id, label, url: `${spritesUrl}/${encodeURIComponent(file)}`, gender: spriteGender(id) };
  }).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { numeric: true }));
  trainerSprites.splice(0, trainerSprites.length, ...sprites);
  spritesById.clear();
  for (const sprite of sprites) spritesById.set(sprite.id, sprite);
}

setTrainerSpriteFiles(bundledFiles);

/** Soma à lista incluída no build as imagens que realmente existem na pasta (chame antes de abrir o jogo). */
export async function loadTrainerSpriteFiles() {
  try {
    const response = await fetch(`${spritesUrl}/lista.json`, { cache: 'no-cache' });
    if (!response.ok) return;
    const files: unknown = await response.json();
    if (Array.isArray(files)) setTrainerSpriteFiles([...bundledFiles, ...files.filter((file): file is string => typeof file === 'string')]);
  } catch {
    // sem a lista (por exemplo, hospedado sem o launcher): vale a que veio no build
  }
}

export const defaultTrainerSprite = 'player_brendan_default';
export const defaultSpriteByGender = { male: defaultTrainerSprite, female: 'player_lyra_default' };

export function getTrainerSprite(id: string) {
  return spritesById.get(id);
}
