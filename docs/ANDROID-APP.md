# Android-app: plan

Doel: de PWA blijft zoals hij is, en er komt een **Android-app (APK)** bij die dezelfde site toont, met

1. **native meldingen** (de ochtendherinnering via Firebase Cloud Messaging, zonder de meldingstoestemming van Chrome),
2. een melding **"Nieuwe versie staat klaar, downloaden?"** in de app zelf (eenmalig installeren, daarna bijwerken vanuit de app),
3. daarna eventueel een **widget** (apart, zie §9).

Alles gaat in één keer live, vanaf één branch (`feature/android-app`, zie §7). Dit document is het plan; de tijdsschattingen zijn schattingen, geen metingen. Markering zoals in [USE-CASES-VOLGENDE-FEATURES.md](USE-CASES-VOLGENDE-FEATURES.md): ✓ gecontroleerd, ? niet gecontroleerd, in de spike na te gaan.

Dit vervangt het advies voor een TWA uit "Feature 4" van dat document: een TWA gebruikt Chrome-meldingen en kan geen widget leveren.

---

## 1. Uitgangspunten

- **De PWA blijft de bron.** Eén codebasis, één uitrol naar GitHub Pages. De app is een Capacitor-schil die de live site laadt (`server.url`). Een webwijziging bereikt dus ook de app-gebruikers zonder nieuwe APK, via de bestaande service worker en de "Vernieuwen"-balk.
- **Geen bundelaar.** De repo heeft geen buildstap en dat blijft zo. Capacitor-plugins worden aangesproken via `window.Capacitor.Plugins.…` (?, spike). Lukt dat niet, dan komt er een klein, meegeleverd bestand in `vendor/`, zoals `supabase-js` dat al is.
- **Alles wat alleen in de app bestaat, zit achter `Capacitor.isNativePlatform()`.** In de browser verandert er niets. Zo is de webversie veilig, ook als een stuk er al op `develop` staat.
- **Web Push blijft bestaan** voor de browser-PWA en desktop. Native push komt ernaast.
- **Serverwijzigingen breiden alleen uit** en volgen [WERKWIJZE.md](WERKWIJZE.md): eerst lokaal getest, bij de release op productie gezet.

### Waarom `server.url` en niet de bestanden in de APK stoppen

| | `server.url` (gekozen) | bestanden in de APK |
|---|---|---|
| Webwijziging bij gebruikers | meteen, via de service worker | pas na een nieuwe APK |
| Origin | `remcovolkers.github.io`, dus `pickEnvironment` kiest productie | `https://localhost`, dus de app zou het **ontwikkel**-Supabase kiezen en de lokale gegevens zijn gescheiden |
| Eerste start zonder internet | kan niet (?, controleren wat er dan staat) | werkt |
| Offline daarna | service worker (?, in de WebView controleren) | altijd |

---

## 2. Wat jij moet regelen (ik kan het niet voor je doen)

| Wat | Waarom | Wanneer |
|---|---|---|
| **Firebase-project** (gratis, geen creditcard; ? controleer de prijspagina) met een Android-app erin; het bestand `google-services.json` aan mij geven | geeft de app een FCM-token | vóór §4.2 |
| **Service-account-sleutel** (JSON) voor FCM, als secret `FCM_SERVICE_ACCOUNT` in Supabase | de Edge Function mag er namens het project mee versturen | vóór §4.2 |
| **Keystore** maken (met OpenSSL, geen Java nodig), bewaren in je wachtwoordmanager, en vier GitHub-secrets zetten (§5) | de APK moet bij elke release met dezelfde sleutel getekend zijn, anders weigert Android de update | vóór §4.1 |
| **Redirect-URL** `habitbuilder://auth` toevoegen onder Supabase → Authentication → URL Configuration | nodig voor inloggen met Google in de app | vóór §4.4 |
| **Toestel** om op te testen, en de "installeren uit onbekende bronnen"-toestemming | de app is geen Play Store-app | vanaf de spike |

De exacte stappen (commando's, waar je moet klikken) staan in [ANDROID-SETUP.md](ANDROID-SETUP.md), in de stijl van [M7-SETUP.md](M7-SETUP.md).

> **De keystore kwijtraken betekent:** gebruikers moeten de app verwijderen en opnieuw installeren. Wie niet is ingelogd, verliest daarbij zijn lokale gegevens. Maak een tweede kopie op een andere plek.

**Besloten** (27 oktober 2026):

1. **Pakketnaam** (`appId`): `io.github.remcovolkers.habitbuilder`. Niet meer te wijzigen na de eerste release.
2. **Appnaam** onder het icoon: "Habit Builder".
3. **Releasebeleid:** bij elke release een nieuwe APK (§4.3). Versmallen tot alleen native wijzigingen kan later.
4. **Sideload:** geen Play Store; eenmalig "onbekende bronnen" toestaan en mogelijk een Play Protect-melding is acceptabel.

---

## 3. Hoe het in elkaar zit

```
                     GitHub Pages (PWA)  ◀── deploy.yml, zoals nu
                           ▲
 Android-app (Capacitor)   │  laadt de site; plugins: push, app, browser
   └ WebView ──────────────┘
   └ FCM-token ─▶ Supabase: push_subscriptions ◀── cron ── Edge Function send-reminders
                                                              ├─ Web Push (bestaand)
                                                              └─ FCM HTTP v1 (nieuw) ─▶ Google ─▶ telefoon
   └ update-controle ─▶ GitHub Releases API ─▶ APK-download ─▶ Android-installatie (bevestigt de gebruiker)
```

Wat hergebruikt wordt: `composeMessage`, `isDue`, het "claim"-mechanisme tegen dubbele meldingen, de samenvatting van de app (geen habitnamen naar de server), de kaart in Instellingen, de testmeldingsknoppen.

---

## 4. De onderdelen

### 4.1 Schil en pipeline (ca. 1,5–2 dagen werk en wachttijd)

- `package.json`: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` (nieuwste stabiele versie, vastgezet in de lockfile) plus de plugins van de volgende onderdelen. Het zijn buildtools; er komt geen bundelaar bij.
- `capacitor.config.json`: `appId`, `appName`, `server.url` = `https://remcovolkers.github.io/habit-builder/`, `server.allowNavigation` voor de Supabase-host, `webDir` naar een kleine map met een offline-pagina (alleen een noodpagina; de site komt van `server.url`).
- Voor lokaal testen: een omgevingsvariabele `CAP_SERVER_URL` die de URL overschrijft, bijvoorbeeld `http://192.168.1.20:5173` (alleen in debug-builds, met cleartext toegestaan). Dan test je de app tegen `npm run serve` zonder eerst iets naar productie te rollen. De app kiest dan, net als de browser, de lokale Supabase.
- `android/` wordt gecommit (nodig voor permissies en later de widget). `.gitignore`: buildmappen en `local.properties`.
- Eigen plugin (Kotlin, een paar bestanden onder `android/app/src/main/java/…`) voor wat geen bestaande plugin doet: de APK-installatie (§4.3) en later de widget (§9).
- Afwerking die bij een schil hoort: statusbalk- en navigatiebalkkleur (`#090c0c`), splashscreen, de terugknop (op het beginscherm de app sluiten, anders terug in de route), externe links en `mailto:` in de systeembrowser, en een iconenset op basis van `icons/icon-maskable-512.png`.
- **Geen pinch-zoom**, in lijn met de bestaande afspraak: de viewport doet dat al; controleren in de WebView.
- Workflow `android.yml`: zie §5.

Tests: de debug-APK bouwt in CI; handmatig installeren en de hele app doorlopen.

### 4.2 Native meldingen via FCM (ca. 2–3 dagen)

**Database** (`supabase/migrations/0009_native_push.sql`, alleen uitbreiden):
- `push_subscriptions` krijgt `fcm_token text` en `platform text not null default 'web'` (`'web'` of `'android'`).
- `endpoint`, `p256dh` en `auth` worden nullable, met een check dat het óf een volledig webabonnement is óf een rij met `fcm_token`. Oude app-versies blijven gewoon webrijen schrijven.
- `unique (user_id, fcm_token)`, een lengtegrens op het token, en de bestaande limiet van 10 apparaten, RLS en `updated_at`-trigger blijven gelden.
- *Alternatief:* een aparte tabel. Meer SQL en een tweede cron-pad; ik kies voor uitbreiden omdat alle logica voor "aan de beurt" en "vandaag al gemeld" dan gedeeld blijft.

**Edge Function** (`send-reminders/index.ts`, nog steeds één bestand zonder imports):
- `sendFcm`: een OAuth-token ophalen met een JWT (RS256, scope `firebase.messaging`) uit de service-account-sleutel, een uur lang bewaard, en dan `POST https://fcm.googleapis.com/v1/projects/<id>/messages:send`.
- Bericht: een `notification` (titel, tekst) plus `data.url`, met `android.priority: "HIGH"` en een vast kanaal. Een notificatiebericht toont het systeem zelf, ook als de app dicht is, zonder dat er eigen code hoeft te draaien.
- Een antwoord `UNREGISTERED` of `NOT_FOUND` betekent dat de installatie weg is: de rij wordt verwijderd, zoals nu bij 404/410 van Web Push.
- `deliver` kiest per rij `sendPush` of `sendFcm`. De cron-query en `claim` blijven hetzelfde.
- Nieuwe secret: `FCM_SERVICE_ACCOUNT`. De rest blijft. Zet de nieuwe vereiste alleen **als FCM-rijen bestaan**, zodat een niet-ingerichte FCM de Web Push niet blokkeert.

**App**:
- `src/ui/reminders.js`: `supported()`, `refreshReminders` en `enableReminder` krijgen een native tak. Toestemming via `PushNotifications.requestPermissions()` (Android 13+: runtime-toestemming `POST_NOTIFICATIONS`), registreren, het token uit het `registration`-event opslaan. De `config.vapidPublicKey`-controle geldt alleen voor het web; native heeft een eigen vlag.
- `src/data/push-remote.js`: opslaan, wijzigen en verwijderen op `fcm_token` in plaats van `endpoint`.
- Het token verandert soms: bij elke start opnieuw registreren en bijwerken (de bestaande `syncReminder` doet dat al met een handtekening).
- Tikken op een melding: `pushNotificationActionPerformed` → `data.url` → de router, ook voor `#/stats?review=…`.
- Staat de app open, dan toon je geen melding (de gebruiker kijkt er al naar).
- In de app valt de Chrome-tekst over batterijbesparing weg of verandert hij ("Habit Builder" in plaats van "Chrome"); de uitleg hoort bij het toestel.
- **Dubbele melding:** wie de herinnering in de Chrome-PWA én in de app aanzet, krijgt er twee. Eerst een duidelijke tekst in de kaart in de app; bepalen of de server er iets aan moet doen na de spike (§8).

**Privacy:** `docs/PRIVACY.md` en de pagina in de app krijgen een regel over het FCM-token en dat Google dat kanaal is. De habitnamen blijven buiten de server.

Tests: zie §6.

### 4.3 Bijwerken vanuit de app (ca. 1 dag, de installatiestap +0,5)

- **Controle:** één keer per dag (en bij het openen van Instellingen) `GET https://api.github.com/repos/remcovolkers/habit-builder/releases/latest`, vergelijken met `App.getInfo().version`. De CSP in `index.html` krijgt `https://api.github.com` bij `connect-src`. Zonder authenticatie geldt een limiet van 60 aanvragen per uur per IP (?); een keer per dag is ruim genoeg.
- **Melding:** een balk net als de bestaande "Vernieuwen"-balk: "Nieuwe versie (1.3) staat klaar. Downloaden?" met "Later".
- **Installatie:** twee uitvoeringen, in deze volgorde:
  1. *Eenvoudig, zonder eigen code:* de APK-URL openen in de systeembrowser; Android downloadt, de gebruiker tikt op de download.
  2. *Doel:* onze eigen plugin downloadt met `DownloadManager` en start de installer (`REQUEST_INSTALL_PACKAGES`, een `FileProvider`). Android toont altijd zelf een bevestiging en vraagt de eerste keer om toestemming voor "installeren uit deze bron"; stil bijwerken bestaat niet.
- Android controleert zelf of de handtekening klopt en weigert een update met een andere sleutel.
- **Versies:** `versionName` = `appVersion` uit `src/config.js` (genormaliseerd naar `1.3.0`); `versionCode` = het buildnummer van de run (loopt altijd op). Een hotfix vraagt dus ook een nieuw `appVersion`, wat de werkwijze al vereist.
- **Releasebeleid (besloten):** elke release = nieuwe APK. Stoort het dat de app ook meldt bij een release zonder native wijziging, dan versmallen we dat later met een apart getal `nativeRevision` in de release.

### 4.4 Inloggen met Google in de app (ca. 1 dag)

Google weigert OAuth in een ingebedde WebView (`disallowed_useragent`, ✓ bekend beleid). De route die wel mag: de systeembrowser (Chrome Custom Tab).

- In de app: `signInWithOAuth({ provider: 'google', options: { redirectTo: 'habitbuilder://auth', skipBrowserRedirect: true } })` geeft een URL terug; die openen met de Browser-plugin.
- Android stuurt `habitbuilder://auth?code=…` terug naar de app (intent-filter); `App.addListener('appUrlOpen')` roept `exchangeCodeForSession(code)` aan en sluit de browser. De PKCE-verifier staat in de `localStorage` van dezelfde WebView.
- `signInWithGoogle` in `src/data/auth.js` krijgt deze tak; de webtak blijft ongemoeid. Inloggen met de e-mailcode werkt zonder wijziging.

---

## 5. Pipeline

`deploy.yml` verandert niet: de PWA gaat zoals nu uit, en een mislukte Android-build blokkeert de web-uitrol nooit.

**`android.yml`** (nieuw):

| Trigger | Wat |
|---|---|
| push naar `feature/android-app` en handmatig | debug-APK bouwen, als artifact bewaren (7 dagen); staan de secrets er, dan ook een getekende proef-APK met controle van de handtekening |
| push naar `main` | bouwen met de release-keystore, en een **GitHub Release** `v<appVersion>` maken met `habit-builder.apk` erbij; bestaat die release al, dan overslaan |

- Een release (geen artifact): vaste downloadlink `…/releases/latest/download/habit-builder.apk`, geen login nodig, verloopt niet.
- Stappen: `actions/checkout`, `setup-node` 24, `setup-java` 21 (Temurin), `npm ci`, `npx cap sync android`, Gradle (met cache) `assembleRelease`, getekend via `signingConfigs` die uit omgevingsvariabelen lezen.
- Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Permissie `contents: write` alleen in deze workflow.
- De Android-SDK staat op de `ubuntu-latest`-runner (?, controleren in de eerste run).
- `google-services.json` komt in de repo (geen geheim; de API-sleutel erin beperken we in de Firebase-console). De service-account-JSON komt **nooit** in de repo: `tests/guardrails.test.js` krijgt een controle.
- De derde stap van de release in [WERKWIJZE.md](WERKWIJZE.md) ("Tag: `git tag -a v1.3 …`") verandert: de workflow maakt de tag bij de release. Dat document gaat mee.

Een nadeel van losstaand: de app kan kort een nieuwere web-versie draaien dan de APK op de release-pagina. Dat is gewenst; de webkant is niet aan de APK gebonden.

---

## 6. Tests

**Automatisch** (`npm test`, in CI):
- FCM-verzending: JWT en tokenaanvraag (met een testsleutel), berichtopbouw, `UNREGISTERED` ruimt de rij op, een rij met een kapot token blokkeert de andere niet, Web Push en FCM naast elkaar in één run. Bij `tests/push/`.
- Migratie en RLS (PGlite, `tests/server/`): een gebruiker ziet en wijzigt alleen eigen FCM-rijen, de checkconstraint, de limiet van 10, oude webrijen blijven schrijfbaar.
- `reminders.js`: de native tak met een nagebootste `Capacitor`; de webtak blijft ongewijzigd.
- Update-controle als pure functie: versies vergelijken, het juiste bestand uit de release kiezen, geen aanvraag bij ontbrekend netwerk, hoogstens één per dag.
- Bewakers: geen sleutelbestand van een service-account in de repo; `index.html` laat alleen het ene extra adres toe.
- De debug-APK bouwt in CI.

**Op het toestel** (door jou; ik kan niet op een echt toestel testen). Een lijst die ik bij de spike aanlever, minstens:
1. Installeren, meldingstoestemming vragen, aanzetten, "Testmelding" en "Testmelding (15 s)" met de app gesloten en het scherm vergrendeld.
2. Tikken op de melding: opent Vandaag, en bij een review de juiste pagina.
3. Na een herstart van het toestel, en met batterijbesparing aan, komt de ochtendmelding toch.
4. Inloggen met Google en met de e-mailcode; uitloggen meldt het apparaat af.
5. Eerste start zonder internet, en daarna offline gebruiken.
6. Terugknop, schermrotatie (staat vast op staand), toetsenbord over invoervelden, donker en licht thema.
7. Update: een lagere versie installeren, een hogere release neerzetten, de melding zien, installeren, gegevens nog aanwezig.
8. Wat een gebruiker ziet bij een Play Protect-waarschuwing voor een app buiten de Play Store (?).

Lokaal en FCM: het ontwikkelproject heeft geen herinnering-functie (zie [DEV-OMGEVING.md](DEV-OMGEVING.md)). Voor de spike: `supabase functions serve send-reminders` tegen de lokale stack met `FCM_SERVICE_ACCOUNT` in een niet-gecommit `.env`, en de testknop in Instellingen. De cron is dan niet nodig.

---

## 7. Branches en oplevering

Eén branch, `feature/android-app` vanaf `develop`, met een commit per onderdeel (§4.1 tot §4.4). Een vroege draft-PR naar `develop`, zodat CI en de diff meegroeien. Release zoals altijd: `develop` → `main`, daarna draait `android.yml` op `main`. De widget (§9) gaat op een eigen branch erachteraan, tenzij hij toch bij dezelfde oplevering hoort.

Op productie (bij de release, niet eerder): migratie 0009, de nieuwe `send-reminders` plakken, `FCM_SERVICE_ACCOUNT` als secret.

---

## 8. De spike: wat eerst, en wat als het niet werkt

Volgorde, elk met een duidelijke ja/nee. Pas als 1 tot en met 3 werken, bouwen we de rest.

| # | Vraag | Als nee |
|---|---|---|
| 1 | Is `window.Capacitor.Plugins` beschikbaar in een pagina van `server.url`? | Meegeleverd bestand in `vendor/`, of (laatste redmiddel) de bestanden in de APK en een eigen oplossing voor origin en omgevingskeuze |
| 2 | Komt een FCM-notificatiebericht aan bij een afgesloten app, met schermvergrendeling? | Eerst Android-kanaal en prioriteit nakijken; anders data-bericht met een eigen native service |
| 3 | Werkt inloggen met Google via Custom Tab en deep link? | Alleen de e-mailcode in de app tot dat werkt |
| 4 | Werken de service worker en IndexedDB in de WebView, ook offline? | Eerste start vereist internet; offline-pagina |
| 5 | Kan de app zelf de APK downloaden en de installer starten? | Terugvallen op de systeembrowser (§4.3, optie 1) |
| 6 | Dubbele melding door Chrome-PWA en app: hoe erg, en is een server-oplossing nodig? | Tekst in de kaart; later `user_agent` bewaren en Android-webrijen overslaan als er een app-rij is |

Een spike levert dus: een werkende debug-APK op jouw telefoon die een testmelding ontvangt, plus de antwoorden op deze zes.

**Eerste uitkomsten** (proef-APK van 4.1, 27 oktober 2026, op een echte telefoon):

- De app laadt de live site; icoon en splash kloppen; inloggen met de e-mailcode werkt.
- De inhoud begon onder de statusbalk. Dat was te verwachten: de APK laadt de live site, en de ruimte onder de statusbalk (`.is-native` in `styles/base.css`) staat pas op Pages na de release. Te controleren met een debug-app tegen de dev-server (stap 4 in [ANDROID-SETUP.md](ANDROID-SETUP.md)). Blijft het mis, dan lossen we het native op.
- "Terug" werkte, maar zette de pagina bovenaan. Dat is geen Android-probleem: de router tekent elke pagina opnieuw en begon altijd bovenaan, ook in de browser. Opgelost voor alle gebruikers met een scrollgeheugen per geschiedenis-ingang (`src/ui/scroll-memory.js`, `src/router.js`), met een controle in een echte browser in `tools/layout-check.mjs`.

---

## 9. Widget (daarna, apart)

- Een widget is Android-code (Kotlin en XML) en kan de IndexedDB van de WebView niet lezen. De app schrijft een kleine samenvatting ("3 van 5 vandaag" plus de datum) naar Android-opslag; de widget leest die. Dat gaat via onze eigen plugin (dezelfde als voor de installatie), die de widget ook laat verversen.
- Alleen-lezen widget die de app opent bij een tik: ca. 2–3 dagen. Vinken vanuit de widget is veel meer werk: schrijven en synchroniseren zonder open app.
- Eigen branch `feature/android-widget`.

---

## 10. Wat het kost

| Onderdeel | Schatting werk | Wacht op |
|---|---|---|
| 4.1 Schil en pipeline | 1,5–2 dagen | keystore en secrets |
| 4.2 FCM | 2–3 dagen | Firebase, service-account, test op toestel |
| 4.3 Bijwerken | 1–1,5 dag | twee releases om het te zien werken |
| 4.4 Google-login | 1 dag | redirect-URL in Supabase |
| **Totaal 4.1 tot 4.4** | ruim een week (kalendertijd; mijn eigen uren veel minder) | jouw testrondes |
| 9. Widget (alleen-lezen) | 2–3 dagen | |

Geld: Firebase en GitHub Releases kosten niets (?, prijspagina's niet opnieuw gecontroleerd); een Play Store-account is **niet** nodig, want we leveren zelf uit.

---

## 11. Open vragen

1. De Play Store blijft een mogelijke latere stap (dan 12 testers gedurende 14 dagen, zie "Feature 4"); nu niet.
2. Hoe lang blijven we Web Push voor Android-Chrome ondersteunen naast de app?
3. iOS: buiten dit plan. De PWA op het beginscherm blijft daar de route.
