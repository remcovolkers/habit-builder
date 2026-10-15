import { h } from '../dom.js';

const pad = (n) => String(n).padStart(2, '0');
const MINUTE_STEP = 5; // de planning draait elke 5 minuten: preciezer dan dit kan toch niet

/**
 * Een tijdkeuze in 24-uursnotatie: twee keuzelijsten (uur en minuut). Een <input type="time"> volgt de 12/24-uursinstelling van het toestel
 * en laat zich daar niet toe dwingen; dit toont altijd 07:30 en nooit 7:30 AM.
 *
 * Het element is één groep met een `value` ('HH:MM', lezen en schrijven) en stuurt een gewoon 'change'-event, zodat het zich gedraagt als een invoerveld.
 */
export function timePicker({ id, value, label, hourLabel, minuteLabel, disabled = false, describedBy = null }) {
  const [hour, minute] = value.split(':').map(Number);

  const hourSelect = h('select', { class: 'input timepicker__select', 'aria-label': `${label}, ${hourLabel}`, disabled },
    ...Array.from({ length: 24 }, (_, i) => h('option', { value: pad(i), selected: i === hour }, pad(i))));

  const minuteValues = [...new Set([...Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP), minute])].sort((a, b) => a - b);
  const minuteSelect = h('select', { class: 'input timepicker__select', 'aria-label': `${label}, ${minuteLabel}`, disabled },
    ...minuteValues.map((m) => h('option', { value: pad(m), selected: m === minute }, pad(m))));

  const root = h('div', { id, class: 'timepicker', role: 'group', 'aria-label': label, ...(describedBy ? { 'aria-describedby': describedBy } : {}) },
    hourSelect, h('span', { class: 'timepicker__sep', 'aria-hidden': 'true' }, ':'), minuteSelect);

  Object.defineProperty(root, 'value', {
    get: () => `${hourSelect.value}:${minuteSelect.value}`,
    set: (next) => {
      const match = /^(\d\d):(\d\d)$/.exec(String(next));
      if (!match) return;
      hourSelect.value = match[1];
      if (![...minuteSelect.options].some((option) => option.value === match[2])) {
        // een tijd die niet op de stap valt (bv. 17:42, eerder ingesteld): als extra keuze toevoegen in plaats van die te verliezen
        const extra = h('option', { value: match[2] }, match[2]);
        const after = [...minuteSelect.options].find((option) => Number(option.value) > Number(match[2]));
        minuteSelect.insertBefore(extra, after ?? null);
      }
      minuteSelect.value = match[2];
    },
  });
  return root;
}
