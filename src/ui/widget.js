// De widget voor het startscherm (docs/ANDROID-WIDGET.md), de kant van de app: de lijst van vandaag aan de widget geven, en wat er in de widget
// is afgevinkt verwerken. Alleen in de Android-app; in de browser doet dit niets. De rekenregels staan in app/widget.js.
import { applyWidgetActions, buildWidgetSnapshot } from '../app/widget.js';
import { isNativeApp, nativePlugin } from '../native.js';
import { notifyChanged, onChanged, state } from './state.js';

/** Hoe lang na een wijziging de widget wordt bijgewerkt (ms): een rij afvinken is vaak snel gevolgd door een tweede. Een object zodat de tests het kunnen verkorten. */
export const widgetTiming = { delay: 1500 };

/** De widget-plugin van de app, of null in de browser. */
const widgetPlugin = () => (isNativeApp() ? nativePlugin('HabitWidget') : null);

/** Schrijft de lijst van vandaag naar de widget. */
export async function writeWidgetSnapshot(plugin = widgetPlugin()) {
  if (!plugin || !state.repo) return false;
  const snapshot = buildWidgetSnapshot({ snapshot: await state.repo.snapshot(), today: state.today, settings: state.settings });
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
  onChanged(() => {
    clearTimeout(timer);
    timer = setTimeout(() => writeWidgetSnapshot(plugin).catch(report), widgetTiming.delay);
  });
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
