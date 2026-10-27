// Inloggen via Supabase Auth (Google of e-mailcode). De SDK (vendor/supabase-js.min.mjs, 217 kB) wordt pas geladen
// als hij nodig is: er is al een sessie, we komen terug van Google, of de gebruiker gaat inloggen.
import { config } from '../config.js';
import { isNativeApp, nativePlugin } from '../native.js';

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

/**
 * Wijst de server erop dat het account van deze sessie niet meer bestaat (bijvoorbeeld verwijderd op een ander apparaat)? GoTrue geeft dan 403
 * `user_not_found`; de database geeft bij elke schrijfactie een foreign-key-fout (23503, door PostgREST als 409 getoond). Andere fouten, zoals
 * geen verbinding of een verlopen token, zeggen daar niets over.
 */
export function isUserGoneError(error) {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '').toLowerCase();
  return code === 'user_not_found' || code === '23503' || message.includes('user from sub claim in jwt does not exist') || message.includes('foreign key constraint');
}

/** Vraagt de server of het account van de huidige sessie nog bestaat. Zonder verbinding of bij een andere fout: nee, we gaan er van uit dat het klopt. */
export async function sessionIsGone() {
  try {
    const client = await getClient();
    const { error } = await client.auth.getUser();
    return Boolean(error) && isUserGoneError(error);
  } catch {
    return false;
  }
}

/**
 * De ingelogde gebruiker. getSession leest alleen wat lokaal bewaard is: een sessie van een account dat intussen is verwijderd lijkt dan nog
 * geldig tot het token verloopt, en geeft bij elke schrijfactie een 409. Daarom vragen we de server (alleen als er een sessie is en we online zijn).
 */
export async function currentUser() {
  const client = await getClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const user = data.session?.user ?? null;
  if (user && navigator.onLine && (await sessionIsGone())) {
    await client.auth.signOut({ scope: 'local' }).catch(() => {});
    return null;
  }
  return user;
}

/**
 * Waar Google (via Supabase) de gebruiker naartoe stuurt na het inloggen in de Android-app: een eigen adres dat Android aan de app koppelt
 * (intent-filter in AndroidManifest.xml). Dit adres moet ook bij Supabase staan onder Authentication → URL Configuration → Redirect URLs.
 */
export const NATIVE_REDIRECT = 'habitbuilder://auth';

/**
 * Wat staat er in het adres waarmee Android de app opent? { code } na een geslaagde inlog, { error } als Google of Supabase een fout meldt
 * (bijvoorbeeld "access_denied" als je annuleert), of null als het geen inlogadres is. De gegevens kunnen in de query of in het #-deel staan.
 */
export function parseNativeAuthUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return null;
  }
  if (`${parsed.protocol}//${parsed.host}` !== NATIVE_REDIRECT) return null;
  const params = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  for (const [key, value] of parsed.searchParams) if (!params.has(key)) params.set(key, value);
  const code = params.get('code');
  if (code) return { code };
  return { error: params.get('error_description') || params.get('error') || 'onbekend' };
}

async function signInWithGoogleInApp() {
  const browser = nativePlugin('Browser');
  if (!browser) throw new Error('de browser-plugin van de app ontbreekt');
  const client = await getClient();
  // Google weigert inloggen in een ingebedde webweergave (disallowed_useragent): daarom een Chrome Custom Tab, en een eigen adres om terug te keren
  const { data, error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true } });
  if (error) throw error;
  await browser.open({ url: data.url });
}

export async function signInWithGoogle() {
  if (isNativeApp()) return signInWithGoogleInApp();
  const client = await getClient();
  const redirectTo = `${location.origin}${location.pathname}`;
  const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw error;
}

/**
 * De app is geopend met het adres waarmee Google terugkeert: de code inwisselen voor een sessie. De PKCE-verifier die daarbij hoort staat in de
 * localStorage van deze webweergave (de SDK bewaarde hem bij het starten van de inlog). Geeft de gebruiker, of gooit de fout.
 */
export async function completeNativeLogin(code) {
  const client = await getClient();
  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return data.user;
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
