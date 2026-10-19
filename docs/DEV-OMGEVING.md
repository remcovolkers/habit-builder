# Ontwikkelomgeving: een eigen testdatabase, lokaal

Tot nu toe is er **één** Supabase-project en dat is productie: wie inlogt, praat met de echte gegevens. Voor nieuwe features (vooral de sociale, waar je minstens twee accounts nodig hebt) is dat te riskant. De gratis Supabase staat maar twee projecten per persoon toe, dus draait de testdatabase **lokaal op je eigen computer**, in Docker. Dat is gratis, heeft geen limiet en je kunt hem in één commando leegmaken.

## Hoe de app kiest

De app kijkt naar waar hij draait (`src/config.js`, functie `pickEnvironment`):

| Waar | Database |
|---|---|
| `remcovolkers.github.io` (de productie-site) | **productie** (Supabase in de cloud) |
| `localhost`, het IP-adres van je computer, alles anders | **lokaal** (`http://<die host>:54321`) |

Gevolgen:
- Een feature-versie die je lokaal draait kan de echte gegevens **niet** raken.
- Productie en lokaal hebben een eigen opslag in de browser (verschillende adressen), dus de gegevens lopen nooit door elkaar.
- Onder in Instellingen staat in de testomgeving **"· testomgeving"** achter het versienummer.
- De ochtendherinnering (Web Push) bestaat lokaal niet: de knop is er verborgen. De sociale feature heeft hem niet nodig.
- De dev-server (`npm run serve`) laat in zijn CSP ook het lokale adres toe. Het bestand `index.html` en dus productie blijven strak.

## Eenmalig: Docker Desktop

1. Installeer Docker Desktop (https://www.docker.com/products/docker-desktop/), kies de **WSL2**-backend en herstart als dat gevraagd wordt.
2. **Start Docker Desktop** en wacht tot onderin links "Engine running" staat. De engine moet draaien voordat het volgende werkt.
3. Open daarna een **nieuwe terminal** (of herstart VS Code), anders kent die het `docker`-commando nog niet.

## De lokale database starten

In de projectmap:

```
npm run db:start      # eerste keer: downloadt de images (± 2–3 GB), daarna in seconden
npm run db:status     # toont de adressen en sleutels
```

`db:start` draait de database, de API en het inloggen, en past alle migraties uit `supabase/migrations/` automatisch toe. Er draait geen realtime, opslag of edge-functions (de app gebruikt ze niet).

Handig:

| Commando | Doet |
|---|---|
| `npm run db:status` | adressen en sleutels |
| `npm run db:check-browser` | de sociale schermen in een echte browser (Edge, Windows) tegen de lokale database: alle stromen, thema's, desktop, grote tekst, offline (maakt schermafbeeldingen) |
| `npm run db:check-app` | controleert de hele keten van de app (echte SDK, data-laag en besturing) met drie testaccounts |
| `npm run db:check-social` | controleert de sociale functies via de echte API (maakt en ruimt testaccounts op) |
| `npm run db:reset` | leegmaken en alle migraties opnieuw toepassen (schone lei) |
| `npm run db:stop` | stoppen (de gegevens blijven bewaard) |
| http://localhost:54323 | **Studio**: tabellen bekijken en SQL draaien |
| http://localhost:54324 | **het mailvenster**: hier staan de inlogcodes |

De **publishable key** uit `db:status` is voor de lokale stack altijd dezelfde en publiek; ze staat in `src/config.js`.

## Proberen

```
npm run serve
```

Open http://localhost:5173/ → Instellingen → **Inloggen of account maken**, vul een e-mailadres in (bijvoorbeeld `test1@example.com`; er wordt niets echt verstuurd) en haal de **code uit het mailvenster** op http://localhost:54324. Onderaan Instellingen staat "testomgeving".

**Twee accounts tegelijk** (voor vrienden en ranglijst): gebruik een tweede browserprofiel of een privévenster, en log in met `test2@example.com`. Elk heeft een eigen sessie. Een derde account voor een groep van drie: `test3@example.com`.

**Op je telefoon** (zelfde wifi): `ipconfig` geeft het IPv4-adres van je computer, bijvoorbeeld `192.168.1.20`; open `http://192.168.1.20:5173/`. Windows vraagt eenmalig om toestemming voor de firewall; sta het toe voor privénetwerken. De poorten 5173 (app) en 54321 (database) moeten bereikbaar zijn. Via gewoon http werken de service worker en meldingen niet; inloggen, synchroniseren en de sociale functies wel.

## Testaccounts: een gevuld en een leeg

Voor functioneel testen zonder alles zelf aan te maken:

```
npm run dev:seed          # maakt (of herstelt) alle accounts, ook de beheerder
npm run dev:admin         # alleen het beheerdersaccount (opnieuw), zonder de andere accounts aan te raken
npm run dev:code -- stub  # toont een inlogcode voor stub@example.com
npm run dev:code -- leeg  # idem voor leeg@example.com
npm run dev:code -- beheer  # idem voor beheer@example.com
```

| Account | Inhoud |
|---|---|
| `leeg@example.com` | niets: het scherm van een nieuwe gebruiker (lege Vandaag, sjablonen, naam vragen) |
| `beheer@example.com` | de **beheerder** (staat in `app_admins`): op de computer staat het tabje **Feedback** in de zijbalk, met vier testberichten (een van een ingelogde afzender met mailadres, drie anoniem, een afgehandeld; herkenbaar aan versie "test"). Beheerder maken kan alleen via SQL; het script doet dat met `docker exec` in de lokale database (`supabase_db_habit-builder`) |
| `stub@example.com` | veertien habits, één voor elke toestand: ingeburgerd te bevestigen, opbouw, opstart, gemiste werkdag vorige week, **zeldzaam en stil** ("Even kijken"), **te laat**, stapel, ingeburgerd in onderhoud, gepauzeerd, gearchiveerd, gepland, een al beantwoorde stille taak, een taak die klaar is voor een proef zonder app (Tuin); plus teller, automatisme-cijfer en twee reviews. Na het seeden staat per habit wat je ervan mag verwachten |

Het stub-account heeft ook **vrienden** (sociaal staat aan, gebruikersnaam `@stub`): Anna, Bram en Cor staan op de ranglijst, Fien is vriend maar deed 10 dagen niets (dus niet op de ranglijst), Dora heeft een verzoek gestuurd en aan Eef heeft de stub er een gestuurd. Elke vriend is een eigen account (`vriend-anna@example.com`, enzovoort; `npm run dev:code -- anna` geeft de code) en blijft tussen twee seeds bestaan. `dev:seed` toont ook een **uitnodigingslink** van de stub, om de flow voor een nieuwe gebruiker mee te proberen.

De datums zijn relatief aan vandaag: draai `dev:seed` opnieuw voor verse gegevens (het account wordt dan weggegooid en opnieuw gevuld). Het script werkt alleen op de lokale stack (vaste adressen op 127.0.0.1) en raakt nooit productie. Inloggen: http://localhost:5173/ → Instellingen → Inloggen met het e-mailadres; de code haalt `dev:code` voor je uit het mailvenster. Gebruik per account een eigen browserprofiel of privévenster, want de app bewaart zijn gegevens ook in de browser. Staat je lokale database op een oudere migratie, dan meldt het script dat; `npm run db:reset` lost het op. De lokale stack laat 100 mails per uur toe en elke seed gebruikt er ruim tien; wacht bij een melding over een limiet even.

De inhoud staat in `tools/lib/stub-data.mjs`; `tests/dev-stub.test.js` bewaakt dat elke toestand erin zit, op elke dag van het jaar.

## Controleren dat het goed staat

GitHub draait dezelfde controles in de workflow **Integratie** (lokale Supabase in Docker plus een echte browser) op elke push naar `develop` en `feature/**`.

`node tools/live-check.mjs --dev` controleert de lokale database (migraties aanwezig, niet-ingelogde bezoekers kunnen niets lezen of schrijven).

## Een wijziging aan de database uitrollen

1. Schrijf de migratie (`supabase/migrations/000N_….sql`, **achterwaarts compatibel**, zie WERKWIJZE). De lokale database pakt hem op met `npm run db:reset` (of bij de eerstvolgende `db:start` op een schone database).
2. Draai de tests: `npm test` bevat de server-tests op een echte Postgres (PGlite, `tests/server/`; `npm ci` installeert het). Voor een wijziging aan de sociale functies draait ook `npm run db:check-social` tegen de lokale Supabase (de echte API, 96 controles). `supabase/tests/rls-check.mjs` toetst de oudere tabellen (0001 en 0002).
3. Test de app lokaal met twee accounts.
4. Pas bij de release plak je dezelfde migratie in het **productieproject** (Supabase-dashboard → SQL Editor), vóórdat de nieuwe app uitgerold wordt.

## Verschillen met productie (goed om te weten)

- Inloggen met Google is lokaal niet ingesteld; de e-mailcode is genoeg.
- Het mailvenster vangt alle mails op; er gaat nooit iets echt de deur uit.
- Gebruikers, e-mailadressen en gegevens bestaan alleen op jouw computer.
- Productie draait Postgres in de cloud met jouw SMTP en rate limits; lokaal zijn die ruimer. Gedrag rond maillimieten test je dus alleen op productie.
