// Past een thema toe op de pagina: het data-theme-kenmerk (de CSS doet de rest), de themakleur van de browser en het merklogo.
import { mascotFor, themeFor } from '../app/themes.js';

const STORAGE_KEY = 'hb-theme';
const DEFAULT_LOGO = 'icons/icon.svg';

export function applyTheme(id) {
  const theme = themeFor(id);
  document.documentElement.setAttribute('data-theme', theme.id);
  try {
    localStorage.setItem(STORAGE_KEY, theme.id); // voor theme-boot.js bij de volgende start
  } catch {
    /* opslag geblokkeerd: het thema geldt dan alleen tijdens deze sessie */
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.themeColor);
  const logo = document.querySelector('.brand__logo');
  if (logo) {
    const mascot = mascotFor(theme.id, 'brand');
    logo.setAttribute('src', mascot ?? DEFAULT_LOGO);
    logo.classList.toggle('is-mascot', Boolean(mascot));
  }
  return theme;
}
