# Datamodel

Hoe de gegevens er in de app en op de server uitzien. De bron van waarheid staat **lokaal** (IndexedDB); de server is een gedeelde kopie per gebruiker. Afgeleide waarden (reeksen, sterkte, consistentie, fase, prestaties-kandidaten, herstelmoment, overzichten) worden **nooit opgeslagen**: ze worden altijd uit de check-ins berekend.

## Opslag lokaal (IndexedDB, versie 3)

Eén object store per soort record. Alle records hebben `id`, `createdAt`, `updatedAt` en `deletedAt` (zacht verwijderen, zodat sync een verwijdering kan doorgeven).

| Collectie | Sleutel (`id`) | Inhoud |
|---|---|---|
| `settings` | `user` | `timezone`, `dayStartHour` (0–6, standaard 4), `displayName`, `nameAsked`, `theme` |
| `habits` | uuid | `name`, `icon`, `color` (`c1`–`c8`), `daypart` (`morning`/`afternoon`/`evening`/`anytime`), `status` (`planned`/`active`/`graduated`/`archived`), `startDate`, `endDate`, `cue`, `why`, `minimalVersion`, `graduationDays` (standaard 66), `maintenance`, `sortOrder`, `counter` (`{ unit, target }`, optioneel), `schedules` |
| `checkIns` | `habitId\|datum` | `habitId`, `date`, `status` (`done`/`minimal`/`skipped`/`partial`), `note` (max. 200 tekens, ook de reden bij overslaan), `value` (teller) |
| `pauses` | uuid | `habitId`, `from`, `to` (`null` = lopend) |
| `dayPlans` | `habitId\|datum` | `habitId`, `date`: een flexibele habit die voor die dag is meegenomen |
| `achievements` | `sleutel\|habitId` | `key`, `habitId` (of `null`), `date`; eenmaal ontgrendeld blijft zo |
| `ratings` | `habitId\|weekStart` | `habitId`, `weekStart`, `score` (1–5, automatisme) |
| `reviews` | `weekStart` | `weekStart`, `wentWell`, `adjust` (wekelijkse review, max. 1000 tekens elk) |
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
| `collection` | een van `settings`, `habits`, `checkIns`, `pauses`, `dayPlans`, `achievements`, `ratings`, `reviews` |
| `id` | het `id` van het record (hierboven) |
| `data` | het record als JSON (maximaal 20 kB, moet een object zijn) |
| `deleted_at` | zacht verwijderen |
| `updated_at`, `seq` | door de server bepaald (trigger); `seq` loopt bij elke schrijfactie op |

Sleutel: `(user_id, collection, id)`. **RLS**: een gebruiker leest en schrijft alleen eigen rijen; `anon` kan niets. Er is bewust geen delete-policy. De server begrijpt de records niet; dat scheelt SQL en migraties zodra de app verandert.

**Sync**: een schrijfactie gaat eerst naar IndexedDB en de outbox. De sync-motor stuurt de outbox (upsert) en haalt daarna alles op met `seq > cursor`. Conflicten: laatste schrijver wint, per record. Een check-in heeft maximaal één record per habit en datum (de sleutel bevat beide), ook als twee apparaten offline hetzelfde invullen.

### `public.push_subscriptions` (ochtendherinnering)

Eén rij per apparaat dat de herinnering aanheeft (`supabase/migrations/0002_push.sql`): `endpoint`, `p256dh`, `auth` (de sleutels om versleuteld te kunnen sturen), `remind_time` (`HH:MM`), `timezone`, `summary`, `last_notified_date`. Hoogstens 10 per gebruiker; RLS: alleen eigen apparaten.

`summary` is `{ "name": "Remco", "days": { "2026-10-16": [3, 2], … } }`: je voornaam en per dag van de komende week `[gepland, in de stapel]`. **De namen van habits staan er niet in.** De Edge Function `send-reminders` leest deze tabel (met de service-sleutel, buiten RLS om) en maakt er de tekst van de melding van.

### Verwijderen

`delete_my_account()` (SQL-functie, alleen voor ingelogde gebruikers) wist de gebruiker in `auth.users`; `records` en `push_subscriptions` verdwijnen mee (cascade).

## Wat we níét opslaan

Reeksen, gewoontesterkte, consistentie, fase, "ingeburgerd"-voorstel, herstelmoment, week- en maandoverzichten. Dat is bewust: één bron van waarheid (de check-ins) en geen scheefgroei tussen apparaten. De regels staan in `src/domain/` (puur en getest).
