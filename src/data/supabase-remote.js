// De Supabase-kant van de sync: tabel public.records (zie supabase/migrations/0001_init.sql).
import { SYNC_BATCH } from './sync.js';

/** PostgREST-foutcodes die niet "later opnieuw proberen" betekenen maar "dit record is onverwerkbaar". */
function toError(error, fallback) {
  const status = Number(error?.status ?? 0);
  const wrapped = new Error(error?.message ?? fallback);
  wrapped.code = error?.code;
  wrapped.status = status;
  // 400 (constraint, validatie) is permanent voor dat record; 401/403/408/429/5xx en netwerkfouten zijn dat niet
  wrapped.permanent = status === 400 || ['23514', '22P02', '23502'].includes(error?.code);
  return wrapped;
}

export function createSupabaseRemote({ client, userId }) {
  return {
    async push(rows) {
      for (let i = 0; i < rows.length; i += SYNC_BATCH) {
        const chunk = rows.slice(i, i + SYNC_BATCH).map((row) => ({
          user_id: userId,
          collection: row.collection,
          id: row.id,
          data: row.data,
          deleted_at: row.deleted_at,
        }));
        const { error } = await client.from('records').upsert(chunk, { onConflict: 'user_id,collection,id' });
        if (error) throw toError(error, 'Versturen mislukt');
      }
    },

    async pull(cursor, limit) {
      const { data, error } = await client
        .from('records')
        .select('collection,id,data,deleted_at,seq')
        .gt('seq', cursor)
        .order('seq', { ascending: true })
        .limit(limit);
      if (error) throw toError(error, 'Ophalen mislukt');
      return data.map((row) => ({ ...row, seq: Number(row.seq) }));
    },
  };
}
