// De app als Android-schil (Capacitor, zie docs/ANDROID-APP.md): herkennen waar we draaien en de systeembalken bij het thema laten passen.
// Alles hier doet niets in de gewone browser. Er is geen bundelaar, dus de native plugins worden aangesproken via window.Capacitor.Plugins.
const capacitor = () => globalThis.Capacitor;

/** Draait de pagina in de Android-app? */
export function isNativeApp() {
  return capacitor()?.isNativePlatform?.() === true;
}

/** Een native plugin (bijvoorbeeld 'App' of 'SystemBars'), of null als die er niet is. */
export function nativePlugin(name) {
  return capacitor()?.Plugins?.[name] ?? null;
}

/** Is een kleur (#rrggbb) donker? Bepaalt of de statusbalk lichte of donkere pictogrammen krijgt. */
export function isDarkColor(color) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color ?? '');
  if (!match) return true; // onbekend: het standaardthema is donker
  const [r, g, b] = match.slice(1).map((part) => parseInt(part, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

function followThemeColor(doc) {
  const apply = () => {
    const color = doc.querySelector('meta[name="theme-color"]')?.getAttribute('content');
    // SystemBars: stijl 'DARK' = lichte pictogrammen (voor een donkere achtergrond), 'LIGHT' = donkere pictogrammen
    nativePlugin('SystemBars')?.setStyle?.({ style: isDarkColor(color) ? 'DARK' : 'LIGHT' })?.catch?.(() => {});
  };
  apply();
  // het thema wisselt via het data-theme-kenmerk (zie ui/theme.js); de themakleur staat dan al in de meta-tag
  if (typeof MutationObserver === 'function') new MutationObserver(apply).observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

/** Zet de app-aanpassingen aan. Geeft true als we in de app draaien. */
export function startNative(doc = globalThis.document) {
  if (!isNativeApp() || !doc) return false;
  doc.documentElement.classList.add('is-native'); // de CSS maakt ruimte onder de statusbalk (styles/base.css)
  followThemeColor(doc);
  return true;
}
