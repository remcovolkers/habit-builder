// Eén bron voor alle regels uit docs/PLAN.md §4. Aanpassen = hier, niet verspreid door de code.

/** Uur waarop een "dag" wisselt. Om 02:00 hoort een check-in nog bij de vorige dag. */
export const DEFAULT_DAY_START_HOUR = 4;
export const MAX_DAY_START_HOUR = 6;

/** Weken beginnen op maandag. */
export const WEEK_STARTS_ON = 'monday';

/** Aantal dagen waarna terugwerkend invullen of corrigeren niet meer kan. */
export const BACKFILL_DAYS = 14;

/** Ingeburgerd: mediaan uit Lally et al. (2009). Per habit overschrijfbaar. */
export const DEFAULT_GRADUATION_DAYS = 66;
export const CONSISTENCY_WINDOW_DAYS = 42;
export const CONSISTENCY_WINDOW_MIN_PERIODS = 3;
export const CONSISTENCY_THRESHOLD = 0.8;
export const AUTOMATICITY_THRESHOLD = 4;

/** Fasegrenzen in actieve dagen sinds de start. */
export const PHASE_STARTING_UNTIL_DAY = 21;
