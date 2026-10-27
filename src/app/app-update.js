// Bijwerken van de Android-app (zie docs/ANDROID-APP.md, §4.3): is er een nieuwere release dan de versie die op dit toestel staat?
// Alleen rekenwerk, zonder netwerk of scherm, zodat het te testen is.

export const REPO = 'remcovolkers/habit-builder';
export const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_PAGE_URL = `https://github.com/${REPO}/releases/latest`;

/** "1.3", "v1.3.0" of "1.3.0-debug" als [1, 3, 0]; null als er geen versie in staat. */
export function parseVersion(text) {
  const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?(?![\d.])/.exec(String(text ?? '').trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : null;
}

/** Is `candidate` een hogere versie dan `current`? Onbekende versies gelden nooit als nieuwer. */
export function isNewer(candidate, current) {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/** Een adres van ons eigen archief op GitHub: de download die we openen komt nooit van ergens anders, wat het antwoord van de API ook zegt. */
const ownDownload = (url) => typeof url === 'string' && url.startsWith(`https://github.com/${REPO}/releases/download/`);

/**
 * Uit het antwoord van de GitHub-API: { version, apkUrl, pageUrl } als er een nieuwere, openbare release met een APK klaarstaat, anders null.
 * `version` staat als "1.3.0" (zonder "v").
 */
export function pickUpdate(release, currentVersion) {
  if (!release || release.draft === true || release.prerelease === true) return null;
  const parsed = parseVersion(release.tag_name);
  if (!parsed || !isNewer(release.tag_name, currentVersion)) return null;
  const apk = (release.assets ?? []).find((asset) => typeof asset?.name === 'string' && asset.name.toLowerCase().endsWith('.apk') && ownDownload(asset.browser_download_url));
  if (!apk) return null;
  const pageUrl = typeof release.html_url === 'string' && release.html_url.startsWith(`https://github.com/${REPO}/`) ? release.html_url : RELEASES_PAGE_URL;
  return { version: parsed.join('.'), apkUrl: apk.browser_download_url, pageUrl };
}
