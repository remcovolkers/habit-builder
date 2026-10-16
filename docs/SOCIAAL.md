# Sociaal: vrienden en ranglijst – analyse en requirements

Status: **gebouwd, versie 1.1** · ontworpen 2026-10-15 · werkwijze: [WERKWIJZE.md](WERKWIJZE.md)

## 1. Doel

Habits bouw je makkelijker samen. Deze feature maakt de app **een beetje sociaal**, zonder dat je privé-gegevens loslaat: je kunt vrienden zoeken en toevoegen, en een **ranglijst** laat zien wie er deze week het beste bezig is.

Wat het níét is: een sociaal netwerk. Geen feed, geen reacties, geen openbare profielen, geen zoeken door "alle gebruikers". Het is een kleine kring van mensen die elkaar kennen.

### Vastgelegde keuzes (door Remco, 2026-10-15)

| # | Keuze | Besluit |
|---|---|---|
| S1 | Vrienden vinden | **Gebruikersnaam + uitnodigingslink.** Zoeken kan alleen op de *exacte* gebruikersnaam; niemand kan door gebruikers bladeren; e-mailadressen blijven altijd verborgen. |
| S2 | Rangschikking | **Punten over de laatste 7 dagen** (zie S6 en §4). Elke week een nieuwe kans, ook voor beginners. |
| S3 | Wat vrienden zien | **Alleen cijfers en je naam.** Geen habit-namen, geen notities, geen cues, geen "vandaag gedaan". |
| S4 | Reikwijdte eerste versie | **Vrienden + ranglijst, verder niets.** Verzoek en acceptatie, verwijderen, ranglijst (blokkeren is later bewust geschrapt, S10). Aanmoedigen, reacties en groepen later. |

### Besloten op 2026-10-15 (antwoorden op de vragen uit het eerste concept)

| # | Besluit |
|---|---|
| S5 | **Weergavenaam = de naam uit Instellingen.** Bij het aanmaken van een account vragen we "Hoe wil je heten?" en leggen uit dat vrienden die naam zien. Je kiest zelf: je voornaam of iets verzonnens. Dezelfde naam gebruiken de begroeting op Vandaag en de ochtendmelding. Zo is er één naam en hoeft er verder niets bijgehouden te worden. |
| S6 | **Punten per afgeronde taak, met bonussen en minpunten** (besloten na de eerste meting). Een vast bedrag per taak (één afgevinkte habit op één dag; flexibele habits doen gelijk mee). Extra punten zolang een habit nog niet eigen is: meer in het begin, minder later. Extra punten voor het starten van een nieuwe habit. Minpunten voor wat je liet liggen, half zoveel als een taak oplevert, nooit onder nul, en **een enkele misser per habit is gratis: nooit twee keer achter elkaar**. Een half gehaalde teller telt voor de helft (§4). |
| S7 | **Wie 3+ dagen niets doet, verdwijnt uit de lijst** tot hij of zij het weer oppakt (§4.4). |
| S8 | **Een uitnodigingslink maakt direct vrienden.** Zoeken op gebruikersnaam blijft een verzoek met acceptatie (zie V12). |
| S9 | **Navigatie via Voortgang** (geen zesde tabblad). |
| S10 | **Geen minimumleeftijd, geen blokkeerfunctie.** Dat pakken we aan als het nodig blijkt. Lastigvallen wordt klein gehouden met een rustige weigerregel (V13) en limieten (V18). |
| S11 | **Een aparte testdatabase**, lokaal in Docker (de gratis Supabase staat maar 2 projecten per persoon toe): [DEV-OMGEVING.md](DEV-OMGEVING.md). |

### Wat dit verandert aan eerdere afspraken

- **PLAN D5** ("geen sociale functies") vervalt voor deze feature; het blijft wel waar voor alles wat hier niet staat.
- **PLAN "Buiten scope voor v1: sociale functies"**: die uitzondering wordt nu opgeheven.
- **De privacyverklaring** belooft nu dat alleen jij je gegevens leest. Dat klopt straks niet meer zonder aanpassing (zie §6). Sociaal is daarom **opt-in**: standaard uit.
- **Het ontwerp "de server begrijpt de records niet"** blijft van kracht voor `records`. De ranglijst gebruikt een eigen, kleine, bewust gepubliceerde samenvatting (zie §5), zoals de ochtendherinnering dat al doet.

## 2. Gebruikers en situaties

| Wie | Wil |
|---|---|
| Ik (met account, sociaal aan) | zien hoe ik het doe ten opzichte van vrienden; vrienden toevoegen zonder mijn e-mailadres te delen |
| Mijn vriend | een uitnodiging krijgen en die makkelijk accepteren, ook als die nog geen account heeft |
| Iemand die sociaal niet wil | er geen last van hebben: de app werkt exact als nu, er verlaat niets zijn apparaat |
| Iemand die lastiggevallen wordt | een verzoek stil kunnen weigeren (de afzender kan 30 dagen niet opnieuw), en sociaal kunnen uitzetten om onvindbaar te zijn |

**Anonieme gebruikers** (zonder account) kunnen niet meedoen: vrienden en een ranglijst vragen een server en een identiteit. De app legt dat uit en biedt inloggen aan.

## 3. Functionele requirements

Prio: M = moet, S = zou moeten, C = kan. Het ID-voorvoegsel is **V** (vrienden).

### 3.1 Meedoen en profiel
| ID | Eis | Prio |
|---|---|---|
| V1 | Sociaal staat **standaard uit**. Je zet het zelf aan via een duidelijk scherm dat uitlegt wat vrienden zien (alleen naam en cijfers) en wat niet. | M |
| V2 | Bij aanzetten kies je een **gebruikersnaam**: uniek, 3–20 tekens, kleine letters/cijfers/`_`/`.`, niet hoofdlettergevoelig, zonder aanstootgevende woorden uit een korte blokkadelijst. De naam kun je later wijzigen (hoogstens eens per 30 dagen). | M |
| V3 | De **weergavenaam** op de ranglijst is de naam uit Instellingen (S5). Bij het aanmaken van een account vragen we die naam en zeggen dat vrienden hem zien. Bestaande accounts krijgen dezelfde vraag eenmalig bij het aanzetten van sociaal. Is de naam leeg, dan de gebruikersnaam. | M |
| V4 | Je kunt sociaal **altijd uitzetten**: je verdwijnt uit de lijsten van anderen en je gepubliceerde punten worden gewist. Vriendschappen blijven bewaard maar zijn "gepauzeerd" tot je het weer aanzet (S: of je kiest ze ook te verwijderen). | M |
| V5 | Zonder account of zonder verbinding is het scherm Vrienden bruikbaar in een nette, verklarende toestand (zie §7), nooit een lege fout. | M |

### 3.2 Vrienden zoeken en toevoegen
| ID | Eis | Prio |
|---|---|---|
| V10 | **Zoeken op exacte gebruikersnaam.** Geen deelmatches, geen autocomplete, geen lijst: een resultaat of "niet gevonden". Zo kan niemand de gebruikerslijst afstruinen. Zoeken is begrensd (rate limit, zie §6). | M |
| V11 | **Uitnodigingslink** (`…/#/vrienden/uitnodiging/<code>`) deelbaar via WhatsApp enz. (Web Share API met kopieer-terugval). De code is lang en onraadbaar, verloopt na 7 dagen en kan door jou ingetrokken worden. | M |
| V12 | **Via een uitnodigingslink** ben je direct vrienden (de afzender gaf de link zelf, S8). **Via zoeken op gebruikersnaam** ontstaat een vriendschap pas na acceptatie door de ander. | M |
| V13 | Ontvangen verzoeken staan in een lijst met **Accepteren / Weigeren**. Weigeren is stil: de afzender ziet alleen dat het verzoek "nog openstaat". Dezelfde afzender kan 30 dagen geen nieuw verzoek meer sturen. | M |
| V14 | Verzoeken die je zelf verstuurde zie je als "uitgenodigd", met **intrekken**. | M |
| V15 | Een uitnodigingslink openen zonder account of zonder sociaal: de app leidt je door inloggen en aanzetten, en handelt het verzoek daarna alsnog af (de code blijft onthouden). | S |
| V16 | Een vriend **verwijderen**: wederzijds en direct; de ander merkt het alleen doordat je uit de lijst verdwijnt. | M |
| V18 | Een maximum van **50 vrienden** per gebruiker en **20 openstaande verzoeken**, tegen misbruik en om de ranglijst werkbaar te houden. | M |

### 3.3 Ranglijst
| ID | Eis | Prio |
|---|---|---|
| V20 | De **ranglijst** toont jou en je geaccepteerde vrienden, gesorteerd op **weekpunten** (§4), met positie, naam, punten en reeks. Jij bent herkenbaar gemarkeerd (niet alleen met kleur). | M |
| V22 | Een vriend die **3 dagen of langer niets heeft afgevinkt** verdwijnt automatisch uit de lijst, en komt terug zodra hij of zij weer iets afvinkt (§4.4). Jezelf zie je altijd. | M |
| V23 | Zichtbare extra's per vriend, uitsluitend uit de gepubliceerde samenvatting: huidige langste **reeks** (dagen), aantal **actieve habits**. | S |
| V24 | De ranglijst werkt **offline** met de laatst opgehaalde stand (duidelijk gemarkeerd als "stand van …"), en ververst bij openen en via een knop. | M |
| V25 | Je eigen punten staan altijd **lokaal berekend** en zijn dus direct juist, ook voor ze gepubliceerd zijn. | M |
| V26 | Terugkijken ("vorige week") is niet nodig in deze versie. | C |

### 3.4 Wat er gepubliceerd wordt
| ID | Eis | Prio |
|---|---|---|
| V30 | Alleen als sociaal aanstaat, publiceert de app na elke synchronisatie en bij openen een **samenvatting** (zie §5.3). Verder verlaat niets het apparaat dat er nog niet was. | M |
| V31 | De samenvatting bevat **geen habit-namen, geen notities, geen cues, geen tijdstippen en geen datums per check-in**. | M |
| V32 | Publiceren faalt stil en herstelt zichzelf: geen blokkerende fout als de server niet bereikbaar is. | M |

### 3.5 Niet in deze versie
Blokkeren, een minimumleeftijd, aanmoedigen/knuffel-knop, reacties, groepen of uitdagingen, publieke profielen, vrienden zoeken op e-mailadres of via contacten, pushmeldingen over vrienden, badges voor ranglijstposities, terugblik per week, vrienden uit een ander land of taal filteren.

## 4. De punten: domeinregels

De ranglijst telt **punten**, over de **laatste 7 dagen, vandaag meegerekend**. De regels zijn puur en met tests gebouwd (`src/app/score.js`, `src/app/leaderboard.js`) en alle bedragen staan in één constantenbestand (`src/domain/constants.js`).

### 4.1 Hoe de punten ontstaan

| Wat | Punten | Constante |
|---|---|---|
| Een afgeronde taak (één afgevinkte habit op één dag; gedaan of minimale versie) | **+10** | `TASK_POINTS` |
| Opbouwbonus, per taak, zolang de habit nog niet eigen is: de eerste 21 dagen | **+4** | `BUILD_BONUS_STARTING` |
| Opbouwbonus, per taak, vanaf dag 22 tot de ingeburgerd-grens (66 dagen, per habit instelbaar) | **+2** | `BUILD_BONUS_BUILDING` |
| Startbonus, eenmalig bij de **eerste afgeronde taak** van een nieuwe habit (hoogstens 3 per venster) | **+10** | `START_BONUS`, `START_BONUS_MAX` |
| Een gemiste dag (habit met vaste dagen) die **direct op een gemiste dag volgt**; de eerste misser van een rij is gratis | **−5** | `MISS_PENALTY`, `MISS_GRACE` |
| Een flexibele habit waarvan een week/maand eindigt zonder dat het doel gehaald is, **als de vorige week/maand ook gemist was**: per ontbrekende keer | **−5** | idem |
| Een teller die je half haalde (bijv. 5 van 8 glazen) | **+5** (de helft van een taak, plus de helft van de opbouwbonus), geen minpunten | `PARTIAL_FRACTION` |

**Totaal** = taken + opbouwbonus + startbonus − minpunten, **nooit onder nul**.

### 4.2 Regels in detail
- **Taak:** dezelfde habit telt hooguit één keer per dag. Overslaan levert niets op en kost niets. Flexibele habits (bijv. 2× per week) doen precies hetzelfde mee als vaste: alles op één dag afronden geeft evenveel basispunten als verspreid over de week.
- **Opbouwbonus bij zeldzame taken:** een taak die minder dan 1× per week voorkomt (bijv. 2× per maand, zie PLAN §4.5) krijgt de bonus per **keer** in plaats van per dag: het hoeveelste afgeronde keer het is. De eerste keren (⅓ van het aantal dat voor ingeburgerd nodig is, bij de standaard 3 van 8) leveren +4 op, daarna +2 tot het aantal keren voor ingeburgerd (8) is bereikt. Zo krijgt zo'n taak de bonus ook echt, in plaats van één taak in 21 dagen. Dit staat ook op de detailpagina van de habit.
- **Opbouwbonus:** de leeftijd van de habit op de dag van de taak (actieve dagen, gepauzeerde dagen tellen niet mee). De bonus stopt zodra je de habit **ingeburgerd verklaart** (voor taken vanaf die dag) of de ingeburgerd-grens van de habit is bereikt, ook als je hem niet verklaart. Zo beloont de bonus de fase waarin een habit nog moeite kost; daarna levert hij gewoon de basispunten op.
- **Startbonus:** pas bij de eerste afgeronde taak, dus niet bij aanmaken. Het plafond van 3 per venster en de minpunten voor de dagen daarna beperken het aanmaken en weggooien van habits (zie §4.7 voor hoe sterk).
- **Minpunten en de eerste misser gratis:** alleen voor dagen die **voorbij** zijn; vandaag kost nooit iets. Per habit is een **enkele misser gratis** (`MISS_GRACE = 1`): je mag een dag missen zonder dat het je iets kost, maar **nooit twee keer achter elkaar**. Bij een rij van n missers is de eerste gratis en kosten de overige n − 1 elk 5. "Achter elkaar" gaat per eenheid van de habit: bij een habit voor maandag, woensdag en vrijdag zijn een gemiste maandag en een gemiste woensdag twee achter elkaar, ook al ligt er een dag tussen. Een afgeronde dag of een half gehaalde teller maakt de rij weer schoon (de volgende misser is weer gratis). Overslaan, pauze en een nog lopende eenheid breken de rij niet af en tellen niet als misser, net als bij de reeks. Een misser vlak vóór het venster telt mee als "de vorige keer". De regel geldt per habit: een misser bij twee verschillende habits op dezelfde dag kost niets.
- **Flexibele habits:** een gemiste week of maand is één misser in de rij. Een enkele gemiste week is gratis; mist een week direct na een gemiste week, dan kost het tekort van die tweede week 5 per ontbrekende keer. De aftrek komt pas als de week of maand eindigt.
- **Overig:** overslaan, pauze en een half gehaalde teller kosten niets. Een afgeronde dag die je **terugwerkend invult** (tot 14 dagen terug) levert de punten op en neemt de aftrek weg.
- **Gearchiveerde habits** krijgen geen minpunten meer; taken die je ervoor deed blijven tellen.
- **Dag** volgt de dagwissel van de gebruiker: een check-in van 02:00 hoort bij de vorige dag.

### 4.3 Gelijke stand
Gelijke punten: de langste reeks gaat voor, daarna de naam. Gelijke posities krijgen dezelfde rang ("1, 1, 3").

### 4.4 Wie is "actief"
Je publiceert de datum van je **laatste afgevinkte dag** (`last_active`; een half gehaalde teller telt mee). Een vriend staat in de lijst zolang `last_active` binnen de laatste **3 dagen** valt (vandaag, gisteren of eergisteren, gerekend vanaf de dag van degene die kijkt). Daarna verdwijnt de vriend, en bij de eerstvolgende afvinkactie is hij of zij terug. Wie de app niet opent, publiceert niets en valt dus vanzelf af.
Je eigen regel staat er altijd. Nieuwe vrienden zonder enige activiteit verschijnen pas na hun eerste afvinkactie.

**Kort: wanneer sta je op andermans ranglijst?** Als jullie vrienden zijn, jij meedoet en je in de laatste 3 dagen (vandaag, gisteren of eergisteren) minstens één taak hebt afgevinkt, ook een half gehaalde teller. Er is **geen minimum aantal taken of punten**; één afgevinkte taak is genoeg. Overslaan en pauzeren tellen niet als afvinken. Deze uitleg staat in de app onder "Wie staat er op de ranglijst?" (op het aanmeldscherm en op de ranglijst) en volgt de constante `SOCIAL_ACTIVE_DAYS`; een test bewaakt dat tekst en regel gelijk blijven.

### 4.5 Reeks en habits (bijzaak)
Naast de punten staan per persoon de **langste lopende reeks** (dagen, alleen habits met vaste dagen; een flexibele habit heeft weken als eenheid) en het **aantal actieve habits**. Een reeks breekt niet doordat vandaag nog open staat.

### 4.6 Jouw eigen opbouw van de punten
De berekening levert naast het totaal een uitsplitsing (`breakdown`: taken, bonus, start, minpunten). Die laat de app **alleen jou** zien ("Waar komen mijn punten vandaan?"), zodat een daling 's nachts of een bonus niet als een raadsel voelt. Vrienden zien alleen het totaal.

### 4.7 Bekende zwakten en meting
**Aanvaard:** de punten worden door de app van de gebruiker berekend en gepubliceerd. Een vriend met kennis kan dus valsspelen. Voor een kring van vrienden is dat aanvaardbaar: er valt niets te winnen. De server beperkt wel de waardebereiken en de update-frequentie. Wil je ooit strenger zijn, dan kan de server de punten afleiden uit de gesynchroniseerde check-ins (veel werk).

**Meting op voorbeeldgegevens** (15 oktober, jaar geschiedenis; berekening 0–30 ms):

| Soort gebruiker | Alleen basis | Met bonussen en minpunten |
|---|---|---|
| 3 habits, 90%, al 200 dagen bezig | 190 | **190** |
| 3 habits, 90%, 30 dagen bezig (opbouw) | 180 | **216** |
| 3 habits, 50%, 30 dagen bezig | 90 | **78** |
| 15 habits gemengd, 70%, 200 dagen | 750 | **725** |
| 15 habits gemengd, 40%, 200 dagen | 480 | **365** |
| starter: 2 habits, 5 dagen bezig, alles gedaan | 120 | **188** |
| starter: 1 habit, 5 dagen bezig, 50% | 20 | **28** |
| knoeier: elke dag een nieuwe habit, één keer afvinken | 70 | **78** |

Wat opvalt:
- **Wie trouw is, merkt de minpunten niet.** Met een gratis eerste misser staat iemand die 90% haalt op 190 (de aftrek is nul). Een gewone slechte dag kost niets; pas een rij missers wordt voelbaar.
- **Een slechte periode doet nog wel pijn**: 50% gedaan in de opbouwfase geeft 78, onder het basisresultaat (90). Wie zijn habit vaak twee dagen op rij laat liggen, verliest punten.
- **Veel habits blijven voordeel geven**: 15 habits half doen (365) staat ruim boven 3 habits bijna perfect (190). Dat volgt uit tellen per taak (§4.2) en is de eerste knop om aan te draaien (bijvoorbeeld een plafond van punten per dag).
- **Knoeien loont een beetje**: elke dag een nieuwe habit starten en één keer afvinken levert 78 op, iets meer dan trouw één habit doen (70). De drie startbonussen en de gratis eerste misser zijn daar de oorzaak van. Besloten: eerst de praktijk afwachten. Wil je dat strenger, dan helpt een lagere `START_BONUS_MAX` of de startbonus pas bij de derde afgeronde taak.
- **De opbouwbonus is bescheiden** (ongeveer 20% in de eerste 21 dagen, 10% daarna) en verdwijnt zodra een habit eigen is. Een starter die in de eerste week alles doet staat net zo hoog als een gevestigde gebruiker (188 tegen 190). Dat is de bedoeling van het "starten" belonen; `START_BONUS` en `BUILD_BONUS_STARTING` zijn de knoppen.

## 5. Datamodel (gebouwd in S2, Supabase)

Alles is **additief**: een nieuwe migratie `0003_social.sql`; de bestaande tabellen en de huidige productie-app blijven ongemoeid (zie "Werkwijze: database"). Geen `records`-wijzigingen: het sociale deel leeft in eigen tabellen, zodat sociaal uit te zetten en op te ruimen is zonder de sync te raken.

### 5.1 Tabellen

Allemaal in `supabase/migrations/0003_social.sql`. Elke tabel heeft RLS aan, **geen enkele policy** en alle rechten ingetrokken voor `anon` en `authenticated`: rechtstreeks lezen of schrijven kan niet.

| Tabel | Kolommen (kern) | Doel |
|---|---|---|
| `social_profiles` | `user_id` (pk, → `auth.users`, cascade), `username` (uniek, 3–20 tekens `a-z 0-9 _ .`), `display_name` (≤ 30), `enabled`, `username_changed_at` | wie meedoet en onder welke naam |
| `social_blocked_terms` | `term` | woorden die niet in een gebruikersnaam mogen (`admin`, `support`, `habitbuilder`, …); aan te vullen met een insert |
| `friendships` | `id`, `user_low`, `user_high` (altijd gesorteerd, uniek paar), `requested_by`, `status` (`pending`/`accepted`/`declined`), `created_at`, `responded_at` | één rij per paar; `declined` onthoudt een weigering voor de wachttijd van 30 dagen |
| `invite_codes` | `id`, `owner`, `code_hash` (sha256, uniek), `expires_at` (7 dagen), `revoked_at` | uitnodigingslinks; de code zelf staat alleen in de link |
| `score_summaries` | `user_id` (pk), `as_of`, `points`, `done`, `streak`, `active_habits`, `last_active`, `updated_at` | de gepubliceerde samenvatting, één rij per gebruiker |
| `social_rate` | `user_id`, `action`, `at` | telt zoek-, verzoek-, uitnodig-, inwissel- en publicatieacties tegen raden en lastigvallen (oude rijen worden vanzelf opgeruimd) |

### 5.2 Toegang: alleen via functies
Het principe: **tabellen zijn dicht, toegang loopt via kleine `security definer`-functies** (met vaste `search_path`), uitsluitend aan te roepen door ingelogde gebruikers. Zo kan niemand rechtstreeks in andermans rijen kijken of door lijsten bladeren. Vier hulpfuncties (`social_uid`, `social_require_enabled`, `social_rate_use`, `social_friend_count`) zijn voor niemand aan te roepen.

| Functie | Doet | Begrenzing |
|---|---|---|
| `social_enable(username, display_name)` | zet sociaal aan of werkt je naam bij; gebruikersnaam wordt kleine letters | naam wisselen hoogstens eens per 30 dagen |
| `social_disable()` | zet uit: uit lijsten en zoekresultaten, samenvatting gewist, uitnodigingen ingetrokken; vriendschappen blijven bewaard | |
| `social_me()` | je eigen profiel of `null` | |
| `social_find(username)` | **exacte** naam, hooguit één rij `{ id, username, display_name, relation }`; negeert jezelf, wie sociaal uit heeft en wie een eerder verzoek van jou weigerde | 20 per uur |
| `friend_request(user_id)` | stuurt een verzoek; vraagt de ander jou al, dan meteen vrienden | 10 per dag, 20 openstaand, 50 vrienden |
| `friend_respond(user_id, accept)` | beantwoordt een verzoek aan jou; weigeren is stil | 50 vrienden (ook die van de afzender) |
| `friend_cancel(user_id)` / `friend_remove(user_id)` | eigen verzoek intrekken / vriend verwijderen (wederzijds) | |
| `friend_list()` | vrienden, binnenkomende en uitgaande verzoeken (alleen mensen die sociaal aan hebben; geweigerd staat er niet in) | |
| `invite_create()` / `invite_list()` / `invite_revoke(id)` | uitnodigingslink maken (de code komt één keer terug, 64 tekens), eigen actieve links zien, intrekken | 10 per dag, 5 tegelijk actief |
| `invite_redeem(code)` | wisselt een code in: direct vrienden. Een ongeldige, verlopen of ingetrokken code geeft altijd `{"status":"invalid"}` en **geen fout**, zodat elke poging meetelt | 20 per uur |
| `publish_summary(...)` | schrijft **jouw** samenvatting; de server bewaakt de bereiken (punten 0–100 000, datum binnen ±2 dagen, enz.) | 60 per uur |
| `leaderboard()` | jouw samenvatting en die van **geaccepteerde** vrienden die sociaal aan hebben; geen e-mail of andere velden. Het wegfilteren van wie 3 dagen niets deed (§4.4) doet de app | |

**Fouten** zijn stabiele codes in de melding, zodat de app ze naar tekst kan vertalen: `not_authenticated`, `not_enabled`, `invalid_username`, `invalid_display_name`, `username_taken`, `username_not_allowed`, `username_change_too_soon`, `not_found`, `friend_limit`, `pending_limit`, `invite_limit`, `too_many_requests`, `invalid_summary`. Een geweigerd verzoek geeft `not_found`, precies zoals een onbekende gebruiker, zodat de afzender niets van de weigering merkt.

**Getest** (zie §8): `tests/server/social.test.js` (32 tests op een echte Postgres, in `npm test` en in CI) en `tools/social-check.mjs` (96 controles via de echte API van de lokale Supabase, `npm run db:check-social`). Ze bewijzen onder meer dat anon niets kan, dat de tabellen en hulpfuncties ook ingelogd dicht zijn, dat een niet-vriend niets ziet, dat raden en zoeken begrensd zijn (ook mislukte pogingen tellen mee), dat een weigering onzichtbaar blijft en dat het verwijderen van een account alles meeneemt.

### 5.3 De samenvatting
```
{ as_of: "2026-10-15", points: 230, done: 23, streak: 9, active_habits: 5, last_active: "2026-10-15" }
```
Alleen getallen en twee datums (`as_of`, `last_active`). Niets dat een habit identificeert. Zie ook [DATAMODEL.md](DATAMODEL.md).

### 5.4 In de app (gebouwd in S3)

De sociale kant gaat **niet door de sync-motor** (het is niet van jou alleen en kent andere regels). Ze zit in drie lagen, naast de bestaande:

| Laag | Bestand | Doet |
|---|---|---|
| puur | `src/app/social.js` | gebruikersnaam controleren en voorstellen, uitnodigingslinks bouwen en lezen, serverrijen omzetten, je eigen cijfers in de ranglijst zetten |
| data | `src/data/social-remote.js` | de serverfuncties aanroepen en fouten omzetten naar stabiele codes (`SocialError`) |
| data | `src/data/social-cache.js` | de laatst opgehaalde vrienden en ranglijst in `localStorage` (per gebruiker; een ander account ziet ze nooit) en een onthouden uitnodigingscode |
| besturing | `src/ui/social.js` (`createSocial`), bedraad in `src/ui/social-app.js` | de status, ophalen, publiceren en alle acties; zonder scherm te testen |

**Status** voor de schermen (S4): `signed-out` · `unknown` (ingelogd, nog niets bekend) · `off` · `on` · `unavailable` (de server kent sociaal nog niet).

**Afspraken in de code:**
- **Wie sociaal niet gebruikt merkt er niets van:** zonder cache gaat er *niets* over het netwerk en wordt er niets berekend, tot de gebruiker het scherm opent. Dan wordt alleen het profiel opgevraagd; doet je niet mee, dan is dat alles. (Getest.)
- **Meedoen:** dan staat de status in de cache en werkt de app vrienden en ranglijst op de achtergrond bij en publiceert hij je samenvatting: bij opstarten, bij elke wijziging in je habits (na 1,5 s, alleen als er iets veranderd is) en als je de app weer opent.
- **Offline:** de cache blijft staan, gemarkeerd als `stale`. Een mislukte publicatie wordt later opnieuw geprobeerd.
- **Je eigen punten** zijn altijd lokaal berekend en gaan voor op wat de server van jou heeft (V25).
- **De naam uit Instellingen** wordt voor het publiceren bij je vrienden bijgewerkt (S5).
- **Uitloggen of account verwijderen** wist de cache en een onthouden uitnodiging; van account wisselen laat de cache van het andere account ongemoeid maar ongezien.
- **Release-volgorde:** kent de server de functies nog niet (migratie 0003 niet uitgevoerd op productie), dan wordt de status `unavailable` en blijft de app stil. De app kan dus veilig vóór of na de migratie worden uitgerold.
- **Acties** (`enable`, `disable`, `find`, `request`, `respond`, `cancel`, `remove`, `createInvite`, `invites`, `revokeInvite`, `redeemInvite`) geven `{ ok: true, … }` of `{ ok: false, reason }` en gooien nooit. De redenen zijn de servercodes uit §5.2 plus `offline`, `signed-out`, `invalid` (uitnodiging) en de naamredenen `empty`, `too_short`, `too_long`, `invalid_chars`.

## 6. Privacy, veiligheid en AVG

### 6.1 Wat verandert
| Nieuw | Waar | Zichtbaar voor |
|---|---|---|
| gebruikersnaam | `social_profiles` | iedereen **die hem exact kent** (zoeken) |
| weergavenaam | `social_profiles` | jouw geaccepteerde vrienden (en wie jouw verzoek kreeg) |
| weekpunten, reeks, aantal habits, laatst actief op | `score_summaries` | jouw geaccepteerde vrienden |
| wie er met wie bevriend is | `friendships` | alleen die twee |

Zichtbaar voor niemand: e-mailadres, habit-namen, notities, cues, "waarom", individuele check-ins, tijdstippen.

### 6.2 Maatregelen
1. **Opt-in** en een scherm dat vooraf uitlegt wat gedeeld wordt.
2. **Geen enumeratie**: zoeken kan alleen op exacte naam; het antwoord is altijd "gevonden" of "niet gevonden", ook als de gebruiker bestaat maar sociaal uit heeft. Het antwoord is ook hetzelfde als je eerder geweigerd bent. Zoeken en verzoeken zijn **begrensd** (voorstel: 20 zoekopdrachten per uur en 10 nieuwe verzoeken per dag per gebruiker), zodat raden niet werkt.
3. **Uitnodigingscodes** zijn lang (≥ 128 bit), worden alleen als hash opgeslagen, verlopen en zijn in te trekken.
4. **Weigeren is stil**: de afzender merkt niets en kan 30 dagen niet opnieuw. Een blokkeerfunctie is bewust niet gebouwd (S10); we kijken later of dat nodig blijkt.
5. **Uitzetten of account verwijderen** wist profiel, samenvatting, uitnodigingen en vriendschappen (cascade); `delete_my_account()` blijft werken.
6. **Gebruikersnamen** worden gecontroleerd op een korte blokkadelijst; er zijn geen vrije profielteksten of foto's (klein aanvalsoppervlak).
7. **Frontend**: alle weergave via `textContent`/DOM-builders (bestaande guardrail), nooit `innerHTML` met namen van anderen.
8. De **privacyverklaring en voorwaarden** worden bijgewerkt (nieuwe gegevens, nieuwe categorie "andere gebruikers" als ontvangers, bewaartermijn: tot je het uitzet of je account verwijdert). Een minimumleeftijd is bewust niet ingesteld (S10).

### 6.3 AVG-kanttekening
Sociaal brengt gegevens van anderen op andermans scherm. Voor een hobbyproject met een kleine kring blijft dat hanteerbaar mits het opt-in is, het minimaal is en je het kunt stoppen. Het blijft een afweging van Remco als verantwoordelijke.

## 7. UX (voorstel, nog te ontwerpen)

### 7.1 Plek in de app
Besloten (S9): de ranglijst is bereikbaar vanaf **Voortgang** (een kaart "Ranglijst" bovenaan, met je positie), met een eigen route (`#/vrienden`). Geen zesde tabblad; de navigatie blijft vijf items. Op desktop kan de zijbalk later een eigen item krijgen als dat prettiger blijkt.

### 7.2 Schermen (gebouwd in S4)

| Route | Scherm |
|---|---|
| Voortgang (`#/stats`) | een **kaart** bovenaan: niet ingelogd "log in om mee te doen"; ingelogd maar nog niet meegedaan "Meedoen" (zonder iets op te halen); meedoend je plek en punten ("Je staat 2e van 5 · 282 punten") met een teller voor nieuwe verzoeken; en een banner als er nog een uitnodiging wacht |
| `#/vrienden` | **hoofdscherm**, afhankelijk van de status: niet ingelogd (uitleg + inloggen), aanmelden (wat vrienden zien en wat privé blijft, je naam en gebruikersnaam), of de **ranglijst** met binnenkomende verzoeken bovenaan, knoppen *Vrienden toevoegen* en *Beheren*, vernieuwen en "Waar komen mijn punten vandaan?" |
| `#/vrienden/toevoegen` | zoeken op de exacte gebruikersnaam (resultaat met de juiste knop: verzoek sturen, verstuurd, accepteren of al vrienden) en een uitnodigingslink maken, delen en kopiëren |
| `#/vrienden/beheer` | verzoeken aan jou en van jou, je vrienden (verwijderen met bevestiging), je uitnodigingslinks (intrekken), je profiel (naam wijzigen) en sociaal uitzetten |
| `#/vrienden/uitnodiging/<code>` | een uitnodigingslink openen: eerst inloggen (de code blijft bewaard, ook over Google heen) en meedoen, daarna word je direct vrienden; bij een verlopen of kapotte link een nette melding |

Geen zesde tabblad (S9): de ranglijst hoort bij Voortgang en laat die in de navigatie oplichten. Na het inloggen stuurt de app je naar een wachtende uitnodiging.

**Lege en bijzondere toestanden:** niet ingelogd · account wordt hersteld · server kent sociaal nog niet (`unavailable`: de kaart verdwijnt, het scherm legt het uit) · geen verbinding en nog niet bekend of je meedoet (met opnieuw proberen) · offline met een cache ("Stand van 21:24") · je staat er nog alleen · geen verzoeken · geen vrienden · geen uitnodigingslinks.

### 7.3 Eisen aan de uitvoering
- Alle teksten in `src/content/nl.js`; werkt in beide thema's (v0lky1, Mel) en op desktop (twee kolommen).
- **Toegankelijk:** de lijst is een geordende lijst (`<ol>`) met tekst ("2e, Anna, 82 procent, reeks 9"), de eigen regel is ook als tekst herkenbaar; geen betekenis in alleen kleur; ≥ 44 px tikvlak; 200% tekst zonder zijwaarts scrollen; lijstwijzigingen aangekondigd.
- **Prestaties:** de ranglijst is één verzoek; Vandaag mag er niet trager van worden (publiceren gebeurt op de achtergrond na sync).
- Zonder sociaal merkt de gebruiker niets: geen extra verzoeken, geen extra rekenwerk.

## 8. Niet-functioneel en kwaliteit
- **Domein** (punten, bonussen, minpunten, venster, gelijke stand, actief-regel, dagwissel, flexibele en teller-habits) puur en met tests, inclusief de randgevallen uit PLAN §4.8 waar relevant. Eén bron voor constanten (alle bedragen, 7 dagen, 3 dagen inactief, 50 vrienden, enz.).
- **Server:** de sociale tabellen en functies hebben eigen tests op een echte Postgres (`tests/server/social.test.js`, draait in `npm test` en in CI) en een controle via de echte API (`tools/social-check.mjs`); migratie idempotent; functies met vaste `search_path`; geen service-sleutel nodig.
- **Guardrails:** geen `innerHTML`, geen service-sleutel, `svh`-regels, tikvlakken blijven gelden.
- **Browsertests** voor de flows (aanzetten, uitnodigen, accepteren, ranglijst, offline, weigeren) op telefoon- en desktopformaat. Dit is het natuurlijke moment om de browsertests eindelijk **in de repository en in CI** te zetten (nu alleen lokaal): sociaal is te riskant om zonder vangnet te bouwen. Zie ook WERKWIJZE.
- **Achterwaarts compatibel:** de oude app (zonder sociaal) werkt ongewijzigd naast de nieuwe tabellen.

## 9. Besloten en nog open

Alle vragen uit het eerste concept zijn beantwoord (S5–S11 bovenaan). Wat overblijft is uitvoering, geen keuze meer:
- **Testdatabase:** lokaal in Docker, volgens [DEV-OMGEVING.md](DEV-OMGEVING.md).
- **Naam bij het aanmaken van een account** (S5): de huidige naamdialoog krijgt de uitleg dat vrienden de naam zien. Bestaande accounts krijgen de vraag eenmalig bij het aanzetten van sociaal.
- **Het gevolg van S6/S7 in één zin:** je punten stijgen met elke taak, krijgen een extra duwtje zolang een habit nog nieuw is, en zakken pas als je een habit twee keer achter elkaar laat liggen (dan met 5 per extra misser); wie 3 dagen stil is, zie je niet meer. De uitsplitsing van je eigen punten laat zien waar het vandaan komt.

## 10. Mijlpalen en acceptatiecriteria (voorstel)

Alle werk op `feature/vrienden` (en korte `feature/*`-takken daarvan) → `develop`; pas na jouw akkoord een release naar `main` met tag `v1.1`.

| M | Inhoud | Klaar als… |
|---|---|---|
| **S0** | Dit document akkoord; besluiten S5–S11 genomen; de lokale testdatabase draait en de app kan er mee verbinden | ✔ klaar |
| **S1** | Domein: punten (basis, opbouwbonus, startbonus, minpunten, half gehaalde teller), actief-regel (3 dagen), gelijke stand, tests. Plus de naamvraag bij het aanmaken van een account (S5) | ✔ klaar: de regels uit §4 hebben groene tests; de meting (§4.7) staat erin. |
| **S2** | Server: migratie 0003, functies, tests, DATAMODEL bijgewerkt | ✔ klaar: niet-vriend ziet niets, vriend ziet alleen de ranglijstvelden, weigeren/intrekken/verlopen/limieten/cascade werken (32 tests op Postgres, 96 controles via de API). **Nog niet op productie gezet**: dat gebeurt bij de release. |
| **S3** | Data-laag en publiceren: remote-client, samenvatting na sync, offline cache | ✔ klaar: publiceren op de achtergrond; uit = niets verzonden (getest, 66 nieuwe tests); de hele keten ook getest met de echte SDK tegen de lokale Supabase (`npm run db:check-app`, 29 controles) |
| **S4** | UI: aanzetten, zoeken, link, verzoeken, ranglijst, lege toestanden, beide thema's, desktop | ✔ klaar: vijf schermen en een kaart op Voortgang. De browserreeks `npm run db:check-browser` (123 controles, echte Edge tegen de lokale Supabase) slaagt: alle stromen, beide thema's, desktop, 320 px met 200% tekst (geen overflow, niets afgeknipt, tikvlakken van 44 px), offline, namen voor alles wat je kunt bedienen. Alle bestaande browserreeksen blijven slagen. |
| **S5** | Privacyverklaring, voorwaarden, in-app uitleg, PLAN en DATAMODEL bijgewerkt, browsertests in CI | ✔ privacyverklaring en voorwaarden bijgewerkt (met een test die ze gelijk houdt aan de database), privacylink bij het aanmelden, PLAN en DATAMODEL bijgewerkt, de workflow **Integratie** draait de API-controles en 123 browsercontroles op GitHub. **Nog te doen:** proberen op twee echte telefoons, en de release volgens [RELEASE-v1.1.md](RELEASE-v1.1.md). |

## 11. Risico's

| # | Risico | Maatregel |
|---|---|---|
| X1 | Gebruikerslijst afzoeken (enumeratie) of namen raden | exacte match, rate limit, uniform antwoord, geen autocomplete |
| X2 | Lastigvallen via verzoeken | stille weigering met wachttijd, limieten, intrekken, geen vrije tekst; blokkeren later als het nodig blijkt |
| X3 | Valsspelen met de punten (of triviale habits toevoegen) | aanvaard binnen vrienden; plafond op startbonussen; minpunten maken knoeien onaantrekkelijk; reeks en habit-aantal zichtbaar |
| X4 | Ranglijst demotiveert (minpunten, altijd laatste staan) of wie veel habits heeft wint altijd | een enkele misser is gratis (nooit twee achter elkaar); minpunten half zo groot als een taak en nooit onder nul; schuivend venster van 7 dagen; wie stil is valt weg; uit te zetten; knoppen in de constanten (§4.7) |
| X5 | Productiedata raakt vermengd met testen | lokale testdatabase (S11); migratie additief |
| X6 | Privacyverklaring loopt achter op de feature | S5 is een voorwaarde voor release |
| X7 | Ontwikkelwerk groeit uit tot "sociaal netwerk" | §3.5 houdt scope klein; aanmoedigen/groepen later apart |
| X8 | Navigatie raakt overvol | besloten: via Voortgang (S9) |
| X9 | Vrienden zonder account kunnen niet meedoen | uitleg en uitnodiging door inloggen; geen workaround |

## 12. Volgende stappen

1. Testdatabase lokaal starten: [DEV-OMGEVING.md](DEV-OMGEVING.md).
2. S1 (de punten), S2 (de server), S3 (de data-laag) en S4 (de schermen) zijn klaar. Wat overblijft is S5: de privacyverklaring en voorwaarden bijwerken, de uitleg in de app nalopen, de browserreeksen in CI zetten en proberen op twee echte telefoons; daarna de release (`v1.1`).
