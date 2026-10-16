# Iteratie na 1.1: uitnodigen, vrienden inzien, prestaties en iconen – analyse en requirements

Status: **analyse, besluiten genomen (§8), klaar om te bouwen** · opgesteld 2026-10-16, besluiten 2026-10-16 · bouwt voort op [SOCIAAL.md](SOCIAAL.md) · werkwijze: [WERKWIJZE.md](WERKWIJZE.md)

Vijf punten van Remco, hier uitgewerkt. Per punt: wat er nu is (uit de code gelezen, niet aangenomen), wat er mist, de eisen, en wat nog een keuze is.

| # | Punt | Soort | Omvang |
|---|---|---|---|
| 1 | Uitnodigingslink die een week geldt en door iedereen te gebruiken is | wijziging van bestaand gedrag, deels al gebouwd | klein–middel |
| 2 | Flow voor een nieuwe gebruiker die op een uitnodiging klikt | herontwerp van een flow | middel |
| 3 | Vrienden kunnen inzien, los van de ranglijst | ontbrekende functie | klein |
| 4 | Vandaag scrolt te ver onder de laatste kaart | bug | klein, eerst meten |
| 5 | Meer prestaties | uitbreiding | middel |
| 6 | Meer en bij het thema passende iconen voor habits | uitbreiding, raakt het datamodel | middel–groot |

---

## 1. Uitnodigingslink: een week geldig, voor iedereen

### Wat er nu is
- De server laat een link al **meermaals** gebruiken: `invite_redeem` verbruikt de code niet, de code verloopt na 7 dagen (`invite_create`). Het is zelfs getest: "de code werkt ook voor een tweede persoon (deelbaar in een groep)" (`tools/social-check.mjs:143`, `tests/server/social.test.js:241`). De uitleg in de app zegt dat ook al ("Iedereen die de link opent en meedoet, is meteen je vriend. De link werkt 7 dagen").
- Het gewenste gedrag bestaat dus op de server. Dat het als "maar één keer goed" **voelt**, heb ik niet kunnen reproduceren; de waarschijnlijke oorzaken zijn:
  1. **De link is maar één keer te zien.** De server bewaart alleen een hash; `invite_list` geeft geen code terug. Na het verlaten van "Vrienden toevoegen" kun je de link niet meer kopiëren of delen. Onder Beheren staat alleen "Link, werkt tot …". Wie hem nog een keer wil sturen, moet een nieuwe maken (max. 10 per dag, 5 tegelijk actief).
  2. **De flow van de ontvanger breekt** (zie §2), waardoor de link bij de tweede persoon lijkt te "falen".
  3. **Nieuw (antwoord Remco):** links die Remco zelf opende en daarna doorstuurde, gaven bij de ontvanger **"Pagina niet gevonden"**; een nieuwe link werkte wel. Die tekst komt uit de router (`views.notFound`, `src/main.js:135`), **niet** uit het uitnodigingsscherm, dat bij een ongeldige code zegt "Deze uitnodiging klopt niet of is niet meer geldig". De ontvangende app kende de route `#/vrienden/uitnodiging/<code>` dus niet. Dat wijst niet op een verbruikte code, maar op een app zonder die route: een oudere versie uit de cache of de productie-app van vóór 1.1 (de uitnodigingsroute zit pas in 1.1), of een link met een ander basisadres (`baseUrl` is `location.origin + location.pathname`, dus een link gemaakt op een testadres wijst naar dat testadres). Dat de nieuwe link wel werkte kan toeval van tijd of versie zijn. **Dit is een hypothese**; te controleren met het exacte adres van zo'n link (host en pad, zonder code) en de versie bij de ontvanger.
  4. Een echte fout die ik niet zie. **Eerste stap bij het bouwen: reproduceren** met twee echte accounts en een derde die dezelfde link opent, ook met een app die de route nog niet kent.

### Eisen
| ID | Eis | Prio |
|---|---|---|
| L1 | Een link is **7 dagen geldig en door meerdere mensen te gebruiken**; iedereen die hem gebruikt wordt direct vriend van de maker. (Server: bestaat; behouden en met een test vastleggen: drie mensen, één link.) | M |
| L2 | De maker kan zijn **actieve link opnieuw tonen, kopiëren en delen** zolang hij geldt, zonder een nieuwe te maken. Voorstel: de app onthoudt de code per apparaat (net als de wachtende uitnodiging); op een ander apparaat maak je een nieuwe. De server blijft alleen de hash bewaren. | M |
| L3 | Bij de link staat hoeveel mensen hem **al gebruikten** en tot wanneer hij geldt ("3 mensen · nog 5 dagen"). Server: teller per code (`uses`, eenmalig opgehoogd per nieuwe vriendschap). | S |
| L4 | **Plafond per link** tegen een link die ergens openbaar belandt: voorstel 25 gebruikers per link (constante, aan te passen). Daarboven geeft de server `invalid`. De 50-vriendengrens blijft gelden. | S |
| L5 | De maker ziet **wie er via zijn link is gekomen**: nieuwe vrienden staan 7 dagen met "Nieuw" in de vriendenlijst (§3, uit het bestaande veld `since`). Geen pushmelding (blijft buiten scope, SOCIAAL §3.5). | S |
| L6 | Opnieuw inwisselen door iemand die al vriend is geeft "jullie waren al vrienden", geen fout (server: `ok`; de tekst in de app moet het onderscheiden). | M |
| L7 | Een link wijst **altijd naar het publieke adres van de app** wanneer hij wordt gemaakt op de productiehost; alleen op een testadres blijft hij naar dat testadres wijzen. De link bevat de appversie niet, maar de app toont op een onbekende uitnodigingsroute geen kale "Pagina niet gevonden" maar een uitleg ("Werk de app bij en open de link opnieuw"). | S |
| L8 | **Release-volgorde:** de uitnodigingslink mag pas gedeeld worden vanaf een app die de route kent. De releasechecklist ([RELEASE-v1.1.md](RELEASE-v1.1.md) en vervolg) krijgt de controle "open een nieuwe link in een schone browser én in een geïnstalleerde app". | M |

### Raakt
`supabase/migrations/0004_*.sql` (kolom `uses`, plafond; additief), `src/data/social-cache.js` (link onthouden), `src/ui/views/friends-add.js`, `friends-manage.js`, `src/content/nl.js`, `docs/SOCIAAL.md` §5.2, servertests.

---

## 2. Flow voor een nieuwe gebruiker op een uitnodiging

### Wat er nu is
Een anonieme ontvanger doorloopt vandaag **vier schermen**, en wordt twee keer om dezelfde naam gevraagd:

| Stap | Scherm | Opmerking |
|---|---|---|
| 1 | `#/vrienden/uitnodiging/<code>`: "log in om de uitnodiging te accepteren" | zegt niet **wie** uitnodigt; de ontvanger weet alleen "een uitnodiging" |
| 2 | Inlogscherm (Google of e-mailcode) | algemeen inlogscherm, geen verwijzing meer naar de uitnodiging |
| 3 | Dialoog "Hoe wil je heten?" (`afterLogin` → `openNameDialog`, S5) | de naam wordt hier al gevraagd |
| 4 | Terug op de uitnodigingspagina: uitleg "wat vrienden zien", de regels, en een formulier met **weer een naam** plus een gebruikersnaam | sociaal staat uit, dus de opt-in komt nu pas |
| 5 | Pas daarna: "Je bent nu vrienden met X" | |

Dat is de reden dat het niet goed voelt: te veel stappen, dubbele vraag, en pas op het eind komt de beloning. De gewenste flow is drie momenten.

### Gewenste flow
```
[link]  →  Welkom: "Anna nodigt je uit voor Habit Builder"
              (twee regels wat de app is) · [Account maken]
        →  account aanmaken (Google of e-mailcode)
        →  één stap: "Hoe wil je heten?"  (naam; gebruikersnaam wordt voorgesteld)
        →  "Jij en Anna zijn nu vrienden!"  · Anna staat in je vriendenlijst
              [Maak je eerste habit]   [Bekijk je vrienden]
```

### Eisen
| ID | Eis | Prio |
|---|---|---|
| N1 | **Welkomstscherm** op de link, ook zonder account: noemt de naam van de uitnodiger, zegt in twee regels wat de app doet en heeft één hoofdactie ("Account maken"). Wie al is ingelogd slaat het over en gaat direct naar N3 of N4. | M |
| N2 | Voor N1 is **één nieuwe serverfunctie** nodig die zonder inloggen de **weergavenaam van de uitnodiger** geeft voor een geldige code (`invite_peek(code)`, anon). Geeft niets anders terug (geen gebruikersnaam, geen punten, geen id). Ongeldige of verlopen code: neutraal antwoord, zodat raden niet loont. Zie besluit B1. | M |
| N3 | **Eén naamstap** na het aanmaken van het account. De bestaande naamdialoog (S5) en het sociaalformulier worden voor deze route **samengevoegd**: er is één vraag, de gebruikersnaam wordt voorgesteld (`suggestUsername`, bij een bezette naam een cijfer erachter) en is later te wijzigen onder Beheren. | M |
| N4 | **Aanmelden voor sociaal gebeurt impliciet** door via de uitnodiging mee te doen, mits het scherm vooraf in een of twee zinnen zegt wat vrienden zien (alleen naam en cijfers) met een verwijzing naar de volledige uitleg. Dit vervangt de aparte "regels"-kaart in deze route; V1 (opt-in met uitleg) blijft daarmee gehaald. Zie besluit B2. | M |
| N5 | **Direct na de naamstap wordt de uitnodiging ingewisseld**; de ontvanger hoeft niets meer te bevestigen. | M |
| N6 | **Bevestigingsscherm** "Jij en Anna zijn nu vrienden!" met de nieuwe vriend zichtbaar (naam, @gebruikersnaam) en twee acties: een eerste habit maken (de sjablonen staan klaar) en de vrienden bekijken. Een nieuwe gebruiker heeft nog geen habits; het scherm mag niet doodlopen in een lege ranglijst. | M |
| N7 | De uitnodiging **overleeft het inloggen**, ook langs Google en een herstelde sessie (bestaat: `rememberInvite`; behouden en testen). | M |
| N8 | Het inlogscherm **herinnert aan de context**: boven het inlogformulier staat "Je bent uitgenodigd door Anna" zolang er een wachtende uitnodiging is. | S |
| N9 | **Foutgevallen** zijn netjes en blokkeren het aanmaken van een account niet: verlopen of ingetrokken link ("Deze link werkt niet meer; vraag Anna om een nieuwe", account maken kan wel), eigen link, al vrienden (L6), vriendengrens bij een van beiden, geen verbinding (opnieuw proberen). | M |
| N10 | Een **bestaande gebruiker met sociaal aan** die op een link klikt, krijgt direct het bevestigingsscherm; **met sociaal uit** alleen de gecombineerde naamstap (N3). | M |
| N11 | Werkt in beide thema's, op 320 px met grote tekst (geen zijwaarts scrollen, geen pinch-zoom: bewuste keuze), met focusbeheer en aangekondigde statuswissels (SOCIAAL §7.3). | M |

### Risico's specifiek voor deze flow
- **iOS: Safari ≠ geïnstalleerde app.** Wie de link in Safari opent en daarna de app op het beginscherm zet, heeft in de app geen onthouden code (aparte opslag). Maatregel: de flow rondt in dezelfde context af (account maken kan in de browser); in de uitleg bij installeren noemen we het niet. Dit is een beperking van het platform, geen oplosbaar punt; we benoemen het en zien in de praktijk of het speelt.
- **Namen tonen aan anoniemen** (N2): de weergavenaam van de uitnodiger is alleen op te vragen met de lange, onraadbare code (≥128 bit) die de uitnodiger zelf deelde. Voor raden is dat niet bruikbaar. Zonder inlog is er geen gebruiker om een limiet op te zetten; daarom geeft de functie voor elke ongeldige code hetzelfde antwoord en bestaat er geen manier om codes op te sommen.

### Raakt
`supabase/migrations/0004_*.sql` (`invite_peek`), `src/data/social-remote.js`, `src/app/social.js`, `src/ui/views/friends-invite.js` (herschrijven), `login.js` (context), `account.js` (naamdialoog niet apart tonen bij een wachtende uitnodiging), `social-parts.js` (`onboardingForm` krijgt een korte variant), `nl.js`, beide thema's, browsercontrole `tools/social-browser-check.mjs` (nieuwe flow), tests.

---

## 3. Vrienden kunnen inzien, los van de ranglijst

### Wat er nu is
- De vriendenlijst bestaat alleen onder **Vrienden → Beheren**. Op de ranglijst zelf staan alleen vrienden die de laatste 3 dagen iets afvinkten (S7/V22). Een **nieuwe vriend zonder activiteit staat er dus niet** ("Nieuwe vrienden zonder enige activiteit verschijnen pas na hun eerste afvinkactie", SOCIAAL §4.4). Precies daardoor kun je niet zien of het toevoegen gelukt is: het bewijs zit verstopt achter "Beheren".

### Eisen
| ID | Eis | Prio |
|---|---|---|
| V40 | Op het hoofdscherm Vrienden staat **onder de ranglijst een lijst "Je vrienden (n)"** met **alle** vrienden, ongeacht activiteit: naam, @gebruikersnaam, sinds wanneer. Verwijderen blijft onder Beheren. | M |
| V41 | Een vriend die niet op de ranglijst staat, krijgt in die lijst een **rustige uitleg** ("Nog niet actief; staat op de ranglijst zodra hij of zij iets afvinkt") in plaats van niets. Dit past bij S7 en lost "waar is hij?" op. | M |
| V42 | **Nieuw** gekomen vrienden (laatste 7 dagen) zijn gemarkeerd (L5), ook als tekst en niet alleen met kleur. | S |
| V43 | De kaart op **Voortgang** toont het aantal vrienden ("3 vrienden · je staat 2e"), en bij nul vrienden de uitnodigingsactie. | S |
| V44 | De lijst werkt **offline** met de laatste stand, net als de ranglijst (V24, bestaand). | M |

Geen nieuwe route nodig; geen server-wijziging (`friend_list` levert alles). Toegankelijk als gewone lijst (`<ul>`), tikvlakken ≥ 44 px.

---

## 4. Vandaag scrolt te ver

### Wat er nu is (uit de CSS)
- `.app__main` heeft onderaan `tabbalk + veilige zone + 1rem` (`styles/base.css:132`).
- Pagina's met een FAB krijgen `tabbalk + veilige zone + 5,5rem` (`styles/components/fab.css:32`). De FAB zelf is 3,5rem hoog en staat 1rem boven de tabbalk.
- Reken na: de FAB beslaat 1 t/m 4,5rem boven de tabbalk, en het laatste item eindigt op 5,5rem. Onder de laatste kaart zit dus **een volle FAB-hoogte plus twee keer 1rem lucht** (4,5rem extra t.o.v. andere pagina's). Zo is het bedoeld, om te voorkomen dat de knop over de laatste kaart valt; maar de knop staat rechts en dekt de kaart maar op één plek af, dus op Vandaag voelt het als te veel.
- **Dat het écht de FAB is, is een hypothese.** Er kunnen nog andere onderkanten meespelen (marges van de laatste sectie, de weekstrook, het herstelmoment). Ik heb het niet gemeten.

### Gemeten en opgelost (2026-10-16)
Gemeten met `npm run check:layout` (echte Edge, 8 habits, onderaan de pagina):

| Scherm | Voor | Na |
|---|---|---|
| Vandaag, 390×844 | **100 px** (6,25 rem) tussen laatste kaart en tabbalk | 28 px |
| Habits, 390×844 | 88 px (5,5 rem) | 16 px |
| Vandaag, 320×568 met tekst 200% | 200 px | 56 px (zelfde 1,75 rem) |

De hypothese klopte: de FAB-reserve (`5,5rem`) was de oorzaak; Vandaag had er nog 12 px extra bij. Minder reserve (optie a) had hooguit 8–20 px opgeleverd, dus is optie **b** gebouwd: de FAB schuift weg zodra hij de laatste kaart zou afdekken en komt terug zodra je ruim omhoog scrolt (`src/ui/components/fab.js`). De extra reserve in `fab.css` is vervallen, zodat de lijst net zo eindigt als elke andere pagina. Op een pagina die niet scrolt blijft de knop staan; met het toetsenbord haalt focus hem terug. De controle staat in CI (workflow Integratie).

Beperking: een pagina die net niet scrolt, met de laatste kaart precies in de 56 px achter de knop, laat de rechterrand van die kaart onder de knop. Komt zelden voor; het wordt pas opgelost als het in de praktijk hindert.

### Eisen
| ID | Eis | Prio |
|---|---|---|
| B1 | **Eerst meten** op 390×844 en 320×568 (ook met grote tekst): afstand tussen onderkant van de laatste kaart en de bovenkant van de tabbalk, en wat daaruit de scrollbare overmaat is. De bestaande Edge-browsercontroles zijn hier geschikt voor; de meting wordt een vaste controle (geen "voelt goed"). | M |
| B2 | De overmaat is **hoogstens de hoogte van de FAB plus één keer lucht**, en alleen zolang de FAB de inhoud kan dekken. Voorstellen, in volgorde van voorkeur: (a) de ruimte terugbrengen tot 4,5rem + 0,5rem; (b) de FAB laten **wegschuiven bij het einde van de pagina** zodat er geen reserve nodig is; (c) op Vandaag de FAB vervangen door een knop in de kop. Besluit B3. | M |
| B3 | Een pagina die **niet hoger is dan het scherm** scrolt niet voor niets (bestaande afspraak in de CSS; behouden). | M |
| B4 | Geldt voor Vandaag én Habits (dezelfde FAB-regel); de lege toestand blijft vrijgesteld (bestaat). | M |

---

## 5. Meer prestaties

### Wat er nu is
Twaalf: **Eerste stap**, de mijlpalen per habit (**7, 21, 42, 66, 100, 365 dagen**), **Perfecte week**, **Comeback**, **Ingeburgerd**, **Drie tegelijk**, **Vier weken reflectie**. De regels zijn puur en getest (`src/domain/achievements.js`); namen en emoji staan in `src/content/achievements.js`.

### Principes voor nieuwe prestaties
- **Beloon gedrag dat de gewoontetheorie ondersteunt** (PLAN §2), niet alleen volhouden: terugkomen na een misser, de minimale versie, reflectie, het "waarom" invullen.
- **Alleen lokaal af te leiden** uit data die er al is. Niets dat een nieuwe server of nieuwe gegevens vraagt.
- **Prestaties zijn privé.** Ze gaan niet in de gepubliceerde samenvatting (SOCIAAL §3.5: geen badges voor ranglijstposities) en tellen niet mee voor punten.
- **Geen ontgrendeling door gek gedrag** (geen prestatie voor het aanmaken en weggooien van habits).

### Voorstel (catalogus; omvang is aan Remco, zie §8)
| Groep | Prestatie | Regel |
|---|---|---|
| Aantallen | 10 / 50 / 100 / 500 / 1000 keer gedaan | totaal aantal check-ins over alle habits |
| Volhouden | Reeks van 7 / 14 / 30 dagen | langste lopende reeks van een habit met vaste dagen |
| Weken | 4 perfecte weken achter elkaar | uitbreiding op `hasPerfectWeek` |
| Terugkomen | **Nooit twee keer missen** | herstelmoment gehaald, 5 keer (kern van de theorie) |
| Terugkomen | Sterk terug | een habit weer op 80% na een dip van ≥ 2 weken |
| Slimmer | **Tweeminutenregel** | 5 keer de minimale versie gebruikt op een slechte dag |
| Slimmer | Kleine stap | de minimale versie ingevuld bij een habit |
| Slimmer | Vol doel | een teller-habit 7 dagen achter elkaar gehaald |
| Slimmer | Pauzeren is oké | een pauze genomen en daarna weer opgepakt |
| Reflectie | Eerste review; automatisme-vraag 4 weken ingevuld | uit de bestaande reviewdata |
| Reflectie | Je "waarom" | het waarom ingevuld bij 3 habits |
| Verbreding | Hele dag | een habit in elk dagdeel (ochtend, middag, avond) |
| Verbreding | Vijf tegelijk | vijf actieve habits (naast "Drie tegelijk") |
| Verbreding | Alles gedaan | alle habits van een dag afgerond, 10 dagen |
| Sociaal | Samen sterker | je eerste vriend; je eerste uitnodiging gebruikt; 5 vrienden |
| Ingeburgerd | Tweede en vijfde ingeburgerde habit | uitbreiding op `first_graduated` |

Dat zijn ± 25 nieuwe, naast de 12 bestaande. De sociale groep leest het aantal vrienden uit de lokale cache; wie sociaal niet gebruikt, ziet die groep niet.

### Eisen
| ID | Eis | Prio |
|---|---|---|
| A1 | Nieuwe regels in `domain/achievements.js` als pure functies met tests, naast de bestaande; een mijlpal-reeks (aantallen, reeksen) uit één constantenreeks in `domain/constants.js`. | M |
| A2 | Namen, omschrijvingen en emoji in `content/achievements.js`; de overzichtspagina groepeert nu per groep en toont **voortgang naar de volgende** ("37 van 50"). | M |
| A3 | Bestaande ontgrendelingen blijven bestaan; nieuwe prestaties worden bij de eerste keer **met terugwerkende kracht** toegekend aan wie de regel al haalt, zonder een regen van vieringen: één gebundelde viering ("5 nieuwe prestaties"). | M |
| A4 | Geen server- of datamodelwijziging; sleutels in het bestaande `achievements`-record (DATAMODEL). Nieuwe sleutels zijn voor oude appversies onbekend en worden genegeerd: controleren in een test. | M |
| A5 | **Optioneel (C):** per thema andere illustratie of naam (Mel-thema met Pokémon). Niet nu. | C |

---

## 6. Meer en bij het thema passende iconen

### Wat er nu is
- 24 vaste emoji in `habit-form.js` (`ICONS`); de gekozen emoji staat als tekst in `habit.icon` en wordt zo getoond (kaart, rij, detail, overzicht). De domeinregel is alleen "geen lege tekst" (`domain/habit.js:26`).
- Een emoji ziet er op elk toestel anders uit en past dus **niet** bij een thema. "Bij het thema passen" betekent daarom **eigen pictogrammen**, niet alleen meer emoji.
- Wat ik van "thema" begrijp: de visuele thema's (v0lky1 donker bos, Mel Pokémon). Bedoel je daarmee ook een indeling naar **onderwerp** (sport, slaap, eten…)? Beide zijn nuttig en ze sluiten elkaar niet uit (§6 trap 1 en 2).

### Aanpak in twee trappen
**Trap 1: meer iconen en een bruikbare kiezer (geen Moda nodig, geen datamodelwijziging).**
| ID | Eis | Prio |
|---|---|---|
| I1 | **Gebouwd.** De catalogus groeit van 24 naar **60** iconen (niet ± 150: de lijst is bewust het contract met Moda, zie [MODA-ICONS.md](MODA-ICONS.md)), gegroepeerd in 9 onderwerpen, in `src/content/icons.js`. Er kunnen altijd iconen bij; een bestaande sleutel of emoji verandert niet. | M |
| I2 | **Gebouwd.** De kiezer heeft een zoekveld en per onderwerp een uitklapbaar blok (het blok met je icoon staat open); zoeken op naam, sleutel en Nederlandse zoekwoorden (`src/app/icons.js`). Elke tegel heeft een naam voor schermlezers. | M |
| I3 | **Gebouwd.** De keuze blijft een **emoji-tekst in `habit.icon`**: geen wijziging in sync, export, import of datamodel. De sleutel volgt uit de emoji (elke emoji komt maar één keer voor, een test bewaakt dat). Een eigen emoji uit een oudere versie blijft zichtbaar en kiesbaar ("Je huidige icoon"). | M |
| I4 | **Gebouwd en gemeten** op 320 px met tekst 200%: geen zijwaarts scrollen, tegels ≥ 44 px. Daarbij is een bestaand overflow-probleem van het hele formulier opgelost (de herhaling-keuze en het datumveld verbreedden de pagina bij grote tekst). | M |

**Trap 2: één iconenset van Moda (besluit Remco, 2026-10-16: één set voor alle thema's, kleuren uit het thema).** Eerder was het plan een set per thema; dat is vervallen. Er is **één** set van **109 iconen** (60 habits, 49 voor prestaties, tips en twee tekens) in één stijl; de thema's geven alleen de kleuren (`currentColor` en `--icon-accent`). Een nieuw thema heeft dus geen eigen iconen nodig.
| ID | Eis | Prio |
|---|---|---|
| I10 | **Gebouwd.** Een icoon heeft een stabiele sleutel met de emoji als terugval; de tekeningen staan in **één sprite** `icons/set.svg` (een `<symbol id=\"<sleutel>\">` per icoon). `src/content/icon-set.js` (gegenereerd) zegt welke sleutels erin staan. Wat ontbreekt toont de emoji. | M |
| I11 | **Anders opgelost dan gepland, en beter.** Er komt **geen** `icon:<sleutel>\|<emoji>` in `habit.icon`: een oudere appversie op een ander apparaat zou dat als tekst tonen. `habit.icon` blijft een gewone emoji en de sleutel volgt daaruit (`iconKeyFor`). Zo veranderen data, sync en export niet en krijgen bestaande habits vanzelf de tekening zodra die er is. | M |
| I12 | **Gebouwd:** [MODA-ICONS.md](MODA-ICONS.md): wat er nog moet (97 iconen in vier batches), de prompts, en de sleutellijsten (60 + 49); tests houden de lijsten gelijk aan de code. | M |
| I13 | **Gebouwd:** `npm run icons:build` (`tools/build-icons.mjs`) leest alles onder `moda-themes/icons/` (svg-bestanden en HTML-pagina's van Moda, het laatst gewijzigde wint), controleert elk icoon (viewBox 0 0 24 24, geen scripts, stijlen, tekst, verlopen of vaste kleuren, ≤ 6 kB), zet Moda's accent-stijl om in kenmerken, schrijft `icons/set.svg` en `icon-set.js`, en meldt wat nog ontbreekt. Bij één fout wordt niets geschreven. De sprite staat onder `icons/` en gaat mee in de offline-cache. | M |
| I14 | **Gebouwd:** prestaties, tips en twee tekens (`ui-streak`, `ui-celebrate`) komen ook uit de set (`content/ui-icons.js`, component `uiIcon`); een medaille toont het icoon donker op het accentvlak, een tip in de accentkleur. | M |

**Eindtoestand bereikt (2026-10-16): geen emoji van het toestel meer in de app.** De set is compleet (109 van 109, gemaakt met één Moda-prompt, zie [MODA-ICONS.md](MODA-ICONS.md)) en de overgangsmaatregelen zijn verwijderd:
1. de emoji-terugval in `habitIcon` en `uiIcon` is weg; een onbekende eigen emoji (oude habit of import) krijgt het standaardicoon `sprout`, en dat wordt het ook als je zo'n habit opnieuw opslaat;
2. de `emoji`-velden in `content/achievements.js` en `content/tips.js` zijn weg; de sjabloon-chips tonen het icoon uit de set;
3. de emoji in `content/icons.js` en `content/templates.js` blijven alleen bestaan als **sleutel in de opgeslagen data** (`habit.icon`), niet als weergave.
Drie tests bewaken dit: de set is compleet, er staat geen emoji meer in de code buiten die twee bestanden, en het standaardicoon staat in de set.

**Gemeten in een echte browser** in beide thema's (v0lky1 en Mel): kaarten, kiezer, prestaties (behaald en vergrendeld), tips en de reeksvlam; geen zijwaarts scrollen op 320 px met tekst 200%.

## 7. Niet-functioneel (voor alles hierboven)
- Alle teksten in `src/content/nl.js`; geen `innerHTML` (guardrail); `svh`; tikvlakken ≥ 44 px; geen pinch-zoom, dus lay-outs moeten robuust zijn bij grote tekst.
- Serverwijzigingen **additief** (`0004_*.sql`): de productie-app van 1.1 blijft werken. Tests op een echte Postgres (`tests/server/social.test.js`), API-controles (`npm run db:check-social`, `db:check-app`), browserreeks (`npm run db:check-browser`) uitbreiden voor de nieuwe flow, beide thema's, desktop en 320 px.
- Werkwijze: kort levende `feature/*`-takken vanaf `develop`; de huidige tak `feature/polish-overzicht-velden` heeft een ander onderwerp en blijft daarbuiten.

## 8. Besloten en nog open

Besloten door Remco op 2026-10-16. In de laatste kolom staat wat het besluit betekent.

| # | Vraag | Besluit | Gevolg |
|---|---|---|---|
| B1 | Naam van de uitnodiger tonen vóór er een account is (N2)? | **Ja** | `invite_peek(code)` komt erbij (anon, alleen weergavenaam). |
| B2 | Meedoen via een uitnodiging telt als aanmelding voor sociaal (N4)? | **Ja** | één naamstap met korte uitleg in plaats van de aparte opt-in-stap. |
| B3 | Vandaag: welke oplossing voor de ruimte onder de laatste kaart? | **Eerst meten**, dan (a) minder reserve; (b) alleen als (a) niet genoeg is | Remco ging akkoord met de voorgestelde volgorde. |
| B4 | Linkplafond per link (L4)? | **25** | Remco ging akkoord met het voorstel; constante aan te passen. |
| B5 | Omvang prestatiecatalogus (§5)? | **de hele voorgestelde lijst, in twee rondes** | akkoord met het voorstel. |
| B6 | Iconen: trap 1 alleen, of ook trap 2? | **Beide.** Eerst een set per thema, daarna (zelfde dag) **één set voor alle thema's**, met de kleuren uit het thema | zie §6 en [MODA-ICONS.md](MODA-ICONS.md). |
| B7 | Wat gebeurde er met de link? | Zelf geopende en doorgestuurde links gaven bij de ontvanger "Pagina niet gevonden"; een nieuwe link werkte | zie §1 punt 3; hypothese, eerst controleren. |

## 9. Voorstel voor de volgorde
1. **Vandaag-ruimte (B)**: meten, dan oplossen. Klein, geen afhankelijkheden.
2. **Vrienden inzien (§3)**: klein, lost direct het "is het gelukt?"-probleem op.
3. **Uitnodigingslink en nieuwe-gebruikersflow (§1 en §2)**: samen, één migratie, één browserreeks.
4. **Iconen trap 1 (§6)** en **prestaties (§5)**: onafhankelijk van de rest, parallel mogelijk.
5. **Iconen trap 2**: zodra Moda de eerste iconensheet levert (de sleutels uit trap 1 zijn het contract).

## 10. Acceptatiecriteria (kort)
- Drie accounts openen één link binnen een week: alle drie zijn vriend van de maker; na een week geeft de link `invalid`.
- Een nieuwe gebruiker komt van link naar "Jij en Anna zijn nu vrienden!" in **drie schermen** (welkom, account, naam) en wordt **één keer** naar zijn naam gevraagd.
- Een vriend zonder activiteit staat in de vriendenlijst met uitleg; direct na het toevoegen is dat zichtbaar zonder naar Beheren te gaan.
- Op Vandaag is de ruimte onder de laatste kaart gemeten en binnen de afgesproken waarde, op 390×844 en op 320 px met grote tekst.
- Elke nieuwe prestatie heeft een test voor "wel" en "niet", en ontgrendelt met terugwerkende kracht zonder vieringsstorm.
- De iconenkiezer toont de catalogus per onderwerp, vindt op Nederlandse trefwoorden, en bestaande habits behouden hun icoon.
