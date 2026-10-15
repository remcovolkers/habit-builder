// De repository: het enige dat de UI van opslag kent. Werkt op elke store met get/getAll/put/delete.
// Alle records krijgen createdAt/updatedAt; verwijderen is "zacht" (deletedAt) zodat sync dit later kan doorgeven.
//
// Interface (alles async):
//   getSettings() / saveSettings(patch)
//   listHabits() / getHabit(id) / saveHabit(habit) / deleteHabit(id)
//   listCheckIns(habitId?) / getCheckIn(habitId, date) / setCheckIn({habitId,date,status,note?}) / clearCheckIn(habitId, date)
//   listPauses(habitId?) / addPause({habitId,from,to?}) / updatePause(id, patch) / removePause(id)
//   listDayPlans() / setDayPlan({habitId,date}) / clearDayPlan(habitId, date)
//   listAchievements() / unlockAchievement({key, habitId?, date})
//   listRatings(habitId?) / setRating({habitId, weekStart, score})   (automatisme 1–5, per week)
//   listReviews() / getReview(weekStart) / saveReview({weekStart, wentWell, adjust})
//   replaceAll(data)  (import: vervangt alles)
//   snapshot() -> { settings, habits, checkIns, pauses, dayPlans, achievements, ratings, reviews }
import { COUNTER_MAX } from '../domain/counter.js';
import { NOTE_MAX_LENGTH } from '../domain/constants.js';
import { isValidDate } from '../domain/dates.js';
import { CHECK_IN_STATUSES, validateHabit } from '../domain/habit.js';
import { defaultSettings, validateSettings } from '../app/settings.js';
import { DATA_COLLECTIONS } from './memory-store.js';

export const REVIEW_TEXT_MAX = 1000;

export class ValidationError extends Error {
  constructor(errors) {
    super(`Ongeldige invoer: ${errors.map((e) => `${e.field}.${e.code}`).join(', ')}`);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

const live = (record) => record.deletedAt == null;
const byOrder = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt));

export function detectTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function createRepository({
  store,
  now = () => new Date().toISOString(),
  uuid = () => crypto.randomUUID(),
  timezone = detectTimeZone,
}) {
  // Elke schrijfactie komt ook in de "outbox": wat de sync-motor nog naar de server moet sturen.
  // rev wisselt bij elke wijziging, zodat een wijziging tijdens het versturen nooit verloren gaat.
  let revCounter = 0;
  const track = (collection, id) =>
    store.put('outbox', { id: `${collection}|${id}`, collection, recordId: id, rev: `${Date.now()}-${++revCounter}` });

  async function upsert(collection, record) {
    const existing = await store.get(collection, record.id);
    const stamped = { ...record, createdAt: existing?.createdAt ?? record.createdAt ?? now(), updatedAt: now(), deletedAt: null };
    await store.put(collection, stamped);
    await track(collection, record.id);
    return stamped;
  }

  async function softDelete(collection, id) {
    const existing = await store.get(collection, id);
    if (!existing || existing.deletedAt != null) return false;
    await store.put(collection, { ...existing, deletedAt: now(), updatedAt: now() });
    await track(collection, id);
    return true;
  }

  const liveList = async (collection) => (await store.getAll(collection)).filter(live);
  const checkInId = (habitId, date) => `${habitId}|${date}`;

  return {
    storeKind: store.kind,
    store, // voor de sync-motor en de accountkoppeling; schermen gebruiken dit niet

    // --- instellingen ---------------------------------------------------------------------
    async getSettings() {
      const stored = await store.get('settings', 'user');
      const saved = stored && live(stored) ? stored : null;
      return { ...defaultSettings(timezone()), ...(saved ?? {}) };
    },
    async saveSettings(patch) {
      const next = { ...(await this.getSettings()), ...patch, id: 'user' };
      const errors = validateSettings(next);
      if (errors.length > 0) throw new ValidationError(errors);
      return upsert('settings', next);
    },

    // --- habits ---------------------------------------------------------------------------
    async listHabits() {
      return (await liveList('habits')).sort(byOrder);
    },
    async getHabit(id) {
      const habit = await store.get('habits', id);
      return habit && live(habit) ? habit : null;
    },
    async saveHabit(habit) {
      const errors = validateHabit(habit);
      if (errors.length > 0) throw new ValidationError(errors);
      const record = { ...habit, id: habit.id ?? uuid(), name: habit.name.trim() };
      return upsert('habits', record);
    },
    async deleteHabit(id) {
      return softDelete('habits', id);
    },

    // --- check-ins ------------------------------------------------------------------------
    async listCheckIns(habitId) {
      const all = await liveList('checkIns');
      return habitId === undefined ? all : all.filter((c) => c.habitId === habitId);
    },
    async getCheckIn(habitId, date) {
      const record = await store.get('checkIns', checkInId(habitId, date));
      return record && live(record) ? record : null;
    },
    async setCheckIn({ habitId, date, status, note = null, value = null }) {
      const errors = [];
      if (!habitId) errors.push({ field: 'habitId', code: 'required' });
      if (!isValidDate(date)) errors.push({ field: 'date', code: 'invalid' });
      if (!CHECK_IN_STATUSES.includes(status)) errors.push({ field: 'status', code: 'invalid' });
      if (value !== null && !(Number.isInteger(value) && value >= 0 && value <= COUNTER_MAX)) errors.push({ field: 'value', code: 'invalid' });
      if (note !== null && typeof note !== 'string') errors.push({ field: 'note', code: 'invalid' });
      else if (note !== null && note.trim().length > NOTE_MAX_LENGTH) errors.push({ field: 'note', code: 'too_long' });
      if (errors.length > 0) throw new ValidationError(errors);
      const cleanNote = note === null || note.trim() === '' ? null : note.trim();
      return upsert('checkIns', { id: checkInId(habitId, date), habitId, date, status, note: cleanNote, value });
    },
    async clearCheckIn(habitId, date) {
      return softDelete('checkIns', checkInId(habitId, date));
    },

    // --- pauzes ---------------------------------------------------------------------------
    async listPauses(habitId) {
      const all = await liveList('pauses');
      return habitId === undefined ? all : all.filter((p) => p.habitId === habitId);
    },
    async addPause({ habitId, from, to = null }) {
      const errors = [];
      if (!habitId) errors.push({ field: 'habitId', code: 'required' });
      if (!isValidDate(from)) errors.push({ field: 'from', code: 'invalid' });
      if (to !== null && (!isValidDate(to) || to < from)) errors.push({ field: 'to', code: 'invalid' });
      if (errors.length > 0) throw new ValidationError(errors);
      return upsert('pauses', { id: uuid(), habitId, from, to });
    },
    async updatePause(id, patch) {
      const existing = await store.get('pauses', id);
      if (!existing || !live(existing)) return null;
      const next = { ...existing, ...patch };
      if (next.to !== null && next.to < next.from) throw new ValidationError([{ field: 'to', code: 'invalid' }]);
      return upsert('pauses', next);
    },
    async removePause(id) {
      return softDelete('pauses', id);
    },

    // --- dagplannen (stapel) --------------------------------------------------------------
    async listDayPlans() {
      return liveList('dayPlans');
    },
    async setDayPlan({ habitId, date }) {
      if (!habitId || !isValidDate(date)) throw new ValidationError([{ field: 'dayPlan', code: 'invalid' }]);
      return upsert('dayPlans', { id: `${habitId}|${date}`, habitId, date });
    },
    async clearDayPlan(habitId, date) {
      return softDelete('dayPlans', `${habitId}|${date}`);
    },

    // --- prestaties ---------------------------------------------------------------------------
    async listAchievements() {
      return liveList('achievements');
    },
    async unlockAchievement({ key, habitId = null, date }) {
      if (!key || !isValidDate(date)) throw new ValidationError([{ field: 'achievement', code: 'invalid' }]);
      const id = `${key}|${habitId ?? ''}`;
      const existing = await store.get('achievements', id);
      if (existing && live(existing)) return existing; // eenmaal ontgrendeld blijft zo
      return upsert('achievements', { id, key, habitId, date });
    },

    // --- automatisme-cijfer per week ------------------------------------------------------------
    async listRatings(habitId) {
      const all = await liveList('ratings');
      return habitId === undefined ? all : all.filter((r) => r.habitId === habitId);
    },
    async setRating({ habitId, weekStart, score }) {
      const errors = [];
      if (!habitId) errors.push({ field: 'habitId', code: 'required' });
      if (!isValidDate(weekStart)) errors.push({ field: 'weekStart', code: 'invalid' });
      if (!(Number.isInteger(score) && score >= 1 && score <= 5)) errors.push({ field: 'score', code: 'invalid' });
      if (errors.length > 0) throw new ValidationError(errors);
      return upsert('ratings', { id: `${habitId}|${weekStart}`, habitId, weekStart, score });
    },

    // --- wekelijkse review ----------------------------------------------------------------------
    async listReviews() {
      return (await liveList('reviews')).sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
    },
    async getReview(weekStart) {
      const review = await store.get('reviews', weekStart);
      return review && live(review) ? review : null;
    },
    async saveReview({ weekStart, wentWell = '', adjust = '' }) {
      const errors = [];
      if (!isValidDate(weekStart)) errors.push({ field: 'weekStart', code: 'invalid' });
      for (const [field, value] of [['wentWell', wentWell], ['adjust', adjust]]) {
        if (typeof value !== 'string' || value.length > REVIEW_TEXT_MAX) errors.push({ field, code: 'too_long' });
      }
      if (errors.length > 0) throw new ValidationError(errors);
      return upsert('reviews', { id: weekStart, weekStart, wentWell: wentWell.trim(), adjust: adjust.trim() });
    },

    // --- import: alles vervangen ----------------------------------------------------------------
    async replaceAll(data) {
      const stamp = now();
      const sets = {
        settings: data.settings ? [{ ...data.settings, id: 'user' }] : [],
        habits: data.habits,
        checkIns: data.checkIns,
        pauses: data.pauses,
        dayPlans: data.dayPlans,
        achievements: data.achievements,
        ratings: data.ratings,
        reviews: data.reviews,
      };
      for (const collection of DATA_COLLECTIONS) {
        const incoming = sets[collection] ?? [];
        const incomingIds = new Set(incoming.map((record) => record.id));
        const previous = await store.getAll(collection);
        await store.clear(collection);
        for (const record of incoming) {
          await store.put(collection, { ...record, createdAt: record.createdAt ?? stamp, updatedAt: stamp, deletedAt: null });
          await track(collection, record.id);
        }
        // wat er eerst was en nu niet meer: grafsteen, anders haalt de sync het van de server terug
        for (const old of previous) {
          if (incomingIds.has(old.id)) continue;
          await store.put(collection, { id: old.id, createdAt: old.createdAt ?? stamp, updatedAt: stamp, deletedAt: stamp });
          await track(collection, old.id);
        }
      }
    },

    // --- alles voor de schermen -------------------------------------------------------------
    async snapshot() {
      const [settings, habits, checkIns, pauses, dayPlans, achievements, ratings, reviews] = await Promise.all([
        this.getSettings(),
        this.listHabits(),
        this.listCheckIns(),
        this.listPauses(),
        this.listDayPlans(),
        this.listAchievements(),
        this.listRatings(),
        this.listReviews(),
      ]);
      return { settings, habits, checkIns, pauses, dayPlans, achievements, ratings, reviews };
    },
  };
}
