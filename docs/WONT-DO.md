# Ga ik niet doen: een taak opgeven, met een reden en een plan

Status: **gebouwd** · 2026-10-23 · bouwt voort op [PLAN.md](PLAN.md) §4.9 (aandacht, redenen) en [DATAMODEL.md](DATAMODEL.md) · werkwijze: [WERKWIJZE.md](WERKWIJZE.md)

## Het probleem

Soms weet je al dat een taak vandaag, of deze week, niet meer gaat lukken. Er is dan niets te doen: de kaart blijft open staan, de stapel blijft vragen en "Even kijken" komt later toch met een verwijt. Overslaan helpt niet, want dat zegt "dit geldt niet" en haalt de taak uit de telling. Het is wel een misser, en de moeite waard om te zeggen waarom en wat er anders moet.

## Wat het wel en niet is

| Overslaan | Ga ik niet doen |
|---|---|
| "Dit geldt vandaag niet": buiten de telling | "Dit lukt niet": telt als **gemist**, eerlijk |
| Een notitie is vrij | Een **reden is verplicht** (dezelfde zeven als bij "Wat hield je tegen?") |
| | Een optioneel **plan**: wat ga je doen zodat je dit niet nog eens hoeft te falen? |
| Alleen die dag | Bij een week- of maandtaak de **rest van die periode** |

## Hoe het werkt

| Plek | Wat |
|---|---|
| **⋯ op de kaart** (Vandaag) | **Ga ik niet doen**, naast Overslaan. Alleen bij een open of overgeslagen taak; bij een opgegeven taak staat er **Reden of plan aanpassen**. Wissen of het rondje tikken draait het terug |
| **⋯ in de stapel** | **Ga ik niet doen deze week** (of **deze maand**) bij een taak zonder vaste dag |
| **Even kijken en de weekterugblik** | Naast *Wat hield je tegen?* de knop **Ga ik niet doen**, voor een taak waar nog niet op is gereageerd |
| **Het blad** | Hetzelfde blad als "Wat hield je tegen?" ([attention.js](../src/ui/components/attention.js), `openReasonSheet` met `wont`): een eerlijke uitleg, de reden, een toelichting en het plan. Zonder reden blijft het open |
| **De kaart daarna** | Status "Ga ik niet doen" met een ×, de reden en het plan eronder. Het rondje tikken, of **Wissen**, zet de taak weer open (en haalt de reden en het plan van die dag weg) |

## Wat het verandert in de telling

Het is een check-in met status `wont`. [units.js](../src/domain/units.js) rekent die als **gemist**, nu al:

| Ritme | Effect |
|---|---|
| Vaste weekdagen | Die dag is gemist (anders zou hij dat aan het eind van de dag zijn) |
| N× per week of maand, of een vaste dag in de maand | De hele week of maand is gemist, ook al loopt hij nog (`givenUp`). De taak staat de rest van de periode niet meer in de stapel. Haal je het aantal toch (je vinkt alsnog af), dan is hij gewoon gedaan |

Verder:

- **Punten** en **aandacht**: een misser telt pas als de dag voorbij is, zoals bij elke gemiste dag; "ga ik niet doen" is zelf geen activiteit (`lastActive` verandert niet). Een opgegeven periode beantwoordt zijn eigen signaal: `since` is de dag waarop je opgaf, dus de reden van die dag dekt het en de weekterugblik toont reden en plan ("Opgegeven met ga ik niet doen.").
- **De dag zelf** (ring, "x van y", "Alles gedaan"): een opgegeven taak telt niet meer mee, net als een overgeslagen. Het blijft over wat nog kan, zodat je niet de hele dag een rondje open hebt dat nooit meer dicht gaat. Dat is het enige verschil met "gemist" voor de dag; reeks, consistentie en sterkte zien het wel.
- **Heatmap**: de dag staat als gemist.

## Gegevens

Geen nieuwe collectie, dus **geen servermigratie** en geen nieuwe IndexedDB-versie.

| Waar | Wat |
|---|---|
| `checkIns.status` | nieuwe waarde `wont` (naast `done`, `minimal`, `skipped`, `partial`) |
| `reasons.plan` | nieuw optioneel veld (max. 200 tekens): het plan. De reden en de toelichting staan in dezelfde `reasons`-record, met als sleutel `habitId\|datum` van de dag die je opgaf |

De server begrijpt de records niet en bewaakt alleen de collectienamen (`records_collection_known`); een test in [tests/server/wont-do.test.js](../tests/server/wont-do.test.js) bewijst dat een `wont`-check-in en een reden met een plan zonder nieuwe migratie worden bewaard. Back-up en sync nemen beide gewoon mee (de back-up valideert `plan`).

Oudere appversies die een `wont`-check-in ophalen kennen de status niet en behandelen de dag als niet afgevinkt: gemist als hij voorbij is, open als het vandaag is. Dat is bijna wat de nieuwe versie doet, dus er gaat niets kapot.

## Besluiten

| # | Besluit | Reden |
|---|---|---|
| W1 | Het telt als gemist, niet neutraal | Besloten 2026-10-23. Anders is het Overslaan met een verplichte reden. Eerlijkheid is het punt: je zegt het vooraf in plaats van achteraf |
| W2 | Een status in een bestaand record, geen eigen collectie | Geen migratie nodig, en de reden en het plan horen bij dezelfde dag als de check-in |
| W3 | De reden is verplicht, het plan optioneel | Besloten 2026-10-23. De reden is wat de weekterugblik nodig heeft; het plan is een kans, geen verplichting |
| W4 | Bij een week- of maandtaak geldt het voor de rest van de periode | Besloten 2026-10-23. Een taak per week die je opgeeft kun je op een andere dag niet ineens wel doen; "toch gedaan" kan altijd door af te vinken |
| W5 | Een opgegeven taak telt niet mee in de ring en "Alles gedaan" | Een rondje dat nooit meer dicht kan, maakt de dag onhaalbaar. De gemiste dag zit al in reeks en sterkte |
| W6 | Niet bij een taak die al (deels) gedaan is | Een teller op 3 van 8 of één dagdeel van twee zou zijn voortgang kwijtraken. Wie die dag wil laten zoals hij is, doet niets |
| W7 | Een taak waar die dag niets openstaat (geen geplande dag) bewaart alleen de reden en het plan | Geen check-in op een dag die niet bestond; de reactie telt wel voor "Even kijken" |

## Nog open

- **Het plan terugzien.** Het plan staat op de kaart van die dag en in de weekterugblik. Het komt nog niet terug als je de taak de volgende keer opent. Een kleine uitbreiding is het laatste plan tonen op de detailpagina van de habit.
- **Een aanbeveling bij de reden.** Zoals in PLAN §4.9 genoemd: bij "Ritme klopt niet" het ritme voorstellen te verlagen, bij "Vergeten" een cue. Het plan is vrije tekst en de app doet er niets mee.

## Uitrollen

Er is niets uit te voeren op de server. Rol de app uit; zie [WERKWIJZE.md](WERKWIJZE.md) voor de gewone volgorde.

## Controles

- `tests/app/wont-do.test.js`: de rekenlaag (dag, week, maand, heatmap), de handeling met ongedaan maken en wissen, Vandaag (kaart, teller, stapel), aandacht, punten en de back-up.
- `tests/server/wont-do.test.js`: de bestaande migraties volstaan, in een echte Postgres.
- `npm run check:layout`: de ingang, het blad (zonder reden, met reden en plan), de kaart met reden en plan, en de pasvorm op 390 px, 320 px en 320 px met 200% tekst.
