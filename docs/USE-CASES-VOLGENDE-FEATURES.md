# Use cases en onderzoek voor vier volgende features

Status: **voorstel, niets gebouwd** · opgesteld 2026-10-17 · bouwt voort op [PLAN.md](PLAN.md), [SOCIAAL.md](SOCIAAL.md), [ITERATIE-1.2.md](ITERATIE-1.2.md) en [DATAMODEL.md](DATAMODEL.md)

| # | Feature | Omvang | Mijn advies voor de volgorde |
|---|---|---|---|
| 3 | Nog steeds ingeburgerd? | klein–middel | **eerst**: bouwt de herbruikbare bouwsteen "habit opnieuw oppakken" |
| 1 | Terug naar af | middel | **tweede**: gebruikt die bouwsteen en de nieuwe "ronde" |
| 4 | Play Store en App Store | onderzoek + spike | **parallel**: Android-spike kan nu, los van de rest |
| 2 | Groepen met taken en verantwoordelijken | groot (nieuw product) | **laatst**, na een gesprek met een paar echte huishoudens |

Leeswijzer. Elke use case heeft een ID (UC1.1, UC2.4, …), een hoofdscenario, alternatieven en uitzonderingen. **Prioriteit** is M (moet), S (zou moeten) of C (kan). Bij elk onderdeel staat wat er **nog besloten** moet worden; mijn voorstel staat erbij. Uitspraken uit het onderzoek (feature 4) zijn gemarkeerd: **✓** = gecontroleerd bij de bron, **?** = uit mijn eigen kennis of een niet-officiële bron, eerst controleren.

---

## Gemeenschappelijke bouwstenen

Drie van de vier features hebben dezelfde onderdelen nodig. Eén keer goed bouwen scheelt veel.

| Bouwsteen | Wat | Gebruikt door |
|---|---|---|
| **Habit opnieuw oppakken** | Een habit krijgt een nieuwe start: dezelfde naam, hetzelfde ritme, de "waarom"-zin en de cue blijven; de opbouw begint weer bij dag 1; de oude geschiedenis blijft leesbaar. | F3 ("weer oppakken") en F1 (per habit bij Terug naar af) |
| **Afronden zonder falen** | Een habit eindigt als "niet meer nodig", als succes en zonder dat de app er nog naar vraagt. Bestaat al als status `archived` met een einddatum; wat ontbreekt is de reden en de toon. | F3 ("niet meer nodig") en F1 ("laten gaan") |
| **Ronde** | Een afgebakende periode van je gebruik (start, einde). Prestaties, punten en statistieken tellen alleen binnen de huidige ronde. | F1 |

Een ronde is geen nieuw woord voor de gebruiker; in de app heet het "vorige keer" of "je vorige ronde". Hieronder gebruik ik "ronde" als werkterm.

---

## Feature 3: Nog steeds ingeburgerd?

### Doel
Een habit die ingeburgerd is, blijft niet eeuwig "ingeburgerd" zonder dat iemand het weet. Af en toe vragen we vriendelijk hoe het gaat, en geven drie uitwegen: het gaat nog goed, ik wil het weer oppakken, of ik heb het niet meer nodig.

### Wat er nu is (uit de code)
- Een ingeburgerde habit (`status: 'graduated'`) staat **standaard niet meer op Vandaag** (`maintenance: false`, [actions.js:146](../src/app/actions.js#L146)). In onderhoudsmodus blijft hij wel staan.
- Gevolg voor dit ontwerp: voor de meeste ingeburgerde habits **ontbreekt er gedrag om uit af te leiden of het nog goed gaat**. De vraag moet dus **op tijd** gebaseerd zijn, niet alleen op afvinken. Voor habits in onderhoud kan het ook op gedrag (zie UC3.2).
- De "stil"-signalen uit §4.9 gelden alleen voor wat gevolgd wordt (`isTracked`), dus niet voor ingeburgerde habits zonder onderhoud.

### Actoren
Gebruiker · Systeem (plant de vraag in).

### Use cases

**UC3.1 Een check-in ontvangen (S→M)**
- *Aanleiding:* een ingeburgerde habit heeft zijn volgende meetmoment bereikt.
- *Voorwaarden:* de habit is `graduated`, niet gepauzeerd, de gebruiker heeft de afgelopen 7 dagen geen andere check-in beantwoord (zie "niet vaker dan").
- *Hoofdscenario:* de gebruiker ziet op Vandaag (of in de weekreview) een rustige kaart: *"Je bent al 9 weken zo ver met Wandelen. Doe je het nog steeds?"* met drie keuzes: **Ja, nog steeds** · **Weer oppakken** · **Niet meer nodig**. Hij kiest er één.
- *Uitkomsten:* zie UC3.3, UC3.4, UC3.5.
- *Alternatief:* **Later** (zet de vraag een week door). Staat er als vierde, kleinere keuze.
- *Alternatief:* de gebruiker negeert de kaart. Na 7 dagen schuift hij zelf door; er is geen straf en geen teller.
- *Eis:* de toon is neutraal en waarderend, nooit verwijtend (PLAN §2).

**UC3.2 Een check-in op gedrag, voor habits in onderhoud (S)**
- *Aanleiding:* een ingeburgerde habit in onderhoud is al lang niet afgevinkt (de bestaande "stil"-regel).
- *Hoofdscenario:* de vraag in UC3.1 krijgt de feiten erbij: *"Je hebt Wandelen 5 weken niet afgevinkt. Doe je het nog?"* In plaats van de aandachtskaart voor "stil": één kaart, één vraag.
- *Reden:* een habit in onderhoud heeft twee signalen (stil, en nog ingeburgerd) die in één vraag samenvallen. Niet twee kaarten voor hetzelfde.

**UC3.3 "Ja, nog steeds"**
- *Uitkomst:* de habit blijft ingeburgerd; het volgende meetmoment schuift op (voorstel: telkens 1,5× zo ver als de vorige keer, met een maximum van 12 maanden).
- *Variant:* *"Nog steeds, maar stel niet meer die vraag"* (S): de habit blijft ingeburgerd en de app vraagt er nooit meer naar.

**UC3.4 "Weer oppakken" (de bouwsteen)**
- *Hoofdscenario:* de gebruiker kiest **Weer oppakken**. De app laat zien wat er gebeurt ("Je begint weer bij dag 1; je oude geschiedenis blijft bewaard") en vraagt één ding: *"Wil je het ritme aanpassen?"* met de huidige afspraak als standaard. Bevestigen zet de habit terug op `active` met een nieuwe startdatum (vandaag) en zet hem op Vandaag.
- *Wat blijft:* naam, icoon, cue, waarom, minimale versie, teller, de oude check-ins en de beoordelingen.
- *Wat begint opnieuw:* de fase (Opstarten), de sterkte, de reeks, de telling naar "ingeburgerd" en de eerste volle periode (geen "stil"/"te laat" in de eerste aangebroken periode, zoals nu).
- *Uitzondering:* de prestatie *Ingeburgerd* die al behaald is blijft bestaan. Een tweede keer ingeburgerd worden telt niet dubbel voor *Tweede/Vijfde ingeburgerd* (er wordt per habit geteld).
- *Alternatief:* de gebruiker past het ritme aan en landt op een ander schema. De oude eenheden blijven ongewijzigd (zoals nu bij een cadence-wijziging).

**UC3.5 "Niet meer nodig" (de bouwsteen)**
- *Hoofdscenario:* de gebruiker kiest **Niet meer nodig**. De app zegt *"Mooi: dan heeft Wandelen zijn werk gedaan"* en zet de habit op `archived` met reden `no_longer_needed` en de datum. Hij verdwijnt van Vandaag en uit de aandachtslijsten en wordt nooit meer gevraagd.
- *Waar blijft hij:* in een lijst "Afgerond" onder Habits, met zijn geschiedenis. Terugzetten kan altijd (UC3.4 vanaf daar).
- *Eis:* telt nergens als mislukking: niet in de weekreview, niet in "stil", niet in punten.

**UC3.6 Instellen hoe vaak er gevraagd wordt (C)**
- Onder Instellingen: *"Vraag me of ingeburgerde habits nog kloppen"*: aan/uit. Standaard aan. De aan/uit staat in de instellingen en synchroniseert mee.

### Regels (voorstel)
| Regel | Voorstel | Waarom |
|---|---|---|
| Eerste vraag | **8 weken** na ingeburgerd | "na een tijdje"; lang genoeg om te kunnen verslappen |
| Daarna | telkens 1,5× zo lang (8, 12, 18 weken …), maximaal elk jaar | een habit die blijft werken hoeft niet gemeten te worden |
| Niet vaker dan | **1 vraag per week** in totaal (over alle habits) | geen vragenuur; bij meerdere habits wachten ze op elkaar |
| Waar | rustige kaart op Vandaag + regel in de weekreview | geen nieuwe push; de wekelijkse neutrale melding bestaat al |
| Niet tijdens | een pauze, of in de eerste week van de app | |

### Nog te beslissen
1. Zijn de getallen (8 weken, 1,5×, 1 per week) goed? Ze staan in `domain/constants.js` en zijn aan te passen.
2. Bij "Weer oppakken": één stap met uitleg (voorstel), of een korte keuze "zelfde ritme / ander ritme"?
3. Telt "Niet meer nodig" als een eigen prestatie (bijvoorbeeld *Klaar*)? Voorstel: nee, de prestatie *Ingeburgerd* bestaat al.

### Impact op bestaande delen
- **Datamodel:** op de habit `nextCheckAt` en `checkInterval`, plus `archiveReason`. Geen nieuwe collectie nodig, dus **geen servermigratie**. Alternatief: een eigen collectie `checks` (zoals `reasons`); dat vraagt wel een migratie zoals 0004.
- **Domein:** een pure functie `graduatedCheckDue({ habit, today, lastAskedAt })` met tests; hergebruikt `isTracked`.
- **UI:** een kaart in de stijl van de aandachtskaart; een regel in de weekreview.
- **Privacy:** geen nieuwe gegevens voor anderen.

---

## Feature 1: Terug naar af (square one)

### Doel
Iemand die het gevoel heeft vastgelopen te zijn, kan met één bewuste stap zonder rommel opnieuw beginnen, zonder dat zijn geschiedenis verdwijnt. De gebruiker bepaalt zelf wat "terug naar af" voor hem betekent.

### Wat er nu is
Een habit kan gepauzeerd worden, gearchiveerd of verwijderd. Er is geen manier om alles in één keer los te laten en geen manier om vorige perioden terug te kijken als geheel. Prestaties worden nooit afgenomen en rekenen over de héle geschiedenis (besluit 2026-10-17); een reset zonder "ronde" zou ze meteen weer toekennen.

### Actoren
Gebruiker · Vriend (ziet de status en kan aanmoedigen) · Systeem.

### Kernbegrippen
- **Ronde:** een afgebakende periode. Je zit altijd in precies één ronde. *Terug naar af* sluit de huidige ronde en opent een nieuwe.
- **Vorige ronde:** alleen-lezen. Habits, check-ins, beoordelingen, weekreviews, redenen en behaalde prestaties van die tijd blijven bestaan en zijn in te zien.
- **Per habit kiezen:** bij het resetten bepaalt de gebruiker per habit: **Opnieuw beginnen** (de bouwsteen uit F3: zelfde habit, nieuwe start) of **Laten gaan** (afronden).

### Use cases

**UC1.1 Terug naar af starten (M)**
- *Aanleiding:* de gebruiker wil opnieuw beginnen.
- *Waar:* Instellingen → "Terug naar af", en vanuit de aandachtskaart/weekreview als er veel openstaat (S).
- *Hoofdscenario:*
  1. De app legt uit wat er gebeurt: je actieve habits en je prestaties van deze ronde gaan naar "Vorige ronde" (blijft in te zien); je begint met een lege Vandaag; je vrienden blijven je vrienden.
  2. De gebruiker ziet zijn habits met per habit de keuze **Opnieuw beginnen** of **Laten gaan** (standaard: laten gaan, zodat hij echt schoon begint).
  3. Een duidelijke bevestiging ("Terug naar af"), geen dubbele stap met intypen: er gaat niets verloren.
  4. De ronde sluit; de nieuwe ronde begint vandaag. De app toont de lege Vandaag met een begin-hulp (UC1.3).
- *Alternatief:* de gebruiker annuleert; er verandert niets.
- *Uitzondering:* geen verbinding. De reset werkt lokaal en synchroniseert later (UC1.9).
- *Eis:* een automatische back-up wordt aangeboden vóór de bevestiging (de bestaande back-up).

**UC1.2 Kiezen wat er mee gaat (M)**
- Per habit, ook ingeburgerde en gepauzeerde: **Opnieuw beginnen** (de habit komt in de nieuwe ronde terug als nieuwe, met dezelfde afspraken) of **Laten gaan** (blijft alleen in de vorige ronde).
- Habits in `planned` (nog niet gestart) en `archived` blijven zoals ze zijn tenzij gekozen.
- *Snel:* "Alles opnieuw beginnen" en "Alles laten gaan" als twee knoppen bovenaan.

**UC1.3 Opnieuw opbouwen, zonder rommel (M)**
- *Aanleiding:* de gebruiker opent Vandaag direct na de reset.
- *Hoofdscenario:* een lege Vandaag met korte uitleg en een begin-hulp: kies een sjabloon, of **neem iets over uit je vorige ronde** (een lijst met de habits die hij liet gaan, aan te vinken, die dan als nieuwe habit starten). Standaardhints: begin klein (maximaal 3 habits) in lijn met PLAN §2.
- *Eis:* geen verwijt of "mislukt" in de tekst. Terminologie: "Een nieuwe start".

**UC1.4 Een vorige ronde inzien (M)**
- *Waar:* Instellingen → "Vorige rondes" (of onder Voortgang).
- *Hoofdscenario:* een lijst met rondes ("Ronde 1: 3 maart – 12 oktober"); per ronde de habits met hun sterkte, reeks en heatmap, de behaalde prestaties, de weekreviews en de redenen. Alleen lezen.
- *Eis:* het ziet er duidelijk anders uit dan de huidige ronde (rustiger, zonder bewerkknoppen), zodat niemand per ongeluk in het verleden afvinkt.
- *Alternatief:* "Zet deze habit terug" vanuit een vorige ronde (UC3.4).

**UC1.5 Prestaties en punten beginnen opnieuw (M)**
- *Regel:* prestaties, punten, reeksen en de aandachtssignalen rekenen alleen over de **huidige ronde**. De prestaties van de vorige ronde staan in UC1.4 bij die ronde.
- *Wat dit technisch vraagt:* de rekenlaag (`achievementInput`, `buildScoreSummary`, `buildAttention`) filtert op ronde. Nu rekenen ze over alle habits, inclusief gearchiveerde. Dit is het **grootste stuk werk** van deze feature.
- *Uitzondering:* de eenmalige "eerste keer"-prestaties (zoals *Eerste stap*) beginnen ook opnieuw; een bewuste keuze, want de gebruiker vroeg dat ("achievements resetten ook").
- *Vrienden:* je punten op de ranglijst beginnen weer bij nul. Dat is zichtbaar voor vrienden en daarom hangt het samen met UC1.6.

**UC1.6 Vrienden laten weten dat je opnieuw begint (S)**
- *Aanleiding:* de gebruiker rondt de reset af.
- *Hoofdscenario:* een keuze, **standaard uit**: *"Laat je vrienden weten dat je opnieuw begint, zodat ze je kunnen aanmoedigen"*. Bij ja staat bij zijn naam in de vriendenlijst en op de ranglijst "Nieuwe start" (als tekst, niet alleen een kleur), voor 14 dagen.
- *Waarom opt-in:* het is kwetsbaar om te delen. Zonder keuze zien vrienden alleen dat de punten weer bij nul staan.
- *Eis:* wat vrienden zien blijft beperkt tot de status en de datum; geen reden, geen habit-namen (SOCIAAL §3).
- *Server:* één extra veld in de gepubliceerde samenvatting (`fresh_start_until`); additief, dus achterwaarts compatibel.

**UC1.7 Een vriend aanmoedigen (C)**
- *Aanleiding:* de vriend staat als "Nieuwe start" in de lijst.
- *Hoofdscenario:* een knop **Aanmoedigen** met een korte vaste boodschap ("Jij kan het!"). Eén per vriend per dag. De ontvanger ziet een rustige regel op Vandaag of in de vriendenlijst, en geen push met inhoud.
- *Eis:* vaste teksten, geen vrije invoer (geen misbruik, geen moderatie nodig).
- *Server:* een kleine RPC; de ontvanger kan het uitzetten.

**UC1.8 Terugzetten (S)**
- *Aanleiding:* de gebruiker heeft spijt, binnen 30 dagen.
- *Hoofdscenario:* "Vorige ronde terugzetten" in de vorige ronde: de nieuwe ronde (met wat er sinds de reset is gedaan) wordt de vorige; de oude wordt weer de huidige.
- *Uitzondering:* als er in de nieuwe ronde veel is gebeurd, een waarschuwing. Mijn voorstel is dit pas te bouwen als er vraag naar is: omdat er niets wordt verwijderd, kan het later zonder spijt.

**UC1.9 Op meerdere apparaten (M)**
- *Regel:* de reset is één wijziging in de gedeelde gegevens (de ronde-gegevens synchroniseren zoals andere records). Op een tweede apparaat verschijnt de nieuwe ronde na de volgende sync.
- *Uitzondering:* een apparaat dat offline was en intussen nog afvinkte voor een habit uit de vorige ronde: die check-ins blijven bij de vorige ronde horen (op datum voor de reset), die erna komen in de nieuwe. De gebruiker krijgt een korte melding.

### Nog te beslissen
1. **Bij een reset: ingeburgerde habits.** Voorstel: dezelfde keuze als alle habits (opnieuw beginnen of laten gaan), met de standaard *laten gaan*.
2. **Zichtbaarheid voor vrienden:** standaard uit (voorstel) of aan?
3. **Aanmoedigen (UC1.7):** nu meebouwen of later? Voorstel: later; UC1.6 eerst.
4. **Prestaties van de vorige ronde:** blijven die in een lijst te zien (voorstel) of verdwijnen ze ook uit het zicht?
5. **Terminologie:** "Terug naar af", "Een nieuwe start" of "Opnieuw beginnen"? Voorstel: de knop heet *Een nieuwe start*, de uitleg noemt "terug naar af".

### Impact op bestaande delen
- **Datamodel:** een collectie `rounds` (`id`, `startedAt`, `endedAt`) en een `roundId` op habits en prestaties; de huidige ronde in `settings`. De server heeft een migratie nodig die de toegestane collecties verbreedt (zoals 0004 voor `reasons`); oudere app-versies kennen de collectie niet en moeten dat negeren (te testen, zoals A4 bij de prestaties).
- **Rekenlaag:** zie UC1.5. Pure functies krijgen een parameter `roundStart`; tests voor "oude data telt niet mee".
- **Sociaal:** één extra veld in `publish_summary` (UC1.6), één extra RPC (UC1.7).
- **Back-up/herstel:** de back-up bevat rondes.
- **Documentatie:** PLAN (nieuwe F-nummers), DATAMODEL, PRIVACY (de status is zichtbaar voor vrienden, alleen als de gebruiker dat kiest).

---

## Feature 2: Groepen met taken, beurten en verantwoordelijken

> Dit is geen uitbreiding van de habit-app maar een tweede product dat op dezelfde basis draait. Daarom ben ik hier uitgebreider, en daarom raad ik aan eerst te valideren (zie "Validatie" onderaan).

### Doel
Een groep mensen (huishouden, schoolproject, vereniging) heeft een gedeelde lijst met taken, waarbij altijd duidelijk is **wie aan de beurt is** en **wie het gedaan heeft**.

### Beoogde groepen
| Groep | Grootte | Wat ze nodig hebben |
|---|---|---|
| Huishouden | 2–6 | beurten (vaatwasser, afval), vaste verantwoordelijke, kinderen zonder telefoon |
| Schoolproject | 3–6 | taken met eigenaar, deadlines, wie heeft wat gedaan |
| Corvee (wijkhuis, scouting, vereniging) | 10–50 | roosters over weken, wisselende bezetting, een beheerder die rooster en leden regelt |

### Begrippen
- **Groep:** een naam, leden en taken.
- **Lid:** iemand met een account. Of een **lid zonder account** (UC2.12), beheerd door een beheerder.
- **Groepstaak:** een herhalende klus met een ritme (dezelfde ritmes als een habit: vaste weekdagen, N keer per week of maand, dag van de maand).
- **Uitvoering:** één keer dat de taak aan de beurt is (de vaatwasser van dinsdag).
- **Beurt:** wie voor een uitvoering is aangewezen.
- **Verantwoordelijke** ("altijd iemands taak"): één vaste persoon die eindverantwoordelijk is. Hij hoeft het niet altijd zelf te doen.
- **Gedaan door:** wie een uitvoering echt afvinkte. Dat kan iemand anders zijn dan de beurthouder.

### Rollen
| Rol | Mag |
|---|---|
| Beheerder | leden uitnodigen en verwijderen, taken maken en wijzigen, de groep opheffen, beheerders aanwijzen |
| Lid | afvinken, beurten ruilen, eigen afwezigheid melden, taken voorstellen (C) |
| Gast (C) | alleen kijken, bijvoorbeeld een ouder of coördinator |

### Toewijzingswijzen per taak
| Wijze | Betekenis | Voorbeeld |
|---|---|---|
| **Iedereen** | niemand is aangewezen; wie het doet vinkt af | de was ophangen |
| **Vast** | één persoon is aangewezen (en dus ook de verantwoordelijke) | de planten water geven |
| **Om de beurt** | de beurt gaat in een vaste volgorde langs de gekozen leden | de vaatwasser uitruimen |
| **Verantwoordelijke erbij** | bij elke wijze kan één persoon eindverantwoordelijk zijn | "Anna is verantwoordelijk voor het afval, maar iedereen kan het buiten zetten" |

### Belangrijke regels (voorstel)
1. **Beurten zijn een rooster, geen stand.** De beurt voor elke uitvoering wordt bepaald door de volgorde en de datum, niet door wie het laatst afvinkte. Dat maakt de uitkomst voorspelbaar, werkt offline en voorkomt conflicten.
2. **Wie afvinkt, staat erbij.** Elke uitvoering bewaart `gedaan door` en het moment. De beurthouder verandert daar niets aan: als Bram de vaatwasser doet op Anna's beurt, is dat voor Anna afgehandeld, Bram krijgt de eer.
3. **Eerlijkheid is zichtbaar.** Een overzicht per lid: aantal keer aangewezen, aantal keer gedaan, per periode (UC2.10).
4. **De verantwoordelijke krijgt de herinneringen.** Is een taak te laat, dan krijgt de verantwoordelijke de aandacht (dezelfde regels als "te laat" bij habits); anderen kunnen afvinken.
5. **Groepstaken zijn geen habits.** Ze hebben geen sterkte, fases, ingeburgerd of prestaties. Ze zijn een klus, geen gewoonte. (Zie "Nog te beslissen" 2.)

### Use cases

**UC2.1 Een groep maken (M)**
- *Hoofdscenario:* de gebruiker kiest **Nieuwe groep**, geeft een naam, kiest een soort (Huishouden / Project / Vereniging; bepaalt alleen de voorbeeldtaken) en is daarmee beheerder. De app stelt voor om meteen leden uit te nodigen (UC2.2) en een eerste taak te maken (UC2.4).
- *Uitzondering:* de gebruiker heeft geen account. De groep vraagt een account (de bestaande flow).
- *Grenzen:* een gebruiker zit in maximaal 10 groepen; een groep heeft maximaal 50 leden en 200 taken (voorstel).

**UC2.2 Leden uitnodigen (M)**
- *Hoofdscenario:* de beheerder krijgt een uitnodigingslink (hergebruik van de bestaande uitnodigingsflow: link, geldigheid, plafond). Hij deelt hem via de gewone kanalen.
- *Alternatief:* **een lid zonder account toevoegen** met alleen een naam (UC2.12).
- *Eis:* de link geeft toegang tot de groep (niet tot vriendschap). De ontvanger ziet de groepsnaam en wie uitnodigt.

**UC2.3 Een uitnodiging accepteren (M)**
- *Hoofdscenario nieuwe gebruiker:* link → welkom met de groepsnaam → account → naam → "Je zit nu in Huishouden Volkers". De flow is dezelfde als §2 van ITERATIE-1.2, met een andere bevestiging.
- *Hoofdscenario bestaande gebruiker:* de link opent de groep direct; één bevestiging.
- *Alternatief:* de gebruiker is al lid: "Je zit al in deze groep".
- *Uitzondering:* link verlopen of vol: duidelijke melding en wie hij om een nieuwe kan vragen.

**UC2.4 Een groepstaak maken (M)**
- *Hoofdscenario:* de beheerder geeft een naam, kiest het ritme (zoals bij een habit), de toewijzing (iedereen / vast / om de beurt) en eventueel een verantwoordelijke. Bij "om de beurt" kiest hij de leden en de volgorde (slepen of "wie het eerst").
- *Uitzondering:* een taak met "vast" en zonder lid: foutmelding. Een lid zonder account kan wel een beurt hebben.

**UC2.5 Om de beurt: wie is aan de beurt? (M)**
- *Hoofdscenario:* elk lid ziet op **Vandaag** een blok per groep: *"Huishouden: jij bent aan de beurt voor de vaatwasser"* en eronder de taken waarvoor niemand specifiek is aangewezen. De groepsweergave toont per taak de beurt van vandaag en de volgende.
- *Regel:* de volgorde loopt door de gekozen leden; een lid dat afwezig is (UC2.9) wordt overgeslagen.
- *Eis:* ook zichtbaar zonder app te openen: een melding (UC2.8) en later eventueel een widget.

**UC2.6 Afvinken, ook voor een ander (M)**
- *Hoofdscenario:* elk lid kan een uitvoering afvinken. De app slaat `gedaan door` en de tijd op en toont *"Vaatwasser: gedaan door Bram, om 18:40"*. Het blok van de beurthouder toont de taak als afgehandeld.
- *Alternatief:* afvinken terwijl een ander dat net deed: zie UC2.14.
- *Alternatief:* ongedaan maken: alleen door degene die afvinkte of een beheerder, binnen 24 uur.

**UC2.7 Ruilen of overnemen (S)**
- *Hoofdscenario:* Anna kan niet. Ze kiest **Ik kan niet** → een ander lid krijgt een verzoek (of de volgende in de volgorde, als ze dat instelt). Neemt iemand het over, dan is hij voor die uitvoering de beurthouder; de rotatie erna verandert niet.
- *Alternatief:* twee leden ruilen een beurt in beide richtingen.
- *Uitzondering:* niemand pakt het op: de uitvoering blijft staan en de verantwoordelijke krijgt de aandacht.

**UC2.8 De verantwoordelijke, "altijd iemands taak" (M)**
- *Hoofdscenario:* een taak heeft een verantwoordelijke. Hij hoeft het niet zelf te doen; hij is aanspreekpunt en krijgt de herinnering of aandachtskaart als het niet gebeurt ("Het afval is 2 dagen te laat").
- *Zichtbaar:* bij de taak staat "Verantwoordelijke: Anna".
- *Wisselen:* een beheerder kan de verantwoordelijke wijzigen; de oude en nieuwe krijgen een melding.

**UC2.9 Afwezigheid (S)**
- *Hoofdscenario:* een lid meldt zich afwezig (van, tot). De rotatie slaat hem over; na terugkomst gaat hij weer mee. De eerlijkheid-telling (UC2.10) houdt rekening met de afwezige periode.

**UC2.10 Eerlijkheidsoverzicht (S)**
- *Hoofdscenario:* per lid over de laatste 4 weken of 3 maanden: aangewezen, gedaan, extra gedaan voor anderen. Geen ranglijst en geen punten; een neutrale tabel ("Bram deed 3 keer extra"). Bedoeld om een gesprek mogelijk te maken, niet om te winnen.
- *Eis:* de toon verbiedt "slechtste" of "beste".

**UC2.11 Meldingen (M)**
- *Soorten:* jij bent aan de beurt (ochtend), iemand vroeg je iets over te nemen, een taak waarvoor je verantwoordelijk bent is te laat.
- *Regel:* meldingen zijn **neutraal**, zoals nu: geen taaknamen in de melding zelf, alleen "Je hebt een beurt in Huishouden". De inhoud staat in de app. (De bestaande keuze voor privacy; voor groepen is dit minder gevoelig, dus aan te passen na overleg.)
- *Instelling:* per groep aan/uit, en een rustig uur.

**UC2.12 Een lid zonder account (S)**
- *Aanleiding:* een kind zonder telefoon, of een gast van de scouting.
- *Hoofdscenario:* de beheerder voegt een naam toe. Dat lid kan een beurt hebben; de beheerder (of een andere volwassene) vinkt namens hem af ("Gedaan door Noor, afgevinkt door Anna"). Als het kind later zelf een account maakt, kan de beheerder het lid koppelen aan dat account met een koppelcode.
- *Eis (privacy):* minderjarigen zonder account hebben geen eigen gegevens op de server behalve de naam en wat de beheerder invult. In PRIVACY expliciet maken.

**UC2.13 Een groep verlaten, een lid verwijderen, de groep opheffen (M)**
- *Verlaten:* een lid verlaat de groep. Zijn eerdere afvinkacties blijven in de geschiedenis van de groep onder zijn naam, of, op zijn verzoek, als "Oud-lid" (voorstel: standaard de naam bewaren zolang de groep bestaat; een lid kan bij verlaten kiezen voor anoniem).
- *Beheerder verlaat:* alleen als er een andere beheerder is, of de groep wordt overgedragen; anders wordt hij gewaarschuwd.
- *Verwijderen:* een beheerder verwijdert een lid; hij krijgt een neutrale melding.
- *Opheffen:* alleen beheerders, met bevestiging; alles van de groep verdwijnt na 30 dagen (met de optie om te herstellen).
- *Accountverwijdering:* verwijdert je gegevens uit groepen; je afvinkacties worden "Oud-lid".

**UC2.14 Offline en tegelijk afvinken (M)**
- *Aanleiding:* twee mensen vinken dezelfde uitvoering af, één offline.
- *Regel (voorstel):* **de eerste afvinking wint**; de tweede wordt niet verloren maar gekoppeld ("Ook gedaan door Bram") zonder dubbel te tellen. Beide zien het resultaat.
- *Eis:* de app toont na synchronisatie wat er gebeurd is ("Anna was je voor").

**UC2.15 Geschiedenis (C)**
- Per groep en per taak een lijst: wie wat deed en wanneer, laatste 90 dagen. Alleen zichtbaar voor leden.

### Niet-functioneel
- **Gegevens delen tussen mensen** is nieuw: nu is alles van één gebruiker (per-gebruiker toegang op de server) en delen gaat alleen via de sociale functies met beperkte velden. Groepen vragen **eigen tabellen met toegang op basis van lidmaatschap**, een server die bepaalt (niet de app) en realtime of regelmatig verversen.
- **Sync** volgt hetzelfde offline-first-patroon, maar met een server als bron van waarheid voor groepsgegevens.
- **Privacy/AVG:** leden zien elkaars naam en afvinkgeschiedenis in de groep; de PRIVACY moet dit benoemen. **Kinderen:** kinderen onder de 16 hebben in NL toestemming van een ouder nodig voor eigen gegevens (?: juridisch laten bevestigen vóór er kinderen met eigen account aan meedoen).
- **Schaal:** 50 leden × 200 taken × dagelijks afvinken is klein voor de database; het vraagt vooral zorgvuldig rotatiegedrag.
- **Verschil met je persoonlijke habits:** groepstaken tellen niet mee in je punten of prestaties, en staan op Vandaag in een eigen blok.

### Nog te beslissen
1. Is dit **een tweede product in dezelfde app**, of een aparte app met dezelfde techniek? Voorstel: dezelfde app, een eigen tab "Groepen" die pas verschijnt als je een groep hebt of maakt.
2. **Tellen groepstaken mee** voor persoonlijke prestaties of punten? Voorstel: nee, om de habit-theorie schoon te houden en gaming te voorkomen.
3. **Beurt-regel bij afvinken door een ander:** voorstel hierboven (rooster, afvinker krijgt de eer). Of liever "wie het doet, heeft zijn beurt gehad" (dan verschuift de rotatie)?
4. **Leden zonder account** in de eerste versie? Voorstel: later; eerst alleen mensen met een account.
5. **Rollen:** alleen beheerder en lid in de eerste versie.
6. **Meldingsinhoud:** neutraal (voorstel) of met de taaknaam?

### Voorstel voor fasering
| Fase | Inhoud | Omvang |
|---|---|---|
| 1 | Huishouden: groep maken, uitnodigen met link, taken met ritme, **om de beurt**, **verantwoordelijke**, afvinken met "gedaan door", blok op Vandaag, neutrale melding | groot |
| 2 | Ruilen/overnemen, afwezigheid, eerlijkheidsoverzicht, geschiedenis | middel |
| 3 | Leden zonder account, rollen, verenigingsschaal (rooster over weken, grotere groepen) | groot |

### Validatie voor het bouwt
Voor een groot nieuw deel is een paar dagen praten goedkoper dan bouwen. Voorstel: drie huishoudens en één vereniging een korte vraag stellen ("hoe regelen jullie nu wie de vaatwasser doet, en wat werkt niet?") en een klikbaar prototype (een gedeelde lijst in de bestaande opzet) laten proberen. Bestaande klussen-apps bestaan; de vraag is waarom jullie versie beter past (de combinatie met gewoontes, de focus op beurten en verantwoordelijkheid). Dat staat hier niet onderzocht.

---

## Feature 4: Play Store en App Store

### Vraag
Wat is er nodig om de app in de stores te krijgen, wat kost dat, werken meldingen met onze JavaScript-app, en moeten we echt native ontwikkelen of volstaat een schil zodat de webversie blijft bestaan?

### Kort antwoord
**Nee, native herontwikkelen is niet nodig.** Onze app is een gewone PWA (offline, service worker, Web Push). Je kunt hem met een dunne schil in de stores zetten en tegelijk de webversie houden:
- **Android:** een *Trusted Web Activity* (TWA): een bijna lege app die onze website in Chrome toont. Weinig werk. Meldingen blijven webmeldingen (? eerst proberen).
- **iOS:** een *Capacitor*-schil rond de web-app. Meer werk en een **echt risico op afwijzing** door Apple als de app te veel op een website lijkt (richtlijn 4.2).
- Eén codebasis blijft bestaan; de web-versie blijft in de lucht.

### Wat het kost
| Post | Bedrag | Status |
|---|---|---|
| Google Play-ontwikkelaarsaccount | **US$25, eenmalig** | ✓ [Google Play Help](https://support.google.com/googleplay/android-developer/answer/6112435) |
| Apple Developer Program | **US$99 per jaar** (vrijstelling voor non-profit, onderwijs en overheid aan te vragen) | ✓ [Apple Developer](https://developer.apple.com/programs/whats-included/) |
| Firebase Cloud Messaging voor Android-push (alleen bij Capacitor op Android) | geen kosten verwacht | ? niet gecontroleerd |
| Een eigen domein | ± €10–15 per jaar | ? mijn schatting, zie "Domein" |
| Mac/Xcode voor iOS-builds | Xcode Cloud: 25 rekenuren per maand zijn bij het programma inbegrepen | ✓ Apple Developer; of een eigen Mac |
| Werk (schatting) | Android-spike 2–3 dagen; iOS-schil met reviewronde 1–2 weken | ? mijn schatting |

### Eisen en haken
**Google Play**
- ✓ Een persoonlijk account dat na 13 november 2023 is gemaakt moet een **gesloten test** draaien met **minstens 12 testers die 14 dagen achter elkaar zijn aangemeld** voordat de app naar productie mag. ([Google Play Help](https://support.google.com/googleplay/android-developer/answer/14151465)) Je hebt dus 12 mensen nodig, 2 weken, vóór je live kunt. Een organisatieaccount is volgens een niet-officiële bron vrijgesteld (?).
- ✓ Identiteitscontrole met een pasje en een creditcard op eigen naam; verificatie met een Android-toestel via de Play Console-app.
- ? Een privacyverklaring-URL en een "gegevensbeveiliging"-formulier zijn nodig; het toestel-API-niveau ("target API") wordt jaarlijks verhoogd (één bron noemt API 36 vanaf 31 augustus 2026).

**Apple**
- ✓ **Richtlijn 4.2:** *"Your app should include features, content, and UI that elevate it beyond a repackaged website."* Een kale schil is een bekende reden voor afwijzing. Daartegenover staan de dingen die onze app al heeft (offline, eigen interface, account) maar dat is geen garantie. Wat in de praktijk helpt zijn echte native functies: **native meldingen**, een badge op het icoon, delen via het systeemmenu, eventueel een widget. ([Apple Review Guidelines](https://developer.apple.com/app-store/review/guidelines/))
- ✓ **Richtlijn 4.8:** wie een externe login (zoals Google) aanbiedt, moet ook een gelijkwaardige optie bieden die alleen naam en e-mail verzamelt, het e-mailadres kan verbergen en geen reclame-tracking doet; behalve als de app **uitsluitend een eigen inlog** gebruikt. Wij bieden **Google én een e-mailcode**. Of de e-mailcode als "gelijkwaardig" telt, is aan Apple: de kans bestaat dat we *Inloggen met Apple* moeten toevoegen. ? Eerst bij Apple of in de review controleren.
- ✓ **Richtlijn 5.1.1(v):** wie accounts aanbiedt, moet ook verwijderen **in de app** aanbieden. Dat hebben we al ("Account verwijderen" in Instellingen).
- ✓ Web Push voor iOS bestaat sinds iOS/iPadOS 16.4, alleen voor een web-app die op het beginscherm is gezet, na een bewuste tik van de gebruiker. Een Apple Developer-lidmaatschap is daarvoor niet nodig. ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/))

### Meldingen: wat werkt waar
| Situatie | Werkt het? |
|---|---|
| **Webversie op Android (Chrome)** | ja, dit gebruiken we nu (Web Push met VAPID via de Supabase-functie `send-reminders`) |
| **Webversie op iPhone** | ja, **alleen** als de gebruiker de app op het beginscherm zet (iOS 16.4 of nieuwer) ✓ |
| **Android-app als TWA** | ? Web Push in een TWA loopt via Chrome en zou moeten werken zonder native code. In de Chrome-documentatie die ik kon ophalen stond dit niet (de gids die ik kon ophalen is van 2020 en gaat niet over meldingen; de pagina over meldingsdelegatie kon ik niet ophalen); **eerst proberen in de spike**. |
| **iOS-app als Capacitor-schil** | de iOS-schil gebruikt **native push (APNs)** via de Capacitor-plugin ✓ ([Capacitor](https://capacitorjs.com/docs/apis/push-notifications)); dat is **een tweede verzendpad** naast het huidige Web Push (de server moet dan ook APNs/FCM-berichten sturen). Eén bron meldt dat push niet werkte als de schil de gehoste site laadde (`server.url`) en wel met lokaal meegeleverde bestanden: ? onzeker, in de spike controleren. |
| **Lokale meldingen** (Capacitor-plugin) | ? een melding die de **telefoon zelf** plant, zonder server. Dat zou de ochtendmelding onafhankelijk van onze server maken en het zou veilig zijn om taaknamen te tonen, omdat de gegevens niet de telefoon verlaten. Mogelijke winst, niet onderzocht. |

### Opties
| Optie | Wat | Voordelen | Nadelen | Advies |
|---|---|---|---|---|
| **A. Alleen PWA** | zoals nu, met een installatiehulp | geen kosten, geen review, één pad | geen store-vermelding; iOS alleen via beginscherm | basis, blijft altijd bestaan |
| **B. Android via TWA** | Bubblewrap of PWABuilder maakt een app die onze site toont | klein werk, dezelfde code, Google Play-vermelding | 12 testers × 14 dagen; domein-koppeling nodig | **nu doen als spike** |
| **C. iOS via Capacitor** | een WKWebView-schil met native plugins | App Store-vermelding, native push | €99/jaar, Mac, reviewrisico (4.2), tweede pushpad, mogelijk Inloggen met Apple | **na de Android-spike besluiten** |
| **D. Capacitor voor beide** | één schil op beide platforms, ook voor Android | één aanpak, native push overal | meer onderhoud dan een TWA | alleen als de TWA-push tegenvalt |
| **E. Native herbouwen** (Swift/Kotlin, React Native, Flutter) | opnieuw bouwen | volledige controle | twee codebases of een herschrijving; de PWA verdwijnt niet vanzelf | **niet nodig** |

### Een belangrijke technische haak: de koppeling met het domein
Een TWA toont onze website zonder adresbalk, maar alleen als de site bewijst dat de app erbij hoort via een bestand `/.well-known/assetlinks.json` op de **wortel** van het domein (✓ Chrome kijkt alleen op die plek, [Chrome for Developers](https://developer.chrome.com/docs/android/trusted-web-activity/integration-guide)). Onze app staat op `remcovolkers.github.io/habit-builder/`, een **projectpagina**: de wortel `remcovolkers.github.io` hoort bij een andere repository.
- **Goedkoopste route (? te controleren):** een repository `remcovolkers.github.io` maken met alleen dat bestand. Geen kosten, geen verhuizing.
- **Netste route:** een eigen domein. Maar het adres verandert dan, en **een andere oorsprong betekent dat de lokale gegevens (IndexedDB) van bestaande gebruikers niet meekomen**. Wie niet ingelogd is en dus geen sync heeft, zou zijn gegevens kwijtraken zonder een export of verhuisactie. Alleen doen met een zorgvuldig plan.

### Voorgestelde aanpak
1. **Android-spike (2–3 dagen):** PWABuilder of Bubblewrap, de wortel-koppeling via de gebruikerssite, een interne testversie op een eigen toestel. Controleren: **ochtendmelding (Web Push) in de TWA**, inloggen met Google en met e-mailcode, offline gedrag, terugknop.
2. **Googles testeis regelen:** 12 testers voor 14 dagen (jouw vrienden en de eerste gebruikers); dit kan lopen terwijl de rest gebouwd wordt.
3. **Beslissen over iOS** op basis van de spike en je wensen: is een App Store-vermelding het €99 per jaar en het reviewrisico waard, of is "Zet op je beginscherm" met een goede installatiehulp genoeg?
4. **Bij ja op iOS:** Capacitor-schil met minstens één echte native functie (push, badge, delen) om 4.2 te weerstaan, *Inloggen met Apple* als 4.8 dat vraagt, een tweede verzendpad voor push in de server.

### Nog te beslissen
1. Is een store-vermelding een doel op zich (vindbaarheid) of vooral een middel (betere meldingen)? Dat bepaalt of iOS het waard is.
2. Persoonlijk of organisatieaccount (Google en Apple)? Een organisatie vraagt verificatie van een bedrijf (? o.a. een D-U-N-S-nummer; niet gecontroleerd).
3. Domein: de gebruikerssite (gratis, nu) of een eigen domein (netter, vraagt een verhuisplan)?

### Bronnen
- [Google Play Help: registreren en kosten](https://support.google.com/googleplay/android-developer/answer/6112435)
- [Google Play Help: testeisen voor nieuwe persoonlijke accounts](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Apple Developer Program: wat is inbegrepen](https://developer.apple.com/programs/whats-included/)
- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (4.2, 4.8, 5.1.1)
- [WebKit: Web Push op iOS en iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [Capacitor: Push Notifications](https://capacitorjs.com/docs/apis/push-notifications)
- [Chrome for Developers: TWA-integratiegids](https://developer.chrome.com/docs/android/trusted-web-activity/integration-guide) (uit 2020)
- [Bubblewrap en TWA, Thinktecture](https://www.thinktecture.com/en/pwa/twa-bubblewrap) (niet-officieel)
- [PWABuilder-blog over de Play Store](https://blog.pwabuilder.com/posts/microsoft-and-google-team-up-to-make-pwas-better-in-the-play-store) (niet-officieel)
