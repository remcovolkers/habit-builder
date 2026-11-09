# Agenda: afspraken uit je agenda op Vandaag

Status: **gebouwd en uitgerold** (1.5.0 en 1.5.1, zie [RELEASES.md](RELEASES.md#150-je-agenda-op-vandaag-en-een-dag-overslaan)) · opgesteld 2026-11-02 · bouwt voort op [LOSSE-AFSPRAKEN.md](LOSSE-AFSPRAKEN.md) (Vandaag, dagdelen) · werkwijze: [WERKWIJZE.md](WERKWIJZE.md) · privacy: [PRIVACY.md](PRIVACY.md)

## Het probleem

Wat er vandaag op je lijst staat is meer dan je habits: de tandarts om half drie, de verjaardag, de vergadering. Dat staat in je agenda, en wie Vandaag opent om te zien hoe de dag eruitziet, opent daarna nog een tweede app. De app laat je agenda daarom op de dag zelf zien, naast je habits.

## Wat het wel en niet is

| Wel | Niet |
|---|---|
| Afspraken uit je agenda op de dag zelf, in het dagdeel van hun begintijd (een hele dag bij "Overdag"), met de naam van de agenda waar ze uit komen. Je kunt ze **afvinken** (bijvoorbeeld om te onthouden dat je Mel nog moest vragen hoe het ging) | Een agenda-app. Je kunt er niets aanmaken, wijzigen of verwijderen; dat doe je in je agenda zelf |
| Twee manieren om te koppelen, los van elkaar te gebruiken: het geheime iCal-adres van je Google Agenda, en de agenda van je telefoon (Android-app) | Inloggen met Google om je agenda te lezen (zie A2) |
| Een kaart in de stijl van de andere, met de tijd vooraan, het woord **Agenda** en de naam van de agenda ("14:30–15:30 · Agenda · Mel"), met een vinkje en een ⋯ met alleen **Niet tonen** (voor een afspraak waar je niets mee moet) | Iets dat meetelt: niet in de ring, de felicitatie, de punten, de prestaties, de aandacht, de weekstrook, de ranglijst of de ochtendmelding |

**De grens:** een afspraak die je in de app maakt (zie LOSSE-AFSPRAKEN) is van jou: je kunt hem wijzigen, verwijderen en afvinken, en hij gaat mee in de sync. Een afspraak uit je agenda is van je agenda: je kunt hem alleen afvinken of niet meer tonen, en dat blijft op dit toestel.

## Hoe het werkt

```
Google Agenda ──(geheim iCal-adres)──▶ Edge Function calendar-feed ──(tekst)──▶ app: leest, rekent herhalingen uit, bewaart op dit toestel
telefoon-agenda ──(READ_CALENDAR)──▶ plugin DeviceCalendar (Android) ──(afspraken)──▶ app
                                                                                          └▶ samenvoegen, per dag, in het dagdeel op Vandaag
```

| Onderdeel | Wat |
|---|---|
| [ical.js](../src/domain/ical.js) | Leest iCalendar (RFC 5545), puur en getest: tijdzones en zomertijd, hele dagen en afspraken over middernacht, herhalingen (DAILY, WEEKLY, MONTHLY en YEARLY met INTERVAL, COUNT, UNTIL, BYDAY met ordinalen, BYMONTHDAY, BYMONTH, BYSETPOS), uitzonderingen (EXDATE), los gewijzigde keren (RECURRENCE-ID) en geannuleerde afspraken |
| [agenda.js](../src/domain/agenda.js) | Welk adres mag, welk dagdeel (tot 12:00 ochtend, tot 18:00 middag, daarna avond; een hele dag is "Overdag"), twee bronnen samenvoegen, wanneer de bewaarde agenda verouderd is, en de omzetting van wat de telefoon geeft |
| [calendar-feed/index.ts](../supabase/functions/calendar-feed/index.ts) | Edge Function die het adres bij Google ophaalt (zie "De functie") |
| [ui/agenda.js](../src/ui/agenda.js) | Koppelen, bewaren op dit toestel, verversen en wissen. Elke bron is los te gebruiken |
| [agenda-connect.js](../src/ui/components/agenda-connect.js) | De kaart **Agenda** in Instellingen |
| [agenda-card.js](../src/ui/components/agenda-card.js) | De kaart op Vandaag, met het vinkje en de naam van de agenda |
| [DeviceCalendarPlugin.java](../android/app/src/main/java/io/github/remcovolkers/habitbuilder/calendar/DeviceCalendarPlugin.java) | Leest de agenda van de telefoon (`CalendarContract.Instances`): Android rekent herhalingen zelf uit. Geeft per afspraak ook de naam van de agenda mee (`CALENDAR_DISPLAY_NAME`). Slaat afgewezen, geannuleerde en verborgen afspraken over |

**Verversen.** De app haalt de agenda op bij het openen, als je terugkomt in de app en elke vijf minuten zolang hij openstaat, maar alleen als wat hij heeft ouder is dan een half uur. **Nu verversen** in Instellingen haalt hem meteen op. Google ververst zijn eigen feed een paar keer per dag, dus een afspraak die je net maakte kan er een tijd over doen om hier te verschijnen. De agenda van de telefoon is steeds actueel. Zonder internet blijft de laatst opgehaalde agenda staan.

**Twee bronnen.** Staat je Google Agenda ook op je telefoon en koppel je beide, dan telt dezelfde afspraak (dezelfde dag, begintijd en naam) één keer; de versie van de telefoon wint.

**De naam van de agenda.** Van de telefoon is dat de naam die de agenda-app daar toont: een gedeelde agenda die als eigen agenda op je telefoon staat, heeft zijn eigen naam en dus zie je meteen van wie een afspraak is. Uit de feed komt de naam van die ene agenda (`X-WR-CALNAME`, bij een gedeelde agenda de naam die jullie hem gaven); de feed zegt niet wie een afspraak in die agenda maakte. Wil je per persoon onderscheid, zet dan elke persoon in een eigen agenda en gebruik de telefoon.

**Afvinken.** Tik het rondje. Het geldt op de dag zelf en tot 14 dagen terug, zoals bij habits (op een dag in de toekomst staat het uit). Een melding met **Ongedaan maken**. Het telt nergens mee en blijft op dit toestel: het gaat niet mee in de sync, dus op een tweede toestel staat de afspraak weer open. Wat je afvinkt, herkent de app aan de dag, de begintijd en de naam van de afspraak, dus dezelfde afspraak blijft afgevinkt als hij de volgende keer uit de andere bron komt. Verplaats of hernoem je hem in je agenda, dan is het een nieuwe afspraak en staat hij weer open.

**Niet tonen.** Tik ⋯ op de kaart en kies **Niet tonen**: de afspraak verdwijnt van Vandaag, met een melding met **Ongedaan maken**. In je agenda verandert niets. Het geldt voor die ene afspraak op die dag (bij een herhalende afspraak dus niet voor de andere keren), op dezelfde manier herkend als bij afvinken, en blijft op dit toestel.

## De functie `calendar-feed`

De app kan het adres niet zelf ophalen: Google zet geen CORS-header op zijn feed. Daarom haalt een Edge Function hem op. Hij is klein en doet bewust niets met de inhoud (het lezen gebeurt in de app, waar het te testen is).

Omdat zo'n doorgeefluik misbruikt kan worden om andere servers te bevragen:

- alleen met een geldige inlogsessie (dus alleen met een account);
- alleen `https`, alleen de host **calendar.google.com** en alleen het pad van een iCal-adres (`/calendar/ical/…/private-…/basic.ics` of `…/public/basic.ics`), zonder gebruikersnaam of poort;
- een doorverwijzing volgt hij alleen naar een andere pagina van dezelfde host en hoogstens twee keer (is het adres ingetrokken, dan stuurt Google je naar inloggen; dat volgt hij niet);
- hoogstens 10 seconden en 8 MB;
- hij geeft alleen terug als er echt een agenda (`BEGIN:VCALENDAR`) uitkomt.

De lijst met toegestane hosts staat op twee plekken (de functie en [agenda.js](../src/domain/agenda.js)); een test bewaakt dat ze gelijk blijven.

**Het adres is een geheim:** wie het heeft, leest je hele agenda. De functie bewaart het niet, logt het niet en zet het in geen enkele foutmelding. Een test bewaakt dat het nergens in een antwoord of logregel terechtkomt.

## Gegevens

Alles staat **alleen op dit toestel** (localStorage): `hb-agenda` (het adres en of de agenda van de telefoon aanstaat), `hb-agenda-cache` (de afspraken van 14 dagen terug tot 14 dagen vooruit, met titel, dag, tijd en de naam van de agenda) en `hb-agenda-done` (wat je hebt afgevinkt, als onleesbare nummers met de dag erbij, zonder namen; wat ouder is dan 14 dagen wordt opgeruimd) en `hb-agenda-hidden` (wat je niet meer wilt zien, op dezelfde manier). Er is geen collectie, geen servermigratie en geen sync. Ze zitten **niet** in de snapshot, de back-up of wat vrienden zien; een test bewaakt dat. Uitloggen en het verwijderen van je account wissen alles, ook het afgevinkte; **Ontkoppelen** wist het adres en de afspraken (het afgevinkte blijft, want het zijn alleen nummers, en geldt weer als je opnieuw koppelt).

## Besluiten

| # | Besluit | Reden |
|---|---|---|
| A1 | Niets wijzigen in je agenda; wel afvinken (zie A12) | Een agenda-app bouwen is een ander product. Wijzigen kan altijd in je agenda zelf. Afvinken veranderde je agenda niet en was een wens ("hoe ging die afspraak?") |
| A2 | Het geheime iCal-adres, geen Google-API met inloggen | De Google Calendar API met `calendar.readonly` is een "gevoelige" scope: Google moet de app goedkeuren (en in testmodus verlopen de tokens na 7 dagen). Dat is veel gedoe voor een persoonlijk project. Het iCal-adres heeft niets nodig, werkt ook voor andere agenda's en laat je je agenda per toestel loskoppelen door het adres opnieuw in te stellen. Nadeel: Google ververst de feed een paar keer per dag |
| A3 | Het adres en de afspraken blijven op het toestel, geen sync | Het adres is een geheim en de agenda is persoonlijker dan een habit. Wat niet op de server staat, kan er niet lekken. Nadeel: je plakt het adres op elk apparaat apart |
| A4 | De feed werkt alleen met een account | De functie moet een inlogsessie kunnen controleren, anders is het een open doorgeefluik. De agenda van de telefoon werkt wel zonder account |
| A5 | Lezen en herhalingen uitrekenen in de app, niet in de functie | Daar is het te testen (`tests/domain/ical.test.js`) en de functie hoeft niet bij elke wijziging met de hand in het dashboard geplakt te worden |
| A6 | Alleen Google Agenda is toegestaan | Dat vroeg je, en een kleinere lijst is veiliger. Een andere agenda (Outlook, iCloud) erbij is een regel in `FEED_HOSTS` en `FEED_PATH` op beide plekken |
| A7 | Dagdeel uit de begintijd: tot 12:00, tot 18:00, daarna avond | De app kent geen kloktijden voor dagdelen. Een hele dag staat onderaan bij "Overdag" |
| A8 | Telt nergens mee | Zoals bij losse afspraken (L3): "alles gedaan" blijft over habits gaan. De agenda staat daarom ook buiten de snapshot, zodat punten, aandacht en weekstrook er niet eens bij kunnen |
| A9 | Een eigen plugin voor de telefoon | Alleen lezen, geen afhankelijkheid van een plugin die Capacitor 8 mogelijk niet bijhoudt, en een plugin die precies het ene doet. Het manifest vraagt alleen `READ_CALENDAR` |
| A10 | Geen melding en niets in de ochtendherinnering | De melding loopt via Google (FCM) en bevat bewust geen namen (PRIVACY.md). Afspraken horen daar niet in |
| A11 | Een hele-dag-afspraak over meer dagen staat op elke dag; een afspraak over middernacht heeft de begintijd op de eerste dag | Zo staat hij er elke dag die hij duurt, zonder een eindtijd te raden |
| A12 | Afvinken blijft op het toestel, onder een onleesbaar nummer, zonder sync | Synchroniseren vraagt een servermigratie en zou namen van afspraken (of hun nummers) op de server zetten, tegen A3 in. Nadeel: een tweede toestel weet het niet. Een nummer in plaats van de naam, zodat de opslag niets verraadt en niet hoeft te verdwijnen bij ontkoppelen |
| A13 | Een afgevinkte afspraak telt nergens mee, net als een losse afspraak (L3) | "Alles gedaan" blijft over habits gaan |
| A14 | De naam van de agenda staat achter het woord Agenda, niet ervoor of ernaast | Zo blijft de regel kort en blijft "Agenda" het kenmerk van dit soort kaart. Een lange naam (een e-mailadres) breekt af |
| A15 | ⋯ op een agenda-kaart met alleen "Niet tonen", bewaard als afvinken (A12) | Dezelfde kaart als de andere ziet er rustiger uit met ⋯ op dezelfde plek, en niet elke afspraak (een verjaardag van een collega) wil je elke keer zien. Wijzigen of verwijderen blijft in je agenda zelf. Een herhalende afspraak verberg je per keer, want de sleutel is dag, tijd en naam |

## Nog open

- **Afvinken op meer toestellen.** Nu per toestel (A12). Synchroniseren kan met een nieuwe collectie en een migratie, als de nummers (geen namen) naar de server mogen.
- **Wie een afspraak maakte** in een gedeelde agenda. De feed noemt dat niet; de telefoon ook niet, behalve via de naam van de agenda.
- **Afgewezen afspraken in de feed.** De telefoon slaat ze over; of de iCal-feed van Google ze ook geeft en hoe hij ze markeert, is niet gecontroleerd. In de feed staat het adres van je account in het pad, dus filteren op `ATTENDEE;PARTSTAT=DECLINED` voor dat adres is mogelijk.
- **Kiezen welke agenda's van de telefoon.** Nu alle zichtbare agenda's (wat je in de agenda-app van de telefoon hebt aangevinkt).
- **Een stipje op de weekstrook** voor dagen met een afspraak uit je agenda.
- **Meer agenda's** (Outlook, iCloud): zie A6.
- **Een eigen volgorde.** Op tijd, naast de habits, in plaats van onder de habits.

## Uitrollen

Er is **geen migratie** en geen nieuw secret. De functie is nieuw; de oude app-versies kennen hem niet en merken niets.

**Lokaal** (zoals send-reminders in [ANDROID-SETUP.md](ANDROID-SETUP.md)): de lokale stack heeft de functie niet. Start hem en laat het venster openstaan:

```
npx supabase@2.121.0 functions serve calendar-feed --no-verify-jwt
```

Zonder dat zegt Instellingen "De agenda-koppeling is nog niet klaargezet op de server (de functie ontbreekt)".

**Productie** (pas bij de release, zie WERKWIJZE.md; de functie kan er eerder, hij raakt niets):

1. Supabase → **Edge Functions → Deploy a new function → Via editor**, naam **calendar-feed**.
2. Vervang de code door de inhoud van `supabase/functions/calendar-feed/index.ts` → **Deploy**.
3. Zet bij de instellingen van de functie **Verify JWT** uit: hij controleert de inlogsessie zelf (zoals send-reminders).
4. `SUPABASE_URL` en `SUPABASE_ANON_KEY` zet Supabase zelf in de omgeving; er zijn geen eigen secrets.

**De Android-app:** de plugin en het recht zitten in de APK. Verhoog `appVersion` in `src/config.js` in de release-PR, anders komt er geen nieuwe APK. Een bestaande app vraagt om de toestemming pas als je **Agenda van deze telefoon gebruiken** aantikt.

## Controles

- `tests/domain/ical.test.js`: lezen, tijdzones, herhalingen, uitzonderingen en gewijzigde of geannuleerde keren, en dat een agenda van tien jaar oud snel blijft.
- `tests/domain/agenda.test.js`: het adres, het dagdeel, samenvoegen, verouderen en de omzetting van de telefoon.
- `tests/calendar/calendar-feed.test.js`: de functie: wie mag, welke adressen, wat er mis kan gaan bij Google, grootte en tijd, en dat het adres nergens uitlekt.
- `tests/ui/agenda.test.js`: koppelen, bewaren, verversen, de toestemming van de telefoon, twee bronnen samen, afvinken (ook na een herstart en uit de andere bron) en de naam van de agenda.
- `tests/app/agenda-day-view.test.js`: de agenda staat in het goede dagdeel en telt nergens mee, en zit niet in de snapshot of de back-up.
- `tests/android-calendar.test.js`: de plugin is aangemeld, het recht is alleen lezen, en de namen en velden (ook de naam van de agenda) kloppen met wat de app aanroept. **De Java-code zelf wordt pas in CI gecompileerd**; probeer hem daarom op een toestel (HOW-TO-TEST §T).
