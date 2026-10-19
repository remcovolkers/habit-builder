# How to test: zeldzame taken, aandacht en de weekterugblik

Functioneel testen op de lokale omgeving met de twee testaccounts. Achtergrond en regels: PLAN §4.5 (ingeburgerd telt keren) en §4.9 (aandacht). De accounts en hun inhoud staan in DEV-OMGEVING.md.

## Voorbereiding (eenmalig per sessie)

```
npm run db:start            # Docker Desktop moet draaien
npm run dev:seed            # maakt stub@example.com (gevuld), leeg@example.com (leeg) en beheer@example.com (beheerder, voor het tabje Feedback)
npm run serve               # de app op http://localhost:5173/
```

- Open het gevulde account in een **eigen browserprofiel** (of privévenster) en het lege in een ander. De app bewaart zijn gegevens ook in de browser.
- Inloggen: Instellingen → Inloggen → e-mailadres, daarna de code. De code haal je met `npm run dev:code -- stub` (of `-- leeg`) of uit het mailvenster op http://localhost:54324.
- De getoonde aantallen zijn die van 16 oktober 2026. Alle datums van het stub-account zijn relatief aan vandaag, dus op een andere dag kan een aantal één of twee afwijken. Is vandaag de 1e van de maand, dan kan "Rekening betalen" niet te laat zijn.
- Opnieuw beginnen met verse gegevens: sluit de app, draai `npm run dev:seed` en log opnieuw in (een nieuw browserprofiel of uitloggen is het schoonst).

## Wat het gevulde account bevat

| Habit | Ritme | Toestand |
|---|---|---|
| Water drinken | dagelijks, teller 8 glazen | 81 dagen, sterk: ingeburgerd te bevestigen |
| Meditatie | werkdagen | 31 dagen; een gemiste dag in de week van 5 oktober |
| Lezen | dagelijks | dag 13 (opstarten), een gemiste en een minimale dag |
| Hardlopen | 3× per week | dag 41, deze week 1 van 3 |
| Gitaar spelen | 1× per week | in de stapel (0 van 1) |
| **Bed opmaken** | 2× per maand | **stil**: 41 dagen niet gedaan, 4 van 8 keer, automatisme 3 |
| **Rekening betalen** | vaste dag in de maand | **te laat**: stond op de 15e |
| **Gordijnen wassen** | 1× per maand | stil, **al beantwoord** ("Vergeten") |
| Dagboek | dagelijks | ingeburgerd, in onderhoud |
| Yoga | 2× per week | gepauzeerd |
| Spaans leren | werkdagen | gearchiveerd |
| Zwemmen | 2× per week | gepland, start over 10 dagen |

## A. Vandaag (stub): is alles te zien?

1. Bovenaan een sectie **Even kijken** met precies één kaart: *Bed opmaken*, "Al 41 dagen niet gedaan." en "Afgesproken: 2× per maand", met de knoppen *Nu afvinken* en *Wat hield je tegen?*. *Gordijnen wassen* staat er **niet** (die is al beantwoord) en *Rekening betalen* ook niet (die heeft zijn eigen blokje).
2. Dagdelen: **Ochtend** Water drinken (met teller) en Meditatie; **Avond** Lezen en Dagboek; **Overdag** Rekening betalen.
3. Bij *Rekening betalen*: "Te laat" en daaronder "Dit stond op de 15e op je lijst en is nog niet gedaan." met de knop *Wat hield je tegen?*.
4. Onderaan de stapel **Oningepland**: Hardlopen 1/3, Gitaar spelen 0/1, Bed opmaken 0/2, Gordijnen wassen 0/1.
5. Niet zichtbaar: Yoga (gepauzeerd), Spaans leren (gearchiveerd), Zwemmen (gepland).

## B. Een stille taak beantwoorden (Bed opmaken)

1. Tik **Wat hield je tegen?** op de kaart in *Even kijken*. Er opent een blad met zeven redenen (Geen tijd, Geen geld, Vergeten, Geen zin, Druk of ziek, Ritme klopt niet, Anders), een toelichting en de knoppen *Reden opslaan* en *Later*. Kies **Anders**: de toelichting krijgt de focus en heet nu "Wat was het dan?".
2. Tik *Reden opslaan* zonder iets te kiezen: het blad blijft open met "Kies eerst een reden."
3. Kies **Geen tijd**, vul een toelichting in en sla op. Verwacht de toast "Genoteerd: Geen tijd" en de kaart is uit *Even kijken* verdwenen.
4. Ga naar **Voortgang**. In de terugblik staat *Bed opmaken* nu gedempt met "Reden: Geen tijd · …" en een knop *Wijzig*. Wijzig de reden en kijk of die verandert.
5. Alternatief (nieuwe seed nodig): tik in plaats daarvan **Nu afvinken**. De kaart verdwijnt, en omdat dit een zeldzame taak is verschijnt onder de afgevinkte kaart "Hoe automatisch voelde dit?" met 1 tot 5. Tik **4**: "Automatisme: 4 van 5". Het cijfer is aan te passen met een andere tik.
6. Open de habit **Bed opmaken**. Voor het afvinken: hero "Keer 4 van ~8"; na het afvinken "Keer 5 van ~8". Bij Ingeburgerd staat "66 actieve dagen" gehaald, "8 keer gedaan 4/8", "80% consistentie" niet gehaald, "Automatisme ≥ 4 (verplicht)" met het laatste cijfer. Boven de checklist staat de uitleg "Deze taak komt niet vaak voor…".

## C. Te laat (Rekening betalen)

1. Tik **Wat hield je tegen?** bij *Rekening betalen*. Hetzelfde blad opent, nu met extra knoppen **Toch gedaan** en **Deze maand overslaan**.
2. Kies **Vergeten**, typ "Stond niet in agenda" en tik **Deze maand overslaan**. Verwacht: de taak staat als *Overgeslagen*, het "Te laat"-blokje is weg en de notitie staat bij de taak.
3. Controle in Studio (http://localhost:54323 → tabel `records`): bij `collection = reasons` staat je reden met `date` van vandaag.
4. Tik de overgeslagen taak open via ⋯ en kies *Wissen* om terug te gaan (of seed opnieuw).

## D. Weekterugblik (Voortgang, stub)

De kaart **Wekelijkse review**, bovenaan de nieuwe terugblik:

1. "Terugblik op de week" met "17 van 23 gehaald, tot en met vandaag." en "4 om naar te kijken, 1 beantwoord."
2. Vier kaarten die aandacht vragen: Rekening betalen (te laat), Bed opmaken (stil), Lezen en Meditatie ("1 dag gemist in de week van ma 5 okt."). Een vijfde, gedempt en direct onder Bed opmaken: **Gordijnen wassen** met "Reden: Vergeten · Stond niet in mijn agenda".
3. Controle op wat er **niet** staat: Water drinken (de halve dag telt niet als gemist), Dagboek, Hardlopen en de gepauzeerde, gearchiveerde en geplande habits.
4. Elke kaart heeft een eigen reden-knop. Beantwoord er één en kijk of de teller ("open / beantwoord") meebeweegt.
5. Daaronder de twee tekstvelden **Wat ging goed?** en **Wat ging slecht?**: schrijf een review en sla op ("Review opgeslagen"). Het formulier wordt een kaart met een kleine **Bewerk**.
6. **Wanneer is een review open?** De weekreview gaat **vrijdag 00:00** open en sluit **maandag 12:00**; de maandreview opent op **de 25e** en sluit op **de 2e om 12:00**. Daarbuiten kun je niets invullen of wijzigen. Blader met de pijltjes: een week of maand die nog niet open is toont "Nog niet open" met de dag waarop hij opent; een gesloten periode zonder review "Niet ingevuld" (zonder knop om alsnog in te vullen); een gesloten periode met review de kaart zonder **Bewerk** en met "Gesloten sinds …". Bladeren kan onbeperkt.
7. Kies **Maand**: de tegel heet "Laatste 31 dagen" en de review is de **Maandelijkse review**: de ingevulde weken van die maand en daaronder "Wat pas ik aan?" (open vanaf de 25e). De afspraak staat vanaf de eerste van de volgende maand als **Maandtaak** bovenaan Vandaag, tot je hem afvinkt. Op de 1e en de 2e tot 12:00 kun je de afspraak van de vorige maand nog aanpassen.
8. **Melding op Vandaag**: zodra een review open staat en nog niet is ingevuld, staat bovenaan Vandaag (onder een eventuele maandtaak) "Week review staat vanaf nu open" (vrijdag tot maandag 12:00), "Maand review staat vanaf nu open" (de 25e tot de 2e 12:00) of, als beide open staan, "Week- en maandreview staan vanaf nu open" met twee knoppen en "Open tot …". De knop opent Voortgang bij die review (gemarkeerd). **Niet nu** verbergt hem voor die week of maand; invullen haalt hem weg, en na het sluiten verdwijnt hij vanzelf (ook als de app open staat: het scherm ververst om 12:00). Alleen op de echte vandaag.
9. Om de vensters te proberen zonder te wachten: zet de klok van je computer even op vrijdag 23:59 / maandag 11:59, of draai `npm test` (de regels staan in `tests/app/detail-backup.test.js`).

## E. Ingeburgerd te bevestigen (Water drinken)

1. Open *Water drinken*: "Dag 81 van ~66", bij Ingeburgerd drie haakjes (66 dagen, "53 keer gedaan 75/53", consistentie ≥ 80%) en de knop **Markeer als ingeburgerd** is actief.
2. Bevestig. Verwacht de toast, de fase "Ingeburgerd" en de schakelaar "Blijf deze habit volgen (onderhoud)". Er kan een prestatie-viering openen.
3. Vergelijk met **Dagboek**: ingeburgerd, in onderhoud, staat nog op Vandaag. Zet de schakelaar uit: de taak verdwijnt uit Vandaag.

## F. Dagelijks gebruik (regressie)

- **Teller:** Water drinken, tik + enkele keren en − eenmaal; bij het doel (8) verschijnt "Doel gehaald".
- **Minimale versie:** ⋯ bij *Lezen* → "Minimale versie: Eén pagina". De kaart toont ½.
- **Ongedaan maken** in de toast na elke actie.
- **Stapel:** *Hardlopen* → "Neem mee vandaag" en daarna afvinken; "Al gedaan"; "Andere dag…".
- **Vorige dagen:** de pijl links op Vandaag, tot 14 dagen terug invullen. Verder terug is vergrendeld.
- **Habits:** de groepen Actief, Gepauzeerd, Gepland, Ingeburgerd (ingeklapt), Gearchiveerd. Pauzeer en hervat Yoga.
- **Punten** (Instellingen → sociaal aanzetten, of de Vrienden-pagina): het totaal ligt rond de 271 punten (10 per afgeronde taak). Vink *Bed opmaken* af en kijk of je er 12 bij krijgt: 10 plus 2 bonus voor een zeldzame taak (keer 5 van 8).

## G. Het lege account (leeg@example.com)

1. **Vandaag** toont het lege scherm "Begin klein" met sjablonen. **Voortgang** toont "Nog niets te zien" en de review toont "Er is niets blijven liggen. Alles loopt zoals afgesproken." Er is geen "Even kijken".
2. Maak **Bed opmaken**, 2× per maand, met startdatum **vandaag**. Verwacht: niets in "Even kijken" en niets in de terugblik. Dat blijft zo, de eerste periode telt niet mee.
3. Maak een tweede 2×-per-maand-taak met startdatum de **1e van deze maand**. Verwacht: nog niets (het wordt pas stil na 22 dagen, dus op de 23e).
4. Maak een derde met startdatum de **1e van vorige maand of eerder**. Verwacht: meteen een kaart in "Even kijken" ("Nog niet gedaan.").
5. Maak een taak met een vaste dag in de maand, dag = gisteren, startdatum 10 dagen terug. Verwacht: "Te laat" bij vandaag.
6. Maak een dagelijkse taak met startdatum een week terug en laat hem liggen. Verwacht pas na 7 dagen stilte een kaart.

## H. Opslag, sync en back-up

- **Sync:** log in met stub in een tweede browserprofiel; na een paar seconden staan dezelfde 12 habits en reacties er. Geef in profiel 1 een reden en vernieuw profiel 2.
- **Server:** Studio (http://localhost:54323) → tabel `records`, filter op `collection` = `reasons`: één rij per gegeven reden, met `habitId`, `date`, `reason`, `note`.
- **Back-up:** Instellingen → exporteren. Het bestand bevat een lijst `reasons`. Importeer het in het lege account en kijk of de reden terugkomt in de terugblik.

## I. Wat je lokaal niet kunt testen

De ochtendmelding (Web Push) bestaat lokaal niet; de knop is er verborgen. Dat test je op de dev-site: kijk in Supabase naar `push_subscriptions.summary`, waar elke dag vijf getallen heeft (`[gepland, stapel, aandacht, review, maandreview]`). Op zondag is het vierde getal 1 zolang de weekreview niet is ingevuld, en op de laatste dag van de maand het vijfde zolang de maandreview niet is ingevuld. Een tik op zo'n melding opent Voortgang op die periode (`#/stats?review=week|month&date=…`), scrolt naar de reviewkaart en laat die even oplichten; staat er ook een review klaar naast gewoontes, dan gaat de tik naar de review. De tekstopbouw staat in `tests/push/reminders.test.js`.

## J. Scrollen op desktop (scherm breder dan 960 px)

Maak het browservenster zo hoog als je scherm (op 1080p ongeveer 950 px) en kijk op elke pagina:

1. **De pagina zelf scrolt niet.** Er is geen scrollbalk aan de rand van het venster die de zijbalk meeneemt; de zijbalk blijft altijd staan.
2. **Vandaag:** de kop (groet, ring, dagnavigatie, weekstrook) blijft staan. Scroll in de linkerkolom (Even kijken en de dagdelen): de rechterkolom (Oningepland) beweegt niet mee, en andersom. Beide kolommen hebben een dunne scrollbalk in het accent.
3. **Tik een taak af** terwijl je halverwege de linkerkolom staat: de kolom springt niet naar boven.
4. **Open "Wat hield je tegen?"** terwijl je gescrold staat: niets verschuift, de zijbalk blijft staan, en na sluiten staat alles weer zoals het was. Doe hetzelfde met de iconenkiezer bij een habit bewerken.
5. **Voortgang:** de titel blijft staan; het overzicht en de terugblik scrollen los van elkaar.
6. **Habit bewerken of nieuw:** het formulier is op elk scherm één lijst in een smalle kolom (geen twee kolommen) en scrollt zelf. De knoppen *Habit opslaan* en *Annuleren* blijven onderaan in beeld, ook bij een habit met teller (daar scrolt het formulier).
7. **Habit: detail:** hoofd- en zijkolom scrollen los van elkaar.
8. **Instellingen en Prestaties** scrollen als geheel, met de balk aan de rand van het scherm.
9. **Venster smaller dan 960 px:** de tabbalk komt terug en de pagina scrolt als op een telefoon.

Meten in plaats van kijken: `npm run audit:scroll` (met `SHOTS=<map>` ook schermafbeeldingen).

## K. Vrienden en de uitnodigingsflow (stub en leeg)

Na `npm run dev:seed` heeft de stub zes vrienden en een uitnodigingslink. Gebruik een eigen browserprofiel per account.

**Als de stub (Vrienden)**
1. Open **Vrienden** (via de kaart bovenaan Voortgang). De ranglijst toont **Anna (340)**, daaronder de **stub zelf** (je eigen cijfers komen uit je habits, ongeveer 270), **Bram (180)** en **Cor (95)**. **Fien** staat er niet op: zij deed 10 dagen niets af. Scroll onder de ranglijst naar **Je vrienden (4)**: Anna, Bram, Cor en Fien met "@naam · Vriend sinds …"; alleen Fien heeft de uitleg "Niet op de ranglijst: de laatste 3 dagen niets afgevinkt…". Omdat de vriendschappen net door de seed zijn gemaakt, hebben ze allemaal het label **Nieuw** (dat verdwijnt na 7 dagen); accepteer Dora en ze komt erbij. De kaart op Voortgang noemt "4 vrienden"; bij het lege account staat er de knop *Vriend toevoegen*.
2. **Beheren:** onder "Je vrienden" staan Anna, Bram, Cor en Fien (ook Fien); onder "Verzoeken aan jou" staat **Dora**, onder "Je verstuurde verzoeken" staat **Eef**. Accepteer Dora: ze komt in de vriendenlijst en, zodra ze iets afvinkt, op de ranglijst (haar samenvatting is er al, dus meteen). Trek het verzoek aan Eef in.
3. **Vrienden toevoegen:** zoek op `bram.stub` (al vrienden: "Al vrienden") en op `eef.stub`. Zoek op een bestaande naam die geen vriend is, via een extra account (zie `dev:code -- dora`).
4. **Je eigen uitnodigingslink:** op "Vrienden toevoegen" staat er geen link (die van de seed staat niet op dit apparaat). Maak er een: hij blijft **na het verlaten van de pagina zichtbaar** met "Nog niemand heeft deze link gebruikt · Werkt tot …", met Kopiëren en Delen. Onder **Beheren** staat dezelfde link met het aantal mensen en een knop Kopiëren.

**Als nieuwe gebruiker (leeg account, of een tweede link-ontvanger)**
5. Open de uitnodigingslink uit de seed (of die van stap 4) **uitgelogd**, in een schone browser. Verwacht: *"Remco (stub) nodigt je uit voor Habit Builder"* met één knop **Account maken**.
6. Maak een account (`leeg@example.com`, code via `dev:code -- leeg`). Het inlogscherm zegt *"Je bent uitgenodigd door Remco (stub)"*. Na de code kom je vanzelf op de uitnodiging; er verschijnt **geen aparte naamdialoog**.
7. **Eén naamstap:** "Hoe wil je heten?" met uitleg. Vul "Leeg" in: de gebruikersnaam (`leeg`) staat achter "Wijzigen". Kies "Niet nu" bij een ander account om over te slaan.
8. Na het opslaan: **"Jij en Remco (stub) zijn nu vrienden!"** met @stub, en "Maak je eerste habit" (je hebt nog geen habits) en "Bekijk je vrienden".
9. Open dezelfde link nog eens: **"Jij en Remco (stub) waren al vrienden"**. Open hem als de stub zelf: "Dit is je eigen uitnodigingslink". Open een verzonnen link (`…/uitnodiging/` met 64 keer `f`): "Deze link werkt niet meer" met nog steeds de knop Account maken.
10. Terug als de stub: de leeg-gebruiker staat in "Je vrienden" en de teller bij je link is **1 persoon**.

## L. Prestaties (§5, ronde 1 en 2)

1. Open het gevulde account (`npm run dev:seed`, inloggen als stub). Bij de eerste keer openen na de update kan er één viering met meerdere medailles verschijnen ("n nieuwe prestaties!"): de stub haalt veel regels al. Sluit hem met *Mooi!*.
2. **Prestaties** is nu per groep: *Aantallen, Volhouden, Terugkomen, Slimmer, Ingeburgerd, Reflectie, Verbreding*, elk met "x van y". Een medaille die nog niet behaald is toont hoe ver je bent, bijvoorbeeld **"199 van 500"** bij *500 keer gedaan*; de rest zegt "Nog niet behaald".
3. Een medaille voor meerdere habits toont de eerste twee en "en 7 andere", niet een hele rij.
4. Zelf uitproberen met het lege account (`leeg`): vink iets af tot 10 keer (*10 keer gedaan*), vul bij een habit een *minimale versie* in (*Kleine stap*, direct), pauzeer een habit, hef de pauze op en vink hem daarna af (*Pauzeren is oké*). *Vol doel* (een teller-habit, zeven dagen op rij het volle doel; een minimale versie of een half doel breekt de reeks) is lokaal alleen met een aangepaste datum te testen en wordt gedekt door de unit-tests.
5. *Sterk terug*: een habit waarvan twee weken minder dan de helft gehaald is en die daarna weer op 80% komt. *Nooit twee keer missen*: vijf keer na een gemiste dag meteen weer gedaan. Beide zijn in de stub al gehaald (Terugkomen: 3 van 3).
6. Controleer op 320 px met 200% tekst dat de pagina niet zijwaarts scrolt (`npm run check:layout` doet dat ook).
7. Nieuwe prestaties zijn privé: ze staan niet op de ranglijst en niet in wat vrienden zien.
8. **Reflectie en verbreding (ronde 2):** *Eerste review* (sla een weekreview op), *Je waarom* (vul het waarom in bij drie habits; "1 van 3" loopt mee), *Automatisme gevolgd* (een cijfer in vier verschillende weken), *Hele dag* (habits in ochtend, middag en avond; "de hele dag" telt niet), *Vijf tegelijk*, *Alles gedaan* (tien dagen waarop alles van de dag is gedaan, minstens twee dingen). De stub heeft de verbredingsgroep al volledig (4 van 4).
9. **Samen (sociaal):** de groep staat alleen op de pagina als sociaal aan staat. Zet sociaal aan als stub (de vrienden uit de seed): *Samen sterker* is meteen behaald, *Vijf vrienden* toont "4 van 5" en komt erbij zodra je er een vijfde hebt (accepteer Dora). Met het lege account en sociaal uit ontbreekt de groep.

## M. Introductie en Zo werkt het (docs/ONBOARDING.md)

Gebruik het lege account (G) of een schone browser; de vlag staat lokaal (`hb-intro-seen`), wis hem in de console met `localStorage.removeItem('hb-intro-seen')`.

1. **Eerste start zonder habits**: je landt op `#/welkom/1`. "Volgende" gaat naar stap 2, 3 (de app installeren) en 4 (de eerste habit); "Overslaan" gaat naar Vandaag, en bij de volgende start komt de introductie niet terug. Stap 1 heeft "Heb je al een account? Log in" en "Kies je stijl": tik op Mel Theme en alles (kleuren, de mascotte bovenaan, de drie fases) verandert meteen; de keuze blijft staan in Instellingen.
2. **Stap 3, de app installeren**: in Chrome of Edge staat er een knop Installeren (probeer hem; daarna staat er "Gelukt!"). Op een iPhone in Safari staan er drie genummerde stappen (Delen, Zet op beginscherm, Voeg toe). In een browser zonder installatie (bijvoorbeeld Firefox) staat er een algemene aanwijzing. Open je de app vanaf het beginscherm, dan ontbreekt deze stap en zijn het drie stappen.
   **Inloggen vanuit stap 1** (heeft een echt account nodig): tik op Log in, log in met een **nieuw** adres: je komt terug bij stap 1 en de regel "Heb je al een account?" is weg. Doe het ook met Google (de pagina laadt opnieuw). Log je in met een account dat al habits heeft, dan kom je op Vandaag uit.
3. **Stap 4**: zeven sjablonen, elk met het soort ritme eronder (Elke dag · met teller, 3× per week, Di, vr, 2× per maand, Dag 25 van de maand). Een sjabloon opent het formulier ingevuld; onder **Herhaling** staat een voorbeeld met "Uitleg over de ritmes". Tik daarop: de uitleg opent als blad boven het formulier (de pagina verandert niet). Sluit het blad: je invoer staat er nog en je zit weer op dezelfde plek.
4. **Eerste habit opslaan** vanuit de introductie: je komt op Vandaag met de tip "Je eerste habit staat klaar" (één keer; "Begrepen" sluit hem voorgoed). Een habit met een minimale versie viert ook "Kleine stap".
5. **Wie al habits heeft** (het gevulde account) ziet de introductie nooit, ook niet via een lege Vandaag later.
6. **Instellingen → Zo werkt het** (`#/uitleg`): acht onderdelen, de vijf ritmes plus de teller met voorbeelden, en onderaan "Bekijk de introductie opnieuw" (verandert niets aan je gegevens).
7. **Uitnodiging als nieuwe gebruiker** (K): na "Jij en Anna zijn nu vrienden!" staat bij een gebruiker zonder habits "Laten we beginnen", dat naar de introductie gaat. "Niet nu" op de naamstap gaat ook naar de introductie.
8. **Scrollen**: op elke stap blijven de stippen en de titel staan terwijl je de inhoud scrolt; er is geen scrollbalk, de inhoud smelt aan de rand weg en de pagina erachter beweegt niet. Probeer ook een liggende telefoon: daar scrolt de hele pagina.
9. **Grote tekst**: alles op 320 px met 200% tekst, zonder zijwaarts scrollen (`npm run check:layout` controleert dit).

## N. Flexibele taken: Habits, de stapel en Plan je week (docs/FLEXIBELE-TAKEN.md)

Gebruik het gevulde account (A). Het stub-account heeft vier flexibele taken (Hardlopen, Bed opmaken, Gitaar spelen, Gordijnen wassen).

1. **Habits**: boven de lijst staat één werkbalk (Volgorde, Pauzeer alles); alleen Volgorde heeft een aan/uit-stand (dan staat er "Klaar"). Bij de groep Flexibel staat een melding in woorden, "Nog n taken om in te plannen", met de knop **Plan je week** ernaast (een kalender, geen aan/uit-stand; hij opent een blad). Is alles gepland of gedaan, dan staat er "Alles is ingepland of gedaan". Gepauzeerde taken (Yoga in het testaccount) tellen niet mee. De lijst heeft de groepen **Vaste dagen** en **Flexibel**. Elke rij heeft een statusregel (bijvoorbeeld "Opbouw · dag 41") en bij een flexibele taak de voortgang van de week of maand.
2. **Dreigt te falen** (op Habits en op Vandaag): een taak waarvan nog niets gedaan is, krijgt de waarschuwing zodra het deel van de periode dat over is kleiner is dan 60% van wat nog moet. Donderdag 0 van 2 in de week: ja; met één keer gedaan: nee; woensdag 0 van 2: nog niet.
3. **Vandaag, de stapel**: compacte kaarten met één knop (＋ Vandaag). Onder **Dreigt te falen** staat wat krap is, onder **Verder deze week** de rest. Met meer dan vier taken zit de rest ingeklapt onder "Nog n taken tonen". Achter ⋯ staan "Andere dag…" en "Al gedaan".
4. **Plan je week** (op Habits bij Flexibel, en bij de stapel op Vandaag): per flexibele taak acht dagknoppen. Tik een dag aan en hij staat daarna op Vandaag van die dag. "Verdeel voor mij" plant wat nog ontbreekt, uit elkaar en niet allemaal op dezelfde dag. **Niet in deze week** (knop onder de dagen van een taak waar nog iets te plannen valt): de rij wordt gedempt ("niet in deze week, geen herinnering"), "Nog n taken om in te plannen" telt hem niet meer mee (staan alleen nog zulke taken open, dan zegt Habits "Alles is ingepland of gedaan, op n taken na die je niet in deze week doet") en "Verdeel voor mij" slaat hem over. "Toch deze week plannen" of een dag aantikken zet het terug. **Overslaan in de laatste kans**: kies bij een taak per maand in de laatste week van de maand (of bij een taak die nog veel keer moet, zoals Dreigt B in het testaccount) **Niet in deze week**: de rij toont eerst een oranje vraag "Als je deze overslaat, kun je je doel niet meer halen" met **Dan plan ik hem in** en **Toch overslaan**. Na overslaan staat er een vaste oranje regel en op Vandaag bij Oningepland een waarschuwing; **Toch inplannen** zet het zonder vraag terug. **Markering en maandtaken**: open Plan je week via "Nog n taken om in te plannen": de taken die nog dagen nodig hebben hebben een accentrand en de eerste staat in beeld; die verdwijnt zodra ze genoeg dagen hebben. Een taak "2× per maand" met nog veel dagen over is klaar met één dag ("alles ingepland"); pas in de laatste dagen van de maand moeten beide een dag. **Start later**: maak een flexibele taak met startdatum morgen (of overmorgen). Hij staat in Plan je week met "start morgen"; de dagen ervoor zijn niet aan te tikken, vanaf de startdatum wel, en "Verdeel voor mij" plant niet eerder. Op Habits staat hij bij Gepland, met Plan je week erboven als er geen lopende flexibele taak is. **Al ingepland**: een taak die je op vrijdag of zondag hebt ingepland staat niet meer in Oningepland (ook niet als je naar morgen bladert); staat er niets anders meer open, dan staat daar een vak "Alles ingepland, goed gedaan!" en pas je het aan via **Plan je week**; moet hij vaker, dan staat er "Eerste keer ingepland op vrijdag" en blijft "＋ Vandaag" staan. De taak verdwijnt dan ook uit **Oningepland** op Vandaag (de kop en de knop Plan je week blijven staan; als er niets meer in te plannen is staat eronder het vak "Alles ingepland, goed gedaan!"). Volgende week (maandag) komt de herinnering vanzelf weer.
5. **Grote tekst**: de stapel en het blad op 320 px met 200% tekst, zonder zijwaarts scrollen (`npm run check:layout`).

## O. Feedback (docs/FEEDBACK.md)

Heeft een draaiende Supabase nodig met migratie 0007 (lokaal doet `npm run db:start` dat zelf; een bestaande lokale database bijwerken kan met `npm run db:reset`). Voor het tabje log je lokaal in als `beheer@example.com` (`npm run dev:admin` maakt dat account, code via `npm run dev:code -- beheer`); in productie moet je jezelf in `app_admins` zetten (zie de release-checklist).

1. **Instellingen → Feedback geven**: een blad met vier soorten (Idee, Probleem, Vraag, Compliment), een tekstvak met teller en "Dit gaat mee: de pagina (#/settings) en de versie van de app". Versturen zonder soort of tekst geeft meldingen en laat het blad open. **Annuleren** brengt je terug op Instellingen, met de focus op de knop.
2. **Zonder account** (anoniem): kies een soort, schrijf iets, **Versturen**: een bedankje. Er is geen mailvinkje.
3. **Met account**: er staat een vinkje "Je mag me hierover mailen". Stuur één bericht met en één zonder het vinkje.
4. **Zonder verbinding** (vliegtuigmodus): versturen geeft "Geen verbinding. Je tekst staat nog hier"; het blad blijft open en je tekst staat er nog. Zet de verbinding weer aan en verstuur opnieuw.
5. **Zijbalk (computer)**: onderaan staat de stille regel "Feedback geven"; die opent hetzelfde blad. Op de telefoon staat die regel er niet.
6. **Zo werkt het** (onderaan): "Mis je iets of is iets onduidelijk?" met dezelfde knop.
7. **De uitnodiging op Vandaag**: zet in de console `localStorage.setItem('hb-first-run', Date.now() - 10 * 864e5)` en `localStorage.setItem('hb-nudge-dismissed', '1')` en open Vandaag: onderaan staat "Hoe bevalt de app tot nu toe?". "Niet nu" laat hem verdwijnen en hij komt de eerste 28 dagen niet terug. In de eerste week (en naast het zetje om in te loggen) verschijnt hij niet.
8. **Het tabje voor jou** (alleen op de computer, ingelogd als beheerder): in de zijbalk staat **Feedback** met het aantal nieuwe berichten. De lijst heeft de filters Nieuw, Afgehandeld en Alles (met aantallen) en een soort. Per bericht: soort, datum, tekst, afzender ("Anoniem" of een mailadres), pagina en versie. **Afgehandeld** verplaatst het bericht; **Verwijderen** vraagt eerst om bevestiging. Een gewone gebruiker ziet het tabje niet; opent hij `#/feedback` toch, dan staat er dat het alleen voor de beheerder is.
9. **Grote tekst**: het blad op 320 px met 200% tekst, zonder zijwaarts scrollen (`npm run check:layout` controleert dit, ook met een nagebootste server voor jouw lijst).

## Automatische controles

```
npm test                 # alle tests, inclusief tests/dev-stub.test.js (elke toestand zit in het stub-account)
npm run check:layout     # lay-out in een echte browser: 390 px, 320 px en tekst op 200%
```
