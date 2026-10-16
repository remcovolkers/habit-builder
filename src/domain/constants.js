// Eén bron voor alle regels uit docs/PLAN.md §4. Aanpassen = hier, niet verspreid door de code.

/** Uur waarop een "dag" wisselt. Om 02:00 hoort een check-in nog bij de vorige dag. */
export const DEFAULT_DAY_START_HOUR = 4;
export const MAX_DAY_START_HOUR = 6;

/** Weken beginnen op maandag. */
export const WEEK_STARTS_ON = 'monday';

/** Aantal dagen waarna terugwerkend invullen of corrigeren niet meer kan. */
export const BACKFILL_DAYS = 14;

/** Langste notitie (of reden bij overslaan) bij een check-in. */
export const NOTE_MAX_LENGTH = 200;

/** Hoeveel dagen vooruit een flexibele habit ingepland mag worden. */
export const PLAN_AHEAD_DAYS = 7;

/** Ingeburgerd: mediaan uit Lally et al. (2009). Per habit overschrijfbaar. */
export const DEFAULT_GRADUATION_DAYS = 66;
export const CONSISTENCY_WINDOW_DAYS = 42;
export const CONSISTENCY_WINDOW_MIN_PERIODS = 3;
export const CONSISTENCY_THRESHOLD = 0.8;
export const AUTOMATICITY_THRESHOLD = 4;

/**
 * Ingeburgerd telt ook het aantal keren (PLAN §4.5): het aantal dat je op het ritme van de habit binnen de
 * ingeburgerd-grens zou halen, op REPETITIONS_SHARE ervan, met een ondergrens voor zeldzame taken.
 * Zeldzaam = minder dan SPARSE_BELOW_PER_WEEK keer per week: daar is de telling zwak bewijs en wordt de automatisme-vraag verplicht.
 */
export const REPETITIONS_SHARE = CONSISTENCY_THRESHOLD;
export const MIN_REPETITIONS = 8;
export const SPARSE_BELOW_PER_WEEK = 1;
export const DAYS_PER_MONTH = 365.25 / 12;

/**
 * Aandacht (PLAN §4.9): een taak die stil ligt, te laat is of is mislukt. "Stil" = langer niet gedaan dan SILENT_FACTOR keer de
 * verwachte tussentijd bij het ritme, met een ondergrens van SILENT_MIN_DAYS dagen (2× per maand: tussentijd 15 dagen, dus de 22e dag).
 * Mislukte weken en maanden blijven FAILED_LOOKBACK_DAYS extra dagen terug zichtbaar (vanaf de start van de vorige week).
 */
export const SILENT_FACTOR = 1.5;
export const SILENT_MIN_DAYS = 7;
export const FAILED_LOOKBACK_DAYS = 7;

/** Fasegrenzen in actieve dagen sinds de start. */
export const PHASE_STARTING_UNTIL_DAY = 21;

/**
 * Gewoontesterkte: per eenheid s = s·a + gedaan·(1–a), met a = STRENGTH_ALPHA^(dagen in de eenheid).
 * 0.95 per dag geeft ~66% na 3 weken en ~97% na 66 dagen dagelijks volhouden; een week is a = 0.95^7.
 */
export const STRENGTH_ALPHA = 0.95;

/** Achievements. */
export const MILESTONE_DAYS = [7, 21, 42, 66, 100, 365];
export const MILESTONE_MIN_CONSISTENCY = 0.5;
export const PERFECT_WEEK_MIN_UNITS = 3;
export const COMEBACK_GAP_DAYS = 7;
export const ACTIVE_HABITS_ACHIEVEMENT = 3;
export const REVIEW_STREAK_WEEKS = 4;

/** Achievements, ronde 1 (docs/ITERATIE-1.2.md §5): aantallen, volhouden, terugkomen, slimmer en ingeburgerd. */
export const DONE_MILESTONES = [10, 50, 100, 500, 1000]; // keren gedaan, over alle habits samen
export const STREAK_MILESTONES = [7, 14, 30]; // dagen achter elkaar bij één habit met vaste dagen
export const PERFECT_WEEKS_RUN = 4; // perfecte weken achter elkaar
export const RECOVERIES_ACHIEVEMENT = 5; // keer meteen terug na een gemiste eenheid
export const MINIMAL_ACHIEVEMENT = 5; // keer de minimale versie gedaan
export const COUNTER_FULL_DAYS = 7; // dagen achter elkaar het volle doel van een teller gehaald
export const GRADUATED_MILESTONES = [2, 5]; // ingeburgerde habits
/** "Sterk terug": binnen een venster van 14 dagen onder de 50% gehaald (dip), later weer op 80% of hoger. Minstens 4 eenheden in het venster, anders zegt een percentage niets. */
export const STRONG_RETURN = Object.freeze({ windowDays: 14, dipBelow: 0.5, backAt: 0.8, minUnits: 4 });

/**
 * Sociaal (docs/SOCIAAL.md §4). Punten over de laatste dagen (vandaag meegerekend):
 * een vast bedrag per afgeronde taak, een bonus voor habits die nog niet eigen zijn, een bonus voor een nieuwe habit,
 * en minpunten voor wat je liet liggen. Wie zo veel dagen niets afvinkt, verdwijnt uit andermans lijst.
 */
export const SCORE_WINDOW_DAYS = 7;
export const TASK_POINTS = 10;
/** Extra per taak zolang de habit nog niet eigen is: de eerste PHASE_STARTING_UNTIL_DAY dagen, daarna tot de ingeburgerd-grens. */
export const BUILD_BONUS_STARTING = 4;
export const BUILD_BONUS_BUILDING = 2;
/** Eenmalig bij de eerste afgeronde taak van een nieuwe habit, hoogstens START_BONUS_MAX per venster (tegen aanmaken en weggooien). */
export const START_BONUS = 10;
export const START_BONUS_MAX = 3;
/** Aftrek per gemiste dag (of per ontbrekende keer bij een flexibele habit). Half zoveel als een taak oplevert. */
export const MISS_PENALTY = 5;
/** Per habit zijn de eerste MISS_GRACE missers van een rij gratis: een enkele misser kost niets, nooit twee keer achter elkaar. */
export const MISS_GRACE = 1;
/** Een teller die je half haalde levert deze fractie van een taak op en kost geen minpunten. */
export const PARTIAL_FRACTION = 0.5;
export const SOCIAL_ACTIVE_DAYS = 3;
