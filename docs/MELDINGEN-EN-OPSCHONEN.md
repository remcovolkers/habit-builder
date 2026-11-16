# Meldingen en opschonen: voorstel

Status: stap 1 (§1 en §2) is **gebouwd**. Van de meldingen (§3 en §4) is **16 november 2026** een eerste deel gebouwd, zie §4.5; de rest is nog voorstel. Gebaseerd op de code op `develop` (na de Android-app, versie 1.3).

**Besluiten van Remco**

- Avondcheck: standaard **uit**, aan te zetten.
- "Terugblik staat klaar": een **losse** melding (niet in de ochtendmelding).
- Tijdzone: **automatisch** van het toestel.
- Dubbele melding Chrome en app: alleen een **hint**, geen knop die de browserherinnering verwijdert (zie §1, de reden staat daar).
- Nog open: aantal momenten, per dagdeel, sluit-bijna-tijd, "Plan je week" (§5).

Drie onderwerpen, in de volgorde waarin ik ze zou bouwen:

1. De app hoeft niets te zeggen over installeren of een PWA als je de app al hebt (§1).
2. Instellingen is op een paar plekken te technisch (§2).
3. Meer meldingen: meerdere momenten per dag, en de week- en maandreview (klaar, en bijna dicht) (§3 en §4).

---

## 1. "PWA" weglaten in de app

**Wat er nu gebeurt.** In de Android-app denkt de code dat hij nog *niet geïnstalleerd* is: `pwa.installed` kijkt naar `display-mode: standalone`, en dat is in de app-webweergave niet zo. Daardoor lekt er op drie plekken installatie-uitleg door:

| Waar | Wat de gebruiker ziet | Nu |
|---|---|---|
| Onboarding (`welcome.js`, `hasInstallStep`) | Een stap "Zet de app op je beginscherm" met "Open het menu van je browser, kies App installeren…", en "Liever later? Je vindt dit onder Instellingen, bij App installeren" | **Zichtbaar in de app.** Onzin: je zit al in de app. |
| Instellingen (`install-card.js`) | De kaart "App installeren" | Alleen verborgen omdat de browsergebeurtenis (`beforeinstallprompt`) in de app nooit komt. Toeval, geen regel. |
| Meldingen (`reminder-card.js`) | "Heb je de herinnering ook in Chrome aan staan?", en bij een niet-ondersteunde browser "Op Android werkt het in Chrome" | Eén zin nuttig (dubbele melding), de rest hoort er niet. |

Het woord "PWA" zelf staat nergens in de zichtbare teksten; het gaat om de installatie-uitleg eromheen.

**Voorstel.** Eén regel in `src/pwa.js`: `pwa.installed` is ook waar als `isNativeApp()`. Dan verdwijnen de onboardingstap en de kaart vanzelf (en blijft de rest van de onboarding op drie stappen), en de batterijstap "doe dit ook voor Chrome" verdwijnt ook. Daarbovenop:

- de teksten die over Chrome of de browser gaan krijgen een app-variant of vallen weg (de lijst hierboven);
- de melding over dubbele herinneringen wordt slim: de app kijkt (de tabel staat onder jouw account, RLS laat je eigen rijen lezen) of er ook een **web**-herinnering voor jouw account bestaat, en toont de hint alleen dan. **Geen knop** die de web-herinnering uitzet: de server weet niet of die rij van deze telefoon of van je laptop is, en je zou dan per ongeluk de laptop uitzetten. (Later kan de app bij elke rij een apparaatnaam bewaren; dan kan zo'n knop wel.) Geen vage waarschuwing meer voor wie alleen de app gebruikt;
- tests: de onboarding heeft in de app drie stappen, en Instellingen toont geen installatiekaart (met de nagebootste Capacitor die we al hebben).

Wat ik **niet** doe: de PWA zelf (Chrome, iOS) aanpassen. Daar blijft de installatie-uitleg gewoon staan.

**Omvang:** klein, ongeveer een halve dag inclusief tests.

---

## 2. Instellingen: te technisch?

Ik heb de teksten en onderdelen doorgelezen, niet de schermen zelf; kijk er zelf ook even naar op je telefoon. Mijn oordeel per onderdeel:

| Onderdeel | Oordeel | Voorstel |
|---|---|---|
| **Tijdzone** (keuzelijst met zo'n 400 namen als `Europe/Amsterdam`) | Het meest technisch, en bijna niemand hoeft hem te wijzigen | Een regel "Tijdzone: Amsterdam (van je telefoon)" met een kleine knop "Wijzigen". De app stelt hem zelf in vanaf het toestel; verandert die (je reist), dan vraagt de app "Je tijdzone lijkt veranderd. Overnemen?". Dit raakt ook de meldingen: die gaan op jouw lokale tijd. |
| **"Een nieuwe dag begint om"** | Begrijpelijk, maar de naam is abstract | Blijft, met de bestaande uitleg, onder een kopje "Jouw dag" samen met de tijdzone. |
| **Ochtendherinnering: privacyalinea** ("Firebase Cloud Messaging", "de server kent je voornaam, je tijdstip en tijdzone…") | Te veel techniek op de plek waar je iets aan zet | Eén menselijke zin ("Je krijgt een melding; je habitnamen blijven op je telefoon") en een link naar de Privacyverklaring, waar de details al staan. |
| **Batterij-uitleg** ("Onbeperkt", "Pauzeer app-activiteit") | In de app niet nodig (FCM met hoge prioriteit; de popup is al weg) | In de app verbergen; alleen tonen als blijkt dat meldingen te laat komen. In Chrome blijft hij. |
| **Notitie over Chrome** | Zie §1 | Alleen tonen als er echt een web-herinnering bestaat. |
| **Gegevens (back-up)**: "Je gegevens staan op dit apparaat… JSON" | Klopt niet voor wie ingelogd is (die synchroniseert) en noemt een bestandsformaat | Twee varianten van de tekst (met en zonder account), de foutmeldingen zonder "JSON", en het blok onder een uitklapper "Back-up". |
| Account, Uiterlijk, Zo werkt het, Feedback, Privacy, versieregel | Prima | Ongewijzigd. De ontwikkelaarsopties blijven achter zeven tikken. |

**Voorgestelde volgorde in de kolommen:** Account · **Meldingen** · Uiterlijk · **Jouw dag** (tijdzone, begin van de dag) · Gegevens (ingeklapt) · Hulp en info (Zo werkt het, Feedback, Privacy, versie).

**Omvang:** klein tot middel, een halve tot een hele dag. Het meeste is tekst en volgorde; de tijdzoneregel vraagt een beetje logica.

---

## 3. Meldingen: wat er nu is, en wat niet klopt

Nu: **één tijdstip per apparaat** (`push_subscriptions.remind_time`), **één melding per dag** (`last_notified_date`), de tekst wordt op de server gemaakt uit een samenvatting per dag (`[gepland, stapel, aandacht, review, maandreview]`) die de app meestuurt. De server kent geen habitnamen.

**Een bevinding die ook zonder de nieuwe wensen gefixt moet worden.** De reviewmeldingen volgen de reviewvensters niet:

| | Venster in de app (`domain/reviews.js`) | Wat de melding nu doet |
|---|---|---|
| Weekreview | opent **zondag 18:00**, sluit **maandag 23:59** (sinds 16 nov 2026; eerder vrijdag t/m maandag 12:00) | meldt alleen op **maandag** (de ochtend, de week ervoor) |
| Maandreview | opent op de **25e**, sluit op de **2e 12:00** | meldt alleen op de **laatste dag** van de maand |

Je hoort dus niet dat hij opent, en niet dat hij bijna sluit. Dat past precies bij jouw wens.

---

## 4. Het voorstel voor meldingen

### 4.1 De momenten

| Melding | Wanneer | Alleen als | Voorbeeld | Tik opent | Kanaal (Android) |
|---|---|---|---|---|---|
| **Ochtend** (bestaat al) | elke dag, jouw tijd, standaard 08:00 | er iets te doen is | "Vandaag staan 3 gewoontes op je lijst." | Vandaag | Ochtendherinnering |
| **Avondcheck** (nieuw, standaard uit) | elke dag, jouw tijd, standaard 20:00 | er nog iets **open** staat | "Nog 2 te doen vandaag." | Vandaag | Wat staat er nog open |
| **Extra moment** (nieuw, standaard uit) | jouw tijd | zelfde soort als de avondcheck | "Nog 3 te doen." | Vandaag | Wat staat er nog open |
| **Terugblik staat klaar** (los, besloten) | week: **zondag** 18:00 (zodra hij opent), maand: **de 25e** 09:00 | de review nog niet is ingevuld | "Je weekterugblik staat klaar." | Voortgang, bij die review | Terugblik |
| **Terugblik sluit bijna** | **24 uur van tevoren** past niet meer bij de week (dat is zondag 23:59): voorstel week **maandag 12:00**, maand **de 1e 12:00** | de review nog niet is ingevuld | "Je weekterugblik sluit vandaag om 23:59." | Voortgang, bij die review | Terugblik |

Ontwerpkeuzes:

- **Stil als er niets te melden is.** De avondcheck komt alleen als er nog iets open staat. Is alles gedaan, dan geen melding: een melding die zegt "je bent klaar" is ruis.
- **Meerdere momenten = een lijstje met aan/uit en een tijd per moment**, hoogstens drie per dag. Geen vrije agenda.
- **Eigen Android-kanalen** (Ochtend, Wat staat er nog open, Terugblik). Zo kun je in de Android-instellingen één soort dempen of het geluid per soort anders zetten zonder de app aan te raken. Dat is precies waar een echte app beter in is dan Chrome.
- **Per dagdeel** (ochtend/middag/avond-habits, zoals tandenpoetsen) kan later, maar niet in de eerste versie: de samenvatting moet dan de open taken per dagdeel meesturen. Eerst het totaal.
- De vensters zijn **vast** (maandag 12:00 en de 1e 12:00); ze volgen uit het reviewvenster, daar valt niets in te stellen.
- "Terugblik staat klaar" komt **los** (besloten), op zondag om 18:00 en de 25e om 09:00, ook als de ochtendmelding om 08:00 al binnenkwam. De ochtendmelding bevat dus niet langer de reviewregel.

### 4.2 Techniek

**Samenvatting.** Per dag komen erbij: `nog open` (voor vandaag: gepland min gedaan; de app werkt de samenvatting binnen een paar seconden bij zodra je iets afvinkt), de status van de weekreview (`opent` op vrijdag, `sluit` op zondag) en van de maandreview (de 25e en de 1e), steeds alleen als nog niet ingevuld. Dat blijft ver onder de grens van 4000 bytes die de tabel nu heeft; voor de zekerheid zet ik de velden in een kortere vorm en test ik de grootte met de langste maand.

**Opslag: een nieuwe tabel in plaats van meer kolommen.** Eén rij per toestel per moment:

```
reminder_moments(id, subscription_id → push_subscriptions (on delete cascade), slot, kind, remind_time, enabled, last_key)
unique (subscription_id, slot)
```

`last_key` is wat er het laatst gemeld is: een datum voor de dagmomenten, een periode (`week:2026-10-26`, `month:2026-10`) voor de terugblik. De server claimt per rij, net als nu per toestel, dus twee gelijktijdige runs sturen niets dubbel. Een extra JSON-kolom zou het claimen veel lastiger maken. De bestaande kolommen `remind_time` en `last_notified_date` blijven staan: een oudere appversie schrijft die nog, en de server behandelt dat als het ochtendmoment. Het wordt dus een **additieve migratie 0010** (de huidige app merkt er niets van, zoals bij 0009).

**Server.** `send-reminders` loopt elke 5 minuten (ongewijzigd) en beoordeelt per moment "is het aan de beurt?" met een eigen uitstelmarge per soort (ochtend 180 min zoals nu, avond 120, terugblik sluit 60: te laat melden heeft geen zin). Tekst per soort, boodschap met het juiste kanaal en een eigen `collapse_key`, zodat een avondmelding de ochtendmelding niet vervangt. Dezelfde route werkt voor Web Push en FCM.

**App.** De kaart "Meldingen" wordt een lijst momenten met een schakelaar en een tijd, de testknoppen (ontwikkelaarsopties) kunnen per soort testen, en `createChannel` maakt de drie kanalen. Bestaande gebruikers houden hun ochtendherinnering precies zoals hij was.

### 4.5 Wat er nu is: avondmelding en weekreview-meldingen (16 november 2026)

Een kleinere variant van §4.2, zonder de tabel met momenten, voor drie vaste meldingen. Migratie **0012** (`0012_extra_reminders.sql`) voegt per apparaat toe: `notify_evening`, `notify_review` (aan/uit, standaard uit) en drie claimkolommen `last_evening_date`, `last_review_open`, `last_review_closing`.

| Melding | Wanneer | Tekst | Tik opent |
|---|---|---|---|
| **Avond** (aan/uit) | elke dag 23:00, tot 24:00 | "Laatste sprintje?" met "Nog 2 taken te doen vandaag." als er nog taken open staan; anders "Wil je je dag afsluiten?" als je dag nog geen reflectie heeft; anders **niets** | Vandaag |
| **Weekreview open** (aan/uit, samen met de volgende) | zondag 18:00, tot 20:00 | "Weekreview staat vanaf nu open", alleen als hij nog niet is ingevuld | Voortgang, die week |
| **Weekreview sluit bijna** | maandag 23:30, tot 23:58 | "Weekreview staat nog open", alleen als hij nog niet is ingevuld | Voortgang, de week van gisteren |

- De tijden zijn vast (lokale tijd van het toestel). Het schakelen doe je per toestel onder Instellingen → Ochtendherinnering → "Meer meldingen".
- Staan de reviewmeldingen aan, dan zit de weekreview niet meer in de ochtendmelding.
- De app stuurt per dag drie getallen méér mee in de samenvatting: `nog open`, `dag niet afgesloten`, `weekreview klaar` (`src/app/reminder.js`). De server kent nog steeds geen habitnamen.
- Elke soort heeft een eigen `tag` (een nieuwe avondmelding vervangt de ochtendmelding niet) en een eigen levensduur (avond 2 uur, review open 3 uur, sluit bijna 25 minuten: een melding na sluiting heeft geen zin).
- Alles gaat nog via het ene Android-kanaal "Ochtendherinnering". Aparte kanalen per soort (zodat je er één in Android kunt dempen) kan later; dan moet de app die kanalen eerst aanmaken.
- Testen: met ontwikkelaarsopties aan staan onder de kaart drie knoppen die de echte tekst van elke melding sturen, ook als er nu niets te melden is.
- Uitrollen: **eerst migratie 0012, dan de Edge Function, dan de app**. Een oudere app schrijft de kolommen niet: alles blijft dan uit.

### 4.3 Tests

- `isDue` en de teksten per soort (zuivere functies), met de reviewvensters als bron zodat melding en venster nooit uit elkaar lopen (een test die voor elke dag van een jaar controleert dat "sluit bijna" precies 24 uur voor de sluiting valt, ook bij zomer- en wintertijd);
- de samenvatting rond de maandwisselingen (28/29/30/31 dagen);
- migratie en RLS met de bestaande Postgres-in-Node-aanpak (iemand kan andermans momenten niet lezen of wijzigen);
- de functie met een nagebootste FCM (het bestaande patroon): stil bij "alles gedaan", niet dubbel claimen, juiste kanaal;
- op de telefoon met "Testmelding over 15 seconden" per soort.

### 4.4 Volgorde (elke stap los te leveren)

1. §1 en §2: de app opruimen (klein, geen server).
2. De reviewmeldingen op de echte vensters zetten, zonder nieuwe tabel: de bestaande vlaggen verschuiven naar de vensters (de weekvlag staat sinds 16 nov 2026 op maandag; de 25e volgt). Verbetert meteen wat nu niet klopt.
3. Migratie 0010 en de server omzetten naar momenten, **zonder gedragsverandering** (alleen het ochtendmoment).
4. De avondcheck en het extra moment (nieuw).
5. "Terugblik sluit bijna" (vraagt stap 3 omdat er twee meldingen op één dag kunnen komen).

Rolloutvolgorde bij een release is zoals altijd: eerst de migratie, dan de functie, dan de app.

---

## 5. Wat ik van jou nodig heb

1. **Avondcheck:** standaard **uit** (opt-in) of aan? Tijd 20:00? Stil als alles klaar is? Mijn advies: uit, 20:00, stil bij klaar.
2. **Hoeveel momenten**: genoeg met ochtend + avond + één extra, of wil je echt een vrij aantal (dan maximaal drie, om niet te veel in de weg te zitten)?
3. **Per dagdeel** (bijvoorbeeld "tandenpoetsen avond" om 21:00): nu niet, later pas? Mijn advies: later.
4. **Terugblik staat klaar** in de ochtendmelding (één melding op vrijdag en de 25e) of altijd los? Mijn advies: in de ochtend meenemen, los om 09:00 als de ochtend uit staat.
5. **Sluit bijna:** het reviewvenster van de week sluit nu maandag 23:59; "24 uur ervoor" zou zondag 23:59 zijn, midden in de nacht. Voorstel: maandag 12:00 (week) en de 1e 12:00 (maand), of een vast avonduur (bijvoorbeeld maandag 19:00)?
6. **"Plan je week"** (je flexibele taken plannen) als wekelijkse melding, bijvoorbeeld zondagavond? Dat zou een zesde melding zijn; ik heb het niet meegenomen.
7. **Tijdzone automatisch** van je telefoon (met een vraag als hij verandert) in plaats van een keuzelijst?
8. **Dubbele melding Chrome en app:** de app mag de web-herinnering van je account met een knop uitzetten (voorstel in §1), akkoord?
