# Datamodel

Hoe de gegevens er in de app en op de server uitzien. De bron van waarheid staat **lokaal** (IndexedDB); de server is een gedeelde kopie per gebruiker. Afgeleide waarden (reeksen, sterkte, consistentie, fase, prestaties-kandidaten, herstelmoment, overzichten) worden **nooit opgeslagen**: ze worden altijd uit de check-ins berekend.

## Opslag lokaal (IndexedDB, versie 5)

Eén object store per soort record. Alle records hebben `id`, `createdAt`, `updatedAt` en `deletedAt` (zacht verwijderen, zodat sync een verwijdering kan doorgeven).

| Collectie | Sleutel (`id`) | Inhoud |
|---|---|---|
| `settings` | `user` | `timezone`, `dayStartHour` (0–6, standaard 4), `displayName`, `nameAsked`, `theme` |
| `habits` | uuid | `name`, `icon`, `color` (`c1`–`c8`), `daypart` (`morning`/`afternoon`/`evening`/`anytime`), `dayparts` (optioneel: twee of drie van `morning`/`afternoon`/`evening`, op volgorde van de dag; `daypart` is dan het eerste, zodat oudere appversies blijven werken. Alleen bij vaste weekdagen en zonder teller), `status` (`planned`/`active`/`graduated`/`archived`), `startDate`, `endDate`, `cue`, `why`, `minimalVersion`, `graduationDays` (standaard 66), `maintenance`, `sortOrder`, `counter` (`{ unit, target }`, optioneel), `noPlanWeeks` (optioneel: de maandagen van de weken waarvoor de gebruiker bij Plan je week "Niet in deze week" koos, de lopende en de volgende kunnen allebei staan; alleen die weken geen herinnering. Het oudere `noPlanWeek`, één maandag, telt nog mee en gaat weg zodra de keuze wordt aangepast), `trials` (optioneel: proeven "zonder app", een lijst `{ period` (`week`/`month`)`, start, end, result` (`null`/`passed`/`failed`)`, answeredOn }`; zie [AUTOMATISME.md](AUTOMATISME.md)), `schedules` |
| `checkIns` | `habitId\|datum` | `habitId`, `date`, `status` (`done`/`minimal`/`skipped`/`partial`/`wont`; `wont` is "ga ik niet doen": telt als gemist, zie [WONT-DO.md](WONT-DO.md)), `note` (max. 200 tekens, ook de reden bij overslaan), `value` (teller, of het aantal gedane dagdelen), `parts` (optioneel, bij een habit met meerdere dagdelen: welke dagdelen gedaan zijn; de dag is `done` als alle gedaan zijn en anders `partial`, zoals bij een teller) |
| `pauses` | uuid | `habitId`, `from`, `to` (`null` = lopend) |
| `dayPlans` | `habitId\|datum` | `habitId`, `date`: een flexibele habit die voor die dag is meegenomen |
| `achievements` | `sleutel\|habitId` | `key`, `habitId` (of `null`), `date`; eenmaal ontgrendeld blijft zo |
| `ratings` | `habitId\|weekStart` | `habitId`, `weekStart`, `score` (1–5, automatisme), `cues` (optioneel: wat hielp, een lijst uit `reminder`/`app_plan`/`routine`/`someone`/`nothing`; `nothing` staat alleen). Zie [AUTOMATISME.md](AUTOMATISME.md) |
| `reviews` | `weekStart` of `month:YYYY-MM` | Twee soorten in één collectie. **Week:** `weekStart`, `wentWell`, `wentBad` (max. 1000 tekens elk; oudere records hebben nog `adjust`, dat de app niet meer toont). **Maand:** `period: 'month'`, `monthStart`, `adjust` ("Wat pas ik aan?", max. 1000 tekens) en `appliedAt` (datum of `null`): het afvinken van de eenmalige taak die op de eerste van de volgende maand op Vandaag komt en blijft staan tot hij is afgevinkt. Een **weekreview** is open van vrijdag 00:00 tot de maandag erna 12:00, een **maandreview** van de 25e 00:00 tot de 2e van de volgende maand 12:00 (lokale tijd van de gebruiker); daarbuiten kan er niets worden ingevuld of gewijzigd (`domain/reviews.js`, `saveWeeklyReview`/`saveMonthlyReview`). De taak zelf wordt niet opgeslagen maar afgeleid. Een week hoort bij de maand waarin zijn donderdag valt |
| `reasons` | `habitId\|datum` | `habitId`, `date` (de dag van de reactie), `reason` (`no_time`/`no_money`/`forgot`/`no_motivation`/`busy_sick`/`wrong_rhythm`/`other`), `note` (optioneel, max. 200 tekens), `plan` (optioneel, max. 200 tekens, alleen bij "ga ik niet doen": wat je doet zodat je het niet nog eens hoeft te falen): waarom een taak bleef liggen of is opgegeven. Een reactie dekt de signalen die op of vóór die dag begonnen (PLAN §4.9) |
| `appointments` | uuid | Een losse afspraak, geen habit: `title` (1–80 tekens), `date`, `daypart` (`morning`/`afternoon`/`evening`/`anytime`), `doneOn` (de dag waarop hij is afgevinkt, of `null`). Staat op Vandaag in zijn dagdeel; een open afspraak van een eerdere dag schuift stil door naar vandaag. Telt nergens mee (punten, prestaties, aandacht, ranglijst). Zie [LOSSE-AFSPRAKEN.md](LOSSE-AFSPRAKEN.md) |
| `outbox` | `collectie\|id` | wat nog naar de server moet (met een `rev` die bij elke wijziging verandert) |
| `meta` | `sync` | `userId`, `cursor` (laatste `seq` van de server), `lastSyncAt` |

**Schema's** (`habits.schedules`): een lijst `{ effectiveFrom, schedule }`. Een cadence-wijziging voegt een versie toe en herschrijft de geschiedenis nooit. `schedule` is een van:

| `type` | Velden |
|---|---|
| `weekdays` | `weekdays`: lijst van 0 (ma) t/m 6 (zo) |
| `times_per_period` | `period` (`week`/`month`), `count` |
| `day_of_month` | `day` (1–31; in een kortere maand de laatste dag) |

**Datums** zijn tekst (`YYYY-MM-DD`), nooit timestamps: zomertijd en tijdzones zijn daarmee geen bron van fouten. "Vandaag" is de lokale tijd minus `dayStartHour`. Een week loopt van maandag t/m zondag.

## Server (Supabase)

### `public.records`

Eén tabel voor alle bovenstaande collecties (zie `supabase/migrations/0001_init.sql`):

| Kolom | |
|---|---|
| `user_id` | eigenaar (`auth.uid()`), onderdeel van de sleutel |
| `collection` | een van `settings`, `habits`, `checkIns`, `pauses`, `dayPlans`, `achievements`, `ratings`, `reviews`, `reasons` (sinds `supabase/migrations/0004_reasons.sql`), `appointments` (sinds `supabase/migrations/0008_appointments.sql`) |
| `id` | het `id` van het record (hierboven) |
| `data` | het record als JSON (maximaal 20 kB, moet een object zijn) |
| `deleted_at` | zacht verwijderen |
| `updated_at`, `seq` | door de server bepaald (trigger); `seq` loopt bij elke schrijfactie op |

Sleutel: `(user_id, collection, id)`. **RLS**: een gebruiker leest en schrijft alleen eigen rijen; `anon` kan niets. Er is bewust geen delete-policy. De server begrijpt de records niet; dat scheelt SQL en migraties zodra de app verandert.

**Sync**: een schrijfactie gaat eerst naar IndexedDB en de outbox. De sync-motor stuurt de outbox (upsert) en haalt daarna alles op met `seq > cursor`. Conflicten: laatste schrijver wint, per record. Een check-in heeft maximaal één record per habit en datum (de sleutel bevat beide), ook als twee apparaten offline hetzelfde invullen.

### `public.push_subscriptions` (ochtendherinnering)

Eén rij per apparaat dat de herinnering aanheeft (`supabase/migrations/0002_push.sql`): `endpoint`, `p256dh`, `auth` (de sleutels om versleuteld te kunnen sturen), `remind_time` (`HH:MM`), `timezone`, `summary`, `last_notified_date`. Hoogstens 10 per gebruiker; RLS: alleen eigen apparaten.

Sinds `0009_native_push.sql` is een rij óf een webabonnement (`platform = 'web'`: `endpoint` en sleutels) óf een toestel met de Android-app (`platform = 'android'`: `fcm_token`, de rest leeg); een check-constraint dwingt dat af. De logica voor "aan de beurt", "vandaag al gemeld" en de samenvatting is voor beide gelijk. Een webrij wordt gevonden op `(user_id, endpoint)`, een app-rij op `(user_id, fcm_token)`.

`summary` is `{ "name": "Remco", "days": { "2026-10-16": [3, 2], … } }`: je voornaam en per dag van de komende week `[gepland, in de stapel]`. **De namen van habits staan er niet in.** De Edge Function `send-reminders` leest deze tabel (met de service-sleutel, buiten RLS om) en maakt er de tekst van de melding van.

### Sociaal: vrienden en ranglijst (`supabase/migrations/0003_social.sql`, uitnodigingen uitgebreid in `0005_invites.sql`)

Zes tabellen die **voor niemand rechtstreeks toegankelijk zijn** (RLS aan, geen policies, alle rechten ingetrokken); alles loopt via `security definer`-functies die alleen ingelogde gebruikers mogen aanroepen. Ontwerp, regels en begrenzingen: [SOCIAAL.md](SOCIAAL.md) §5.

| Tabel | Inhoud |
|---|---|
| `social_profiles` | gebruikersnaam (uniek), weergavenaam, aan/uit |
| `social_blocked_terms` | woorden die niet in een gebruikersnaam mogen |
| `friendships` | één rij per paar: `pending` / `accepted` / `declined`, wie het verzoek deed |
| `invite_codes` | alleen de **hash** van een uitnodigingscode, met verloopdatum en `uses` (hoeveel mensen er via vrienden werden; hooguit 25) |
| `score_summaries` | **jouw** samenvatting: `as_of`, `points`, `done`, `streak`, `active_habits`, `last_active` |
| `social_rate` | tellers tegen raden en lastigvallen |

Een vriend ziet van jou alleen je weergavenaam, gebruikersnaam en de samenvatting. Wie een geldige uitnodigingslink heeft ziet je **weergavenaam** (functie `invite_peek`, ook zonder account) en niets anders. **Nooit** je e-mailadres, habit-namen, notities, cues of check-ins. De samenvatting wordt door de app lokaal berekend en alleen gepubliceerd als sociaal aanstaat. Alles verdwijnt met `delete_my_account()` (cascade).

### Verwijderen

`delete_my_account()` (SQL-functie, alleen voor ingelogde gebruikers) wist de gebruiker in `auth.users`; `records` en `push_subscriptions` verdwijnen mee (cascade).

## Wat we níét opslaan

Reeksen, gewoontesterkte, consistentie, fase, "ingeburgerd"-voorstel, herstelmoment, week- en maandoverzichten. Dat is bewust: één bron van waarheid (de check-ins) en geen scheefgroei tussen apparaten. De regels staan in `src/domain/` (puur en getest).
