// Configuratie van de Android-schil (zie docs/ANDROID-APP.md). De app toont de live site; er zit geen kopie van de bestanden in.
// CAP_SERVER_URL overschrijft het adres, bijvoorbeeld http://192.168.1.20:5173 om een debug-build tegen `npm run serve` te proberen.
//
// Benoemde exports in plaats van `export default`: de Capacitor-CLI laadt dit bestand met require(), en in een pakket met
// "type": "module" geeft dat het module-object. Zo staan appId en de rest er direct op.
const serverUrl = process.env.CAP_SERVER_URL || 'https://remcovolkers.github.io/habit-builder/';

export const appId = 'io.github.remcovolkers.habitbuilder';
export const appName = 'Habit Builder';
export const webDir = 'android-web'; // alleen een noodpagina; de app zelf komt van server.url
export const server = {
  url: serverUrl,
  cleartext: serverUrl.startsWith('http://'), // alleen voor een lokale proef; de productie-url is https
};
export const android = {
  backgroundColor: '#090c0c',
};
