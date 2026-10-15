// De repository: het enige dat de UI van opslag kent. Werkt op elke store met get/getAll/put/delete.
// Alle records krijgen createdAt/updatedAt; verwijderen is "zacht" (deletedAt) zodat sync dit later kan doorgeven.
//
// Interface (alles async):
//   getSettings() / saveSettings(patch)
//   listHabits() / getHabit(id) / saveHabit(habit) / deleteHabit(id)
//   listCheckIns(habitId?) / getCheckIn(habitId, date) / setCheckIn({habitId,date,status,note?}) / clearCheckIn(habitId, date)
//   listPauses(habitId?) / addPause({habitId,from,to?}) / updatePause(id, patch) / removePause(id)
//   listDayPlans() / setDayPlan({habitId,date}) / clearDayPlan(habitId, date)
//   snapshot() -> { settings, habits, checkIns, pauses, dayPlans }  (alles wat de schermen nodig hebben)
import { isValidDate } from '../domain/dates.js';
import { CHECK_IN_STATUSES, validateHabit } from '../domain/habit.js';
import { defaultSettings, validateSettings } from '../app/settings.js';

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
  async function upsert(collection, record) {
    const existing = await store.get(collection, record.id);
    const stamped = { ...record, createdAt: existing?.createdAt ?? record.createdAt ?? now(), updatedAt: now(), deletedAt: null };
    await store.put(collection, stamped);
    return stamped;
  }

  async function softDelete(collection, id) {
    const existing = await store.get(collection, id);
    if (!existing || existing.deletedAt != null) return false;
    await store.put(collection, { ...existing, deletedAt: now(), updatedAt: now() });
    return true;
  }

  const liveList = async (collection) => (await store.getAll(collection)).filter(live);
  const checkInId = (habitId, date) => `${habitId}|${date}`;

  return {
    storeKind: store.kind,

    // --- instellingen ---------------------------------------------------------------------
    async getSettings() {
      const saved = await store.get('settings', 'user');
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
    async setCheckIn({ habitId, date, status, note = null }) {
      const errors = [];
      if (!habitId) errors.push({ field: 'habitId', code: 'required' });
      if (!isValidDate(date)) errors.push({ field: 'date', code: 'invalid' });
      if (!CHECK_IN_STATUSES.includes(status)) errors.push({ field: 'status', code: 'invalid' });
      if (errors.length > 0) throw new ValidationError(errors);
      return upsert('checkIns', { id: checkInId(habitId, date), habitId, date, status, note });
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

    // --- alles voor de schermen -------------------------------------------------------------
    async snapshot() {
      const [settings, habits, checkIns, pauses, dayPlans] = await Promise.all([
        this.getSettings(),
        this.listHabits(),
        this.listCheckIns(),
        this.listPauses(),
        this.listDayPlans(),
      ]);
      return { settings, habits, checkIns, pauses, dayPlans };
    },
  };
}
