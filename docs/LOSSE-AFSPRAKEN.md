# Losse afspraken: een eenmalige herinnering op een dag

Status: **gebouwd** · 2026-10-21 · bouwt voort op [PLAN.md](PLAN.md) (Vandaag, dagdelen) en [DATAMODEL.md](DATAMODEL.md) · werkwijze: [WERKWIJZE.md](WERKWIJZE.md)

## Het probleem

Op dinsdag besluit je dat je donderdagmiddag iemand moet bellen. Dat is geen gewoonte: het gebeurt één keer. Toch is Vandaag de plek waar je kijkt, en wie er geen plek voor heeft, opent er een tweede app voor.

## Wat het wel en niet is

| Wel | Niet |
|---|---|
| Een eenmalige herinnering met een **tekst**, een **dag** en een **dagdeel** (Ochtend, Middag, Avond of Overdag) | Een habit. Geen ritme, sterkte, fase, reeks, punten of prestaties |
| Staat op Vandaag, in zijn dagdeel, onder de habits | Een to-do-app. Geen herhaling, subtaken, prioriteiten, lijsten of tijdstippen |
| Afvinken, wijzigen, verwijderen, en alles met "Ongedaan maken" | Iets dat meetelt: niet in de ring, de felicitatie, de punten, de weekreview, de aandachtskaart of wat vrienden zien |

**De grens:** heeft het een datum, dan is het een afspraak. Heeft het een ritme, dan is het een habit. Wie "elke maand" wil toevoegen, maakt een habit.

## Wat er is gebouwd

| Onderdeel | Wat |
|---|---|
| **Ingang per dag** | Onder de dagdelen op Vandaag staat een rustige knop **＋ Afspraak**, op vandaag en elke dag erna (niet op dagen die voorbij zijn). De dag die je bekijkt is voorgevuld: sta je op donderdag, dan maak je er een voor donderdag. Geen zwevende knop (die staat alleen op Habits) en niets op Habits |
| **Het blad** | Eén blad ([appointment-sheet.js](../src/ui/components/appointment-sheet.js)): **wat** (80 tekens, met teller), **moment van de dag** en **op welke dag** (voorgevuld, te wijzigen tot een jaar vooruit). Een nieuwe afspraak zet de cursor meteen in het tekstveld; Enter bewaart. ⋯ op een kaart opent hetzelfde blad om te wijzigen, met **Verwijderen** |
| **De kaart** | [appointment-card.js](../src/ui/components/appointment-card.js): een kaart in de stijl van een habit, maar zonder icoon, met een accentrand en het woord **Afspraak**. Afvinken zoals bij een habit |
| **Doorschuiven** | Een open afspraak van een eerdere dag staat op vandaag met "Afspraak · Van gisteren", rustig en zonder waarschuwing |
| **Dagdelen** | Een afspraak staat in zijn dagdeel onder de habits; "Overdag" is "geen vast moment". Een dagdeel met alleen afspraken bestaat ook. De teller bij de kop ("0 van 1") telt alleen habits |

## Hoe een afspraak op een dag komt

[appointmentsOn](../src/domain/appointments.js) beslist, puur en getest:

1. Een afspraak staat op **zijn eigen dag**, ook als die voorbij is (afgevinkt of niet).
2. Op de **echte vandaag** staat daarnaast alles van een eerdere dag dat nog openstaat (`carried`).
3. Is zo'n doorgeschoven afspraak **vandaag** afgevinkt, dan blijft hij vandaag in beeld. Is hij op een eerdere dag afgevinkt, dan staat hij alleen nog op zijn eigen dag.
4. Een afspraak voor een latere dag staat nergens eerder. Je ziet hem zodra je naar die dag bladert (de dagnavigatie reikt zeven dagen vooruit).

## Gegevens

Een eigen collectie `appointments`, **geen habit met een vlag**. De rekenlaag (punten, aandacht, prestaties, weekstrook) rekent over alle habits; als een afspraak een habit was, moest elk van die plekken hem eruit filteren. Een test bewijst dat afspraken geen van die uitkomsten veranderen.

| Veld | Inhoud |
|---|---|
| `id` | uuid |
| `title` | tekst, 1 tot 80 tekens |
| `date` | de dag (`YYYY-MM-DD`) |
| `daypart` | `morning` / `afternoon` / `evening` / `anytime` |
| `doneOn` | de dag waarop hij is afgevinkt, of `null` |

Verder zoals elk record: `createdAt`, `updatedAt`, `deletedAt` (zacht verwijderen). IndexedDB gaat naar **versie 5** (een nieuwe store); de server krijgt de collectie in [0008_appointments.sql](../supabase/migrations/0008_appointments.sql). Afspraken zitten in de **back-up** (een afspraak hoort bij geen habit, dus geen wees) en in de sync.

## Besluiten

| # | Besluit | Reden |
|---|---|---|
| L1 | Een ingang per dag op Vandaag, geen zwevende knop | Besloten 2026-10-21. De FAB staat alleen op Habits; een afspraak via Habits maken voelt vreemd. De dag die je bekijkt geeft de datum |
| L2 | Een eigen collectie in plaats van een habit | Zie "Gegevens". Kost een servermigratie, houdt de habit-logica schoon |
| L3 | Afspraken tellen nergens mee: niet in de ring, de felicitatie, punten, prestaties, aandacht, de weekstrook of de ranglijst | Een gemiste afspraak mag nooit voelen als een mislukte gewoonte, en "alles gedaan" blijft over habits gaan |
| L4 | Een gemiste afspraak schuift stil door, zonder "te laat" | Dezelfde toon als de rest van de app (PLAN §2): geen verwijt. Wie hem niet meer nodig heeft, verwijdert hem |
| L5 | Afvinken legt de dag vast waarop je kijkt (`doneOn`), met dezelfde terugwerkende termijn als habits | Zo klopt "afgevinkt op een eerdere dag" voor het doorschuiven. Op een toekomstige dag is afvinken uit, zoals bij habits |
| L6 | Een andere dag kiezen maakt een afgevinkte afspraak weer open | Het is dan een nieuwe afspraak. Een afspraak van een eerdere dag mag zijn dag houden (hij schuift door), maar niet naar een andere dag in het verleden |
| L7 | Maximaal 366 dagen vooruit | Voorkomt een tikfout met het jaar; ver genoeg voor wat je nog weet te willen doen |
| L8 | Geen icoon op de kaart | De iconenset is bedoeld voor habits; een afspraak is geen onderwerp maar een taak van één keer. De accentrand en het woord "Afspraak" maken het verschil |
| L9 | De ochtendmelding verandert niet | Zie "Nog open" |

## Nog open

- **Een melding op de dag zelf.** Een afspraak helpt het meest als hij je waarschuwt. De huidige melding is één neutrale ochtendmelding met getallen en zonder namen (de privacykeuze in [PRIVACY.md](PRIVACY.md)). Een kleine uitbreiding is "er staat 1 afspraak op je lijst", zonder tekst. Dat vraagt een extra getal in de samenvatting en een wijziging in de Edge Function; daarom nu niet gebouwd.
- **Een stipje op de weekstrook** voor dagen met een afspraak, zodat je op dinsdag ziet dat donderdag al iets heeft. De strook toont nu alleen hoe het met habits ging.
- **Opruimen.** Afgevinkte afspraken blijven staan. Het zijn kleine records, maar na een paar jaar is een opruimregel ("ouder dan een jaar") logisch.

## Uitrollen

Gebruikers draaien soms een oudere appversie. Zoals in [WERKWIJZE.md](WERKWIJZE.md): voer **eerst** `0008_appointments.sql` uit in de SQL-editor van productie, rol daarna de app uit. Zonder die migratie weigert de server de records (de check `records_collection_known`) en blijven afspraken alleen op het toestel staan. Oudere appversies negeren de collectie bij het ophalen en tonen hem niet; er gaat niets kapot.

## Controles

- `tests/domain/appointments.test.js`: validatie en de regels voor "op welke dag staat een afspraak".
- `tests/app/appointments.test.js`: opslag, handelingen met ongedaan maken, het Vandaag-scherm, dat punten, aandacht en weekstrook gelijk blijven, en de back-up.
- `tests/data/sync.test.js`: afspraken synchroniseren tussen twee apparaten, ook verwijderen.
- `tests/server/appointments.test.js`: de migratie in een echte Postgres (idempotent, per gebruiker afgeschermd, een onbekende collectie blijft geweigerd).
- `npm run check:layout`: de ingang, het blad, doorschuiven, afvinken, verwijderen en de pasvorm op 390 px, 320 px en 320 px met 200% tekst, en op desktop.
