# Release 1.5.0: je agenda op Vandaag, en een dag overslaan

Twee nieuwe dingen sinds [RELEASE-v1.4.1.md](RELEASE-v1.4.1.md). Deze release zet de versie op `1.5.0`, zodat de workflow **Android-app** een nieuwe getekende APK bouwt en de GitHub Release **v1.5.0** maakt. De APK is nodig voor de agenda van de telefoon (een nieuwe plugin en een nieuw recht); de rest werkt via de webkant.

Ontwerp: [AGENDA.md](AGENDA.md) en [DAG-OVERSLAAN.md](DAG-OVERSLAAN.md).

## Wat er in zit

| Onderdeel | Toelichting |
|---|---|
| **Agenda op Vandaag** | Afspraken uit je agenda staan op de dag zelf in het dagdeel van hun begintijd, zonder mee te tellen. Twee manieren, los van elkaar: het geheime iCal-adres van Google Agenda (met een account), en de agenda van je telefoon (alleen de Android-app, zonder account) |
| Afvinken en de naam van de agenda | Een afspraak uit je agenda kun je afvinken (blijft op het toestel, telt nergens mee), en achter het woord Agenda staat de naam van de agenda waar hij uit komt, zodat je in een gedeelde agenda ziet van wie een afspraak is |
| **Een dag overslaan** | Alle habits van een dag (of een paar dagen) in één keer overslaan met een reden, zonder dat het als gemist telt |
| Knoppen breken lange woorden af | Instellingen liep op 320 px met 200% tekst 4 px zijwaarts door "Privacyverklaring" |

Nieuw op de telefoon: het recht **Agenda lezen** (`READ_CALENDAR`, alleen lezen). Android vraagt er pas om als je **Agenda van deze telefoon gebruiken** aantikt.

## 1. Vóór de release (productie)

De volgorde telt, zie [WERKWIJZE.md](WERKWIJZE.md). Alles breidt alleen uit; oudere appversies merken er niets van.

1. **Migratie** (voor "dag overslaan"): Supabase → **SQL Editor → New query** → plak `supabase/migrations/0010_skipdays.sql` → **Run**. Opnieuw uitvoeren kan geen kwaad. Zonder deze stap weigert de server de overgeslagen dagen en blijven ze alleen op het toestel staan.
2. **Edge Function** (voor de agenda via Google): Supabase → **Edge Functions → Deploy a new function → Via editor**, naam **calendar-feed**, plak `supabase/functions/calendar-feed/index.ts`, zet **Verify JWT** uit → **Deploy**. Geen secrets nodig. Sla je dit over, dan zegt Instellingen bij het koppelen "De agenda-koppeling is nog niet klaargezet op de server" en werkt de rest gewoon.
3. **Controleer vooraf of de Android-code compileert** (optioneel, maar verstandig: de Java van de agenda-plugin is nog nooit gebouwd): GitHub → **Actions → Android-app → Run workflow** → kies de branch `release/1.5.0`. Dat bouwt een debug-APK, zonder iets uit te rollen. Een fout in de code zie je daar, niet pas op `main`.

## 2. De release

1. Pull request `release/1.5.0` → `main`; wacht tot de tests groen zijn; merge. De uitrol van de webkant start vanzelf.
2. Controleer onder **Actions** dat **Test & deploy** en **Android-app** groen zijn, en onder **Releases** dat **v1.5.0** `habit-builder.apk` heeft. Mislukt de Android-build, dan is er nog geen release gemaakt; herstel de fout en draai de workflow opnieuw, de versie hoeft dan niet omhoog.
3. Zet daarna `main` terug in `develop`.

## 3. Na de release (jij, op je telefoon)

1. **Updatemelding:** open de app met versie 1.4.1. Binnen een dag, of via Instellingen met ontwikkelaarsopties → "Controleer op een nieuwe app-versie", moet "Nieuwe versie (1.5.0) staat klaar" verschijnen. Installeer de APK over de oude heen.
2. **Agenda van de telefoon:** Instellingen → **Agenda** → **Agenda van deze telefoon gebruiken**. Android vraagt toestemming. Daarna staan de afspraken van vandaag op Vandaag, met de naam van de agenda erachter (ook die van een gedeelde agenda). Vink er een af. Het hele draaiboek staat in HOW-TO-TEST §T (stap 11 tot 14).
3. **Google Agenda:** log in, plak het geheime iCal-adres (zie §T stap 2) en controleer dat de afspraken er staan. Staat dezelfde agenda ook op je telefoon, dan komt elke afspraak één keer voor.
4. **Een dag overslaan:** onder de dagdelen op Vandaag staat de knop; zie DAG-OVERSLAAN.md.

## Terugdraaien

Een pull request die de merge terugdraait (`git revert -m 1 <merge-commit>`). De migratie en de functie kunnen blijven staan: ze breiden alleen uit. Een al gepubliceerde GitHub Release blijft staan; verwijder die zo nodig met de hand, anders blijft de app melden dat 1.5.0 klaarstaat.
