// Het register van thema's. Puur (geen DOM): de CSS staat in styles/themes/<id>.css, het toepassen in ui/theme.js.
//
// mascots koppelt "plekken" in de app aan een illustratie (relatief pad). Een thema zonder mascotte voor een plek
// toont gewoon het standaardicoon of de emoji. Plekken:
//   brand, celebrate, achievement, empty, login, phase.starting, phase.building, phase.established
export const DEFAULT_THEME = 'v0lky1';

export const THEMES = Object.freeze({
  v0lky1: {
    id: 'v0lky1',
    name: 'v0lky1 Theme',
    description: 'Donker bos met neon-munt',
    themeColor: '#090c0c',
    swatches: ['#29ffb9', '#10221d', '#e4e9f2'],
    mascots: {},
  },
  mel: {
    id: 'mel',
    name: 'Mel Theme',
    description: 'Pokémon: geel op een blauwe nacht',
    themeColor: '#0c1238',
    swatches: ['#ffcb05', '#2a75bb', '#22307a'],
    // de drie starters (Bulbasaur, Charmander, Squirtle) zijn de drie fases; Pikachu viert, Jigglypuff houdt lege schermen
    // gezelschap en Meowth verwelkomt je bij het inloggen
    mascots: {
      brand: 'themes/mel/pokemon/5.svg',
      celebrate: 'themes/mel/pokemon/5.svg',
      achievement: 'themes/mel/pokemon/5.svg',
      empty: 'themes/mel/pokemon/32.svg',
      login: 'themes/mel/pokemon/38.svg',
      'phase.starting': 'themes/mel/pokemon/23.svg',
      'phase.building': 'themes/mel/pokemon/24.svg',
      'phase.established': 'themes/mel/pokemon/44.svg',
    },
  },
});

export const THEME_IDS = Object.freeze(Object.keys(THEMES));

export const isTheme = (id) => typeof id === 'string' && Object.hasOwn(THEMES, id);

/** Het thema voor een id; onbekend of leeg geeft het standaardthema. */
export const themeFor = (id) => THEMES[isTheme(id) ? id : DEFAULT_THEME];

/** Pad van de illustratie voor een plek in dit thema, of null. */
export const mascotFor = (id, slot) => themeFor(id).mascots[slot] ?? null;
