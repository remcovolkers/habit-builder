// Onthoudt per geschiedenis-ingang waar de pagina stond, zodat "terug" je op dezelfde plek zet.
//
// Waarom zelf: de router tekent bij elke routewissel de hele pagina opnieuw en begint bovenaan (src/router.js). De browser kan dan niet
// meer zelf herstellen. Een nieuwe navigatie (een link, een tab) begint nog steeds bovenaan; alleen terug of vooruit herstelt.
//
// Elke ingang krijgt een eigen id in history.state (hbEntry). Het id is uniek over herladen heen, zodat een oud id uit de geschiedenis
// nooit per ongeluk de plek van een andere pagina oplevert. De posities zelf staan alleen in het geheugen: na een herlaad begint elke pagina bovenaan.
const LIMIT = 100; // zoveel ingangen onthouden we; daarboven gaat de oudste eruit

export function createScrollMemory({ makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` } = {}) {
  const saved = new Map(); // id -> { page, outlet }
  let current = null;

  return {
    /**
     * De pagina wordt (opnieuw) getekend voor de ingang met deze history.state.
     * Geeft { id, isNew, restore }: isNew = de ingang had nog geen id (schrijf hem met replaceState weg), restore = de plek om naar terug te keren, of null.
     */
    enter(historyState) {
      const known = typeof historyState?.hbEntry === 'string' ? historyState.hbEntry : null;
      const id = known ?? makeId();
      current = id;
      return { id, isNew: known === null, restore: known === null ? null : (saved.get(known) ?? null) };
    },

    /** Legt de huidige plek vast voor de ingang waar we nu op staan. */
    save(position) {
      if (current === null) return;
      saved.delete(current); // opnieuw invoegen: de laatst gebruikte ingang staat achteraan
      saved.set(current, { page: position.page, outlet: position.outlet });
      if (saved.size > LIMIT) saved.delete(saved.keys().next().value);
    },
  };
}
