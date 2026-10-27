// De widget voor het startscherm (docs/ANDROID-WIDGET.md), de kant van de app: de lijst van vandaag aan de widget geven, en wat er in de widget
// is afgevinkt verwerken. Alleen in de Android-app; in de browser doet dit niets. De rekenregels staan in app/widget.js.
import { applyWidgetActions, buildWidgetSnapshot, colorToHex } from '../app/widget.js';
import { isNativeApp, nativePlugin } from '../native.js';
import { account, onAccountChanged } from './account.js';
import { notifyChanged, onChanged, state } from './state.js';

/** Hoe lang na een wijziging de widget wordt bijgewerkt (ms): een rij afvinken is vaak snel gevolgd door een tweede. Een object zodat de tests het kunnen verkorten. */
export const widgetTiming = { delay: 1500 };

/** De widget-plugin van de app, of null in de browser. */
const widgetPlugin = () => (isNativeApp() ? nativePlugin('HabitWidget') : null);

// welke kleurvariabelen van het thema bij welke kleur van de widget horen (styles/themes/*.css)
const THEME_TOKENS = {
  background: '--color-surface-solid',
  text: '--color-text',
  muted: '--color-text-muted',
  accent: '--color-accent',
  onAccent: '--color-on-accent',
  hairline: '--color-hairline-strong',
};

/**
 * De kleuren van het thema dat nu actief is, als "#rrggbb"/"#aarrggbb". De waarde van een variabele kan in elke CSS-notatie staan (hex, rgb, een mengkleur):
 * we laten de browser hem op één pixel tekenen en lezen de pixel terug. Lukt dat niet (geen DOM), dan komt er niets terug en gebruikt de widget zijn standaardkleuren.
 */
export function readThemeColors(doc = globalThis.document) {
  const colors = {};
  try {
    const style = globalThis.getComputedStyle(doc.documentElement);
    const context = doc.createElement('canvas').getContext('2d', { willReadFrequently: true });
    for (const [name, token] of Object.entries(THEME_TOKENS)) {
      const value = style.getPropertyValue(token).trim();
      if (!value) continue;
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = 'rgba(0, 0, 0, 0)'; // een waarde die de browser niet begrijpt, laat de vorige staan: zo herkennen we dat
      const before = context.fillStyle;
      context.fillStyle = value;
      if (context.fillStyle === before && value !== before) continue;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      if (a > 0) colors[name] = colorToHex(r, g, b, a);
    }
  } catch {
    /* geen DOM of geen canvas: de widget gebruikt zijn eigen kleuren */
  }
  return colors;
}

/** Schrijft de lijst van vandaag naar de widget. */
export async function writeWidgetSnapshot(plugin = widgetPlugin()) {
  if (!plugin || !state.repo) return false;
  // wijzigingen die de app nog niet bij de server heeft gebracht (alleen met een account): de widget toont daarvoor het "niet gesynct"-icoon
  const unsynced = account.status === 'signed-in' ? account.pending : 0;
  const snapshot = buildWidgetSnapshot({ snapshot: await state.repo.snapshot(), today: state.today, settings: state.settings, colors: readThemeColors(), unsynced });
  await plugin.setSnapshot({ json: JSON.stringify(snapshot) });
  return true;
}

/**
 * Haalt de wachtrij uit de widget op en voert die uit. Geeft { applied, skipped } (zie applyWidgetActions), of null zonder widget.
 * Veranderde er iets, dan weet de rest van de app dat via notifyChanged (scherm, sync en een nieuwe momentopname).
 */
export async function drainWidgetQueue(plugin = widgetPlugin()) {
  if (!plugin || !state.repo) return null;
  const { json } = (await plugin.takeQueue()) ?? {};
  let actions = [];
  try {
    actions = JSON.parse(json || '[]');
  } catch {
    /* een kapotte wachtrij: weggooien is beter dan er telkens op vast te lopen (hij is al leeggemaakt) */
  }
  if (!Array.isArray(actions) || actions.length === 0) return { applied: 0, skipped: 0 };
  const result = await applyWidgetActions({ repo: state.repo, actions, today: state.today });
  if (result.applied > 0) notifyChanged();
  return result;
}

let started = false;

export function initWidget() {
  const plugin = widgetPlugin();
  if (started || !plugin) return;
  started = true;
  const report = (error) => console.warn('widget bijwerken mislukt', error);

  // eerst de acties uit de widget verwerken, dan de lijst opnieuw schrijven (ook als er niets te verwerken viel: dan klopt de widget weer met de app)
  const sync = () => drainWidgetQueue(plugin).then(() => writeWidgetSnapshot(plugin)).catch(report);

  let timer = null;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(() => writeWidgetSnapshot(plugin).catch(report), widgetTiming.delay);
  };
  onChanged(later);
  onAccountChanged(later); // ook als er gesynct is (het aantal niet-gesyncte wijzigingen verandert) of je in- of uitlogt
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { // naar de achtergrond: de widget moet de laatste stand hebben, niet wachten op de timer
      clearTimeout(timer);
      writeWidgetSnapshot(plugin).catch(report);
    } else {
      sync();
    }
  });
  sync();
}
