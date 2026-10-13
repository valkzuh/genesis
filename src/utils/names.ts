import type { Rng } from './rng';

/**
 * Procedural naming. Each culture speaks one of a handful of invented
 * "languages" — syllable inventories with characteristic endings — so the
 * nations, cities and rulers of one culture sound related to each other.
 */

export interface Language {
  id: string;
  label: string;
  onsets: readonly string[];
  vowels: readonly string[];
  codas: readonly string[];
  /** Endings used for country / region names. */
  placeEndings: readonly string[];
  /** Endings used for settlements. */
  cityEndings: readonly string[];
  /** Endings for personal names. */
  personEndings: readonly string[];
  /** Suffix used to form adjectives from names ending in a consonant. */
  adjectiveSuffix: string;
}

export const LANGUAGES: readonly Language[] = [
  {
    id: 'valorian',
    label: 'Valorian',
    onsets: ['v', 's', 't', 'c', 'l', 'm', 'n', 'r', 'd', 'p', 'qu', 'f', 'gr', 'tr', 'pr', 'aur', 'cl', 'v', 'l'],
    vowels: ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'ae', 'au', 'io'],
    codas: ['', '', '', 'r', 'n', 'l', 's', 'x', 'nt', 'rn'],
    placeEndings: ['ia', 'ora', 'ara', 'ona', 'ium', 'ica', 'ana', 'aria', 'ea'],
    cityEndings: ['um', 'a', 'is', 'ona', 'ium', 'ae', 'entum', 'ia', 'ano'],
    personEndings: ['us', 'ius', 'a', 'ia', 'or', 'an', 'ina', 'ix'],
    adjectiveSuffix: 'ian',
  },
  {
    id: 'nordic',
    label: 'Nordic',
    onsets: ['th', 'sk', 'br', 'h', 'v', 'g', 'r', 's', 'st', 'fr', 'k', 'tr', 'sv', 'b', 'd', 'j', 'ulf', 'ey'],
    vowels: ['a', 'e', 'i', 'o', 'u', 'y', 'ei', 'au', 'a', 'o'],
    codas: ['', 'r', 'n', 'k', 'rn', 'ld', 'nd', 'g', 'lf', 'st', 'rk'],
    placeEndings: ['heim', 'gard', 'mark', 'land', 'vik', 'reach', 'holm', 'mere', 'fell'],
    cityEndings: ['stad', 'borg', 'vik', 'by', 'havn', 'holm', 'fjord', 'dal', 'nes'],
    personEndings: ['ar', 'ir', 'a', 'olf', 'rid', 'mund', 'hild', 'ulf', 'vald'],
    adjectiveSuffix: 'ic',
  },
  {
    id: 'steppe',
    label: 'Steppe',
    onsets: ['kh', 't', 'b', 'ar', 's', 'm', 'q', 'z', 'or', 'j', 'ch', 'k', 'ul', 'er', 'g'],
    vowels: ['a', 'u', 'o', 'e', 'i', 'a', 'u', 'ai', 'ao'],
    codas: ['', 'n', 'r', 'k', 'l', 'g', 'kh', 'sh', 'm', 't'],
    placeEndings: ['ar', 'ul', 'an', 'ai', 'uk', 'stan', 'gir', 'tai', 'or'],
    cityEndings: ['balik', 'kent', 'ordu', 'kur', 'gan', 'tai', 'yar', 'shan'],
    personEndings: ['ai', 'an', 'ur', 'ei', 'mir', 'ugei', 'tash', 'bek'],
    adjectiveSuffix: 'i',
  },
  {
    id: 'qasari',
    label: 'Qasari',
    onsets: ['al', 'sh', 'k', 'q', 'z', 'h', 'm', 'r', 'd', 'n', 'j', 'b', 's', 'ish', 'kh', 'f'],
    vowels: ['a', 'i', 'u', 'a', 'aa', 'ai', 'e', 'a'],
    codas: ['', 'r', 'm', 'n', 'd', 'b', 'sh', 'l', 'h', 'z', 'q'],
    placeEndings: ['ar', 'im', 'ah', 'un', 'esh', 'at', 'iya', 'oun', 'ir'],
    cityEndings: ['abad', 'ar', 'iya', 'an', 'ush', 'ra', 'el', 'ah', 'oun'],
    personEndings: ['im', 'a', 'id', 'ah', 'ir', 'un', 'ira', 'ad'],
    adjectiveSuffix: 'i',
  },
  {
    id: 'silken',
    label: 'Silken',
    onsets: ['l', 'm', 'h', 't', 's', 'w', 'y', 'k', 'r', 'ts', 'sh', 'ch', 'n', 'j'],
    vowels: ['a', 'ai', 'ao', 'e', 'i', 'o', 'ou', 'u', 'ia', 'ei'],
    codas: ['', '', 'n', 'ng', 'n', ''],
    placeEndings: ['an', 'ei', 'ao', 'ing', 'u', 'en', 'ai', 'ou'],
    cityEndings: ['jing', 'shan', 'hai', 'zhou', 'lin', 'tan', 'po', 'an'],
    personEndings: ['ei', 'an', 'ing', 'ou', 'u', 'ai', 'en'],
    adjectiveSuffix: 'ese',
  },
  {
    id: 'brython',
    label: 'Brythonic',
    onsets: ['br', 'gl', 'c', 'd', 'm', 'n', 'rh', 't', 'g', 'b', 'ael', 'cy', 'll', 'f', 'tr'],
    vowels: ['a', 'e', 'i', 'o', 'y', 'ae', 'ei', 'wy', 'a', 'e'],
    codas: ['', 'n', 'r', 'th', 'dd', 'l', 'ch', 'm', 'nn', 'rr'],
    placeEndings: ['wyn', 'dor', 'ach', 'mor', 'glen', 'aeth', 'ia', 'an', 'yr'],
    cityEndings: ['dun', 'caer', 'lan', 'avon', 'ford', 'mere', 'wick', 'by', 'ton'],
    personEndings: ['wen', 'an', 'yd', 'ach', 'rhys', 'wyn', 'eth', 'ra'],
    adjectiveSuffix: 'ish',
  },
  {
    id: 'hellenic',
    label: 'Hellenic',
    onsets: ['th', 'ph', 'k', 'kr', 'd', 'l', 'm', 'n', 'p', 'ar', 'e', 's', 'ch', 'myr', 'z', 'pl'],
    vowels: ['a', 'e', 'i', 'o', 'y', 'ai', 'eu', 'o', 'a', 'e'],
    codas: ['', '', 's', 'n', 'r', 'l', 'x', 'th', 'rm', 'ss'],
    placeEndings: ['ia', 'eia', 'ene', 'os', 'is', 'ys', 'aia', 'onia', 'ea'],
    cityEndings: ['polis', 'os', 'ion', 'eia', 'ae', 'ene', 'ope', 'ra'],
    personEndings: ['os', 'as', 'ia', 'es', 'on', 'eus', 'ra', 'ides'],
    adjectiveSuffix: 'ian',
  },
  {
    id: 'austral',
    label: 'Austral',
    onsets: ['k', 'm', 'n', 't', 'w', 'h', 'l', 'p', 'r', 'ng', 'f', 'v', 'a', 'o'],
    vowels: ['a', 'e', 'i', 'o', 'u', 'a', 'ai', 'au', 'oa', 'ua'],
    codas: ['', '', '', '', 'n', 'ng'],
    placeEndings: ['a', 'i', 'ua', 'oa', 'ani', 'iki', 'ano', 'ehu', 'iti'],
    cityEndings: ['nui', 'roa', 'kai', 'ono', 'ahi', 'motu', 'ane', 'ula'],
    personEndings: ['a', 'i', 'ani', 'oa', 'iko', 'ua', 'ele', 'ono'],
    adjectiveSuffix: 'an',
  },
  {
    id: 'nahuan',
    label: 'Nahuan',
    onsets: ['x', 'tl', 'ch', 'k', 'p', 't', 'y', 'qu', 'm', 'n', 'h', 'tz', 'iz', 'oc'],
    vowels: ['a', 'e', 'i', 'o', 'a', 'o', 'ua', 'ia'],
    codas: ['', '', 'l', 'n', 'c', 'tl', 'x', 'z'],
    placeEndings: ['an', 'tlan', 'ec', 'ica', 'opan', 'apa', 'oca', 'altan', 'eca'],
    cityEndings: ['tlan', 'pan', 'co', 'tepec', 'apan', 'tzin', 'ixco', 'calli'],
    personEndings: ['tli', 'ac', 'otl', 'itzin', 'oc', 'ali', 'ana', 'emoc'],
    adjectiveSuffix: 'ec',
  },
  {
    id: 'vandric',
    label: 'Vandric',
    onsets: ['br', 'dr', 'gr', 'kr', 'v', 'z', 'st', 'sl', 'm', 'n', 'b', 'r', 'vl', 'ya', 'p', 'zv'],
    vowels: ['a', 'e', 'i', 'o', 'u', 'ya', 'ye', 'o', 'a', 'e'],
    codas: ['', 'v', 'n', 'r', 'sk', 'k', 'l', 'm', 'sl', 'd'],
    placeEndings: ['ava', 'ovia', 'ina', 'eska', 'ania', 'ov', 'ice', 'ara', 'eny'],
    cityEndings: ['grad', 'ov', 'sk', 'ets', 'ograd', 'ava', 'in', 'ice', 'nik'],
    personEndings: ['slav', 'mir', 'a', 'ana', 'ko', 'ek', 'imir', 'ya'],
    adjectiveSuffix: 'ian',
  },
] as const;

const VOWEL_CHARS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);
const COMMON_WORDS = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use', 'war', 'bad', 'die', 'dead', 'hell', 'kill', 'hate', 'then', 'than', 'them', 'they', 'this', 'that', 'with', 'from', 'were', 'when', 'what', 'here', 'there', 'some', 'more', 'many', 'much', 'only', 'very', 'also', 'into', 'over', 'such', 'your', 'yes']);
const BANNED = ['fuck', 'shit', 'cunt', 'nig', 'fag', 'rape', 'piss', 'cock', 'dick', 'slut', 'whore', 'nazi', 'kkk', 'cum', 'tit', 'anal', 'anus', 'porn', 'sex'];

/**
 * Real places, peoples and faiths. A generated name that matches one exactly,
 * or whose demonym does, is rejected, so a fantasy world never fields an
 * "Asian Republic" or a "Kingdom of Peru".
 */
const REAL_WORLD = new Set(
  `africa african america american asia asian europe european europa oceania arctic antarctica australia australian
  eurasia eurasian siberia siberian arabia arabian arab arabic sahara caribbean balkan balkans baltic nordic
  scandinavia anatolia anatolian caucasus indonesia indonesian filipino
  china chinese japan japanese korea korean mongolia mongol mongolian tibet tibetan nepal nepali nepalese bhutan
  india indian hindu hindi bengal bengali punjab punjabi burma burmese siam siamese thai laos lao vietnam vietnamese
  cambodia khmer malaya malay malaysia java javanese bali balinese sumatra borneo timor taiwan taiwanese ceylon lanka
  tamil pakistan pakistani afghan afghani persia persian iran iranian iraq iraqi syria syrian assyria assyrian
  babylon babylonian sumer sumerian akkad akkadian elam lydia lydian media median phrygia phrygian parthia parthian
  armenia armenian georgia georgian israel israeli judea judah jewish jew hebrew lebanon lebanese jordan canaan
  phoenicia phoenician yemen yemeni oman omani qatar kuwait kuwaiti saudi mecca medina jerusalem bethlehem nazareth
  islam islamic muslim egypt egyptian libya libyan tunisia algeria morocco moor moorish carthage berber nubia nubian
  kush turk turkish turkey ottoman
  mali malian chad niger nigeria nigerian ghana ghanaian togo benin gabon congo congolese zaire angola zambia malawi
  kenya kenyan uganda rwanda burundi sudan sudanese somalia somali ethiopia eritrea guinea liberia senegal gambia
  namibia botswana lesotho zulu bantu
  france french gaul gallic spain spanish iberia portugal italy italian rome roman roma latin venice genoa milan
  naples florence greece greek hellas hellenic sparta spartan athens athenian troy trojan crete cretan cyprus malta
  maltese sicily germany german prussia prussian saxon saxony bavaria austria austrian hungary hungarian magyar
  bohemia poland polish russia russian rus ukraine slav slavic serbia serbian croatia bosnia romania bulgaria albania
  thrace thracian dacia dacian illyria macedonia celt celtic goth gothic viking norse dane danish sweden swedish
  norway finland finnish iceland ireland irish scotland scottish wales welsh england english britain british albion
  holland dutch belgium swiss
  canada canadian mexico mexican cuba cuban haiti jamaica panama peru peruvian chile chilean bolivia brazil ecuador
  colombia venezuela argentina texas texan alaska hawaii hawaiian ohio utah iowa idaho maine kansas nevada dakota
  oregon montana virginia carolina florida inca incan maya mayan aztec olmec toltec zapotec mixtec
  tonga samoa fiji nauru palau tuvalu tahiti guam papua maori
  paris london berlin vienna prague warsaw moscow kiev kyiv madrid lisbon oslo dublin cairo lagos accra dakar tunis
  rabat kabul tehran baghdad ankara istanbul sofia tokyo kyoto osaka seoul beijing shanghai delhi mumbai dhaka manila
  hanoi jakarta sydney perth dubai doha riyadh lima quito havana cusco tikal boston dallas denver austin chicago
  atlanta miami seattle houston toronto quebec
  christ christian jesus moses allah buddha buddhist catholic sikh zion vatican`
    .split(/\s+/)
    .filter(Boolean),
);

/** True when a word matches a real place, people or faith. */
export function isRealWorldName(name: string): boolean {
  return REAL_WORLD.has(name.toLowerCase());
}

export function getLanguage(id: string): Language {
  return LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0]!;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function isVowel(ch: string | undefined): boolean {
  return ch !== undefined && VOWEL_CHARS.has(ch);
}

/** Joins two fragments, avoiding awkward vowel/consonant pile-ups. */
function join(a: string, b: string): string {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const last = a[a.length - 1];
  const first = b[0];
  if (isVowel(last) && isVowel(first)) {
    // Drop the trailing vowel of `a` to avoid "aia"-style clusters when both are vowels.
    return a.slice(0, -1) + b;
  }
  if (!isVowel(last) && !isVowel(first)) {
    const lastTwo = a.slice(-2);
    // Three consonants in a row read badly; drop the ending consonant.
    if (!isVowel(lastTwo[0]) && a.length > 2) return a.slice(0, -1) + b;
  }
  return a + b;
}

function syllable(lang: Language, rng: Rng, allowCoda: boolean): string {
  const onset = rng.chance(0.85) ? rng.pick(lang.onsets) : '';
  const vowel = rng.pick(lang.vowels);
  const coda = allowCoda ? rng.pick(lang.codas) : '';
  return onset + vowel + coda;
}

function acceptable(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.length < 3 || lower.length > 12) return false;
  if (/(.)\1\1/.test(lower)) return false;
  if (/[^aeiouy]{4,}/.test(lower)) return false;
  if (/[aeiou]{3,}/.test(lower)) return false;
  for (const bad of BANNED) if (lower.includes(bad)) return false;
  if (COMMON_WORDS.has(lower)) return false;
  if (isRealWorldName(lower)) return false;
  return true;
}

function generate(
  lang: Language,
  rng: Rng,
  endings: readonly string[],
  minSyl: number,
  maxSyl: number,
  endingChance: number,
  accept?: (name: string) => boolean,
): string {
  for (let attempt = 0; attempt < 40; attempt++) {
    const count = rng.intRange(minSyl, maxSyl);
    let name = '';
    for (let i = 0; i < count; i++) {
      name = join(name, syllable(lang, rng, i === count - 1 ? rng.chance(0.5) : rng.chance(0.25)));
    }
    if (rng.chance(endingChance)) name = join(name, rng.pick(endings));
    if (acceptable(name) && (!accept || accept(capitalize(name)))) return capitalize(name);
  }
  return capitalize(rng.pick(lang.onsets) + rng.pick(lang.vowels) + rng.pick(endings));
}

/** Tracks every proper name in a world so nations and cities never collide. */
export class NameRegistry {
  private readonly used: Set<string>;

  constructor(existing: Iterable<string> = []) {
    this.used = new Set(Array.from(existing, (n) => n.toLowerCase()));
  }

  has(name: string): boolean {
    return this.used.has(name.toLowerCase());
  }

  add(name: string): void {
    this.used.add(name.toLowerCase());
  }

  values(): string[] {
    return Array.from(this.used);
  }

  private unique(make: () => string): string {
    for (let i = 0; i < 60; i++) {
      const candidate = make();
      if (!this.has(candidate)) {
        this.add(candidate);
        return candidate;
      }
    }
    // Extremely unlikely: fall back to a suffixed variant.
    const base = make();
    let n = 2;
    while (this.has(`${base} ${roman(n)}`)) n++;
    const name = `${base} ${roman(n)}`;
    this.add(name);
    return name;
  }

  placeName(lang: Language, rng: Rng): string {
    // Nations take their adjective from the place name, so screen that too ("Asia" → "Asian").
    return this.unique(() => generate(lang, rng, lang.placeEndings, 1, 2, 0.75, (name) => !isRealWorldName(adjectiveFor(name, lang))));
  }

  cityName(lang: Language, rng: Rng): string {
    return this.unique(() => generate(lang, rng, lang.cityEndings, 1, 2, 0.6));
  }
}

export function personName(lang: Language, rng: Rng): string {
  return generate(lang, rng, lang.personEndings, 1, 2, 0.7);
}

export function worldName(rng: Rng): string {
  const lang = rng.pick(LANGUAGES);
  return generate(lang, rng, lang.placeEndings, 2, 2, 0.8);
}

/** Forms an adjective / demonym from a place name ("Solara" → "Solaran"). */
export function adjectiveFor(name: string, lang: Language): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('ia') || lower.endsWith('a')) return name + 'n';
  if (lower.endsWith('ium') || lower.endsWith('ius') || lower.endsWith('ios')) return name.slice(0, -3) + 'ian';
  if (lower.endsWith('us') || lower.endsWith('um') || lower.endsWith('os')) return name.slice(0, -2) + 'ian';
  if (lower.endsWith('is') || lower.endsWith('ys')) return name.slice(0, -2) + 'ian';
  if (lower.endsWith('y')) return name.slice(0, -1) + 'ian';
  if (lower.endsWith('e')) return name.slice(0, -1) + 'ean';
  if (lower.endsWith('i') || lower.endsWith('o') || lower.endsWith('u')) return name + 'an';
  return name + lang.adjectiveSuffix;
}

const ROMAN: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

export function roman(n: number): string {
  let out = '';
  let v = Math.max(1, Math.floor(n));
  for (const [value, sym] of ROMAN) {
    while (v >= value) {
      out += sym;
      v -= value;
    }
  }
  return out;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

export function ordinalWord(n: number): string {
  const words = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
  return words[n] ?? ordinal(n);
}
