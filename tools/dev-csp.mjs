// De dev-server serveert index.html met een CSP die ook de lokale Supabase toestaat (alleen lokaal: het bestand zelf en
// dus de productie-CSP blijven strak, zonder jokertekens). De host is die waarop je de app opent (localhost of het IP-adres
// van je computer, voor testen op je telefoon).
export const LOCAL_API_PORT = 54321;

/** Geeft de hostnaam uit een Host-header, of null als die er niet netjes uitziet (nooit iets onbetrouwbaars in de CSP zetten). */
export function hostnameFromHeader(hostHeader) {
  const match = /^([a-z0-9.-]+|\[[0-9a-f:]+\])(:\d+)?$/i.exec(String(hostHeader ?? '').trim());
  return match ? match[1] : null;
}

/** Voegt `http://<host>:54321` toe aan connect-src van de CSP in `html`. Zonder geldige host blijft de HTML ongewijzigd. */
export function allowLocalApi(html, hostname) {
  if (!hostname) return html;
  return html.replace(/(connect-src [^;]+)/, `$1 http://${hostname}:${LOCAL_API_PORT}`);
}
