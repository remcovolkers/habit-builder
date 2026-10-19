# Automatisme: een cijfer met een verhaal, en een proef zonder app

Status: **gebouwd** · 2026-10-19 · bouwt voort op [PLAN.md](PLAN.md) §4.5 (ingeburgerd) en [FLEXIBELE-TAKEN.md](FLEXIBELE-TAKEN.md) · werkwijze: [WERKWIJZE.md](WERKWIJZE.md)

## Het probleem

Automatisme was één los cijfer van 1 tot 5 ("hoe automatisch voelde dit?"), met één zin uitleg en een toast die na een paar seconden weg was. Je zag het cijfer nergens terug, het zei niet wat het betekende, en het deed niets behalve meetellen voor "ingeburgerd". Drie dingen ontbraken:

- **Het voelde niet als iets om naartoe te werken.** Er was geen verloop, geen doel en geen reden waarom een 3 geen 4 was.
- **Het cijfer meet hoe een taak op gang komt, niet of hij lukt.** Je kunt iets elke keer doen en toch elke keer een herinnering nodig hebben. Als de app zelf de cue is (het plan, de ochtendherinnering), meet het cijfer deels hoe goed de app werkt.
- **Er was geen manier om het te bewijzen.** Zelfrapportage is subjectief; er ontbrak iets wat je kunt *doen* om te laten zien dat een taak van jou is.

## Wanneer is iets automatisch?

Vier kenmerken, uit de gevalideerde vragenlijsten van Verplanken en Gardner (SRHI en SRBAI). De uitleg in de app ("Wanneer is iets automatisch?") noemt ze zo:

1. **Zonder nadenken:** er is geen beslismoment.
2. **Je weet precies wat je doet:** een vast riedeltje, dezelfde plek, hetzelfde moment, dezelfde volgorde.
3. **Zonder zetje:** je doet het ook als niets of niemand je eraan herinnert, dus ook zonder herinnering of plan van Habit Builder.
4. **Vreemd om het niet te doen:** je bent al bezig voor je het doorhebt.

Habit Builder is een **steiger**: hij helpt zolang dat nodig is en mag verdwijnen zodra jij het zelf kunt. Dat staat ook zo in de uitleg.

## Wat er is gebouwd

| Onderdeel | Wat |
|---|---|
| **Vijf zinnen in plaats van een cijfer** | 1 = "Ik moest het plannen en me ertoe zetten", 2 = "Ik moest eraan denken", 3 = "Het ging, maar ik moest even nadenken", 4 = "Ik wist wat ik moest doen en deed het gewoon", 5 = "Op de automatische piloot, zelfs zonder herinnering". Je kiest een zin; daarna staat alleen die zin er met **Wijzig**. Dezelfde keuze staat op Vandaag (onder een zeldzame taak die je net afvinkt) en op de habit |
| **Wat hielp?** | Optioneel na het cijfer: *een herinnering, het plan van de app, een vaste plek of moment, iemand anders, niets (het ging vanzelf)*. "Niets" sluit de rest uit. Het staat bij het cijfer van die week (`ratings.cues`) |
| **Een feedbackmoment** | Direct onder het cijfer op Vandaag blijft een regel staan (geen toast): de eerste keren *"Genoteerd. Bij de habit zelf zie je hoe je automatisme van keer tot keer groeit."* met de link **Bekijk verloop** naar de habit, daarna alleen *"Genoteerd."* met dezelfde link |
| **Automatisme op de habit** | Een kaart met een **meter** in vier stappen (*Nog bewust, Komt eraan, Bijna vanzelf, Vanzelf*), de **cijfers van keer tot keer** als staafjes met een doellijn bij 4, **één zin raad** (zie hieronder), een regel over wat er hielp (vanaf twee antwoorden) en het cijfer van deze week. Op de lijst Habits staat het niveau als regel onder de habit |
| **"Wanneer is iets automatisch?"** | Een blad met de vier kenmerken, de vijf cijfers en de boodschap dat een laag cijfer geen falen is en dat de app een steiger is. Te openen vanaf de vraag en vanaf de habit |
| **Ingeburgerd: de laatste twee cijfers** | De regel was "het laatste cijfer ≥ 4". Eén gelukkig cijfer is te weinig, vooral bij een zeldzame taak met weinig metingen. Nu: de **laatste twee cijfers ≥ 4**, of **één keer ≥ 4 na een geslaagde proef zonder app** (`AUTOMATICITY_CONFIRMATIONS`, [graduation.js](../src/domain/graduation.js)). In de checklist staat "1 van 2" |
| **De proef zonder app** | Zie hieronder |

## De raad

Eén zin, afgeleid van de cijfers en wat er hielp ([automaticity.js](../src/domain/automaticity.js), `adviceFor`):

| Sleutel | Wanneer | Zegt |
|---|---|---|
| `effort` | laatste cijfer 1 of 2 | maak het kleiner, kies een minimale versie |
| `cue` | minstens de helft van de laatste (minstens twee) antwoorden noemt een herinnering of het plan van de app, en er is nog geen cue | koppel het aan iets wat je al doet en vul dat in als cue |
| `weaning` | idem, maar er is al een cue | probeer het eens zonder de app |
| `coming` | laatste cijfer 3 | herhaling maakt het vanzelf |
| `once` | één keer 4 of 5 | nog één keer, of een geslaagde proef |
| `steady` | twee keer achter elkaar 4 of 5 | dit onderdeel van ingeburgerd is gehaald |

## De proef zonder app

**Idee:** de eerlijkste vraag is niet "hoe automatisch voelt het?" maar "doe je het ook zonder dat de app helpt?". Daarom kan een flexibele taak (N× per week of maand) een hele week of maand zonder de app: geen kaartje op Vandaag, geen herinnering, niet in Plan je week, geen aandachtssignaal. Aan het eind staat in de **review** de vraag of het gelukt is.

| Regel | Waarom |
|---|---|
| **Alleen een flexibele taak** (per week of per maand) | Een taak met vaste dagen staat altijd op zijn dag op Vandaag; daar kun je de app niet wegnemen zonder de taak te verstoppen. Besloten met Remco: de proef is voor week- en maandtaken |
| **Kan zodra de laatste twee cijfers minstens 3 zijn** | "Een paar keer 3 of hoger" werd twee keer. Lager is te vroeg: dan is de proef bijna zeker mislukt en is dat demotiverend |
| **Begint op de eerstvolgende hele week of maand** (of vandaag als dat de eerste dag is) | Een proef dekt een hele periode, anders is het antwoord niet eerlijk. Wat al was ingepland voor die dagen vervalt |
| **De vraag staat in de week- of maandreview, geen kaartjes** | Besluit Remco: de vraag komt eind van de week ("Heb je het gedaan zonder de app?"), geen extra kaartje op Vandaag. De review van de week (vrijdag t/m maandag 12:00) of de maand (de 25e t/m de 2e 12:00) is het venster. Staat de review open en is een taak zover, dan biedt de review ook meteen een volgende proef aan |
| **"Ja" kan alleen als de taak in die periode is afgevinkt** | Anders is er niets om te beoordelen. Afvinken doe je tijdens de proef bij de habit zelf (**Vandaag gedaan**), want de taak staat niet meer op Vandaag |
| **Mislukt: de app helpt weer** | Direct weer in de stapel en in de herinnering. Een week-taak krijgt **4 hele weken** hulp, een maand-taak **2 hele maanden** (gerekend vanaf het eind van de proef), daarna kan het opnieuw (besluit Remco: "houden we de app weer even 2 maanden aan voor maandtaken, 4 weken aan voor weektaken") |
| **Gelukt: telt als één van de twee keren voor ingeburgerd** | Alleen samen met een laatste cijfer van 4 of hoger. De taak staat dan gewoon weer op zijn plek |
| **Geen antwoord voor de review sluit: de proef verloopt** | Geen wachttijd; vergeten is geen mislukking. De taak staat weer in de stapel |
| **Stoppen kan altijd** | Zonder wachttijd |

Een proef staat op de habit zelf (`habit.trials`, geen nieuwe tabel en dus geen serverwijziging; zie [DATAMODEL.md](DATAMODEL.md)). Wat er in de proef gebeurt met de afspraak zelf verandert niet: haal je de taak in die maand niet, dan is dat een gewone gemiste eenheid. Dat is de prijs van de proef en dat staat in de uitleg op de habit.

## Wat bewust niet is gebouwd

- **Geen eigen cijfer voor "zonder app" bij taken met vaste dagen.** Daar bestaat de proef niet. Mogelijk later: een aanwijzing uit de gegevens (op een vaste tijd afgevinkt).
- **Geen afleiding "uit jezelf gedaan"** uit dagplannen bij flexibele taken: of een check-in zonder plan echt uit jezelf was, is uit de huidige gegevens niet betrouwbaar te zien (een plan wordt na het afvinken niet bewaard als aparte stap). De proef is de betrouwbare route.
- **Geen prestatie** voor een geslaagde proef. Dat vraagt een icoon en teksten in de set; kan later, en past bij "Automatisme gevolgd".
- **Geen nieuw meetinstrument** (de volledige SRBAI met vier vragen): elke extra vraag kost een tik op het moment dat iemand net klaar is. Het cijfer blijft één tik; wat hielp is optioneel.

## Waar het staat

| Wat | Waar |
|---|---|
| Regels (puur) | [automaticity.js](../src/domain/automaticity.js), [trial.js](../src/domain/trial.js), [graduation.js](../src/domain/graduation.js) |
| Handelingen | [actions.js](../src/app/actions.js): `rateAutomaticity`, `rateCues`, `startTrial`, `cancelTrial`, `answerTrial` |
| Scherm | [automaticity.js](../src/ui/components/automaticity.js), [trial.js](../src/ui/components/trial.js), [period-review.js](../src/ui/components/period-review.js), [habit-detail.js](../src/ui/views/habit-detail.js) |
| Teksten | `nl.automaticity` en `nl.trial` in [nl.js](../src/content/nl.js) |
| Stub-account | de habit **Tuin** is klaar voor een proef ([stub-data.mjs](../tools/lib/stub-data.mjs)) |
