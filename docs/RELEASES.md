# Releases

Wat er in elke release zat, welke servermigraties of instellingen erbij hoorden, en waar je op moest letten bij terugdraaien. De nieuwste staat bovenaan. Dit document vervangt de losse bestanden `RELEASE-v1.1.md` t/m `RELEASE-v1.5.1.md` (de stap-voor-stap draaiboeken van afgeronde releases zijn weggehaald; wie ze wil zien: `git log -- docs/RELEASE-v1.5.1.md`).

Hoe je een release uitrolt staat in [WERKWIJZE.md](WERKWIJZE.md) (branches, tests, terugdraaien) en hoe je een wijziging aan de server veilig doet in dezelfde werkwijze ("Wijzigingen aan de database zijn extra voorzichtig"). Op een telefoon proberen: [HOW-TO-TEST.md](HOW-TO-TEST.md).

## Overzicht

| Versie | Waar het om ging | Servermigratie of -instelling | Nieuwe APK |
|---|---|---|---|
| [Zonder versienummer (na 1.5.1)](#zonder-versienummer-na-151) | dagdeel slepen, hoe ging je dag, Vandaag-knoppen, agenda ⋯, uitbouwen en prestaties | `0011` (zie onder) | nee |
| [1.5.1](#151-afspraken-uit-je-agenda-afvinken) | afspraken uit je agenda afvinken, naam van de agenda | geen | ja |
| [1.5.0](#150-je-agenda-op-vandaag-en-een-dag-overslaan) | je agenda op Vandaag, een dag overslaan | `0010`, functie `calendar-feed` | ja |
| [1.4.1](#141-de-widget-alleen-nog-weergave) | de widget alleen nog weergave | geen | ja |
| [1.4](#14-de-widget-voor-vandaag) | de widget voor Vandaag | geen | ja |
| [1.3](#13-de-android-app) | de Android-app | `0009`, `send-reminders`, secret, redirect-URL | ja |
| [1.2](#12-uitnodigen-prestaties-onboarding-en-meerdere-dagdelen) | uitnodigen, prestaties, onboarding, meerdere dagdelen, flexibele taken, feedbackhub | `0004` t/m `0007`, `send-reminders` | nee |
| [1.1](#11-vrienden-en-ranglijst) | vrienden en ranglijst | `0003` | nee |

Een versienummer in `src/config.js` (`appVersion`) laat de workflow **Android-app** een getekende APK bouwen en een GitHub Release maken (`v<appVersion>`, zie [ANDROID-APP.md](ANDROID-APP.md)). De Android-app laadt de live site: een wijziging aan alleen de webkant bereikt de app-gebruikers via "Vernieuwen", zonder nieuwe APK. Uitbreiding en onderhoud van wat er al was krijgt daarom geen nieuw versienummer.

## Terugdraaien (voor alle releases)

- **De app:** een pull request die de merge terugdraait (`git revert -m 1 <merge-commit>`), zoals in WERKWIJZE. Gebruikers krijgen de oude versie na "Vernieuwen".
- **Een gepubliceerde GitHub Release** blijft staan; verwijder die zo nodig met de hand, anders blijft de app melden dat die versie klaarstaat.
- **De database:** niet nodig. Alle migraties breiden alleen uit en kunnen opnieuw worden uitgevoerd; een oudere app negeert wat hij niet kent.
- Gaat alleen een Android-onderdeel mis, dan is dat een kleine hotfix-release (`hotfix/<naam>` naar `main`, met de versie op `x.y.1`); de webkant blijft werken.

---

## Zonder versienummer (na 1.5.1)

Op `main` (en dus live) zonder nieuwe versie, omdat het uitbreiding en onderhoud is:

| Onderdeel | Toelichting |
|---|---|
| Een taak voor één dag naar een ander dagdeel slepen, en "Hoe ging je dag?" | [DAGDEEL-EN-DAGREFLECTIE.md](DAGDEEL-EN-DAGREFLECTIE.md) |
| De knoppen onder de dagdelen op Vandaag (Iets inplannen, Deze dag niet meetellen) en de dagnotitie als tekst | [DAG-OVERSLAAN.md](DAG-OVERSLAAN.md), [LOSSE-AFSPRAKEN.md](LOSSE-AFSPRAKEN.md) |
| Een ⋯ bij afspraken uit je agenda met "Niet tonen" | [AGENDA.md](AGENDA.md) |

**Server:** migratie `supabase/migrations/0011_day_moves_reflections.sql` voegt de collecties `dayMoves` en `dayReflections` toe. Zonder deze migratie op productie weigert de server die records en blijven ze alleen op het toestel staan. **Controleer of 0011 op het productieproject is uitgevoerd** (SQL Editor, de migratie opnieuw uitvoeren kan geen kwaad).

**In `develop`, nog niet in `main`:** de feedbackronde van november 2026: uitbouwen (een doel met treden), prestaties die kloppen voor zeldzame ritmes, reeksen in weken en maanden, prestaties per habit, herijken, en een review die pas klaarstaat na drie dagen gebruik. Zie [FEEDBACKRONDE-2026-11.md](FEEDBACKRONDE-2026-11.md). Geen servermigratie en geen versieverhoging. Bij de eerste start na de update worden mijlpalen eenmalig herijkt: wie een `days_N`-prestatie op één vinkje bij een zeldzaam ritme had, verliest die.

## 1.5.1: afspraken uit je agenda afvinken

Een kleine aanvulling op 1.5.0, na het proberen met een gedeelde agenda. Ontwerp: [AGENDA.md](AGENDA.md).

| Onderdeel | Toelichting |
|---|---|
| **Afvinken** | Een afspraak uit je agenda heeft een vinkje, met "Ongedaan maken". Het blijft op je toestel (geen sync) en telt nergens mee. Een afspraak blijft afgevinkt als hij de volgende keer uit de andere bron komt. Op de dag zelf en tot 14 dagen terug |
| **De naam van de agenda** | "14:30–15:30 · Agenda · Mel": de naam van de agenda waar de afspraak uit komt. Van de telefoon is dat de naam uit je agenda-app (een gedeelde agenda heeft zijn eigen naam), uit het Google-adres de naam van die agenda |

Wat je afvinkt staat als een onleesbaar nummer op je toestel, niet met de titel van de afspraak; uitloggen wist het ([PRIVACY.md](PRIVACY.md)). De APK was nodig voor de naam van de agenda van de telefoon (de plugin geeft die nu mee); afvinken en de naam uit de Google-feed werken via de webkant. Geen servermigratie, geen nieuwe rechten.

## 1.5.0: je agenda op Vandaag, en een dag overslaan

Ontwerp: [AGENDA.md](AGENDA.md) en [DAG-OVERSLAAN.md](DAG-OVERSLAAN.md).

| Onderdeel | Toelichting |
|---|---|
| **Agenda op Vandaag** | Afspraken staan op de dag zelf in het dagdeel van hun begintijd, alleen om te lezen en zonder mee te tellen. Twee manieren, los van elkaar: het geheime iCal-adres van Google Agenda (met een account), en de agenda van je telefoon (alleen de Android-app, zonder account) |
| **Een dag overslaan** | Alle habits van een dag (of een paar dagen) in één keer overslaan met een reden, zonder dat het als gemist telt |
| Knoppen breken lange woorden af | Instellingen liep op 320 px met 200% tekst 4 px zijwaarts door "Privacyverklaring" |

Nieuw op de telefoon: het recht **Agenda lezen** (`READ_CALENDAR`, alleen lezen). Android vraagt er pas om bij **Agenda van deze telefoon gebruiken**.

**Server, vóór de release (de volgorde telt, alles breidt alleen uit):**

1. Migratie `supabase/migrations/0010_skipdays.sql` in de SQL Editor (voor "dag overslaan"). Zonder deze stap weigert de server de overgeslagen dagen en blijven ze alleen op het toestel staan.
2. Edge Function **calendar-feed**: Supabase → Edge Functions → Deploy a new function → Via editor, plak `supabase/functions/calendar-feed/index.ts`, zet **Verify JWT** uit. Geen secrets nodig. Zonder deze functie zegt Instellingen bij het koppelen "De agenda-koppeling is nog niet klaargezet op de server" en werkt de rest gewoon.
3. Optioneel: laat de Android-code vooraf compileren via Actions → Android-app → Run workflow op de releasebranch (een debug-APK, zonder iets uit te rollen).

Mislukt de Android-build na de merge, dan is er nog geen release gemaakt; herstel de fout en draai de workflow opnieuw, de versie hoeft dan niet omhoog.

## 1.4.1: de widget alleen nog weergave

Na een paar weken gebruik van de widget uit 1.4. Ontwerp: [ANDROID-WIDGET.md](ANDROID-WIDGET.md). De widget zit alleen in de APK; de webkant verandert niet.

| Onderdeel | Toelichting |
|---|---|
| De widget is alleen weergave | Een tik op een rij, een dagdeel of de voortgang opent de app; scrollen laat de rest van de lijst zien |
| Geen − en + meer bij tellers | Een teller toont titel en stand ("3 / 8 glazen"); afvinken en tellen doe je in de app |
| Volgorde Ochtend, Middag, Overdag, Avond | Op Vandaag in de app verandert niets |

Geen servermigratie en geen nieuwe secrets. Een tik in de widget van vóór de update die de app nog niet had verwerkt, gaat niet verloren: de app verwerkt de wachtrij nog bij het openen.

## 1.4: de widget voor Vandaag

Ontwerp: [ANDROID-WIDGET.md](ANDROID-WIDGET.md). De widget, de opschoning van de app en de tijdzone stonden al in `main`; deze release zette de versie op `1.4`, zodat een nieuwe APK ontstond (zonder nieuwe versie slaat de workflow dat over, en bevat de APK van 1.3.0 de widget niet).

| Onderdeel | Toelichting |
|---|---|
| Widget voor het startscherm met de lijst van vandaag, vinkjes en tellers | Alleen in de APK; de webkant werkt zichzelf bij |
| Dagdelen als bovenste regel, een gedaan dagdeel verdwijnt, voortgang rechtsboven | |
| Kleuren van je thema, en een icoon voor "niet gesynct" | |
| Geen installatie-uitleg in de app, tijdzone automatisch, Instellingen opgeschoond | Al live via de site |

Geen servermigratie en geen nieuwe secrets: de widget praat niet met de server, alleen met de app.

## 1.3: de Android-app

Het plan en de keuzes: [ANDROID-APP.md](ANDROID-APP.md). Instellen en proberen: [ANDROID-SETUP.md](ANDROID-SETUP.md).

| Onderdeel | Waar uitgelegd |
|---|---|
| Een Android-app (Capacitor-schil om de PWA, toont de live site) die je als APK installeert | ANDROID-APP.md §4.1 |
| Ochtendherinnering via Google (FCM) in plaats van Chrome, met een eigen kanaal en icoon | §4.2 |
| In de app melden dat er een nieuwe versie klaarstaat en die downloaden | §4.3 |
| Inloggen met Google in de app, via de systeembrowser | §4.4 |
| Een pipeline die bij elke release een getekende APK in een GitHub Release zet; de PWA gaat zoals altijd uit | `.github/workflows/android.yml` |
| Servermigratie `0009_native_push.sql` en een uitgebouwde `send-reminders` | [DATAMODEL.md](DATAMODEL.md), [PRIVACY.md](PRIVACY.md) |

De PWA in Chrome en op iOS veranderde niet, op één regel in de CSP na (`https://api.github.com`, voor de updatecontrole in de app).

**Server, vóór de merge naar `main` (de volgorde telt: de nieuwe functie kan app-toestellen aan, de migratie maakt het veld daarvoor, en pas daarna komt er een app die het gebruikt):**

1. Migratie `0009_native_push.sql` in de SQL Editor (en eerst `0008_appointments.sql` als die er nog niet staat).
2. Edge Function **send-reminders** vervangen door `supabase/functions/send-reminders/index.ts`.
3. Secret `FCM_SERVICE_ACCOUNT` (waarde via `node tools/fcm-secret.mjs C:/pad/naar/je-sleutel.json | clip`). De VAPID-secrets blijven zoals ze zijn.
4. Authentication → URL Configuration → Redirect URLs: `habitbuilder://auth`. Zonder dit weigert Supabase de terugkeer van Google in de app.

**Weten:** elke release met een versienummer is een nieuwe APK, ook als er niets native verandert. De app staat niet in de Play Store; een nieuwe versie installeer je over de oude heen (zelfde sleutel). **Bewaar de keystore** ([ANDROID-SETUP.md](ANDROID-SETUP.md), stap 1): zonder die sleutel kan geen update meer over de bestaande app heen. Staat de herinnering ook in Chrome aan, dan krijg je twee meldingen; zet hem in Chrome uit.

## 1.2: uitnodigen, prestaties, onboarding en meerdere dagdelen

| Onderdeel | Waar uitgelegd |
|---|---|
| Uitnodigen voor nieuwe gebruikers, vrienden inzien | [ITERATIE-1.2.md](ITERATIE-1.2.md) §1–§3 |
| Prestaties: 22 nieuwe, voortgang per groep, aantikken voor uitleg | ITERATIE-1.2.md §5 |
| Iconenset en iconenkiezer | ITERATIE-1.2.md §6 |
| Aandacht voor taken die blijven liggen, zeldzame taken | [PLAN.md](PLAN.md) §4.9 |
| Desktop-schil met kolommen die zelf scrollen | [SCROLLEN.md](SCROLLEN.md) |
| **Onboarding** (stijl kiezen, een dag, de app installeren, de eerste habit) en **Zo werkt het** | [ONBOARDING.md](ONBOARDING.md) |
| **Meerdere dagdelen** per habit (tandenpoetsen 's ochtends en 's avonds) | [DATAMODEL.md](DATAMODEL.md) |
| **Flexibele taken**: compacte stapel, "Dreigt te falen", Plan je week, verbeterd Habits-scherm | [FLEXIBELE-TAKEN.md](FLEXIBELE-TAKEN.md) |
| **Feedbackhub**: feedback geven (ook zonder account) en een tabje Feedback voor de beheerder | [FEEDBACK.md](FEEDBACK.md) |
| Teller voor de ontwikkelaar (aantal gebruikers, vandaag actief) | migratie `0006_dev_usage.sql` |

**Server, vóór de uitrol (alles alleen uitbreiding en opnieuw uit te voeren), in volgorde:** `0004_reasons.sql` (redenen bij taken die blijven liggen), `0005_invites.sql` (uitnodigen), `0006_dev_usage.sql` (de teller), `0007_feedback.sql` (de feedbackhub; vereist 0006; zonder deze migratie zegt de feedbackknop "Feedback versturen kan nog niet"). Daarna jezelf als beheerder toevoegen, anders blijven de teller en het tabje Feedback verborgen:

```sql
insert into public.app_admins (user_id) select id from auth.users where email = 'jouw-adres';
```

De Edge Function `send-reminders` opnieuw plakken (de ochtendmelding is aangepast; zie [M7-SETUP.md](M7-SETUP.md)) en `node tools/live-check.mjs` draaien (die kent 0006 en 0007 niet: test de teller en de feedback zelf). Meerdere dagdelen vragen **geen** migratie: het zit in de gegevens van een habit en een check-in (`dayparts`, `parts`).

**Weten:**
- **Terugdraaien bij meerdere dagdelen:** een habit die je op 1.2 met meerdere dagdelen maakt, ziet een oudere app als een habit met alleen het eerste dagdeel; een dag die deels is afgevinkt staat daar als "deels". Er gaat niets verloren, maar het kan er vreemd uitzien tot je weer op 1.2 zit.
- Wie al op de app zat, ziet de onboarding niet (hij verschijnt alleen voor wie nog geen habits heeft en hem niet eerder zag, op dat apparaat) en krijgt wel de nieuwe prestaties in één viering.
- De teller telt alleen accounts: wie de app alleen lokaal gebruikt, staat niet op de server.

## 1.1: vrienden en ranglijst

Wat de feature doet: [SOCIAAL.md](SOCIAAL.md).

**Server, vóór de uitrol:** migratie `supabase/migrations/0003_social.sql` (alleen uitbreiding: nieuwe tabellen en functies; de huidige app merkt er niets van; opnieuw uitvoeren kan geen kwaad), daarna `node tools/live-check.mjs`: alle regels moeten **OK** zijn, inclusief de regels "vrienden: …". Zonder deze stap rolt de app wel uit, maar blijft hij stil op "Nog niet beschikbaar": er breekt niets.

**Weten:**
- **Vrienden zien je naam.** Gebruikers die al een naam hebben ingesteld, behouden die; wie nog geen naam heeft, vult hem in bij het meedoen.
- **Zet je sociaal uit, dan blijven je gebruikersnaam en vriendschappen bewaard** (onzichtbaar), tot je je account verwijdert. Dat staat zo in de privacyverklaring. Een knop "alles wissen" zonder je account te verwijderen is een vervolgstap.
- **Sociaal uitzetten voor één gebruiker** kan zonder terug te draaien (Beheren → Sociaal uitzetten). **Gebruikersnamen die je niet wilt:** `insert into public.social_blocked_terms (term) values ('woord');`.
- **Knoppen om aan te draaien als de ranglijst scheef voelt:** zie [SOCIAAL.md §4.7](SOCIAAL.md) (de bedragen staan in `src/domain/constants.js`).
