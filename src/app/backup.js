// Export en import van alle gegevens als één JSON-bestand (je vangnet: de gratis Supabase heeft geen back-ups).
import { isValidDate } from '../domain/dates.js';
import { COUNTER_MAX } from '../domain/counter.js';
import { SLIP_REASONS } from '../domain/attention.js';
import { validCues } from '../domain/automaticity.js';
import { CHECK_IN_STATUSES, validParts, validateHabit } from '../domain/habit.js';
import { validateSettings } from './settings.js';

export const BACKUP_APP = 'habit-builder';
export const BACKUP_VERSION = 1;
const REVIEW_TEXT_MAX = 1000;

const COLLECTIONS = ['habits', 'checkIns', 'pauses', 'dayPlans', 'achievements', 'ratings', 'reviews', 'reasons'];

/** snapshot: uitvoer van repo.snapshot(); alleen levende records, zonder interne verwijdermarkeringen. */
export function buildExport(snapshot, now = new Date()) {
  const clean = ({ deletedAt, ...rest }) => rest;
  const { settings } = snapshot;
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data: {
      settings: clean(settings),
      ...Object.fromEntries(COLLECTIONS.map((name) => [name, (snapshot[name] ?? []).map(clean)])),
    },
  };
}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// een weekreview (wentWell, wentBad; oudere back-ups hebben nog `adjust`) of een maandreview (adjust, appliedAt)
const textOk = (value) => value === undefined || (typeof value === 'string' && value.length <= REVIEW_TEXT_MAX);
function isValidReview(record) {
  if (record.period === 'month') return isValidDate(record.monthStart) && typeof record.adjust === 'string' && textOk(record.adjust) && (record.appliedAt == null || isValidDate(record.appliedAt));
  return isValidDate(record.weekStart) && [record.wentWell, record.wentBad, record.adjust].every(textOk);
}

function validateRecords(name, records, habitIds, problems) {
  const kept = [];
  records.forEach((record, index) => {
    const where = `${name}[${index}]`;
    if (!isRecord(record) || typeof record.id !== 'string' || record.id === '') {
      problems.push(`${where}: record of id ontbreekt`);
      return;
    }
    const bad = (reason) => problems.push(`${where}: ${reason}`);
    switch (name) {
      case 'habits': {
        const errors = validateHabit(record);
        if (errors.length > 0) return bad(errors.map((e) => `${e.field}.${e.code}`).join(', '));
        break;
      }
      case 'checkIns':
        if (!isValidDate(record.date) || !CHECK_IN_STATUSES.includes(record.status)) return bad('ongeldige datum of status');
        if (record.value != null && !(Number.isInteger(record.value) && record.value >= 0 && record.value <= COUNTER_MAX)) return bad('ongeldige waarde');
        if (record.parts != null && !validParts(record.parts)) return bad('ongeldige dagdelen');
        break;
      case 'pauses':
        if (!isValidDate(record.from) || (record.to != null && (!isValidDate(record.to) || record.to < record.from))) return bad('ongeldige pauze');
        break;
      case 'dayPlans':
        if (!isValidDate(record.date)) return bad('ongeldige datum');
        break;
      case 'achievements':
        if (typeof record.key !== 'string' || !isValidDate(record.date)) return bad('ongeldige prestatie');
        break;
      case 'ratings':
        if (!isValidDate(record.weekStart) || !(Number.isInteger(record.score) && record.score >= 1 && record.score <= 5)) return bad('ongeldig cijfer');
        if (record.cues != null && !validCues(record.cues)) return bad('ongeldig cijfer');
        break;
      case 'reasons':
        if (!isValidDate(record.date) || !SLIP_REASONS.includes(record.reason)) return bad('ongeldige reden');
        break;
      case 'reviews':
        if (!isValidReview(record)) return bad('ongeldige review');
        break;
      default:
        break;
    }
    // records die naar een onbekende habit verwijzen zijn wees: weglaten in plaats van de hele import te weigeren
    if (name !== 'habits' && name !== 'reviews' && name !== 'achievements' && !habitIds.has(record.habitId)) {
      problems.push(`${where}: verwijst naar een onbekende habit (weggelaten)`);
      return;
    }
    kept.push(record);
  });
  return kept;
}

/**
 * Leest een back-upbestand. Geeft { ok: true, data, warnings } of { ok: false, error, details }.
 * error: 'invalid_json' | 'wrong_app' | 'wrong_version' | 'invalid_data'
 */
export function parseImport(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid_json', details: [] };
  }
  if (!isRecord(parsed) || parsed.app !== BACKUP_APP) return { ok: false, error: 'wrong_app', details: [] };
  if (parsed.version !== BACKUP_VERSION) return { ok: false, error: 'wrong_version', details: [`versie ${parsed.version}`] };
  if (!isRecord(parsed.data)) return { ok: false, error: 'invalid_data', details: ['data ontbreekt'] };

  const problems = [];
  const raw = parsed.data;
  for (const name of COLLECTIONS) {
    if (raw[name] !== undefined && !Array.isArray(raw[name])) return { ok: false, error: 'invalid_data', details: [`${name} is geen lijst`] };
  }

  const data = {};
  data.habits = validateRecords('habits', raw.habits ?? [], new Set(), problems);
  const rejectedHabits = (raw.habits ?? []).length - data.habits.length;
  if (rejectedHabits > 0) return { ok: false, error: 'invalid_data', details: problems };

  const habitIds = new Set(data.habits.map((h) => h.id));
  for (const name of COLLECTIONS.slice(1)) data[name] = validateRecords(name, raw[name] ?? [], habitIds, problems);

  if (raw.settings != null) {
    if (!isRecord(raw.settings) || validateSettings(raw.settings).length > 0) return { ok: false, error: 'invalid_data', details: ['settings ongeldig'] };
    data.settings = raw.settings;
  }

  // een ongeldig record in een andere lijst dan habits is geen reden om alles te weigeren, wel om te waarschuwen
  return { ok: true, data, warnings: problems };
}
