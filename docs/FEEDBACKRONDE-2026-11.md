# Feedbackronde november 2026: uitbouwen, wachten met de review, prestaties per habit

Status: **in analyse** · opgesteld 2026-11-09 · bron: drie ideeën uit de feedbackhub (v1.5.1, zie [FEEDBACK.md](FEEDBACK.md)) · bouwt voort op [PLAN.md](PLAN.md) §4.5 en §4.7, [AUTOMATISME.md](AUTOMATISME.md), [FLEXIBELE-TAKEN.md](FLEXIBELE-TAKEN.md) · werkwijze: [WERKWIJZE.md](WERKWIJZE.md)

Dit bestand is mijn werklijst voor deze ronde. Ik werk het bij zodra jij antwoordt of ik iets nieuws vind. Alles wat ik niet zelf kan of mag beslissen staat onder **Vragen aan Remco**, met mijn voorstel erbij, zodat "ja" genoeg is.

## Overzicht

| # | Idee (feedbackhub) | Soort | Omvang | Status |
|---|---|---|---|---|
| F1 | Een habit kunnen **uitbouwen**: een doel ("4× per week sporten") waar je naartoe groeit, met reflectie en op- of terugschakelen | nieuwe feature | groot | analyse klaar, wacht op antwoorden (Q1–Q8) |
| F2 | Het weekoverzicht pas klaar na minstens 3 dagen gebruik | verbetering | klein | **gebouwd** op deze branch |
| F3 | Prestaties: 1× per maand of 2× per week moet anders tellen, een mogelijke reset, en prestaties per habit naast het algemene scherm | verbetering + nieuwe weergave | middel–groot | analyse klaar, wacht op antwoorden (Q9–Q14) |

Voorgestelde volgorde: **F2** (klaar) → **F3a** (de tellingen herstellen, want daar zit een fout in) → **F1** → **F3c** (prestaties per habit, ook voor de uitbouw-habits). Zie Q15.

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
| UC1.1 | Bij het maken of bewerken van een habit kun je een **doel** instellen naast het ritme van nu ("Nu 1× per week, doel 4× per week") | M |
| UC1.2 | Het doel is overal zichtbaar waar de habit staat: de kaart, de habit zelf en Voortgang, met de stap ("stap 2 van 4") en een balk naar het doel | M |
| UC1.3 | Op een rustig moment (voorstel: in de weekreview) vraagt de app: *hoe ging het op dit niveau?* Je kiest **Opschalen**, **Blijven** of **Terugschakelen**. De app beslist nooit zelf | M |
| UC1.4 | Opschalen of terugschakelen maakt een nieuwe ritmeversie met ingang vandaag (bestaande mechaniek). De vorige stap blijft in de geschiedenis | M |
| UC1.5 | Een korte notitie bij het besluit ("wat merkte je?"), terug te lezen bij de habit | S |
| UC1.6 | Een habit **zonder** doel werkt precies zoals nu | M |
| UC1.7 | Doel bereikt: de habit gaat gewoon het gewone traject in (vast worden op dat niveau, dan ingeburgerd) | M |
| UC1.8 | Het doel aanpassen of weghalen kan altijd (een doel van 4 wordt 3) | M |
| UC1.9 | Een bestaande habit omzetten naar uitbouwen | S |
| UC1.10 | Prestaties voor uitbouwen: eerste keer opgeschaald, doel bereikt, terugschakelen "mag ook" (zoals "Pauzeren is oké") | C |

### Ontwerpvoorstel
| Onderwerp | Voorstel | Reden |
|---|---|---|
| Gegevens | Eén nieuw optioneel veld op de habit: `goal: { schedule, setOn }` (alleen `times_per_period`). De stappen zelf staan al in `schedules`; besluiten met notitie in `goal.log: [{ date, choice, from, to, note }]` (kort, hoogstens ± 20) | Geen nieuwe collectie, **geen servermigratie** (zoals bij [WONT-DO.md](WONT-DO.md)); de server bewaakt alleen collectienamen |
| Terugwaarts | Een oudere app kent `goal` niet en negeert het. **Te controleren**: dat een oude app bij het opslaan het veld niet weggooit (hij spreidt het bestaande record, dus waarschijnlijk niet) | Zie risico R1 |
| Besluit | Opschalen stelt +1 voor, maar je kiest zelf elk aantal tot het doel; terugschakelen elk lager aantal (minstens 1) | Jij kiest zelf, zoals je aangaf |
| Moment | Een kaart in de weekreview ("Je doet X nu 2× per week, doel 4×. Hoe ging het?") **na minstens 2 volle weken** op een stap; daarnaast altijd een knop "Stap aanpassen" bij de habit. Voor een maandhabit: in de maandreview | Reflectie hoort bij de bestaande reviews; wachten voorkomt een besluit na één week |
| Vandaag | De habit blijft op Vandaag staan tot het doel is gehaald, ook als de gewone regels hem "ingeburgerd" noemen | Anders verdwijnt hij net als hij moet groeien |
| Fase | Zolang het doel niet is gehaald: fase **Uitbouwen** met "stap 2 van 4" in plaats van de gewone voortgang; ingeburgerd telt pas op doelniveau | Anders wordt een habit "ingeburgerd" op 1× per week |
| Spotlight | Zie Q7 | |

### Risico's
| # | Risico | Maatregel |
|---|---|---|
| R1 | Oudere appversie slaat een habit op en verliest `goal` | Test met het opslaan van een record met onbekende velden; zo nodig het veld laten passeren in de repository |
| R2 | Sync met twee toestellen: op twee plekken tegelijk opschalen | Laatste wijziging wint, zoals bij andere habitvelden; stappen blijven in `schedules` |
| R3 | Het "ingeburgerd"-criterium en de uitbouw-fase botsen in stats ([stats.js](../src/domain/stats.js)) | Eén duidelijke regel (zie Q4) en tests per fase |
| R4 | Overbelasting van de weekreview | De kaart komt alleen voor habits met een doel en alleen als er een besluit aan toe is |

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

**Voorstel voor het minimum** (Q9): een mijlpaal per habit vraagt, naast de dagen, ook een aantal keren gedaan: `max(3, ⌈N ÷ 7 × (keer per week) × 0,8⌉)`. Voorbeelden: dagelijks `days_7` = 6 keer; 2× per week `days_7` = 3 keer (dus minstens twee weken); 1× per maand `days_21` = 3 keer (drie maanden). De 0,8 en de rekenmethode staan al in `REPETITIONS_SHARE` en `graduationPace`. Eén bron, in [constants.js](../src/domain/constants.js).

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
| UC3.3 | Nieuwe prestaties per habit (Q11), bijvoorbeeld keren gedaan bij deze habit | S |
| UC3.4 | Voor flexibele ritmes een eigen reeks: **weken (of maanden) achter elkaar gehaald**, naast de dagenreeks | S |
| UC3.5 | Bij een uitbouwen-habit (F1): stap- en doelprestaties zichtbaar op de habit | C |

---

## Vragen aan Remco

Antwoord gerust kort ("ja", "nee, want …" of een nummer). Mijn voorstel staat vooraan.

### F1: uitbouwen
| # | Vraag | Mijn voorstel | Antwoord |
|---|---|---|---|
| Q1 | Welke ritmes mogen een doel hebben? | Alleen "N× per week" en "N× per maand" (aantal opschalen is daar eenduidig). Vaste weekdagen nog niet: daar is "een dag erbij" een andere keuze (welke dag?) | |
| Q2 | Hoe kies je de stappen? | Geen vaste trap: bij elk besluit kies jij het aantal (voorstel +1, hoogstens tot het doel) | |
| Q3 | Wanneer vraagt de app om te reflecteren? | Na minstens 2 volle weken op een stap, als kaart in de weekreview; altijd ook een knop "Stap aanpassen" bij de habit | |
| Q4 | Wanneer is zo'n habit "ingeburgerd"? | Pas op **doelniveau** (met de gewone regels daar). Tot dan blijft hij op Vandaag en toont de fase "Uitbouwen, stap 2 van 4" | |
| Q5 | Mag je terugschakelen naar 0 (pauzeren)? | Nee, minimaal 1×; voor pauzeren bestaat Pauzeren al | |
| Q6 | Bestaande habits omzetten? | Ja: "Doel instellen" bij Habit bewerken, voor een habit met N× per week/maand | |
| Q7 | Wat is de **spotlight** precies? | (a) een eigen sectie bovenaan Habits ("Aan het uitbouwen") en (b) op de kaart een stap-indicator en een balk naar het doel; (c) eigen prestaties volgen via F3c. Past dat, of denk je aan meer? | |
| Q8 | Hoe noemen we het in de app? | "Uitbouwen" (werkwoord) en "Doel" (de stip). Alternatieven: "Groeigewoonte", "Stip op de horizon" | |

### F3: prestaties
| # | Vraag | Mijn voorstel | Antwoord |
|---|---|---|---|
| Q9 | Het minimum aantal keren voor mijlpalen per habit | `max(3, ⌈N ÷ 7 × per week × 0,8⌉)`, zie F3a. Ook voor alle andere prestaties waar het kan; geen apart minimum voor `done_N` (telt al keren) | |
| Q10 | Wat doet "reset"? | **Herijken** (wat niet meer klopt weg, de rest behoudt zijn datum), eenmalig automatisch bij de eerste start na de update **én** een knop in Instellingen. Geen volledige wis, tenzij jij dat wilt | |
| Q11 | Welke prestaties per habit komen erbij? | Keren gedaan per habit (10, 25, 50, 100) en weken op rij voor flexibele ritmes; de huidige drie blijven | |
| Q12 | Wat toont het habit-scherm? | Alles behaald plus **de eerstvolgende** per soort met voortgang, niet de hele lijst (te druk op een telefoon) | |
| Q13 | Mogen flexibele habits (2× per week) een reeks halen? | Ja, als aparte reeks in **weken**: `weekstreak_2/4/8`, niet in dagen | |
| Q14 | Komen er per habit ook sociale gevolgen (de puntentelling met vrienden)? | Nee, achievements blijven privé en buiten de punten (zoals nu) | |

### Planning en afspraken
| # | Vraag | Mijn voorstel | Antwoord |
|---|---|---|---|
| Q15 | Volgorde en release | F2 klaar. Dan F3a + herijking (herstelt een fout) als 1.5.2; daarna F1 met F3c als 1.6. Akkoord? | |
| Q16 | F2: drie kalenderdagen sinds de eerste vastlegging, ook voor de maandreview | Zo laten | |

---

## To-do

Ik vink af wat klaar is en voeg toe wat ik onderweg vind. Een item met **?** wacht op een antwoord hierboven.

### F2 (klaar, wacht op jouw akkoord)
- [x] Regel `usedLongEnough` en `firstUseDate`, meldingen, push, kaart ("Nog even gebruiken")
- [x] Tests voor regel, meldingen en push (1174 groen)
- [x] Testgegevens van de layout-check teruggedateerd
- [ ] `npm run check:layout` draaien op de branch (heeft Chrome en de lokale database nodig)
- [ ] Q16 bevestigen

### F3a: tellingen herstellen
- [ ] T3.1 Audit van alle sleutels in `ACHIEVEMENT_KEYS` tegen de tabel hierboven, met een test per ritme (dagelijks, 2× per week, 1× per maand)
- [ ] T3.2 Q9: minimum in `constants.js` en in `evaluateAchievements`; ook de voortgang ("2 van 3 keer") in de detailtekst
- [ ] T3.3 Teksten in [content/achievements.js](../src/content/achievements.js) aanpassen ("… en minstens X keer gedaan")
- [ ] T3.4 **?** Q10: herijken (domein + runner), eenmalig bij de start en een knop in Instellingen, met een bevestiging en een toast
- [ ] T3.5 Versie van de regels in de instellingen (R5), met een test voor "oude app ontgrendelt opnieuw"
- [ ] T3.6 Back-up: herijken verandert de export niet, controleren

### F1: uitbouwen
- [ ] T1.1 **?** Q1 Domein: `goal` valideren in [habit.js](../src/domain/habit.js) (alleen `times_per_period`, doel boven het huidige aantal, zelfde periode)
- [ ] T1.2 Domein: fase "Uitbouwen" in [phases.js](../src/domain/phases.js) en [stats.js](../src/domain/stats.js), en "blijft op Vandaag" bij `graduated` (Q4)
- [ ] T1.3 Handelingen: opschalen, blijven en terugschakelen in [actions.js](../src/app/actions.js) (hergebruikt de ritmeversie), met een log en ongedaan maken
- [ ] T1.4 **?** Q3 Weekreview-kaart "Hoe ging het op dit niveau?" met drie keuzes en een notitie
- [ ] T1.5 Habitformulier: doel instellen (Q6), uitleg in gewone taal
- [ ] T1.6 **?** Q7 Spotlight op Habits, Vandaag en de habit zelf; layout op 390 px, 320 px en 320 px met 200% tekst
- [ ] T1.7 Test: opslaan door een oudere appversie verliest `goal` niet (R1)
- [ ] T1.8 Uitleg in "Zo werkt het" ([guide.js](../src/content/guide.js)) en de Voorwaarden/Privacy ongewijzigd (geen nieuwe soort gegevens naar de server: te bevestigen)
- [ ] T1.9 Uitlegfilmpje bijwerken? (Alleen als jij dat wilt, zie [explainer-film](../tools/film))

### F3c: prestaties per habit
- [ ] T3.7 **?** Q11 Voortgang per habit in het domein (`achievementProgress` met habit)
- [ ] T3.8 Nieuwe sleutels (keren per habit, weken op rij) en hun teksten en iconen: iconen volgens [MODA-ICONS.md](MODA-ICONS.md); ik teken ze zelf in dezelfde set
- [ ] T3.9 **?** Q12 Blok "Prestaties van deze habit" in [views/habit-detail.js](../src/ui/views/habit-detail.js)
- [ ] T3.10 Het algemene scherm: "behaald bij: …" blijft, controleren met de nieuwe sleutels

### Afronden per release
- [ ] Alle tests groen, `check:layout` en `audit:scroll` op de branch
- [ ] Release-notities (RELEASE-v1.5.2 en 1.6) en het verhogen van `appVersion` in de release-PR
- [ ] Geen servermigratie nodig (te bevestigen bij T1.7 en T3.5); zo toch, dan eerst lokaal en achterwaarts compatibel

## Besluiten (tot nu toe)

| # | Besluit | Reden |
|---|---|---|
| B1 | Uitbouwen is een keuze van de gebruiker per stap; de app stelt voor, beslist nooit | Remco, 2026-11-09 |
| B2 | Uitbouwen-habits krijgen een spotlight, omdat ze zowel moeten inslijten als uitdijen | Remco, 2026-11-09 |
| B3 | De stappen staan in de bestaande ritmeversies; alleen het doel is nieuw | Geen migratie, geschiedenis klopt vanzelf |
| B4 | De review wacht drie kalenderdagen, ook de maandreview | Mijn aanname, te bevestigen (Q16) |
| B5 | Eén bron voor het minimum aantal keren, afgeleid van het tempo van de habit | Zoals `graduationPace`; geen losse getallen per prestatie |
