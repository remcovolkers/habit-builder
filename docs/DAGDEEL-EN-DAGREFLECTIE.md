# Een taak naar een ander dagdeel, afvinken met een tik op de kaart en hoe ging je dag

Status: **gebouwd** · 2026-11-04 · bouwt voort op [PLAN.md](PLAN.md) §4.6 (de stapel), [FLEXIBELE-TAKEN.md](FLEXIBELE-TAKEN.md) en [DATAMODEL.md](DATAMODEL.md) · werkwijze: [WERKWIJZE.md](WERKWIJZE.md)

Dit komt uit vijf feedbackberichten (eigen gebruik, 2–4 november). Eerst wat er stond, dan wat we ervan hebben gemaakt.

| Bericht | Wat het wordt |
|---|---|
| "Taken in Vandaag kunnen slepen van hun oorspronkelijk dagdeel" en "taken verzetten van oorspronkelijk dagdeel" | **Een kaart naar een ander dagdeel zetten**, voor die ene dag (slepen of ⋯ → Ander dagdeel) |
| "Vrij in te plannen taken: instellen welk dagdeel je ze opneemt" | Hetzelfde mechanisme: je plant de taak in (één tik), hij staat in zijn eigen dagdeel, en je zet hem op die dag waar je hem wilt |
| "Afvinken mag door op de card te drukken in plaats van de bolletjes" | **Tikken op de kaart vinkt af** |
| "Feedback op dag kunnen geven" | **Hoe ging je dag?**: een cijfer van 1 tot 5 en een korte notitie, die je terugziet in de weekreview |

## 1. Een kaart naar een ander dagdeel (alleen voor die dag)

Een habit staat op Vandaag in zijn eigen dagdeel ("Ochtend"). Soms komt het die dag anders uit. Je zet de kaart dan in een ander dagdeel; **morgen staat de habit weer op zijn eigen moment**. Het dagdeel van de habit zelf aanpassen kan nog altijd in het bewerkformulier.

| Hoe | Wat |
|---|---|
| **Slepen met de muis** | Pak de kaart en sleep hem naar een dagdeel. De dagdelen waar hij heen mag lichten op |
| **Slepen op een telefoon** | **Even vasthouden** (zo'n driekwart seconde), dan slepen. Een gewone veeg blijft scrollen. Aan de rand van het scherm scrolt de pagina mee. De telefoon trilt kort als het slepen begint |
| **Een dagdeel waar nog niets staat** | Tijdens het slepen verschijnt daar een lege plek ("Zet de taak hier neer"), zodat je ook naar de middag kunt als daar niets staat |
| **Zonder slepen** | ⋯ → **Ander dagdeel** toont de andere dagdelen als knoppen. Dit is ook de weg voor toetsenbord en schermlezer |
| **Terug** | Sleep hem terug, of kies in het menu **Terug naar ochtend**. Onder de naam staat "Verplaatst van ochtend" zolang hij elders staat |

Regels:

- Het geldt voor elke habit op Vandaag (vaste dagen, flexibel, teller). Een vrij in te plannen taak staat pas op een dag als je hem inplant; daarna kun je hem verplaatsen. **Terug naar de stapel** haalt ook de verplaatsing weg.
- Een habit met **meerdere dagdelen** (tandenpoetsen 's ochtends en 's avonds): elke kaart gaat los. De ochtend gaat niet naar de avond zolang daar al een kaart van die habit staat. Het vinkje blijft bij zijn eigen dagdeel (`part`), ook als de kaart elders staat.
- Het kan op de dag zelf, tot 14 dagen terug en op dagen die je kunt vooruitplannen (7 dagen), dus dezelfde grens als afvinken en plannen.
- Losse afspraken en afspraken uit je agenda zijn niet versleepbaar. Een afspraak kun je met ⋯ → bewerken in een ander dagdeel zetten; een agenda-afspraak staat bij zijn tijd.
- De teller bij de ring en het dagdeel, de widget en de week verwerken de verplaatsing vanzelf: ze gebruiken allemaal dezelfde dagweergave (`buildDayView`).

### Opslag

Een nieuwe collectie **`dayMoves`** (id `habitId|datum|van`): `habitId`, `date`, `from` (het eigen dagdeel van de kaart), `to`. Het staat in de back-up, gaat mee in de sync en valt onder het account.

**Servermigratie nodig:** [0011_day_moves_reflections.sql](../supabase/migrations/0011_day_moves_reflections.sql) voegt `dayMoves` en `dayReflections` toe aan de toegestane collecties. Voer die uit **vóór** de app wordt uitgerold (WERKWIJZE: eerst uitbreiden). Doe je dat niet, dan weigert de server de records en blijven ze alleen op het toestel staan en worden ze later niet vanzelf opnieuw verzonden (de sync laat een door de server geweigerd record los).

## 2. Tikken op de kaart vinkt af

De hele kaart is nu de afvinkknop: een groot vlak is makkelijker te raken dan het rondje. Het rondje blijft (en blijft de weg voor toetsenbord en schermlezer).

- Geldt voor habits, losse afspraken en afspraken uit je agenda. Een tik op een gedane kaart zet hem weer open, zoals het rondje; de melding biedt "Ongedaan maken".
- Wat zelf iets doet blijft zijn eigen werk doen: het rondje, ⋯, links, velden en het blok onder de kaart (het automatisme-cijfer, "Nu afvinken" bij te laat, de notitie).
- **Een teller (bijvoorbeeld water) vink je niet met een tik op de kaart af.** Een tik zou daar geen duidelijk antwoord zijn: je gebruikt + en −.
- Staat afvinken uit (een dag die te ver terug of in de toekomst ligt), dan doet de kaart niets.
- Slepen en tikken tegelijk: na het loslaten van een sleepactie wordt de tik die de browser nog stuurt genegeerd, zodat het verplaatsen niet ook afvinkt.

## 3. Hoe ging je dag?

Onder de dagdelen op Vandaag, voor de dag zelf en de dagen die je nog mag invullen (14 terug): vijf woorden om uit te kiezen (**Zwaar, Lastig, Gewoon, Goed, Top**, cijfer 1 tot 5). De vraag gaat over **hoe zwaar het voelde om je taken te doen**: een dag waarop alles is afgevinkt maar die pittig was, is "Zwaar"; wie liever een dag markeert waarop de taken niet lukten, gebruikt dezelfde woorden. Kiezen bewaart meteen. Daarna kun je een notitie toevoegen (optioneel, 200 tekens): **Er iets bij schrijven** opent het veld, **Notitie bewaren** sluit het weer. Een bewaarde notitie staat als **tekst** op de kaart (met een accentstreep), niet als invoerveld; **Notitie aanpassen** opent het veld opnieuw en **Annuleren** laat alles zoals het was. **Wissen** haalt de reflectie weg.

- Het is voor jezelf en **telt nergens mee**: geen punten, geen reeksen, geen aandacht, niet in de ranglijst, en vrienden zien het nooit.
- Je ziet het terug in de **weekreview** op Voortgang: "Hoe je dagen gingen", het gemiddelde cijfer en per dag het woord en de notitie.
- Het cijfer vervangt het automatisme-cijfer niet: dat gaat over één taak, dit over de dag.

### Opslag

Een nieuwe collectie **`dayReflections`** (id = de datum): `date`, `score` (1–5), `note` (max. 200 tekens, of `null`). Dezelfde migratie als hierboven. Zie [PRIVACY.md](PRIVACY.md): de notitie is vrije tekst die jij schrijft.

## Besluiten

| # | Besluit | Reden |
|---|---|---|
| D1 | Een verplaatsing geldt alleen voor die dag | Besloten 2026-11-04 (met Remco). "Vandaag komt het anders uit" is een uitzondering, geen nieuwe gewoonte; het eigen dagdeel van de habit is al aan te passen in het formulier |
| D2 | Vrij in te plannen taken krijgen geen aparte keuze bij het inplannen | Besloten 2026-11-04. Inplannen blijft één tik; wie het dagdeel wil veranderen gebruikt dezelfde weg als bij elke andere taak |
| D3 | Vasthouden voor slepen op een telefoon | Anders is elke veeg om te scrollen een sleepactie. De muis begint na 6 pixels bewegen |
| D4 | Een teller vink je niet af met een tik op de kaart | Besloten 2026-11-04. Een tik betekent daar niets eenduidigs; de teller heeft + en − |
| D5 | Tikken op de kaart geldt ook voor afspraken (eigen en uit je agenda) | Besloten 2026-11-04 (met Remco), zodat alle kaarten zich gelijk gedragen |
| D6 | De reflectie is een cijfer en een notitie, niet iets voor de ontwikkelaar | Besloten 2026-11-04 (met Remco). Feedback aan de ontwikkelaar bestaat al (zie [FEEDBACK.md](FEEDBACK.md)) |

## Weten

- De dagweergave (`buildDayView`) geeft elke kaart `daypart` (waar hij nu staat), `fromDaypart` (zijn eigen), `moved` en `moveTargets`. `part` blijft het eigen dagdeel van een habit met meerdere dagdelen, want daar hoort het vinkje bij (`check-in.parts`).
- De sleeplogica staat in [daypart-drag.js](../src/ui/daypart-drag.js), de regels (puur) in [daymoves.js](../src/domain/daymoves.js) en [reflections.js](../src/domain/reflections.js).
- Een verplaatsing van een dagdeel dat de habit later niet meer heeft doet niets.
