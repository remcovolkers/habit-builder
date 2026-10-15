# Habit Builder – Plan & Requirements

Status: concept, wacht op akkoord · Datum: 2026-10-15

## 1. Doel en scope

Een mobiel-eerst PWA waarmee je gewoontes bouwt: terugkerende habits met een cadence (dagelijks, wekelijks, maandelijks), een "Vandaag"-overzicht, een stapel oningeplande taken voor flexibele habits (bv. 2× per week) en ingebouwde gewoonte-theorie die laat zien hoe het met elke habit gaat, inclusief achievements.

**Vastgelegde keuzes**

| # | Keuze | Besluit |
|---|---|---|
| D1 | Stack | Vanilla JS (ES-modules), HTML, CSS. Geen frameworks, geen bouwstap. |
| D2 | Hosting | GitHub Pages (statisch), subpad `/habit-builder/`. |
| D3 | Backend | Supabase (Postgres, Auth, RLS, Edge Functions) op het gratis plan. |
| D4 | Data | **Offline-first**: lokaal in IndexedDB, op de achtergrond sync naar Supabase. |
| D5 | Gebruikers | **Meerdere gebruikers** (vrienden/familie). Strikte RLS, account verwijderen, geen sociale functies. |
| D6 | Taal | Nederlands. Alle teksten in `src/content/nl.js`, zodat een tweede taal later mogelijk blijft. |
| D7 | Meldingen | Ochtendherinnering via Web Push (Android/desktop). iOS-ondersteuning bewust later. |
| D8 | Design | Komt later (Moda). Nu: functionaliteit plus een design-token-laag zodat de skin los te wisselen is. |

## Voortgang

| Mijlpaal | Status |
|---|---|
| M0 skelet, CI, Pages | klaar |
| M1 domeinlogica + tests | klaar |
| M2 lokale UI (habits, Vandaag, stapel, backfill, undo) | klaar |
| Teller-habits (bv. 8 glazen water) en sjablonen | klaar |
| M6 (deels) Moda-design op de bestaande schermen, lokale fonts | klaar |
| M3 detailpagina (sterkte, fases, heatmap), tips, ingeburgerd-flow, achievements, automatisme, review, export/import | klaar |
| IndexedDB-migraties (v1 naar v2 naar v3) getest | klaar |
| M4 Supabase, auth (Google + e-mailcode), sync, keepalive | gebouwd; wacht op jouw Supabase-configuratie (zie docs/M4-SETUP.md) |
| M5 PWA (manifest, service worker, offline) | open |
| M7 ochtendherinnering (Web Push) | open |

## 2. Gewoontetheorie die in het product zit

- **66 dagen, niet 21 of 42.** Onderzoek (Lally et al., 2009): mediaan 66 dagen, spreiding 18–254 dagen. Eén gemiste dag schaadt het proces nauwelijks. De app gebruikt daarom een gewoontesterkte-score in plaats van harde streaks, en toont "dit duurt gemiddeld ~9 weken, jij zit op week X".
- **Fases** per habit: *Opstarten* (dag 1–21), *Opbouw* (22–66), *Ingeburgerd* (66+ en aan de criteria voldaan). Elke fase heeft eigen tips (bv. de dip in week 2–3).
- **Nooit twee keer achter elkaar missen:** na een gemiste dag wordt de eerstvolgende gelegenheid gemarkeerd als "herstelmoment".
- **Minimale versie** ("tweeminutenregel"): een afgeslankte variant voor slechte dagen. Telt als gedaan, gemarkeerd als minimaal.
- **Implementation intentions / habit stacking:** per habit een cue ("Na het ontbijt…") en een locatie of moment.
- **Identiteit en "waarom":** vrije tekst per habit, zichtbaar op de detailpagina en bij een gemiste dag.
- **Automatisme-zelfrapportage:** wekelijks "dit doe ik zonder erbij na te denken" (1–5), omdat automatisme het echte kenmerk van een gewoonte is.
- **Wekelijkse review:** korte reflectie ("wat ging goed / wat pas ik aan").

## 3. Functionele requirements

Prioriteit: **M** = must (v1), **S** = should (v1 als het past), **C** = could (later).

### 3.1 Habits beheren
| ID | Eis | Prio |
|---|---|---|
| F1 | Habit aanmaken, bewerken, pauzeren, archiveren, verwijderen (soft delete). Velden: naam, icoon/emoji, kleur, dagdeel (ochtend/middag/avond/overdag), startdatum, cue, "waarom", minimale versie, cadence. | M |
| F2 | Cadence-typen: **(a)** vaste weekdagen (incl. dagelijks, werkdagen), **(b)** N× per week, **(c)** vaste dag van de maand, **(d)** N× per maand. | M |
| F3 | Cadence wijzigen geldt vanaf een ingangsdatum en herschrijft de geschiedenis nooit (schema-versies). | M |
| F4 | Startdatum in de toekomst: de habit verschijnt pas vanaf die dag. | S |
| F5 | Optioneel doel met aantal ("8 glazen") naast simpel afvinken. | C |
| F6 | Habit-templates voor snelle start. | S |
| F7 | Volgorde van habits zelf instelbaar. | S |

### 3.2 Dagelijks gebruik
| ID | Eis | Prio |
|---|---|---|
| F10 | **Vandaag-scherm:** de habits die vandaag gepland staan, gegroepeerd per dagdeel, met afvinken, overslaan (met reden) of "minimale versie". | M |
| F11 | **Stapel "Oningepland deze week/maand":** flexibele habits met voortgang (1/2) en resterende dagen. Per item "neem mee in vandaag" (of kies een andere dag). | M |
| F12 | Mee-genomen items die niet afgerond worden vallen aan het eind van de dag terug in de stapel (afgeleid, niet gemuteerd) zolang de periode loopt. | M |
| F13 | Terugwerkend invullen en corrigeren tot 14 dagen terug; undo van de laatste actie. | M |
| F14 | Optionele notitie per check-in. | S |
| F15 | Pauzemodus (vakantie/ziekte) per habit of globaal. Gepauzeerde dagen tellen niet mee in noemer of teller. | M |
| F16 | Dag-navigatie (gisteren/morgen) en weekweergave. | S |

### 3.3 Voortgang, theorie, achievements
| ID | Eis | Prio |
|---|---|---|
| F20 | Per habit: gewoontesterkte (0–100), consistentie over de laatste 6 weken, huidige en beste reeks, totaal aantal keer gedaan, fase en dagnummer. | M |
| F21 | Heatmap-kalender en week/maand-overzicht. | M |
| F22 | Ingeburgerd-flow: de app *stelt voor* om een habit ingeburgerd te verklaren (criteria §4.5), de gebruiker bevestigt. Ingeburgerde habits kunnen in "onderhoud" blijven. | M |
| F23 | Achievements (§4.7) met een overzichtspagina en een viering bij het ontgrendelen. | M |
| F24 | Contextuele tips uit `tips.json` per fase en per situatie (na een gemiste dag, bij een dip). | S |
| F25 | Wekelijkse automatisme-vraag en wekelijkse review. | S |

### 3.4 Account, data, meldingen
| ID | Eis | Prio |
|---|---|---|
| F30 | Inloggen met e-mail + 6-cijferige code (zie risico R2). | M |
| F31 | Offline volledig bruikbaar; sync zodra er verbinding is; zichtbare synchronisatiestatus. | M |
| F32 | Export en import als JSON. | M |
| F33 | Account en alle data verwijderen vanuit de app. | M |
| F34 | Instellingen: dagwissel-uur (0–6 u), tijdzone, herinneringstijd. | M |
| F35 | Ochtendherinnering via Web Push (Android/desktop), met tijdstip per gebruiker. | S (mijlpaal 7) |
| F36 | Installeerbaar als PWA (manifest, icoon, offline shell, "nieuwe versie beschikbaar"). | M |

### 3.5 Niet-functioneel
- **Prestaties:** Vandaag-scherm interactief < 1 s na openen (met cache).
- **Toegankelijkheid:** semantische HTML, toetsenbord bruikbaar, contrast, `prefers-reduced-motion`, ≥ 44 px touch targets.
- **Beveiliging:** RLS op elke tabel, geen `innerHTML` met gebruikersdata (alleen `textContent`/DOM-builders), strikte CSP, service key staat nooit in de repo.
- **Privacy:** minimale data, notities zijn privé, volledige verwijdering mogelijk, korte privacyverklaring in de app.
- **Onderhoudbaarheid:** domeinlogica puur en getest; één bron voor constanten.

### Buiten scope voor v1
Sociale functies, native app, iOS-push, AI-coach, negatieve habits ("stoppen met X"), widgets, meerdere talen.

## 4. Domeinregels (de "ironclad" kern)

### 4.1 Tijd
- Logica werkt op **lokale datums als tekst** (`YYYY-MM-DD`), nooit op timestamps. Daarmee zijn zomertijd en tijdzones geen bron van bugs.
- "Vandaag" = huidige lokale tijd minus het dagwissel-uur (standaard **04:00**, instelbaar 0–6 u). Om 02:00 's nachts hoort een check-in dus nog bij de vorige dag.
- Week = maandag t/m zondag. Maand = kalendermaand.

### 4.2 Wanneer is een habit "gepland"?
- **Vaste weekdagen:** gepland op de gekozen weekdagen.
- **Dag van de maand X:** gepland op dag X; bij een kortere maand op de laatste dag. Blijft zichtbaar als "te laat" tot het einde van de maand; late afronding telt als gedaan.
- **N× per week/maand:** geen vaste dag, hoort in de stapel van die periode. Elke datum heeft maximaal één check-in per habit.

### 4.3 Eenheden en status
Elke habit levert per periode een rij **eenheden** op: een geplande dag (vaste dagen, dag-van-de-maand) of een periode (N×/week, N×/maand). Elke eenheid is: `gedaan`, `minimaal` (telt als gedaan), `overgeslagen` (buiten noemer en teller), `gepauzeerd` (idem) of `gemist`. Een lopende, nog haalbare eenheid is `open` en telt nog niet mee.

### 4.4 Streak en sterkte
- **Reeks:** opeenvolgende eenheden zonder `gemist`. Overgeslagen en gepauzeerde eenheden onderbreken niet. Bij flexibele habits is de eenheid de periode (week/maand).
- **Consistentie:** gedaan ÷ (gedaan + gemist) over het venster. Venster = laatste 42 dagen, bij maandelijkse habits minimaal de laatste 3 perioden.
- **Gewoontesterkte:** voortschrijdend gemiddelde over eenheden (`s = s·α + gedaan·(1–α)`). Eén gemiste dag verlaagt de score een beetje en reset niets. De parameters staan in één constantenbestand en worden met tests vastgepind.

### 4.5 Ingeburgerd
Voorstel zodra **alle** voorwaarden gelden:
1. ≥ 66 actieve dagen sinds de start (instelbaar per habit, gepauzeerde dagen tellen niet mee);
2. consistentie ≥ 80% over het venster uit §4.4;
3. indien de automatisme-vraag aan staat: laatste score ≥ 4.

De gebruiker bevestigt. Pas dan wordt de achievement ontgrendeld en verandert de status.

### 4.6 De stapel en de dag
- Een `day_plan` koppelt (habit, datum). Een plan zonder check-in op een verstreken datum verdwijnt uit Vandaag en de habit staat weer in de stapel (indien de periode loopt).
- Een check-in op een stapel-habit telt mee voor de periode waarin de *datum* valt.
- Aan het eind van een periode: quota niet gehaald → eenheid `gemist`.

### 4.7 Achievements (eerste set)
Eerste check-in · reeksen en dagen: 7/21/42/66/100/365 · perfecte week · *comeback* (weer begonnen na ≥ 7 dagen gemist) · eerste ingeburgerde habit · 3 habits tegelijk actief · 4 weken wekelijkse review. Ontgrendeling is deterministisch, wordt opgeslagen en kan niet "afgenomen" worden.

### 4.8 Randgevallen die expliciet getest worden
Maand met 28/29/30/31 dagen en dag-van-de-maand 31; week- en maandwissel; zomer-/wintertijd; dagwissel-uur; cadence-wijziging halverwege een week; pauze die een periode overspant; backfill over een periodegrens; dubbele check-in op dezelfde datum (offline op twee apparaten); habit met startdatum in de toekomst; ingeburgerd met onderhoudsmodus.

> **Afwijking van dit hoofdstuk (besloten in M4):** op de server staat niet per soort record een tabel, maar één tabel
> `public.records` (`user_id`, `collection`, `id`, `data jsonb`, `deleted_at`, `seq`). Dat scheelt SQL en migraties
> zodra de app verandert, en de server hoeft de records niet te begrijpen: de app is offline-first en de bron van waarheid
> staat lokaal. Strikte RLS per gebruiker staat in `supabase/migrations/0001_init.sql`. De tabellen hieronder beschrijven
> de records zoals de app ze gebruikt.

## 5. Datamodel (Supabase / Postgres, spiegel in IndexedDB)

Alle tabellen hebben client-gegenereerde `id uuid`, `user_id`, `created_at`, `updated_at` (server-trigger) en `deleted_at` (soft delete voor sync). RLS: `user_id = auth.uid()` voor select, insert, update en delete.

| Tabel | Belangrijkste kolommen |
|---|---|
| `profiles` | `user_id`, `display_name`, `timezone`, `day_start_hour`, `reminder_time`, `reminder_enabled` |
| `habits` | `name`, `icon`, `color`, `daypart`, `start_date`, `status` (planned/active/graduated/archived; "gepauzeerd" is afgeleid uit `habit_pauses`), `end_date`, `maintenance`, `cue`, `why`, `minimal_version`, `graduation_days` (66), `graduated_at`, `sort_order` |
| `habit_schedules` | `habit_id`, `effective_from`, `schedule` jsonb (`type`, `weekdays[]`, `count`, `period`, `day_of_month`) |
| `habit_pauses` | `habit_id`, `from_date`, `to_date` (null = lopend) |
| `check_ins` | `habit_id`, `date`, `status` (done/minimal/skipped), `value`, `note` – **unique (habit_id, date)**. Lokaal is de sleutel de combinatie van habit-id en datum; bij sync wordt op (habit_id, date) ge-upsert. |
| `day_plans` | `habit_id`, `date` – unique (habit_id, date) |
| `automaticity_ratings` | `habit_id`, `week_start`, `score` 1–5 |
| `weekly_reviews` | `week_start`, `went_well`, `adjust` |
| `achievements_unlocked` | `key`, `habit_id` (nullable), `unlocked_at` – unique (user_id, key, habit_id) |
| `push_subscriptions` | `endpoint`, `keys` jsonb, `user_agent`, `last_notified_date` |

**Sync-strategie:** lokale schrijfacties gaan eerst naar IndexedDB en in een outbox-wachtrij. Een sync-lus pusht de outbox (upsert; bij `check_ins` en `day_plans` op de unieke sleutel) en pullt daarna alles met `updated_at > last_sync`. Conflicten: last-write-wins per rij. Afgeleide waarden (reeksen, sterkte, achievements-kandidaten) worden nooit gesynct maar altijd uit check-ins berekend.

## 6. Architectuur en bestandstructuur

```
habit-builder/
├─ index.html · manifest.webmanifest · sw.js
├─ src/
│  ├─ main.js · router.js (hash-router) · config.js
│  ├─ domain/          pure functies, geen DOM, geen opslag
│  │   ├─ dates.js · schedule.js · units.js · streaks.js
│  │   ├─ strength.js · phases.js · graduation.js · achievements.js
│  │   └─ constants.js
│  ├─ data/
│  │   ├─ repository.js (interface) · local-store.js (IndexedDB)
│  │   ├─ supabase-store.js · sync.js · auth.js · export.js
│  ├─ ui/
│  │   ├─ views/       today, pool, habits, habit-detail, stats, achievements, review, settings, login
│  │   ├─ components/  habit-card, heatmap, progress-ring, dialog, toast
│  │   └─ dom.js · state.js
│  └─ content/         nl.js, tips.json, achievements.json, templates.json
├─ styles/             tokens.css, base.css, components/, views/
├─ vendor/             supabase-js (vastgepind)
├─ supabase/
│  ├─ migrations/      SQL + RLS-policies
│  └─ functions/       delete-account, send-morning-reminders
├─ tests/              node:test voor domain/ en sync-logica
├─ tools/serve.mjs     dev-server zonder dependencies
├─ docs/               PLAN.md, DATAMODEL.md
└─ .github/workflows/  deploy.yml (test → Pages), keepalive.yml
```

**Principes**
- `domain/` kent geen `window`, geen `fetch` en geen opslag. Dat maakt de logica testbaar en deelbaar met Edge Functions.
- UI praat uitsluitend met `data/repository.js`. Supabase is een adapter erbij.
- Alle paden relatief; `start_url` en `scope` van de PWA zijn `./`.
- Service worker: versioned app-shell-cache, netwerk-eerst voor data, duidelijke update-melding.
- Styling uitsluitend via CSS-variabelen in `tokens.css` en semantische klassen, zodat het Moda-design er zonder herbouw in past.
- `package.json` bevat alleen scripts (`test`, `serve`), geen dependencies.

## 7. Mijlpalen en acceptatiecriteria

| M | Inhoud | Klaar als… |
|---|---|---|
| **M0** | Repo-skelet, dev-server, CI, Pages-deploy, lege app-shell | Lege app staat live op GitHub Pages; `npm test` draait in CI. |
| **M1** | `domain/` + tests | Alle regels uit §4 en alle randgevallen uit §4.8 hebben groene tests. |
| **M2** | Lokale UI: habits CRUD, Vandaag, stapel, backfill, undo (IndexedDB) | Volledige dagelijkse flow werkt zonder internet. |
| **M3** | Stats, fases, tips, ingeburgerd-flow, achievements, review, export/import | Per habit zichtbaar hoe het gaat; achievements ontgrendelen correct. |
| **M4** | Supabase: migraties, RLS, auth (e-mail-OTP), sync, account verwijderen | Twee apparaten synchroniseren; een andere gebruiker kan nooit mijn data lezen (RLS-test). |
| **M5** | PWA: manifest, service worker, installeerbaar, update-flow | Installeerbaar op Android; werkt in vliegtuigmodus; update wordt aangeboden. |
| **M6** | Design-integratie (Moda) en polish | Tokens vervangen, componenten gestyled, a11y-check. |
| **M7** | Web Push ochtendherinnering | Android ontvangt op het ingestelde tijdstip een melding met "x vandaag, y in de stapel". |

M7 staat achteraan, omdat push een Edge Function, VAPID-sleutels en pg_cron vraagt. Een korte spike bevestigt vooraf welke web-push-bibliotheek in Edge Functions werkt.

## 8. Risico's en maatregelen

| # | Risico | Maatregel |
|---|---|---|
| R1 | Gratis Supabase pauzeert een project na ~7 dagen zonder activiteit. | `keepalive.yml` pingt dagelijks via een GitHub Action. Actuele limieten controleren bij het aanmaken. |
| R2 | Magic links openen in Safari en niet in de geïnstalleerde PWA (sessie kwijt). De ingebouwde Supabase-mail is zwaar rate-limited en bedoeld voor testen, dus onbruikbaar voor meerdere gebruikers. | E-mail + 6-cijferige code in plaats van een link. Eigen SMTP (bv. Resend/Brevo, gratis laag) instellen vóór M4-oplevering. |
| R3 | Anon key staat publiek in de repo. | Normaal bij Supabase, mits RLS klopt: RLS-tests in M4, nooit de service key committen. |
| R4 | Gratis plan heeft geen downloadbare back-ups. | JSON-export (F32). |
| R5 | Sync-conflicten bij offline gebruik op twee apparaten. | Unieke (habit, datum), last-write-wins, afgeleide data nooit synchroniseren. |
| R6 | GitHub Pages heeft geen SPA-fallback en draait op een subpad. | Hash-routing, relatieve paden. |
| R7 | Cadence-wijzigingen vervuilen de geschiedenis. | Schema-versies met ingangsdatum (F3). |
| R8 | Veel gebruikersdata in vanilla JS geeft XSS-risico. | Geen `innerHTML` met gebruikersdata, CSP, lint-regel/check in CI. |
| R9 | Meerdere gebruikers brengt AVG-verplichtingen met zich mee. | Dataminimalisatie, accountverwijdering, korte privacyverklaring, geen tracking. |

## 9. Wat ik van jou nodig heb
1. Supabase-project aanmaken (alleen de **URL** en **anon key** delen, nooit de service-key).
2. GitHub-repo (naam bepaalt het Pages-subpad) en Pages op "GitHub Actions" zetten.
3. Een SMTP-keuze (voorstel: Resend) vóór M4.
4. ~~Bevestiging aannames §4~~ Bevestigd: weekstart maandag, **dagwissel standaard 04:00**, 80%/66 dagen voor ingeburgerd.
5. De Moda-uitvoer (tokens en componenten) zodra die er is, uiterlijk bij M6.
