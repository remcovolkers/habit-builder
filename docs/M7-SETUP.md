# M7 – ochtendherinnering: wat jij moet instellen

Je hoeft mij **geen geheimen** te geven. De privésleutel en het cron-geheim komen alleen in het Supabase-dashboard te staan, nooit in de repo en nooit in een chat. Aan mij geef je straks alleen de **publieke** sleutel (die is bedoeld om openbaar te zijn).

Dashboard: https://supabase.com/dashboard/project/rbsqafttotdaakpwtjmh
Project-URL: `https://rbsqafttotdaakpwtjmh.supabase.co`

## Hoe het werkt (kort)

1. Je zet in **Instellingen → Ochtendherinnering** een tijdstip in en tikt op *Herinnering aanzetten*. Je telefoon geeft de app een adres om meldingen naartoe te sturen.
2. De app zet dat adres, je tijdstip, je tijdzone, je voornaam en per dag *"hoeveel gewoontes, hoeveel in de stapel"* in de tabel `push_subscriptions`. De **namen van je gewoontes gaan niet naar de server**.
3. Supabase roept elke 5 minuten de Edge Function `send-reminders` aan (via `pg_cron`). Die kijkt wie aan de beurt is en stuurt een versleutelde melding via Google (FCM), die op je telefoon aankomt.
4. Tik je op de melding, dan opent de app op Vandaag.

Werkt op **Android (Chrome, ook als geïnstalleerde app)** en op desktop. iPhone volgt later (besluit D7).

---

## Stap 1 – Sleutels maken (op je eigen computer)

In de projectmap:

```
node tools/generate-vapid.mjs
```

Je krijgt twee regels:

- **PUBLIEK**: mag je delen. Die komt in `src/config.js` (stap 6).
- **PRIVÉ**: **geheim**. Bewaar die in je wachtwoordmanager en gebruik hem alleen in stap 5. Plak hem nergens anders, ook niet in een chat met mij.

Maak ook een lang willekeurig **cron-geheim** (dat is een wachtwoord tussen Supabase-cron en de functie):

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Bewaar dat ook in je wachtwoordmanager.

## Stap 2 – De tabel (SQL Editor)

Supabase → **SQL Editor → New query** → plak de volledige inhoud van `supabase/migrations/0002_push.sql` → **Run**. Opnieuw uitvoeren kan geen kwaad.

Dit maakt de tabel `push_subscriptions` met dezelfde soort beveiliging als `records`: je ziet en beheert alleen je eigen apparaten.

## Stap 3 – Extensies aanzetten

Supabase → **Database → Extensions**: zet **`pg_cron`** en **`pg_net`** aan (zoek ze op naam).

## Stap 4 – De Edge Function

> **Na een update van de app** (nieuwe melding met aandacht, weekterugblik en maandreview): plak de volledige inhoud van `supabase/functions/send-reminders/index.ts` opnieuw in de bestaande functie en deploy. Zonder dat blijven de oude teksten staan; de app zelf blijft werken.

Supabase → **Edge Functions → Deploy a new function → Via Editor**.

1. Naam: **`send-reminders`** (precies zo).
2. Verwijder de voorbeeldcode en plak de volledige inhoud van `supabase/functions/send-reminders/index.ts`.
3. Deploy.
4. Open daarna de **instellingen van de functie** en zet **Verify JWT** (soms "Enforce JWT verification") **uit**. De functie controleert zelf wie er belt: het cron-geheim, of jouw inlogsessie bij de testknop. Laat je het aan staan, dan geeft de gateway een 401 bij de cron-aanroep.

## Stap 5 – Geheimen van de functie

Supabase → **Edge Functions → Secrets → Add new secret**. Vier stuks:

| Naam | Waarde |
|---|---|
| `VAPID_PUBLIC_KEY` | de **publieke** sleutel uit stap 1 |
| `VAPID_PRIVATE_KEY` | de **privé** sleutel uit stap 1 |
| `VAPID_SUBJECT` | `mailto:` plus je contactadres, bijvoorbeeld `mailto:remco.volkers1@gmail.com` (push-diensten gebruiken dat als contactadres bij problemen) |
| `CRON_SECRET` | het cron-geheim uit stap 1 |

`SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY` zet Supabase zelf in de functie; die hoef je niet toe te voegen.

## Stap 6 – De publieke sleutel in de app

Stuur mij de **publieke** sleutel; ik zet hem in `src/config.js` (`vapidPublicKey`) en push het. Zolang dat veld leeg is, blijft de kaart in Instellingen verborgen.

(Zelf doen kan ook: vul de sleutel in bij `vapidPublicKey` in `src/config.js`.)

## Stap 7 – De planning (SQL Editor)

Vervang `<CRON_SECRET>` door je cron-geheim uit stap 1 en voer uit:

```sql
select cron.schedule(
  'send-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://rbsqafttotdaakpwtjmh.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
```

Dat zijn ongeveer 8.600 aanroepen per maand; ruim binnen het gratis plan.

Controleren:

```sql
select jobid, schedule, active from cron.job;                       -- staat de planning erin?
select status_code, content, created from net._http_response order by created desc limit 5;   -- wat antwoordde de functie?
```

Antwoord `200` met `{"mode":"cron","due":0,...}` betekent: de keten werkt, er was alleen niemand aan de beurt. Stoppen kan met `select cron.unschedule('send-reminders');`.

## Stap 8 – Uitproberen op je telefoon

1. Open de app in Chrome op je Pixel (liefst geïnstalleerd op je beginscherm), log in, ga naar **Instellingen → Ochtendherinnering**.
2. Kies een tijdstip en tik op **Herinnering aanzetten**; geef toestemming voor meldingen.
3. Tik op **Stuur een testmelding**. Binnen een paar seconden komt er een melding.
4. Wil je de echte planning testen: zet het tijdstip op over zeven, acht minuten en wacht.

Als het niet lukt:

| De kaart zegt | Oorzaak |
|---|---|
| "…de functie ontbreekt" | stap 4 niet gedaan, of de naam klopt niet |
| "De server mist nog instellingen" | een van de vier geheimen uit stap 5 ontbreekt (de functie-log noemt welke) |
| "…kon de melding niet afleveren" | kijk bij **Edge Functions → send-reminders → Logs**; vaak een verkeerde of niet bij elkaar passende sleutel (publiek en privé moeten uit dezelfde generatie komen) |
| "…staat niet (meer) bij de server" | zet de herinnering uit en weer aan |
| Test lukt, maar de ochtendmelding komt niet | controleer stap 7 (`cron.job` en `net._http_response`); en of `Verify JWT` uit staat |
| Geen enkele melding op de telefoon | Android: Instellingen → Apps → Chrome (of Habit Builder) → Meldingen aan; en niet in "niet storen" |

## Opruimen en privacy

- **Uitzetten** in de app verwijdert het apparaat van de server. **Uitloggen** en **account verwijderen** ruimen het ook op.
- Een apparaat dat niet meer bestaat (app gewist, telefoon weg) ruimt de server vanzelf op bij de eerstvolgende melding.
- Wat de server van de herinnering weet, staat in `docs/PRIVACY.md`.
