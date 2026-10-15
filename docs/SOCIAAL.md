# Sociaal: vrienden en ranglijst – analyse en requirements

Status: **concept ter bespreking** (nog niets gebouwd) · 2026-10-15 · branch `feature/vrienden` · werkwijze: [WERKWIJZE.md](WERKWIJZE.md)

## 1. Doel

Habits bouw je makkelijker samen. Deze feature maakt de app **een beetje sociaal**, zonder dat je privé-gegevens loslaat: je kunt vrienden zoeken en toevoegen, en een **ranglijst** laat zien wie er deze week het beste bezig is.

Wat het níét is: een sociaal netwerk. Geen feed, geen reacties, geen openbare profielen, geen zoeken door "alle gebruikers". Het is een kleine kring van mensen die elkaar kennen.

### Vastgelegde keuzes (door Remco, 2026-10-15)

| # | Keuze | Besluit |
|---|---|---|
| S1 | Vrienden vinden | **Gebruikersnaam + uitnodigingslink.** Zoeken kan alleen op de *exacte* gebruikersnaam; niemand kan door gebruikers bladeren; e-mailadressen blijven altijd verborgen. |
| S2 | Rangschikking | **Score over de laatste 7 dagen** (percentage gedaan van wat gepland stond). Elke week een nieuwe kans, ook voor beginners. |
| S3 | Wat vrienden zien | **Alleen cijfers en je naam.** Geen habit-namen, geen notities, geen cues, geen "vandaag gedaan". |
| S4 | Reikwijdte eerste versie | **Vrienden + ranglijst, verder niets.** Verzoek en acceptatie, verwijderen, blokkeren, ranglijst. Aanmoedigen, reacties en groepen later. |

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
| Iemand die lastiggevallen wordt | iemand kunnen blokkeren en niet meer vindbaar zijn |

**Anonieme gebruikers** (zonder account) kunnen niet meedoen: vrienden en een ranglijst vragen een server en een identiteit. De app legt dat uit en biedt inloggen aan.

## 3. Functionele requirements

Prio: M = moet, S = zou moeten, C = kan. Het ID-voorvoegsel is **V** (vrienden).

### 3.1 Meedoen en profiel
| ID | Eis | Prio |
|---|---|---|
| V1 | Sociaal staat **standaard uit**. Je zet het zelf aan via een duidelijk scherm dat uitlegt wat vrienden zien (alleen naam en cijfers) en wat niet. | M |
| V2 | Bij aanzetten kies je een **gebruikersnaam**: uniek, 3–20 tekens, kleine letters/cijfers/`_`/`.`, niet hoofdlettergevoelig, zonder aanstootgevende woorden uit een korte blokkadelijst. De naam kun je later wijzigen (hoogstens eens per 30 dagen). | M |
| V3 | De **weergavenaam** op de ranglijst is je bestaande voornaam uit Instellingen. Is die leeg, dan de gebruikersnaam. | M |
| V4 | Je kunt sociaal **altijd uitzetten**: je verdwijnt uit de lijsten van anderen en je gepubliceerde score wordt gewist. Vriendschappen blijven bewaard maar zijn "gepauzeerd" tot je het weer aanzet (S: of je kiest ze ook te verwijderen). | M |
| V5 | Zonder account of zonder verbinding is het scherm Vrienden bruikbaar in een nette, verklarende toestand (zie §7), nooit een lege fout. | M |

### 3.2 Vrienden zoeken en toevoegen
| ID | Eis | Prio |
|---|---|---|
| V10 | **Zoeken op exacte gebruikersnaam.** Geen deelmatches, geen autocomplete, geen lijst: een resultaat of "niet gevonden". Zo kan niemand de gebruikerslijst afstruinen. Zoeken is begrensd (rate limit, zie §6). | M |
| V11 | **Uitnodigingslink** (`…/#/vrienden/uitnodiging/<code>`) deelbaar via WhatsApp enz. (Web Share API met kopieer-terugval). De code is lang en onraadbaar, verloopt na 7 dagen en kan door jou ingetrokken worden. | M |
| V12 | Een vriendschap ontstaat pas na **acceptatie**. Een verzoek via de link is een verzoek aan de afzender dat de ander moet bevestigen óf (keuze, zie §9 vraag 4) direct accepteert omdat de afzender de link zelf heeft gedeeld. | M |
| V13 | Ontvangen verzoeken staan in een lijst met **Accepteren / Weigeren / Blokkeren**. De afzender krijgt bij weigeren geen melding (alleen dat het verzoek "nog openstaat" of verdwijnt na 30 dagen). | M |
| V14 | Verzoeken die je zelf verstuurde zie je als "uitgenodigd", met **intrekken**. | M |
| V15 | Een uitnodigingslink openen zonder account of zonder sociaal: de app leidt je door inloggen en aanzetten, en handelt het verzoek daarna alsnog af (de code blijft onthouden). | S |
| V16 | Een vriend **verwijderen**: wederzijds en direct; de ander merkt het alleen doordat je uit de lijst verdwijnt. | M |
| V17 | **Blokkeren**: de geblokkeerde kan je niet meer vinden, uitnodigen of zien; bestaande vriendschap eindigt. Geblokkeerde ziet "niet gevonden". Je kunt deblokkeren. | M |
| V18 | Een maximum van **50 vrienden** per gebruiker en **20 openstaande verzoeken**, tegen misbruik en om de ranglijst werkbaar te houden. | M |

### 3.3 Ranglijst
| ID | Eis | Prio |
|---|---|---|
| V20 | De **ranglijst** toont jou en je geaccepteerde vrienden, gesorteerd op **weekscore** (§4), met positie, naam, score en reeks. Jij bent herkenbaar gemarkeerd (niet alleen met kleur). | M |
| V21 | Een vriend met te weinig om te beoordelen (§4.3) staat onderaan met "nog te weinig gepland" in plaats van een misleidende 100% of 0%. | M |
| V22 | Per regel staat wanneer de score voor het laatst is bijgewerkt. Een score ouder dan 3 dagen is **"verouderd"** en telt niet mee voor de volgorde (staat onderaan). | M |
| V23 | Zichtbare extra's per vriend, uitsluitend uit de gepubliceerde samenvatting: huidige langste **reeks** (dagen), aantal **actieve habits**. | S |
| V24 | De ranglijst werkt **offline** met de laatst opgehaalde stand (duidelijk gemarkeerd als "stand van …"), en ververst bij openen en via een knop. | M |
| V25 | De eigen score staat altijd **lokaal berekend** en is dus direct juist, ook voor je gepubliceerd wordt. | M |
| V26 | Terugkijken ("vorige week") is niet nodig in deze versie. | C |

### 3.4 Wat er gepubliceerd wordt
| ID | Eis | Prio |
|---|---|---|
| V30 | Alleen als sociaal aanstaat, publiceert de app na elke synchronisatie en bij openen een **samenvatting** (zie §5.3). Verder verlaat niets het apparaat dat er nog niet was. | M |
| V31 | De samenvatting bevat **geen habit-namen, geen notities, geen cues, geen tijdstippen en geen datums per check-in**. | M |
| V32 | Publiceren faalt stil en herstelt zichzelf: geen blokkerende fout als de server niet bereikbaar is. | M |

### 3.5 Niet in deze versie
Aanmoedigen/knuffel-knop, reacties, groepen of uitdagingen, publieke profielen, vrienden zoeken op e-mailadres of via contacten, pushmeldingen over vrienden, badges voor ranglijstposities, terugblik per week, vrienden uit een ander land of taal filteren.

## 4. De score: domeinregels (het eerlijke hart)

De ranglijst staat of valt met een eerlijke maat. Deze regels worden, net als de rest van het domein, **puur en met tests** gebouwd (`src/domain`) en één keer vastgepind.

### 4.1 Definitie
**Weekscore** = (aantal gedane eenheden ÷ aantal gedane + gemiste eenheden) over de **laatste 7 afgesloten dagen** (gisteren en de 6 dagen daarvoor), als geheel getal 0–100 (afgerond).

- Een eenheid is zoals in PLAN §4.3: `gedaan` en `minimaal` tellen als gedaan; `overgeslagen` en `gepauzeerd` tellen nergens; `gemist` telt tegen.
- **Vandaag telt niet mee**: de dag is nog niet voorbij. Je score daalt dus nooit omdat het ochtend is en je nog niets deed.
- Een dag houdt de **dagwissel** van de gebruiker aan (standaard 04:00): "gisteren" is voor elke gebruiker de eigen vorige dag.
- **Flexibele habits** (N× per week/maand, dag van de maand) worden pas beoordeeld zodra hun periode is afgesloten. Binnen het venster tellen alleen eenheden mee die in die 7 dagen zijn **afgesloten**; de eenheden zelf blijven de regels van `units.js` volgen. (Alternatief, zie §9 vraag 2: de dagweergave `buildDayView` hergebruiken die ook de weekstrook gebruikt.)

### 4.2 Waarom dit eerlijk is
- Wie **3 habits** heeft en wie **15** concurreren op percentage, niet op aantal: meer habits geeft geen voordeel.
- Pauze en overslaan kosten niets: vakantie of ziekte kost je geen plek.
- Elke week een nieuwe kans: het venster schuift, een slechte week is na zeven dagen weg.
- Beginners kunnen meteen meedoen; er is geen "reeks" die je moet hebben (de reeks is bijzaak, V23).

### 4.3 Te weinig om te beoordelen
Een score telt alleen als er in het venster **minstens 3 beoordeelde eenheden** zijn (gedaan + gemist). Anders: "nog te weinig" en geen rang. Reden: één habit, één dag, 100% zegt niets.

### 4.4 Gelijke stand
Gelijke score: meer beoordeelde eenheden eerst (meer te verliezen gehad), daarna de langste reeks, daarna de naam alfabetisch. Gelijke posities mogen dezelfde rang krijgen ("1, 1, 3").

### 4.5 Bekende zwakte (aanvaard)
De score wordt **door de app van de gebruiker berekend en gepubliceerd**. Een vriend met kennis kan dus valsspelen. Voor een kring van vrienden is dat aanvaardbaar: er valt niets te winnen. De server beperkt wel de **waardebereiken** (score 0–100, aantallen ≤ 1000) en de update-frequentie, zodat rotzooi niet kan. Een tweede zwakte: iemand met één habit kan makkelijk 100% halen; dat wordt gemilderd doordat het aantal habits en de reeks zichtbaar zijn (V23). Ben je hier later bezorgd over, dan kan de server de score afleiden uit de gesynchroniseerde check-ins (veel werk, past slecht bij "de server begrijpt de records niet").

## 5. Datamodel (voorstel, Supabase)

Alles is **additief**: een nieuwe migratie `0003_social.sql`; de bestaande tabellen en de huidige productie-app blijven ongemoeid (zie "Werkwijze: database"). Geen `records`-wijzigingen: het sociale deel leeft in eigen tabellen, zodat sociaal uit te zetten en op te ruimen is zonder de sync te raken.

### 5.1 Tabellen

| Tabel | Kolommen (kern) | Doel |
|---|---|---|
| `social_profiles` | `user_id` (pk, → `auth.users`, cascade), `username` (uniek, citext), `display_name` (≤ 30), `enabled`, `username_changed_at`, `created_at` | wie meedoet en onder welke naam |
| `friendships` | `id`, `user_low`, `user_high` (altijd gesorteerd, uniek paar), `requested_by`, `status` (`pending`/`accepted`), `created_at`, `responded_at` | één rij per paar, voorkomt dubbele of wederzijdse rijen |
| `social_blocks` | `blocker`, `blocked`, `created_at` | blokkeren, los van vriendschap |
| `invite_codes` | `code` (hash, uniek), `owner`, `expires_at`, `revoked_at` | uitnodigingslinks; de code zelf staat alleen in de link, in de database staat alleen een hash |
| `score_summaries` | `user_id` (pk), `as_of` (datum), `score` (0–100), `rated_units`, `done_units`, `streak`, `active_habits`, `updated_at` | de gepubliceerde samenvatting, één rij per gebruiker |

### 5.2 Toegang (RLS en functies)
Het principe: **tabellen zijn dicht, toegang loopt via een paar kleine `security definer`-functies** (met vaste `search_path`), zodat gebruikers nooit direct in andermans rijen kunnen kijken of door lijsten bladeren.

| Functie | Doet |
|---|---|
| `social_enable(username, display_name)` / `social_disable()` | aan- en uitzetten, valideren, uniekheid |
| `social_find(username)` | geeft hooguit **één** rij `{ id, display_name }` terug bij exacte match; negeert geblokkeerden en niet-ingeschakelden; begrensd (§6) |
| `friend_request(user_id)` / `friend_respond(id, accept)` / `friend_remove(user_id)` | de vriendschapsstroom met alle controles (max. aantallen, blokkade, geen jezelf) |
| `invite_create()` / `invite_revoke(code)` / `invite_redeem(code)` | uitnodigingslinks |
| `block_user(id)` / `unblock_user(id)` | blokkeren |
| `leaderboard()` | jouw samenvatting + die van **geaccepteerde** vrienden die sociaal aan hebben; zonder e-mailadres of andere velden |
| `publish_summary(...)` | schrijft **jouw** `score_summaries`-rij, met bereikcontroles |

Direct select/insert/update/delete op deze tabellen: **geen enkele policy voor `anon`**; voor `authenticated` alleen wat de functies nodig hebben (of niets, met alles via functies). Het RLS-testscript krijgt uitgebreid met: niet-vriend kan niets lezen, vriend leest alleen de ranglijstvelden, geblokkeerde is onzichtbaar, `anon` kan niets, aantal-limieten werken, intrekken en verlopen werken, account verwijderen wist alles (cascade).

### 5.3 De samenvatting
```
{ as_of: "2026-10-15", score: 82, rated_units: 14, done_units: 11, streak: 9, active_habits: 5 }
```
Alleen getallen en een datum. Niets dat een habit identificeert. Het bestand `docs/DATAMODEL.md` wordt bijgewerkt met deze tabellen.

### 5.4 Lokaal
Het lokale deel is klein: de instelling "sociaal aan" (`settings`), een cache van de laatst opgehaalde ranglijst en vriendenlijst (alleen om offline te tonen) en een onthouden uitnodigingscode. De sociale gegevens **gaan niet door de sync-motor**: ze zijn niet van jou alleen en kennen andere conflictregels. De app praat er rechtstreeks met de server over, met een nette offline-toestand.

## 6. Privacy, veiligheid en AVG

### 6.1 Wat verandert
| Nieuw | Waar | Zichtbaar voor |
|---|---|---|
| gebruikersnaam | `social_profiles` | iedereen **die hem exact kent** (zoeken) |
| weergavenaam | `social_profiles` | jouw geaccepteerde vrienden (en wie jouw verzoek kreeg) |
| weekscore, reeks, aantal habits, bijgewerkt op | `score_summaries` | jouw geaccepteerde vrienden |
| wie er met wie bevriend is | `friendships` | alleen die twee |

Zichtbaar voor niemand: e-mailadres, habit-namen, notities, cues, "waarom", individuele check-ins, tijdstippen.

### 6.2 Maatregelen
1. **Opt-in** en een scherm dat vooraf uitlegt wat gedeeld wordt.
2. **Geen enumeratie**: zoeken kan alleen op exacte naam; het antwoord is altijd "gevonden" of "niet gevonden", ook als de gebruiker bestaat maar sociaal uit heeft of je geblokkeerd hebt. Zoeken en verzoeken zijn **begrensd** (voorstel: 20 zoekopdrachten per uur en 10 nieuwe verzoeken per dag per gebruiker), zodat raden niet werkt.
3. **Uitnodigingscodes** zijn lang (≥ 128 bit), worden alleen als hash opgeslagen, verlopen en zijn in te trekken.
4. **Blokkeren** is altijd mogelijk en laat de ander niets merken (zelfde "niet gevonden").
5. **Uitzetten of account verwijderen** wist profiel, samenvatting, uitnodigingen en vriendschappen (cascade); `delete_my_account()` blijft werken.
6. **Gebruikersnamen** worden gecontroleerd op een korte blokkadelijst; er zijn geen vrije profielteksten of foto's (klein aanvalsoppervlak).
7. **Frontend**: alle weergave via `textContent`/DOM-builders (bestaande guardrail), nooit `innerHTML` met namen van anderen.
8. De **privacyverklaring en voorwaarden** worden bijgewerkt (nieuwe gegevens, nieuwe categorie "andere gebruikers" als ontvangers, bewaartermijn: tot je het uitzet of je account verwijdert). **Minimumleeftijd**: de voorwaarden zeggen nu niets; zie §9 vraag 6.

### 6.3 AVG-kanttekening
Sociaal brengt gegevens van anderen op andermans scherm. Voor een hobbyproject met een kleine kring blijft dat hanteerbaar mits het opt-in is, het minimaal is en je het kunt stoppen. Het blijft een afweging van Remco als verantwoordelijke.

## 7. UX (voorstel, nog te ontwerpen)

### 7.1 Plek in de app
De navigatie heeft al **vijf items** (Vandaag, Habits, Voortgang, Prestaties, Instellingen): een zesde tabblad past krap op 360 px. Opties, zie §9 vraag 5:
- **A:** een zesde tabblad, met alleen een icoon of een korte naam;
- **B:** Vrienden bereikbaar vanaf **Voortgang** (een kaart/knop "Ranglijst") met een eigen route, zonder extra tabblad;
- **C:** "Prestaties" en "Vrienden" samenvoegen tot één item met twee tabs.

Mijn voorstel is **B**: de ranglijst is een extra laag op de voortgang, geen dagelijkse bestemming; zo blijft de navigatie schoon, en op desktop (zijbalk) is er ruimte voor een eigen item.

### 7.2 Schermen
1. **Uitleg + aanzetten** (bij eerste keer): wat vrienden zien, kies je gebruikersnaam, bevestig.
2. **Ranglijst** (hoofdscherm): lijst met jou gemarkeerd, rang, naam, score als getal én balk, reeks. Bovenaan wie je bent en je positie; onderaan "Vrienden toevoegen".
3. **Vrienden toevoegen**: zoekveld (exacte naam) + "Deel uitnodigingslink"; resultaat "Stuur verzoek".
4. **Verzoeken**: ontvangen (accepteren/weigeren/blokkeren) en verstuurd (intrekken), met een teller op het item.
5. **Vriendenlijst/beheer**: verwijderen en blokkeren, geblokkeerden beheren.
6. **Lege toestanden** (verplicht, zoals eerder): geen vrienden ("Nodig iemand uit"), alleen jij op de lijst, te weinig gepland, geen verbinding, niet ingelogd.

### 7.3 Eisen aan de uitvoering
- Alle teksten in `src/content/nl.js`; werkt in beide thema's (v0lky1, Mel) en op desktop (twee kolommen).
- **Toegankelijk:** de lijst is een geordende lijst (`<ol>`) met tekst ("2e, Anna, 82 procent, reeks 9"), de eigen regel is ook als tekst herkenbaar; geen betekenis in alleen kleur; ≥ 44 px tikvlak; 200% tekst zonder zijwaarts scrollen; lijstwijzigingen aangekondigd.
- **Prestaties:** de ranglijst is één verzoek; Vandaag mag er niet trager van worden (publiceren gebeurt op de achtergrond na sync).
- Zonder sociaal merkt de gebruiker niets: geen extra verzoeken, geen extra rekenwerk.

## 8. Niet-functioneel en kwaliteit
- **Domein** (score, venster, gelijke stand, te weinig data, dagwissel, pauze/overslaan, flexibele habits) puur en met tests, inclusief de randgevallen uit PLAN §4.8 waar relevant. Eén bron voor constanten (3 eenheden, 7 dagen, 3 dagen verouderd, 50 vrienden, enz.).
- **Server:** RLS-test uitgebreid (§5.2) in `supabase/tests/rls-check.mjs`, die in CI/`npm test` meedraait; migratie idempotent; functies met vaste `search_path`; geen service-sleutel nodig.
- **Guardrails:** geen `innerHTML`, geen service-sleutel, `svh`-regels, tikvlakken blijven gelden.
- **Browsertests** voor de flows (aanzetten, uitnodigen, accepteren, ranglijst, offline, blokkeren) op telefoon- en desktopformaat. Dit is het natuurlijke moment om de browsertests eindelijk **in de repository en in CI** te zetten (nu alleen lokaal): sociaal is te riskant om zonder vangnet te bouwen. Zie ook WERKWIJZE.
- **Achterwaarts compatibel:** de oude app (zonder sociaal) werkt ongewijzigd naast de nieuwe tabellen.

## 9. Open vragen voor Remco

1. **Weergavenaam.** Op de ranglijst: je voornaam (zoals de begroeting), of de gebruikersnaam? *Voorstel: voornaam, met de gebruikersnaam eronder in klein, zodat je weet wie wie is.* Zonder voornaam: de gebruikersnaam.
2. **Weekscore en flexibele habits.** Bij "2× per week" is de eenheid pas beoordeeld als de week voorbij is. Voorstel A: alleen afgesloten eenheden binnen 7 dagen tellen (eerlijk maar kan "schokkerig" zijn). Voorstel B: dezelfde dagelijkse voortgang als de weekstrook (gedaan ÷ gepland per dag) optellen over 7 dagen (voelt vloeiender, sluit aan bij wat je al ziet). *Ik beveel B aan; ik meet dan eerst op echte voorbeelddata of de uitkomsten redelijk zijn.*
3. **Verouderde score.** Hoe lang tot "verouderd" (voorstel: 3 dagen) en hoort een verouderde vriend nog in de lijst (voorstel: ja, onderaan)?
4. **Uitnodigingslink = automatisch vrienden?** Wie jouw link opent en inlogt: (a) wordt een *verzoek* dat jij accepteert (veiliger), of (b) is direct bevriend omdat jij de link zelf gaf (soepeler)? *Voorstel: (b) voor links, (a) voor zoeken op naam,* want de link is een bewuste uitnodiging; je kunt hem intrekken.
5. **Plek in de navigatie** (zie §7.1): *voorstel B, via Voortgang*.
6. **Minimumleeftijd en voorwaarden.** Wil je een leeftijdsgrens of een zin in de voorwaarden dat gebruikers elkaar fatsoenlijk behandelen? (Jij bent de verantwoordelijke; ik raad een korte zin + blokkeren aan.)
7. **Blokkadelijst voor gebruikersnamen**: simpele lijst van mij, of laat je die zelf invullen? (Voorstel: ik begin met een korte lijst, jij kunt aanvullen.)
8. **Testen met de gedeelde database.** De Supabase-database is productie. Migratie 0003 is additief en veilig, maar **de ranglijst proberen vraagt minstens twee accounts**. Wil je daarvoor een tweede (gratis) Supabase-project voor ontwikkeling (aanbevolen voor deze feature, zie WERKWIJZE), of werken we met twee testaccounts op productie? Eén extra gratis project verdient zich hier terug.

## 10. Mijlpalen en acceptatiecriteria (voorstel)

Alle werk op `feature/vrienden` (en korte `feature/*`-takken daarvan) → `develop`; pas na jouw akkoord een release naar `main` met tag `v1.1`.

| M | Inhoud | Klaar als… |
|---|---|---|
| **S0** | Dit document akkoord; vragen §9 beantwoord; dev-Supabase (vraag 8) beschikbaar | Jij zegt "ja, bouwen". |
| **S1** | Domein: weekscore, venster, tellingen, gelijke stand, tests | Alle regels uit §4 hebben groene tests; een meting op voorbeelddata is besproken. |
| **S2** | Server: migratie 0003, functies, RLS-tests, DATAMODEL bijgewerkt | RLS-testscript bewijst: niet-vriend ziet niets, vriend ziet alleen de ranglijstvelden, blokkeren/intrekken/verlopen/limieten/cascade werken. |
| **S3** | Data-laag en publiceren: remote-client, samenvatting na sync, offline cache | Publiceren gebeurt op de achtergrond; uit = niets verzonden (testbaar). |
| **S4** | UI: aanzetten, zoeken, link, verzoeken, ranglijst, lege toestanden, beide thema's, desktop | Browsertests groen op 360/390/412 px en desktop; a11y- en overflowrondes groen. |
| **S5** | Privacyverklaring, voorwaarden, in-app uitleg, PLAN en DATAMODEL bijgewerkt, browsertests in CI | Release-checklist uit WERKWIJZE doorlopen; test op twee echte telefoons; release `v1.1`. |

## 11. Risico's

| # | Risico | Maatregel |
|---|---|---|
| X1 | Gebruikerslijst afzoeken (enumeratie) of namen raden | exacte match, rate limit, uniform antwoord, geen autocomplete |
| X2 | Lastigvallen via verzoeken | blokkeren, limieten, intrekken, geen vrije tekst |
| X3 | Valsspelen met de score | aanvaard binnen vrienden; bereikcontroles; reeks en habit-aantal zichtbaar |
| X4 | Ranglijst demotiveert (altijd laatste staan) | wekelijks nieuw venster, percentage i.p.v. aantal, geen publieke positie bij anderen, uit te zetten |
| X5 | Productiedata raakt vermengd met testen | dev-Supabase of testaccounts (vraag 8); migratie additief |
| X6 | Privacyverklaring loopt achter op de feature | S5 is een voorwaarde voor release |
| X7 | Ontwikkelwerk groeit uit tot "sociaal netwerk" | §3.5 houdt scope klein; aanmoedigen/groepen later apart |
| X8 | Navigatie raakt overvol | voorstel B (via Voortgang) |
| X9 | Vrienden zonder account kunnen niet meedoen | uitleg en uitnodiging door inloggen; geen workaround |

## 12. Wat ik nog van jou nodig heb

Antwoorden op §9 (vooral 2, 4, 5 en 8), en een akkoord op S0. Daarna begin ik met S1 (het domein), omdat de score de kern is en die zonder server en zonder UI al te testen is.
