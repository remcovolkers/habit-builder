// Teller-habits ("8 glazen water"): per dag een eigen waarde, dus elke dag begint vanzelf bij 0.
// habit.counter = null | { unit: 'glazen', target: 8 | null }
//
// Met een doel is de dag gedaan bij waarde ≥ doel (daaronder: 'partial'); zonder doel is hij gedaan
// zodra er iets geteld is. 'partial' telt in het domein niet als gedaan en ook niet als overgeslagen.
export const COUNTER_MAX = 999;
export const COUNTER_UNIT_MAX = 20;

export const clampCounter = (value) => Math.min(COUNTER_MAX, Math.max(0, value));

/** 'done' | 'partial' | null (niets geteld). */
export function counterStatus(value, counter) {
  if (!(value > 0)) return null;
  return value >= (counter.target ?? 1) ? 'done' : 'partial';
}

/** De waarde die "gedaan" betekent als je het handmatig als gedaan markeert. */
export const counterDoneValue = (counter, current = 0) => Math.max(current, counter.target ?? 1);
