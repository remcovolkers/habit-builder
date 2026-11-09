# Feedbackronde november 2026: uitbouwen, wachten met de review, prestaties per habit

Status: **ronde 3**: F2 en F3a gebouwd, F1 volgt (alle vragen Q1–Q25 beantwoord) · opgesteld 2026-11-09 · bron: drie ideeën uit de feedbackhub (v1.5.1, zie [FEEDBACK.md](FEEDBACK.md)) · bouwt voort op [PLAN.md](PLAN.md) §4.5 en §4.7, [AUTOMATISME.md](AUTOMATISME.md), [FLEXIBELE-TAKEN.md](FLEXIBELE-TAKEN.md) · werkwijze: [WERKWIJZE.md](WERKWIJZE.md)

Dit bestand is mijn werklijst voor deze ronde. Ik werk het bij zodra jij antwoordt of ik iets nieuws vind. Alles wat ik niet zelf kan of mag beslissen staat onder **Vragen aan Remco**, met mijn voorstel erbij, zodat "ja" genoeg is.

## Overzicht

| # | Idee (feedbackhub) | Soort | Omvang | Status |
|---|---|---|---|---|
| F1 | Een habit kunnen **uitbouwen**: een doel ("4× per week sporten") waar je naartoe groeit, met reflectie en op- of terugschakelen | nieuwe feature | groot | ontwerp af, bouwen volgt na F3a; ontwerp af en beslist (ook de boost, Q24); bouwen is de volgende stap |
| F2 | Het weekoverzicht pas klaar na minstens 3 dagen gebruik | verbetering | klein | **gebouwd** op deze branch |
| F3 | Prestaties: 1× per maand of 2× per week moet anders tellen, een mogelijke reset, en prestaties per habit naast het algemene scherm | verbetering + nieuwe weergave | middel–groot | **F3a gebouwd** (minimum aantal keren, reeksen in weken en maanden, herijken); F3c en de uitbouw-prestaties volgen met F1 |

Voorgestelde volgorde: **F2** (klaar) → **F3a** (de tellingen herstellen, want daar zit een fout in) → **F1** → **F3c** (prestaties per habit, ook voor de uitbouw-habits). Akkoord (Q15).

---

## F2: de review wacht tot de app drie dagen is gebruikt

### Probleem
Wie de app net installeert, kreeg een weekoverzicht (de weekreview, open vrijdag tot maandag 12:00) en een melding "je review staat klaar", terwijl er niets is om op terug te blikken.

### Wat er is gebouwd
| Onderdeel | Gedrag |
|---|---|
| Eerste gebruiksdag | De vroegste aanmaakdatum van een habit of check-in, als lokale dag ([firstUseDate](../src/app/reviews.js)). Geen apparaat-instelling: een tweede toestel met hetzelfde account begint dus niet opnieuw |
| Regel | Een review staat klaar vanaf de **derde dag** van gebruik, de eerste dag meegeteld ([usedLongEnough](../src/domain/reviews.js)) |
| Waar | De melding op Vandaag, de pushmelding op zondag (en laatste dag van de maand) en de kaart op Voortgang ("Nog even gebruiken", zonder formulier) |
| Onbekend | Zonder aanmaakdatum (oude records) of zonder gegevens houdt niets tegen: bestaande gebruikers merken niets |
| Maandreview | Wacht ook. Dat vroeg het idee niet, maar het is dezelfde gedachte |

Afwegingen die ik heb gemaakt (zeg het als je ze anders wilt, zie Q16):
- "3 dagen" is kalenderdagen sinds de eerste vastlegging, niet "3 dagen met een check-in". Eenvoudiger en voorspelbaar.
- Wie zondag begint, ziet maandagochtend de review van de week ervoor nog niet (dag 2) en mist die dus. Dat is bedoeld: er viel niets terug te blikken.
- Opslaan zelf is niet geblokkeerd in de rekenlaag, alleen de kaart en de meldingen. Een toegang via een oude link kan dus nog; de kaart toont dan wel de wachttekst.

### Controles
`tests/app/detail-backup.test.js` (regel, meldingen, kaart) en `tests/app/reminder.test.js` (push). `npm run check:layout` is niet gedraaid; de testgegevens daar zijn teruggedateerd zodat de reviewcontroles blijven kloppen.

---

## F1: uitbouwen, de stip op de horizon

### Het probleem
Je wilt uiteindelijk 4× per week sporten, maar niet meteen. Nu moet je het ritme telkens met de hand bewerken, zonder dat de app weet waar je naartoe wilt, en zonder moment om te kijken of het lukt. Soms voelt het ook goed om vast te houden aan wat er in elk geval staat.

### Wie en wat
Wie een habit wil opbouwen die **ook groter** moet worden (sport, lezen, schrijven, wandelen), niet alleen vast moet worden. Dit zijn de habits die een spotlight verdienen: ze moeten **inslijten én uitdijen**. Het gebruikersdoel: *"Ik wil naar 4× per week, maar eerst 1× laten wennen, dan bijsturen op wat ik ervaar, en terug mogen als het te veel is."*

### Wat er nu is (uit de code)
- Een habit heeft al een **lijst ritmeversies** `schedules: [{ effectiveFrom, schedule }]`. Bewerken in [actions.js:283](../src/app/actions.js#L283) voegt een versie toe met ingang vandaag. Statistieken, reeksen en sterkte rekenen per eenheid met het ritme van dat moment (`scheduleAt`). **De geschiedenis van het opbouwen bestaat dus al; alleen het doel en het besluitmoment ontbreken.**
- "Ingeburgerd" gebruikt het ritme van nu voor het aantal keren dat nodig is ([pace.js](../src/domain/pace.js)).
- Een ingeburgerde habit (`graduated`) staat standaard **niet meer op Vandaag** ([USE-CASES-VOLGENDE-FEATURES.md](USE-CASES-VOLGENDE-FEATURES.md)). Voor een uitbouwen-habit is dat fout zolang het doel niet is gehaald: hij moet blijven staan.
- Een doel van "N× per week" past bij het type `times_per_period`. Vaste weekdagen en "dag van de maand" kennen geen "aantal" om op te schalen.

### Use cases
| ID | Wat | Prio |
|---|---|---|
| UC1.1 | Bij het maken of bewerken van een habit kun je een **ideale versie** (het doel) instellen naast waar je nu staat: "Nu 1× per week, doel 4×", of "Nu 0,5 liter, doel 2 liter". Ook voor dagelijkse habits (Q1) | M |
| UC1.2 | Het doel is overal zichtbaar waar de habit staat: de kaart, de habit zelf en Voortgang, met de trede ("trede 2 van 4") en een balk naar het doel (spotlight (b)) | M |
| UC1.3 | Op een rustig moment (de weekreview, na de nudge-drempel; altijd ook een knop bij de habit) vraagt de app: *hoe ging het op deze trede?* Je kiest **Opschalen**, **Blijven** of **Terugschakelen**. De app beslist nooit zelf | M |
| UC1.4 | Opschalen of terugschakelen maakt een nieuwe ritmeversie met ingang vandaag (bestaande mechaniek). De vorige stap blijft in de geschiedenis | M |
| UC1.5 | Een korte notitie bij het besluit ("wat merkte je?"), terug te lezen bij de habit | S |
| UC1.6 | Een habit **zonder** doel werkt precies zoals nu | M |
| UC1.7 | Doel bereikt: *Uitgebouwd*; wat daarna gebeurt, hangt af van Q20 (voorstel: het gewone traject in, nu kan hij ingeburgerd worden) | M |
| UC1.8 | Het doel aanpassen of weghalen kan altijd (een doel van 4 wordt 3) | M |
| UC1.9 | Een bestaande habit omzetten naar uitbouwen (Q6: ja) | M |
| UC1.11 | De app **nudgt** als het op een trede al lang goed gaat, op keren en niet op dagen (Q2) | M |
| UC1.10 | Prestaties voor uitbouwen met iconen, waaronder *Uitgebouwd* (Q11, Q23) | M |

### Wat jouw antwoorden veranderen (ronde 2)

- **Het doel is een "ideale versie", ook bij dagelijkse habits** (Q1). Een uitbouwen-habit werkt toe naar een ideale versie, een gevestigde habit houdt een **minimale versie** als vangnet. Twee richtingen: omhoog naar het ideaal, of vasthouden op niveau met een vangnet naar beneden. Het doel is dus niet alleen "vaker per week": ook "meer per dag" (0,5 liter water → 2 liter) of "langer" (5 → 30 minuten lezen).
- **Elke trede begint opnieuw** (Q4): de telling van "hoe lang gaat het al goed" start bij elke nieuwe trede op nul. Een uitbouwen-habit wordt niet ingeburgerd zolang hij uitbouwt; hij kan wel **maximaal uitgebouwd** zijn.
- **De app mag nudgen, op basis van keren, niet van dagen** (Q2). Hoe en wanneer: zie "Wanneer is een nudge verantwoord?" hieronder.
- **Spotlight = (b)** (Q7): een stap-indicator ("trede 2 van 4") en een balk naar het doel op de kaart en de habit. Geen aparte sectie op Habits.

### Ontwerpvoorstel (bijgewerkt)

| Onderwerp | Voorstel | Reden |
|---|---|---|
| Soorten doel | **Frequentie** (4× per week; type `times_per_period`), **hoeveelheid** (teller: 0,5 → 2 liter) en **tekst** (ideale versie in woorden: "30 minuten lezen", met een huidige trede als tekst). Zie Q17 | Je voorbeeld (water) is een hoeveelheid; sporten is frequentie; veel habits zijn geen van beide |
| Gegevens | Eén nieuw optioneel veld op de habit: `goal: { kind, ideal, setOn, log }`. `ideal` is een ritme (frequentie), een tellerdoel (hoeveelheid) of een tekst. De stappen van ritme en tellerdoel staan al in de ritmeversies en het tellerdoel (zie Q18 voor de teller); het `log` bewaart elk besluit `{ date, choice, from, to, note }` (hoogstens ± 30) | Geen nieuwe collectie, **geen servermigratie** (zoals [WONT-DO.md](WONT-DO.md)) |
| Trede | De trede is de periode sinds de laatste verandering van ritme, tellerdoel of tekst. De telling voor de nudge (**keren op deze trede**) begint daar bij nul (Q4) | Je wens: het opbouwen reset zich bij elke trede |
| Besluit | Jij kiest elke trede zelf: **Opschalen** (voorstel +1 stap, maar jij kiest het getal, hoogstens tot het ideaal), **Blijven** of **Terugschakelen** (elke lagere trede, niet onder het minimum). De app beslist nooit | B1 |
| Nudge | Alleen op basis van keren op deze trede en hoe goed het ging. Zie hieronder | Q2 |
| Momenten | Een kaart in de weekreview (maandreview bij maandhabits) na de nudge-drempel; daarnaast altijd "Trede aanpassen" bij de habit | Q3: ja |
| Vandaag | Een uitbouwen-habit blijft op Vandaag staan tot hij uitgebouwd is | Een ingeburgerde habit verdwijnt anders van Vandaag |
| Fase | Fase **Uitbouwen** met "trede 2 van 4" in plaats van de gewone voortgang; geen "ingeburgerd" zolang hij uitbouwt (Q4) | Je antwoord op Q4 |
| Spotlight | Stap-indicator en balk naar het doel op de kaart en de habit ((b), Q7) | Q7 |
| Minimale versie | Blijft los bestaan als vangnet op slechte dagen (Q19) | Twee verschillende dingen: ideaal omhoog, minimaal omlaag |

### Wanneer is een nudge verantwoord? (onderzoek en voorstel)

Wat ik vond, met de kanttekening dat ik alleen **samenvattingen** kon raadplegen en niet de oorspronkelijke artikelen (te controleren voordat we iets in de app beweren):

| Bron | Wat het zegt | Wat ik ermee doe |
|---|---|---|
| Lally e.a. (2010), via [BPS Research Digest](https://bps.org.uk/research-digest/how-form-habit) en [uitleg van de resultaten](https://www.thebehavioralscientist.com/articles/how-long-to-form-a-habit) | Automatisme groeit langs een kromme die **eerst snel stijgt en dan afvlakt** (een asymptoot). De 66 dagen is de mediaan tot 95% van het eigen plafond (spreiding 18 tot 254 dagen) en gold voor een eenvoudige dagelijkse handeling | De meeste winst zit in de **eerste herhalingen**. Wachten tot het afgevlakt is (de volle 66 dagen) is bij een trede niet nodig |
| Gardner e.a. (2019), via [Frontiers in Psychology](https://www.frontiersin.org/articles/10.3389/fpsyg.2019.01556/pdf) | Automatisme hangt samen met **frequentie, stabiele context en beloning** | Tellen in keren klopt met de gedachte; "waarom" en cue blijven belangrijk bij een nieuwe trede |
| Geleide beheersing en zelfeffectiviteit, via [een overzicht](https://www.canaryhealth.com/?p=4322) en [Behavioural momentum](https://learnnovators.com/?p=23281) | Begin met iets wat lukt, bouw **geleidelijk** op, **grote sprongen breken de vaart**, en een trede moet uitdagend maar haalbaar zijn | Opschalen in kleine stappen; terugschakelen is een legitieme keuze |
| Gezocht en niet gevonden | Een **vaste drempel** ("na N keer opschalen") met onderzoek erachter. De bronnen zeggen alleen: opschalen als het **betrouwbaar lukt en comfortabel voelt**, terug als het wankel wordt | De drempel hieronder is mijn eigen afleiding en moet als **vuistregel** gepresenteerd worden, niet als bewezen feit |

**Mijn voorstel voor de nudge** (Q21), per trede:

1. **Aantal keren**: minstens de helft van wat "ingeburgerd" bij dat ritme vraagt (`requiredRepetitions` in [pace.js](../src/domain/pace.js)), met een ondergrens van 6 keer. Dagelijks: 27 keer. 2× per week: 6 keer. 1× per week of per maand: 6 keer. De helft komt uit de vorm van de kromme: bij 66 dagen voor 95% is na de helft van de tijd ongeveer driekwart van het plafond bereikt. Dat is een afleiding, geen meting.
2. **Hoe goed het ging**: minstens 80% van de eenheden op deze trede gehaald (de bestaande `CONSISTENCY_THRESHOLD`), en de laatste twee eenheden niet gemist.
3. **Optioneel**: als je het automatisme-cijfer hebt ingevuld en dat is 2 of lager, wachten (het kost nog moeite).
4. **De nudge zelf**: één rustige zin in de weekreview of op de habit ("Je hebt dit 8 keer gedaan op deze trede. Zin om een trede hoger te gaan, of blijf je hier?"). Met **Niet nu** komt hij pas na de helft van de drempel aan extra keren terug, nooit vaker dan eens per twee weken.
5. **De andere kant op**: gaat het op een trede onder de 50% over de laatste vier eenheden, dan mag de app zachtjes zeggen dat **terugschakelen mag**. Nooit als verwijt.

### Risico's

| # | Risico | Maatregel |
|---|---|---|
| R1 | Oudere appversie slaat een habit op en verliest `goal` | Test met het opslaan van een record met onbekende velden; zo nodig het veld laten passeren in de repository |
| R2 | Sync met twee toestellen: op twee plekken tegelijk opschalen | Laatste wijziging wint, zoals bij andere habitvelden; stappen blijven in de ritmeversies en het `log` |
| R3 | Het "ingeburgerd"-criterium en de uitbouw-fase botsen in [stats.js](../src/domain/stats.js) | Eén duidelijke regel (Q4, Q20) en tests per fase |
| R4 | Overbelasting van de weekreview | De kaart komt alleen voor habits met een doel en alleen als er een besluit aan toe is |
| R5 | De teller kent alleen gehele getallen tot 999 ([counter.js](../src/domain/counter.js)): 2 liter in ml (2000) past niet | Zie Q18 |
| R6 | Een "tekst"-doel kan de app niet narekenen: de nudge kan alleen op keren en slagingspercentage | Zie Q17 |
| R7 | De nudge-drempel is een vuistregel zonder bewijs in het onderzoek | Als vuistregel formuleren, instelbaar in [constants.js](../src/domain/constants.js), en later bijstellen op echt gebruik |

---


## F3: prestaties die kloppen, een herijking en prestaties per habit

### F3a: waarom "1× per maand" en "2× per week" te snel scoren
**Oorzaak (nagelezen in de code):**
- De mijlpalen per habit (`days_7`, `21`, `42`, `66`, `100`, `365`) tellen **kalenderdagen sinds de start** (`activeDays`) en een consistentie van minstens 50%, op de afgesloten eenheden. Bij een maandhabit is na één afgesloten maand met één keer gedaan de consistentie 100% en zijn `days_7` en `days_21` al binnen. Bij "2× per week" is `days_7` na één gehaalde week binnen.
- Een eenheid (week of maand) telt als één, hoe weinig er ook gebeurde. Daarom is "een **minimaal aantal keer gedaan**" de logische ondergrens.

**Eerste lezing van alle prestaties** (te bevestigen in de audit, to-do T3.1):

| Prestatie | Telt kalenderdagen of eenheden? | Mijn oordeel |
|---|---|---|
| `days_N` (per habit) | kalenderdagen + 50% consistentie | **te snel** voor zeldzame ritmes: minimum aantal keren nodig |
| `done_N` | keren gedaan | eerlijk |
| `streak_N` | dagen achter elkaar, alleen vaste dagen | eerlijk, maar flexibele habits kunnen hem nooit halen (zie Q13) |
| `perfect_week`, `perfect_weeks_4` | minstens 3 eenheden, allemaal gedaan | eerlijk |
| `comeback` (per habit) | een gemist stuk van ≥ 7 dagen en daarna weer gedaan | bij een maandhabit is één gemiste maand al genoeg; te beoordelen |
| `strong_return` | vensters met minstens 4 eenheden | al beschermd |
| `recover_5`, `minimal_*`, `counter_week`, `pause_resume`, reviews, vrienden | gebeurtenissen | niet afhankelijk van het ritme |
| `graduated_*` | ingeburgerd (al gekoppeld aan keren via [pace.js](../src/domain/pace.js)) | eerlijk |

**Uitkomst van de audit** (T3.1, 2026-11-09): alleen `days_N` was te snel en is aangepast. `comeback` bij een maandhabit laat ik staan: een hele gemiste maand en dan weer oppakken is een echte comeback. `streak_N` (dagen) kan een flexibele habit niet halen; daar zijn de nieuwe week- en maandreeksen voor. Een kanttekening: het minimum rekent met het ritme van **nu**; bij een habit die is opgeschaald (F1) vraagt het dus iets meer dan de eerdere treden samen gaven. Dat lossen we bij F1 op door de keren per trede te tellen.

**Voorstel voor het minimum** (Q9, akkoord): een mijlpaal per habit vraagt, naast de dagen, ook een aantal keren gedaan: `max(3, ⌈N ÷ 7 × (keer per week) × 0,8⌉)`. Voorbeelden: dagelijks `days_7` = 6 keer; 2× per week `days_7` = 3 keer (dus minstens twee weken); 1× per maand `days_21` = 3 keer (drie maanden). De 0,8 en de rekenmethode staan al in `REPETITIONS_SHARE` en `graduationPace`. Eén bron, in [constants.js](../src/domain/constants.js).

### F3b: reset
**Wat ik vond:** de regels zijn deterministisch en idempotent ([evaluateAchievements](../src/domain/achievements.js)). Wis je alle ontgrendelingen, dan **komt alles wat de gegevens verdienen bij de eerstvolgende controle vanzelf terug**, maar met de datum van die dag in plaats van de oorspronkelijke ([achievement-runner.js](../src/app/achievement-runner.js)). Een "reset" doet daarom in de praktijk alleen iets nuttigs als de regels strenger zijn geworden.

| Optie | Wat het doet |
|---|---|
| **Herijken** (voorstel) | Per ontgrendeling opnieuw toetsen aan de regels van nu: wat niet meer klopt gaat weg (zacht verwijderd, synct mee), wat klopt blijft **met de oorspronkelijke datum** |
| Volledige wis | Alles weg; wat verdiend is komt terug met de datum van vandaag |
| Eenmalig automatisch | Herijken één keer bij de eerste start na de update, zonder dat jij iets doet |

Risico R5: een gebruiker die nog op de **oude appversie** zit, ontgrendelt de verwijderde prestatie opnieuw en synct die terug. Mogelijke maatregel: een versienummer van de regels (`achievementRules: 2`) in de instellingen, zodat de nieuwe app weet dat hij moet herijken, en de oude app (met rust gelaten) hooguit opnieuw ontgrendelt tot hij vernieuwd is.

### F3c: prestaties per habit en het algemene scherm
**Wat er nu is:** `days_N`, `comeback` en `strong_return` worden al per habit bewaard (`habitId`). Het algemene scherm toont een prestatie als behaald zodra het **één keer** ergens is gehaald, met de naam van de habit eronder ([views/achievements.js](../src/ui/views/achievements.js)). Dat is precies wat het idee vraagt ("als hij één keer is gehaald, staat hij bij de algemene"). Wat ontbreekt: dezelfde lijst **op het habit-scherm**, met voortgang per habit ("42 van 66 dagen"), want de voortgang ([achievementProgress](../src/domain/achievements.js)) is nu alleen globaal.

| ID | Wat | Prio |
|---|---|---|
| UC3.1 | Op het habit-scherm een blok **Prestaties van deze habit**: behaald (met datum) en de eerstvolgende met voortgang | M |
| UC3.2 | Het algemene scherm blijft zoals het is, met "behaald bij: …" | M |
| UC3.3 | Nieuwe prestaties per habit (Q11: akkoord): keren gedaan bij deze habit | M |
| UC3.4 | Reeksen voor elk ritme: dagen, **weken** of **maanden** achter elkaar gehaald; bij week- en maandhabits breekt één gemiste periode de reeks meteen (Q13, Q22) | M |
| UC3.5 | Bij een uitbouwen-habit (F1): trede- en doelprestaties zichtbaar op de habit (Q11, Q23) | M |

---

## Vragen aan Remco

### Beantwoord (2026-11-09)

| # | Vraag | Antwoord | Wat ik ermee doe |
|---|---|---|---|
| Q1 | Welke ritmes mogen een doel? | **Ook dagelijkse.** Opbouwen werkt naar een **ideale versie** (2 liter water, nu 0,5); een gevestigde habit werkt "op niveau" met een **minimale versie** | Doel uitgebreid van alleen frequentie naar frequentie, hoeveelheid en tekst (nieuwe vraag Q17, Q18, Q19) |
| Q2 | Hoe kies je de stappen? | Jij kiest, maar de app mag **nudgen** als het al lang goed gaat, op basis van **aantal keren**, niet dagen. Ik zoek uit wanneer dat verantwoord is | Onderzoek en voorstel staan bij F1; keuze in Q21 |
| Q3 | Wanneer reflecteren? | Ja (weekreview na de drempel, plus altijd een knop) | Opgenomen |
| Q4 | Wanneer ingeburgerd? | Een opbouwende habit haalt **geen** ingeburgerd, maar kan wel **maximaal opbouwend** zijn; het opbouwen **reset bij elke trede** | Telling per trede; wat na het maximum gebeurt: Q20 |
| Q5 | Terugschakelen naar 0? | Akkoord: nee, minimaal 1× | Opgenomen |
| Q6 | Bestaande habits omzetten? | Ja | Opgenomen |
| Q7 | Wat is de spotlight? | **(b)**: stap-indicator en balk naar het doel op de kaart | Geen aparte sectie op Habits |
| Q8 | Naam in de app? | **Uitbouwen** | Opgenomen |
| Q9 | Minimum aantal keren voor mijlpalen | Akkoord, voor alle prestaties waar het kan | Naar de audit (T3.1, T3.2) |
| Q10 | Wat doet "reset"? | Akkoord: **herijken**, eenmalig automatisch plus een knop in Instellingen | T3.4 |
| Q11 | Prestaties per habit | Akkoord, **en "uitgebouwd" erbij**: een paar prestaties rond uitbouwen, met iconen | UC1.10 is nu "moet"; voorstel in Q23 |
| Q12 | Wat toont het habit-scherm? | Akkoord: behaald plus de eerstvolgende per soort | Opgenomen |
| Q13 | Reeksen voor flexibele habits | **Ja, alles mag een reeks halen.** Bij week- en maandhabits breekt een gemiste periode de reeks meteen: een reeks moet iets betekenen. Bij dagelijkse habits valt daar nog wat over te zeggen | Reeksen per eenheid; wat voor dagelijkse geldt: Q22 |
| Q14 | Sociale gevolgen? | Akkoord: privé, buiten de punten | Opgenomen |
| Q15 | Volgorde en release | Akkoord | Zie de to-do |
| Q16 | F2: drie kalenderdagen, ook de maandreview | Akkoord | B4 is een besluit |
| Q17 | Welke soorten doel? | "Meer lezen" is een slecht doel. Een **kwartier lezen** met als ideaal **een uur** is een goed doel; na **x keer** een kwartier (het gaat goed) pas je aan naar **30 minuten**, enzovoort | Het tekstdoel is een **concrete trede** plus een concreet ideaal, geen vage wens. Het formulier zegt dat ("een kwartier lezen", niet "meer lezen"). De app telt de keren en nudgt; jij typt de volgende trede |
| Q18 | Teller: gehele getallen tot 999 | Akkoord: maximum omhoog, gehele getallen | T1.2 |
| Q19 | Minimale versie bij uitbouwen? | Akkoord: ja, los van het ideaal | B13 |
| Q20 | Na het hoogste niveau? | **Uitgebouwd** moet daarna nog steeds **ingeburgerd** worden. Wellicht een **boost** bij elke trede: je begint niet op nul maar gaat verder waar je gebleven was | Ja op het gewone traject erna. De boost werk ik uit als vraag Q24 |
| Q21 | De nudge-regel | Akkoord | B14 |
| Q22 | Reeksen: streng, drempels | Akkoord | B15; gebouwd (T3.11) |
| Q23 | Prestaties voor uitbouwen, met iconen | Akkoord | T1.12 |
| Q24 | De boost bij een nieuwe trede | Akkoord: tegoed van de helft van de keren op de vorige trede, hoogstens de helft van de nudge-drempel van de nieuwe trede | B18, T1.14 |
| Q25 | Pushen en een pull request naar `develop` | Ja | Gedaan |

### Open vragen

Geen. Q24 (de boost) en Q25 (pushen en een pull request) zijn akkoord; zie B18. Nieuwe vragen komen hier weer te staan zodra het bouwen van F1 ze oplevert.

---

## To-do

Ik vink af wat klaar is en voeg toe wat ik onderweg vind. Een item met **?** wacht op een antwoord hierboven.

### F2 (klaar)
- [x] Regel `usedLongEnough` en `firstUseDate`, meldingen, push, kaart ("Nog even gebruiken")
- [x] Tests voor regel, meldingen en push (1174 groen)
- [x] Testgegevens van de layout-check teruggedateerd
- [x] Q16 bevestigd
- [ ] `npm run check:layout` draaien op de branch (heeft Chrome en de lokale database nodig); ook voor de nieuwe sectie "Prestaties herijken" in Instellingen

### F3a: tellingen herstellen (eerstvolgende stap)
- [x] T3.1 Audit van alle sleutels (zie "Uitkomst van de audit" bij F3a) en tests per ritme (dagelijks, 2× per week, 1× per maand)
- [x] T3.2 Minimum aantal keren (Q9): `milestoneRepetitions` in [pace.js](../src/domain/pace.js), `MILESTONE_MIN_REPETITIONS` in `constants.js`. (De voortgang "2 van 3 keer" in de detailtekst staat nog open, zie T3.13)
- [x] T3.3 Teksten in [content/achievements.js](../src/content/achievements.js) aangepast
- [x] T3.4 Herijken (Q10): `staleAchievements`, `recalibrateAchievements`, eenmalig bij de start (wacht op de eerste sync bij een account) en een knop in Instellingen met bevestiging
- [x] T3.5 Versie van de regels (`achievementRules`) in de instellingen; de knop in Instellingen vangt het geval op dat een oude appversie een ingetrokken mijlpaal weer ontgrendelt (R5)
- [x] T3.6 Back-up: `achievementRules` reist mee in de instellingen; een oude back-up zonder het veld wordt bij de volgende start weer herijkt
- [x] T3.11 Reeksen per eenheid (Q13, Q22): `weekstreak_2/4/8/13` en `monthstreak_3/6/12`, streng, met zeven nieuwe iconen ([docs/icons/icons-ronde3.html](icons/icons-ronde3.html)). Wie ze al verdiend had, krijgt ze bij de eerstvolgende controle vanzelf, met de datum van die dag (de regels rekenen de geschiedenis niet per datum na)
- [ ] T3.12 De getoonde reeks op de habit laat één gemiste dag niet meteen afbreken (Q22: dagelijks soepel in de weergave, streng voor prestaties)
- [ ] T3.13 De detailtekst van een mijlpaal toont "2 van 3 keer" voor de habit

### F1: uitbouwen
- [ ] T1.1 Domein: `goal` valideren in [habit.js](../src/domain/habit.js) voor de soorten uit Q17 (frequentie: alleen `times_per_period` boven het huidige aantal; hoeveelheid: boven het huidige tellerdoel)
- [ ] T1.2 Q18 Tellerbereik omhoog (9999) en gehele getallen houden; controleren bij back-up en server (de server bewaakt geen waarden)
- [ ] T1.3 Domein: de trede (`stepStart`, keren op deze trede) en de nudge-regel (Q21) in een nieuw bestand, zuiver en getest met tabeltests per ritme
- [ ] T1.4 Domein: fase "Uitbouwen" in [phases.js](../src/domain/phases.js) en [stats.js](../src/domain/stats.js); geen "ingeburgerd" zolang hij uitbouwt, en blijven op Vandaag (Q4)
- [ ] T1.5 Q20 Na het maximum: prestatie *Uitgebouwd*, het doel gaat uit beeld en de habit volgt het gewone traject (ingeburgerd haalbaar; alle keren van de hele habit tellen mee)
- [ ] T1.14 Q24 De boost: tegoed bij een nieuwe trede in de nudge-regel (T1.3), instelbaar in `constants.js`
- [ ] T1.15 Tekstdoel (Q17): het formulier vraagt een concrete trede en een concreet ideaal, met een hint dat "meer lezen" geen trede is
- [ ] T1.6 Handelingen: opschalen, blijven en terugschakelen in [actions.js](../src/app/actions.js) (hergebruikt de ritmeversie en het tellerdoel), met logboek en ongedaan maken
- [ ] T1.7 Weekreview-kaart "Hoe ging het op deze trede?" met drie keuzes en een notitie; ook bij de habit
- [ ] T1.8 Habitformulier: doel instellen en bestaande habit omzetten (Q6), uitleg in gewone taal ("Waar wil je uiteindelijk naartoe?")
- [ ] T1.9 Spotlight (b): stap-indicator en balk naar het doel op de kaart en de habit; layout op 390 px, 320 px en 320 px met 200% tekst
- [ ] T1.10 Test: opslaan door een oudere appversie verliest `goal` niet (R1)
- [ ] T1.11 Uitleg in "Zo werkt het" ([guide.js](../src/content/guide.js)); privacy: geen nieuwe soort gegevens naar de server, te bevestigen
- [ ] T1.12 Prestaties voor uitbouwen met iconen (Q23)
- [ ] T1.13 Uitlegfilmpje bijwerken, alleen als je dat wilt ([tools/film](../tools/film))

### F3c: prestaties per habit
- [ ] T3.7 Voortgang per habit in het domein (`achievementProgress` met habit)
- [ ] T3.8 Nieuwe sleutels (keren per habit: 10, 25, 50, 100) met teksten en iconen volgens [MODA-ICONS.md](MODA-ICONS.md)
- [ ] T3.9 Blok "Prestaties van deze habit" in [views/habit-detail.js](../src/ui/views/habit-detail.js): behaald plus de eerstvolgende per soort (Q12)
- [ ] T3.10 Het algemene scherm: "behaald bij: …" blijft, controleren met de nieuwe sleutels

### Afronden per release
- [ ] Alle tests groen, `check:layout` en `audit:scroll` op de branch
- [ ] Release-notities (RELEASE-v1.5.2 en 1.6) en het verhogen van `appVersion` in de release-PR
- [ ] Geen servermigratie nodig (te bevestigen bij T1.10 en T3.5); zo toch, dan eerst lokaal en achterwaarts compatibel

## Besluiten (tot nu toe)

| # | Besluit | Reden |
|---|---|---|
| B1 | Uitbouwen is een keuze van de gebruiker per trede; de app stelt voor en mag nudgen, maar beslist nooit | Remco, 2026-11-09 |
| B2 | Uitbouwen-habits krijgen een spotlight: een stap-indicator en een balk naar het doel (geen aparte sectie) | Remco, 2026-11-09 (Q7) |
| B3 | De stappen van het ritme staan in de bestaande ritmeversies; het doel is nieuw | Geen migratie, geschiedenis klopt vanzelf |
| B4 | De review wacht drie kalenderdagen, ook de maandreview | Remco, 2026-11-09 (Q16) |
| B5 | Eén bron voor het minimum aantal keren, afgeleid van het tempo van de habit | Zoals `graduationPace`; geen losse getallen per prestatie |
| B6 | Ook dagelijkse habits mogen uitbouwen; het doel is een **ideale versie** (omhoog), de **minimale versie** blijft het vangnet (omlaag) | Remco, 2026-11-09 (Q1) |
| B7 | De nudge telt **keren op de huidige trede**, niet dagen sinds de start; elke nieuwe trede begint bij nul | Remco, 2026-11-09 (Q2, Q4) |
| B8 | Een uitbouwen-habit kan niet ingeburgerd worden zolang hij uitbouwt | Remco, 2026-11-09 (Q4) |
| B9 | Terugschakelen kan tot minimaal 1×; voor pauzeren bestaat Pauzeren | Remco, 2026-11-09 (Q5) |
| B10 | Prestaties blijven privé en buiten de punten | Remco, 2026-11-09 (Q14) |
| B11 | Herijken van prestaties in plaats van alles wissen, eenmalig automatisch plus een knop | Remco, 2026-11-09 (Q10) |
| B12 | Alle habits mogen een reeks halen; bij week- en maandhabits breekt één gemiste periode de reeks meteen | Remco, 2026-11-09 (Q13) |
| B13 | Een uitbouwen-habit mag een minimale versie hebben, los van het ideaal | Remco, 2026-11-09 (Q19) |
| B14 | De nudge volgt de regel uit F1 (helft van de ingeburgerd-keren, ondergrens 6, 80% gehaald, de laatste twee niet gemist), als vuistregel gepresenteerd | Remco, 2026-11-09 (Q21) |
| B15 | Reeksen: week- en maandhabits streng; dagelijks streng voor prestaties; drempels 7/14/30 dagen, 2/4/8/13 weken, 3/6/12 maanden | Remco, 2026-11-09 (Q22) |
| B16 | Een tekstdoel is een concrete trede met een concreet ideaal ("een kwartier lezen" → "een uur"), niet een vage wens | Remco, 2026-11-09 (Q17) |
| B17 | Na "uitgebouwd" volgt het gewone traject en kan de habit ingeburgerd worden | Remco, 2026-11-09 (Q20) |
| B18 | De boost: een nieuwe trede start met een tegoed van de helft van de keren op de vorige trede, hoogstens de helft van de nudge-drempel van de nieuwe trede; instelbaar in `constants.js` | Remco, 2026-11-09 (Q24) |
