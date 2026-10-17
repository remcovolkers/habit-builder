# Feedbackhub: gebruikers laten feedback achter, jij leest ze op het web

Status: **gebouwd** · 2026-10-17 · bouwt voort op [PLAN.md](PLAN.md), [PRIVACY.md](PRIVACY.md) en de beheerder uit migratie `0006_dev_usage.sql` · werkwijze: [WERKWIJZE.md](WERKWIJZE.md)

## Doel

Gebruikers kunnen een idee, een probleem, een vraag of een compliment kwijt, zonder dat het de app in de weg zit. Jij leest ze als beheerder op het web, in een eigen tabje (niet op de telefoon).

## De knop: drie lagen

De knop is er altijd, maar nooit luid. Net als de uitleg heeft hij drie "volumes":

| Laag | Waar | Gedrag |
|---|---|---|
| **Altijd vindbaar, stil** | Onderaan de zijbalk op de computer (een tekstregel met een icoon, onder de tabs). Op de telefoon onder **Instellingen**, in een eigen sectie. | Geen zwevende knop: die is bewust van Vandaag gehaald omdat hij een verkeerde indruk wekte. De tabbalk van de telefoon zit vol. |
| **Een uitnodiging op een natuurlijk moment** | Onderaan **Vandaag**, een rustige kaart "Hoe bevalt de app tot nu toe?" met "Feedback geven" en "Niet nu". | Pas na **7 dagen** gebruik, nooit naast het zetje om in te loggen, nooit tijdens het afvinken (hij staat onderaan). Na "Niet nu" of openen: **28 dagen** stil. Na een bericht: **90 dagen** stil. Zonder opslag in de browser nooit (we kunnen dan niet onthouden dat je nee zei). |
| **Waar iets kan haperen** | Onderaan **Zo werkt het**: "Mis je iets of is iets onduidelijk?" | Dat is de plek waar je merkt dat iets onduidelijk is. |

## Het formulier

Een **blad boven de huidige pagina**, geen aparte pagina (dezelfde les als bij de uitleg over ritmes: je raakt niets kwijt en hoeft nergens heen). Een soort kiezen (Idee, Probleem, Vraag, Compliment), een tekst van hoogstens 1000 tekens met teller, en zichtbaar welke context meegaat: *"de pagina (#/today) en de versie van de app (1.2). Verder niets."* Ben je ingelogd, dan staat er ook een vinkje "Je mag me hierover mailen".

- Leeg of zonder soort versturen geeft meldingen en laat het blad open.
- Bij een fout (geen verbinding, te veel berichten, migratie ontbreekt) staat er een melding en **blijft je tekst staan**.
- Na het versturen: een bedankje en het blad sluit. De focus gaat terug naar de knop die het opende.
- Een uitnodigingslink gaat nooit mee als "pagina": de geheime code wordt weggelaten.

## Jouw kant

Het tabje **Feedback** staat in de zijbalk, **alleen op de computer** (onder 960 px laat de CSS het ook voor jou weg) en alleen als de server zegt dat je beheerder bent (`app_is_admin()`, dezelfde `app_admins` als de gebruikersteller). Het toont het aantal nieuwe berichten.

De pagina heeft filters (Nieuw, Afgehandeld, Alles, met aantallen, en een soort), per bericht de soort, datum, tekst, afzender (een mailadres of "Anoniem"), pagina en versie, en de acties **Afgehandeld** (of weer openen) en **Verwijderen** (met bevestiging).

## Server (migratie 0007)

| Onderdeel | Wat |
|---|---|
| `feedback` | De tabel. **Niemand** kan hem rechtstreeks lezen of schrijven (ook de app niet); alles gaat via functies. |
| `feedback_send(...)` | Versturen, **ook zonder account**. Controleert soort en lengte, kort pagina en versie in, en past een tempolimiet toe. |
| `app_is_admin()` | Is de aanroeper beheerder? |
| `feedback_list()` | De berichten, nieuwste eerst, hoogstens 500. Voor een ander dan een beheerder: een lege lijst, geen foutmelding. |
| `feedback_set_status(...)`, `feedback_delete(...)` | Alleen voor een beheerder. |

Zie [0007_feedback.sql](../supabase/migrations/0007_feedback.sql) en `tests/server/feedback.test.js` (14 tests op een echte Postgres).

## Privacy

Zie [PRIVACY.md](PRIVACY.md), "Alleen als je feedback stuurt". Kort:

- Een bericht bevat de soort, de tekst, de pagina en de appversie. Geen naam, geen gegevens over je habits, geen apparaatgegevens.
- **Zonder vinkje, of zonder account, is het bericht anoniem**: de server bewaart dan geen gebruiker en geen adres, en houdt niet bij wie of hoe vaak iemand stuurt.
- **Met het vinkje** (alleen ingelogd) worden het account en het e-mailadres van dat account bewaard. Het adres komt van de server, niet van de telefoon. Het bericht verdwijnt als het account verwijderd wordt.
- Alleen de beheerder kan berichten lezen. Een bijpassende test in `tests/legal.test.js` dwingt af dat elke kolom van de tabel in de privacyverklaring staat.

## Besluiten

| # | Besluit | Reden |
|---|---|---|
| FB1 | Ook zonder account kun je feedback sturen | Besloten 2026-10-17. Juist wie net begint (en misschien nog geen account heeft) merkt wat onduidelijk is |
| FB2 | Het adres gaat alleen mee met het vinkje, en komt van de server | Besloten 2026-10-17. Je hebt geen antwoordkanaal in de app; zo kies je zelf of je gemaild mag worden |
| FB3 | De privacyverklaring is aangevuld | Besloten 2026-10-17 |
| FB4 | Het tempo wordt **in totaal** begrensd (20 per minuut, 500 per dag), niet per persoon | Anders moeten we per persoon bijhouden, en dan is "anoniem" niet meer waar |
| FB5 | Geen zwevende knop, geen pop-up | Past niet bij de ervaring van de app; de FAB op Vandaag is er juist uit gehaald |

## Risico's en keuzes om te weten

- **Spam.** Omdat het tempo in totaal wordt begrensd, kan iemand de limiet volmaken en zo echte feedback tijdelijk blokkeren. Gevolg: "te veel berichten, probeer het over een paar minuten". Verwijder dan het overtollige in het tabje. Per persoon begrenzen kan alleen door gegevens over afzenders te bewaren; dat is bewust niet gedaan.
- **Geen antwoord in de app.** Je kunt alleen mailen als iemand het vinkje aanzette. Anonieme berichten kun je niet beantwoorden.
- **Bewaartermijn.** In de privacyverklaring staat dat je berichten verwijdert zodra ze zijn afgehandeld, en uiterlijk na een jaar. Dat gebeurt **niet automatisch**: het is jouw werk (Verwijderen in het tabje). Wil je dat automatisch, dan is dat een vervolgstap (een geplande opruimactie).
- **De migratie moet in productie staan** voordat de knop werkt. Zonder migratie geeft versturen "Feedback versturen kan nog niet".
- **Offline** versturen lukt niet; de tekst blijft staan en je probeert het later opnieuw. Er is geen wachtrij.
