# Release 1.3: de Android-app

Een checklist, in volgorde, in dezelfde opzet als [RELEASE-v1.2.md](RELEASE-v1.2.md). Wat in de repo staat is klaar en getest; de stappen met **Jij** kan alleen jij doen (het Supabase-dashboard, je telefoon, op "Merge" drukken).
Het plan en de keuzes: [ANDROID-APP.md](ANDROID-APP.md). Instellen en proberen: [ANDROID-SETUP.md](ANDROID-SETUP.md). Algemene werkwijze: [WERKWIJZE.md](WERKWIJZE.md).

## Wat er in zit

| Onderdeel | Waar uitgelegd |
|---|---|
| Een Android-app (Capacitor-schil om de PWA, toont de live site) die je als APK installeert | ANDROID-APP.md §4.1 |
| Ochtendherinnering via Google (FCM) in plaats van Chrome, met een eigen kanaal en icoon | §4.2 |
| In de app melden dat er een nieuwe versie klaarstaat en die downloaden | §4.3 |
| Inloggen met Google in de app, via de systeembrowser | §4.4 |
| Een pipeline die bij elke release een getekende APK in een GitHub Release zet; de PWA gaat zoals altijd uit | `.github/workflows/android.yml` |
| Servermigratie `0009_native_push.sql` en een uitgebreide `send-reminders` | DATAMODEL.md, PRIVACY.md |

De PWA in Chrome en op iOS verandert niet, op één regel in de CSP na (`https://api.github.com`, voor de updatecontrole in de app).

## 1. Samenvoegen in develop

- Pull request `feature/android-app` → `develop`. Alle drie de workflows moeten groen zijn: **Test & deploy**, **Integratie** en **Android-app** (die bouwt een debug-APK en een getekende proef-APK; staat nu groen op de laatste commit).

## 2. De productie voorbereiden (Jij, vóór de merge naar main)

De migratie is **alleen uitbreiding** en opnieuw uit te voeren; de huidige app merkt er niets van.

1. Supabase (productie) → **SQL Editor → New query** → plak `supabase/migrations/0009_native_push.sql` → **Run**.
2. Supabase → **Edge Functions → send-reminders** → vervang de code door `supabase/functions/send-reminders/index.ts` → **Deploy**.
3. Supabase → **Edge Functions → Secrets** → nieuw secret `FCM_SERVICE_ACCOUNT`, waarde op je klembord met `node tools/fcm-secret.mjs C:/pad/naar/je-sleutel.json | clip`. De VAPID-secrets blijven zoals ze zijn.
4. Supabase → **Authentication → URL Configuration → Redirect URLs → Add URL** → `habitbuilder://auth`. Zonder dit weigert Supabase de terugkeer van Google in de app.
5. Staat `0008_appointments.sql` (losse afspraken) al op productie? Zo niet, eerst die uitvoeren: hij zit al in `main`.
6. Controleer in de projectmap: `node tools/live-check.mjs`. Alle regels moeten **OK** zijn.

Waarom deze volgorde: de nieuwe functie kan app-toestellen aan, de migratie maakt het veld daarvoor, en pas daarna komt er een app die het gebruikt.

## 3. De release zelf

1. `appVersion` in `src/config.js` staat op `'1.3'` (dat wordt Android-versie `1.3.0`).
2. Pull request `develop` → `main`, merge. Er gebeurt dan tegelijk twee dingen: de PWA rolt uit (Pages) en de workflow **Android-app** bouwt de getekende APK en maakt de GitHub Release **v1.3.0** met `habit-builder.apk` erbij. Een tag maak je dus **niet** met de hand.
3. Controleer onder **Actions** dat beide groen zijn, en onder **Releases** dat v1.3.0 een APK heeft.

## 4. Na de release (Jij, op je telefoon)

1. **Eerst de updatemelding, met de debug-app die nu op je telefoon staat** (versie 1.2.0-debug, dus ouder dan de release): open hem, ontwikkelaarsopties aan, Instellingen → "Controleer op een nieuwe app-versie". Verwacht: "Versie 1.3.0 staat klaar (jij hebt 1.2.0-debug)" en een balk "Nieuwe versie (1.3.0) staat klaar. Downloaden?". **Downloaden** opent de APK in Chrome. Daarna ga je verder met stap 2.
2. **Installeren:** download `habit-builder.apk` uit de release op je telefoon, open hem, en sta eenmalig "installeren uit onbekende bronnen" toe voor je browser. Heb je de debug-app nog staan, dan geeft Android een conflict (andere handtekening): verwijder eerst de debug-app.
3. **Google-login:** Instellingen → Inloggen → Doorgaan met Google. Verwacht: Chrome opent met Google, na kiezen van je account sta je weer in de app en ben je ingelogd.
4. **Herinnering:** Instellingen → Ochtendherinnering → aanzetten, toestemming geven. Met ontwikkelaarsopties aan: een testmelding (de app open: een balk; de app dicht: in het meldingenpaneel) en "Testmelding over 15 seconden".
5. **Niet dubbel:** staat de herinnering ook in Chrome of de PWA aan, dan krijg je twee meldingen. Zet hem in Chrome uit.

## Terugdraaien

- **De app:** een pull request die de merge terugdraait (`git revert -m 1 <merge-commit>`), zoals in WERKWIJZE. Een al gepubliceerde GitHub Release blijft staan; verwijder die zo nodig met de hand, anders blijft de app melden dat v1.3.0 klaarstaat.
- **De database:** niet nodig, de migratie is additief.
- Gaat alleen de Google-login in de app mis, dan is dat een kleine hotfix-release (`hotfix/<naam>` naar `main`, met `appVersion` `1.3.1`); de PWA en de herinnering blijven werken.

## Weten voor je begint

- **Elke release is een nieuwe APK**, ook als er niets native verandert. Dat is zo besloten; zie ANDROID-APP.md §4.3.
- **Sideloaden:** de app staat niet in de Play Store. Een nieuwe versie installeer je over de oude heen (zelfde sleutel); de updatemelding in de app regelt het downloaden.
- **Bewaar de keystore** (zie ANDROID-SETUP.md, stap 1). Zonder die sleutel kan geen update meer over de bestaande app heen.
