// Laadt de Edge Function als gewone module: het bestand heeft geen imports, dus een data-URL is genoeg.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FUNCTION_PATH = fileURLToPath(new URL('../../supabase/functions/send-reminders/index.ts', import.meta.url));
const source = readFileSync(FUNCTION_PATH, 'utf8');
export const reminders = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
