# Onboarding: een nieuwe gebruiker weet na een minuut hoe de app bedoeld is

Status: **besloten en gebouwd (zie "Stand")** · opgesteld 2026-10-17 · bouwt voort op [ITERATIE-1.2.md](ITERATIE-1.2.md) §2 (de flow voor een nieuwe gebruiker op een uitnodiging) en [PLAN.md](PLAN.md) · werkwijze: [WERKWIJZE.md](WERKWIJZE.md)

## Stand

| Onderdeel | Stand |
|---|---|
| O1 Zo werkt het (naslag) | gebouwd: `#/uitleg`, vanuit Instellingen en het habit-formulier |
| O2 Voorbeelden bij Herhaling in het formulier | gebouwd, plus drie sjablonen (vaste dagen, per maand, dag van de maand) |
| O3 Introductie van vier schermen (drie als de app al geïnstalleerd is) | gebouwd: `#/welkom/1` t/m `4`, met een lokale vlag |
| O8 Stap "Zet de app op je beginscherm" | gebouwd: een installeerknop, stappen voor iOS, een algemene aanwijzing, en "Gelukt!" na het installeren |
| O4 Aansluiting op de uitnodigingsflow | gebouwd: het bevestigingsscherm wijst een nieuwe gebruiker naar de introductie |
| O5 Eenmalige tip op Vandaag na de eerste habit | gebouwd |

## Het probleem

Wie de app voor het eerst opent, ziet een leeg Vandaag met drie voorbeelden. Dat is een goed begin, maar de app doet veel meer dan een afvinklijst, en een paar dingen zijn niet te raden:

- dat een gewoonte in ongeveer 66 dagen groeit en dat **missen mag, maar twee keer achter elkaar niet**;
- dat je **klein** begint (een minimale versie, een cue) en dat dat de bedoeling is;
- dat een habit **vijf soorten ritme** kan hebben (elke dag, vaste dagen, X keer per week, X keer per maand, een dag van de maand). Wie dit niet weet, maakt van "ramen lappen" een dagelijkse taak en haakt af;
- dat overslaan en pauzeren iets anders zijn dan missen;
- dat alles op dit apparaat staat tot je een account maakt.

Er is nu **één** plek met uitleg: de tips op de habit-detailpagina. Die komen pas als je al een habit hebt.

## Wie komt er binnen?

| Ingang | Wat er al is | Wat er mist |
|---|---|---|
| **Direct de app openen**, zonder account | leeg Vandaag met sjablonen | uitleg wat de app bedoelt |
| **Via een uitnodigingslink** (anoniem) | welkom met de naam van de uitnodiger, account, één naamstap, "Jij en Anna zijn nu vrienden!" | daarna loopt het af in "Maak je eerste habit" of "Naar Vandaag" |
| **Terugkerende gebruiker op een nieuw apparaat** | inloggen, sync | niets: die heeft habits en hoeft niets te zien |

De introductie mag dus **niet** aan sociaal of een account hangen. Dat bepaalt de trigger.

## Wat moet iemand weten? (en wat niet)

Vooraf, in de introductie:

1. **Waar het om gaat.** Een gewoonte groeit in ongeveer 66 dagen. Missen mag; twee keer achter elkaar is het begin van stoppen.
2. **Begin klein.** Een minimale versie voor slechte dagen en een cue ("na het ontbijt").
3. **Een dag.** Op Vandaag vink je af. Je kunt ook overslaan, de minimale versie doen of een teller bijhouden.
4. **Het ritme kiezen.** Vijf soorten, elk met een voorbeeld.
5. **Je eerste habit**, uit een sjabloon of zelf.

Pas later, op het moment dat het relevant wordt: punten, prestaties, weekreview, "Even kijken", de ochtendmelding, installeren en vrienden. Die staan wel in de naslag.

## Drie lagen

| Laag | Wanneer | Wat |
|---|---|---|
| **Introductie** (O3) | één keer, bij de eerste start zonder habits; altijd over te slaan | vier schermen, ongeveer een minuut |
| **Hulp op het keuzemoment** (O2, O5) | als de vraag speelt | een voorbeeld onder elk ritme in het formulier; één tipkaart op Vandaag na de eerste habit |
| **Naslag "Zo werkt het"** (O1) | altijd, via Instellingen en een link in het formulier | de soorten habits met voorbeelden, klein beginnen, een dag, missen, ingeburgerd, punten en prestaties, je gegevens |

Bewust **niet**: pijlen en bellen op het scherm (coach-marks). Die breken bij grote tekst en bij de kolomindeling op desktop, en de app is juist robuust gemaakt voor grote tekst (zie de besluiten over pinch-zoom).

## Eisen

| ID | Eis | Prio |
|---|---|---|
| O1 | Een pagina **Zo werkt het** met de uitleg, bereikbaar uit Instellingen en vanuit het formulier. Onderaan een knop om de introductie opnieuw te bekijken. | M |
| O2 | Onder **Herhaling** in het formulier staat bij het gekozen ritme een voorbeeld ("2 keer per maand: ramen lappen") en een link naar de naslag. Er komen sjablonen voor "vaste dagen", "per maand" en "dag van de maand", zodat alle vijf de ritmes in de introductie te kiezen zijn (een test bewaakt dat). | M |
| O3 | Een **introductie van vier schermen**: het idee, een dag en het ritme, de app installeren (O8) en de eerste habit. Elk scherm heeft "Volgende" en "Overslaan". Het eerste scherm heeft ook "Heb je al een account? Log in". | M |
| O3a | **Trigger:** bij het starten op Vandaag, zolang er **geen habits** zijn en de introductie op dit apparaat nog niet is gezien. Wie al habits heeft, krijgt hem nooit, ook niet na een update of op een nieuw apparaat. De vlag staat lokaal (geen server, geen nieuwe gegevens). | M |
| O3b | Overslaan of afronden zet de vlag; daarna komt de introductie nooit vanzelf terug. Opnieuw bekijken kan alleen met de knop in de naslag. Dat verandert niets aan je gegevens. | M |
| O3c | De introductie is **hervatbaar en loopt nergens dood**: de eerste habit is aangeboden, niet verplicht ("Later"). Vooruit en terug werken met de knop van de browser. | M |
| O4 | In de uitnodigingsflow wijst het bevestigingsscherm een gebruiker **zonder habits** naar de introductie ("Laten we beginnen") in plaats van direct naar een leeg formulier. Een gebruiker met habits ziet geen verandering. | M |
| O5 | Na het opslaan van de eerste habit vanuit de introductie gaat de gebruiker naar Vandaag en ziet **één keer** een rustige tipkaart ("Tik om af te vinken. Een dag mislukt? Doe de minimale versie of sla over."), die te sluiten is. | S |
| O6a | **Scrollen** (zie [SCROLLEN.md](SCROLLEN.md)): de stappen (stippen) en de titel staan altijd vast; de inhoud scrolt eronder, zonder zichtbare scrollbalk en met de zachte fade aan de randen. De pagina zelf scrolt niet. Op een scherm lager dan 30rem (ook door grote tekst) scrolt de pagina als geheel, zodat de inhoud ruimte houdt. | M |
| O6 | Overal: 320 px met 200% tekst zonder zijwaarts scrollen, beide thema's, focus naar de kop bij elke stap, offline, alle teksten in `nl.js` of `content/`. | M |
| O7 | Geen nieuwe gegevensverwerking en geen telling van wie de introductie afrondt (we zien lokale gebruikers niet; succes beoordelen we op terugkoppeling). | M |
| O9 | Op de **eerste stap** kies je je stijl (de themakaarten uit Instellingen, gedeeld onderdeel `theme-picker.js`). De keuze geldt direct: kleuren, mascottes en de stap zelf veranderen mee, en de rest van de introductie staat in dat thema. De keuze wordt bewaard zoals in Instellingen. | S |
| O10 | **Inloggen vanuit de introductie brengt je erna weer bij de introductie.** "Heb je al een account? Log in" staat er alleen voor wie niet is ingelogd. Een tik op Log in onthoudt de terugweg 10 minuten (lokaal), voor de e-mailcode én de omweg via Google (de pagina laadt dan opnieuw; we wachten op de eerste sync). Overslaan of afronden vergeet de terugweg. Heeft het account al habits (een bestaand account op een nieuw apparaat), dan ga je naar Vandaag en is de introductie gezien. Een uitnodiging die wacht gaat voor. | M |
| O8 | Een stap **"Zet de app op je beginscherm"** vóór de eerste habit, met het icoon van de app en twee voordelen. **Android, Chrome en Edge:** een knop Installeren (de hoofdactie; "Volgende" is dan rustiger). **iOS:** drie genummerde stappen met de knoppen die je ziet (Delen, Zet op beginscherm, Voeg toe), want daar bestaat geen knop. **Overige browsers:** een algemene aanwijzing (menu, App installeren). Na het installeren staat er "Gelukt!". Is de app al geïnstalleerd toen de introductie begon, dan ontbreekt de stap. Onder Instellingen blijft App installeren staan. | M |

## Besluiten

| # | Besluit | Reden |
|---|---|---|
| B1 | De eerste habit is aangeboden, niet verplicht | Wie al weet wat hij wil, hoeft niet door sjablonen. Verplichten geeft een doodlopende stap |
| B2 | De vlag staat lokaal en de trigger is "geen habits én niet gezien" | Geen serverwijziging; een nieuw apparaat met een account heeft habits en slaat de introductie dus over |
| B3 | De naslag heet **Zo werkt het**, niet "Tips en tricks" | Het is uitleg die je nodig hebt, geen bijzaak |
| B4 | De knop "Introductie opnieuw bekijken" staat onderaan de naslag, niet als eigen regel in Instellingen | Hij is er voor wie hem zoekt, en voor testen; hij maakt niets aan en zet niets terug |
| B5 | Geen coach-marks | Zie hierboven: grote tekst en kolommen |
| B6 | De ochtendmelding hoort niet in de introductie; het installeren wel (besluit 2026-10-17, was eerst andersom) | De melding wordt aangeboden na de eerste keer afvinken, als de waarde zichtbaar is (bestaande kaart). Het installeren stond verstopt in Instellingen en hoort bij het begin: wie de app op zijn beginscherm heeft, gebruikt hem vaker |
| B7 | De installeerstap staat vóór de eerste habit en valt weg als de app al geïnstalleerd is | De laatste stap verlaat de introductie (naar het formulier), dus installeren moet eerder. Wie de app vanaf zijn beginscherm opent, heeft de stap niet nodig. De stappen verschuiven niet als je halverwege installeert: dan staat er "Gelukt!" |

## Ontwerp

```
[eerste start, geen habits]  ->  #/welkom/1  Het idee            [Volgende]  Overslaan · Log in
                                  #/welkom/2  Een dag en het ritme [Volgende]  Overslaan
                                  #/welkom/3  De app installeren   [Installeren] of stappen  (valt weg als al geïnstalleerd)
                                  #/welkom/4  Je eerste habit      kies een sjabloon · zelf maken · Later
                                                  |
                                                  v   (habit opgeslagen)
                                            Vandaag + eenmalige tipkaart

[uitnodiging] ... "Jij en Anna zijn nu vrienden!"  [Laten we beginnen] -> #/welkom/1   (alleen zonder habits)
```

Bestanden: `src/ui/intro.js` (vlaggen), `src/ui/views/welcome.js` en `guide.js`, `src/content/guide.js` (de teksten van de naslag), `src/main.js` (routes en de trigger), `habit-form.js`, `today.js`, `friends-invite.js`, `settings.js`, `templates.js`, `styles/components/welcome.css`.

## Risico's

- **Een tweede eindscherm.** Na de uitnodiging staat er al een bevestiging. De introductie hangt aan de knop daarvan, dus er komt geen tweede "klaar" bij.
- **Iemand die al een account heeft op een nieuw apparaat** ziet de introductie kort, voordat de sync zijn habits brengt. Daarom heeft het eerste scherm "Log in", en slaat overslaan de introductie voorgoed over.
- **De uitleg loopt achter** op de app. De naslag wordt vergeleken met de bron: een test controleert dat elk ritme een uitleg en een voorbeeld heeft.
