// Inloggen via Supabase Auth (Google of e-mailcode). De SDK (vendor/supabase-js.min.mjs, 217 kB) wordt pas geladen
// als hij nodig is: er is al een sessie, we komen terug van Google, of de gebruiker gaat inloggen.
import { config } from '../config.js';

/** De sleutel waaronder de SDK de sessie in localStorage bewaart: sb-<projectref>-auth-token. */
export function sessionStorageKey(supabaseUrl) {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

export function hasStoredSession(storage = globalThis.localStorage, url = config.supabaseUrl) {
  try {
    return Boolean(storage?.getItem(sessionStorageKey(url)));
  } catch {
    return false; // opslag geblokkeerd: dan is er ook geen sessie die we kunnen herstellen
  }
}

/** Komen we terug van Google (of een foutmelding daarvan)? */
export function isAuthCallback(search = globalThis.location?.search ?? '') {
  return /[?&](code|error_description|error_code)=/.test(search);
}

let clientPromise = null;

export function getClient() {
  clientPromise ??= import('../../vendor/supabase-js.min.mjs').then(({ createClient }) =>
    createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }));
  return clientPromise;
}

/** Foutcodes die de UI netjes kan vertalen. */
export function describeAuthError(error) {
  const message = String(error?.message ?? error ?? '').toLowerCase();
  const status = Number(error?.status ?? 0);
  if (!navigator.onLine || message.includes('failed to fetch') || message.includes('networkerror') || message.includes('load failed')) return 'offline';
  if (status === 429 || message.includes('rate limit') || message.includes('too many')) return 'rate_limit';
  if (message.includes('expired') || message.includes('invalid') || message.includes('token')) return 'invalid_code';
  if (message.includes('email') && message.includes('valid')) return 'invalid_email';
  return 'unknown';
}

export async function currentUser() {
  const client = await getClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session?.user ?? null;
}

export async function signInWithGoogle() {
  const client = await getClient();
  const redirectTo = `${location.origin}${location.pathname}`;
  const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw error;
}

export async function sendEmailCode(email) {
  const client = await getClient();
  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyEmailCode(email, token) {
  const client = await getClient();
  const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  return data.user;
}

/** Alleen op dit apparaat uitloggen; andere apparaten blijven ingelogd. */
export async function signOutLocal() {
  const client = await getClient();
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

/** Wist het account en alle gegevens op de server (SQL-functie delete_my_account). */
export async function deleteMyAccount() {
  const client = await getClient();
  const { error } = await client.rpc('delete_my_account');
  if (error) throw error;
  await client.auth.signOut({ scope: 'local' }).catch(() => {});
}

/** Let op: de SDK blokkeert als je in deze callback zelf weer SDK-functies aanroept; plan dat met setTimeout. */
export async function onAuthChange(callback) {
  const client = await getClient();
  const { data } = client.auth.onAuthStateChange((event, session) => callback(event, session));
  return () => data.subscription.unsubscribe();
}
