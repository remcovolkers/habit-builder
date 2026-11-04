// Tikken op de kaart zelf vinkt af, net als op het bolletje (een grote vlak is makkelijker te raken dan een rondje). Alles op de kaart dat zelf iets doet
// (knoppen, links, velden, de tellerbediening en het blok onder de kaart met het cijfer of de notitie) doet dat zelf en wordt hier niet onderschept.
export const OWN_CONTROLS = 'button, a, input, textarea, select, summary, label, .habit-card__extra, .counter';

/** De eigenschappen voor een kaart (h()-props) die met een tik afvinkt; `enabled` = mag afvinken. Leeg als het niet mag. */
export function tapProps(enabled, onTap) {
  if (!enabled) return {};
  return {
    onclick: (event) => {
      if (event.target.closest(OWN_CONTROLS)) return;
      onTap();
    },
  };
}
