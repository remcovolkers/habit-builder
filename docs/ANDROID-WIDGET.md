# Widget voor Vandaag (Android)

Status: **in aanbouw** op `feature/android-widget`. Opzet, keuzes en afspraken tussen de app en de widget. Hoort bij [ANDROID-APP.md](ANDROID-APP.md) §9.

## Wat het doet

Een widget voor het startscherm met de lijst van vandaag. Je scrolt erdoorheen, vinkt af, en bij een teller-habit tik je op − en +. Tik je op de kop, dan opent de app.

Besluiten van Remco: de dagdelen staan als scheidingsstreepjes met een naam in de lijst; teller-habits werken (− en +); een vinkje uit de widget bereikt de server en je andere toestellen pas als de app opent.

## Hoe het werkt

De widget is Android-code en kan de IndexedDB in de webweergave niet lezen. Daarom praten app en widget via een klein gedeeld stukje Android-opslag (`SharedPreferences`), met een eigen Capacitor-plugin (`HabitWidget`) als brug.

```
app (webweergave)                      Android-opslag                       widget (Java)
  buildWidgetSnapshot  ── setSnapshot ──▶  snapshot  ◀── leest, tekent ───  lijst met rijen
  logCheckIn, ...      ◀─ takeQueue ────   queue     ◀── tik: vinkje/+/− ──  schrijft een actie
```

1. **Momentopname (`snapshot`).** De app rekent met `buildDayView` uit wat er vandaag staat en schrijft een compacte lijst weg: titel, dagdeel, gedaan of niet, bij tellers de waarde en het doel. De regels van "wat staat er vandaag" blijven zo op één plek (de app). Dit gebeurt bij elke wijziging (na een korte wachttijd), bij het starten en direct als de app naar de achtergrond gaat.
2. **Wachtrij (`queue`).** Een tik in de widget werkt de momentopname meteen bij (de widget toont het vinkje of de nieuwe stand direct) en zet een actie in de wachtrij: `{ key, date, done }` voor een vinkje, `{ key, date, delta }` voor een teller. Tikken die elkaar opheffen (aan en weer uit) verdwijnen uit de wachtrij; tellertikken worden opgeteld.
3. **Verwerken.** Zodra de app opent of weer op de voorgrond komt, haalt hij de wachtrij op en voert elke actie uit met dezelfde functies als op Vandaag (`logCheckIn`, `clearCheckIn`, `togglePart`, `adjustCounter`, `setAppointmentDone`). Punten, reeksen en prestaties tellen dus gewoon mee en de gewone sync neemt het over. Een actie die de regels niet meer toelaten (bijvoorbeeld een dag die te ver terug ligt) wordt stil overgeslagen.
4. **Een nieuwe dag.** De momentopname bevat het tijdstip waarop de dag afloopt (`expiresAt`, met je tijdzone en het begin van je dag). Daarna toont de widget "Open de app voor de lijst van vandaag" in plaats van een verouderde lijst.

Waarom niet rechtstreeks naar Supabase schrijven: een check-in is meer dan één rij (reeksen, minimale versie, tellers, dagdelen, punten). Dat in Java nabouwen geeft twee plekken met regels die uit elkaar gaan lopen.

## Gegevens

`snapshot` (JSON-tekst):

```json
{ "date": "2026-10-28", "expiresAt": 1761700000000, "done": 2, "total": 5,
  "labels": { "title": "Vandaag", "of": "van", "empty": "Niets gepland voor vandaag", "stale": "Open de app voor de lijst van vandaag" },
  "items": [
    { "key": "h|<habitId>|",         "kind": "habit",       "group": "Ochtend", "title": "Water drinken", "done": false },
    { "key": "h|<habitId>|evening",  "kind": "habit",       "group": "Avond",   "title": "Tandenpoetsen", "done": true  },
    { "key": "c|<habitId>",          "kind": "counter",     "group": "Overdag", "title": "Water", "value": 3, "target": 8, "unit": "glazen", "done": false },
    { "key": "a|<appointmentId>",    "kind": "appointment", "group": "Middag",  "title": "Tandarts", "done": false } ] }
```

`queue` (JSON-lijst): `{ "key": "h|…|", "date": "2026-10-28", "done": true }` of `{ "key": "c|…", "date": "…", "delta": 1 }`.

Wat er niet in zit: wat is overgeslagen of opgegeven ("ga ik niet doen") telt niet meer mee, net als in de teller op Vandaag.

## Bestanden

| Onderdeel | Waar |
|---|---|
| Momentopname, sleutels, einde van de dag (puur) | `src/app/widget.js`, `tests/app/widget.test.js` |
| Koppeling met de app: schrijven, wachtrij verwerken | `src/ui/widget.js`, `tests/ui/widget.test.js` |
| Plugin, opslag, widget, lijst | `android/app/src/main/java/io/github/remcovolkers/habitbuilder/widget/` |
| Schermen en instellingen van de widget | `android/app/src/main/res/layout/widget_*.xml`, `res/xml/habit_widget_info.xml`, `res/drawable/widget_*` |
| Aanmelden bij Android | `AndroidManifest.xml` (ontvanger en service), `MainActivity.java` (plugin) |

## Later, bewust nu niet

- De kleuren van je gekozen thema (nu een vaste donkere stijl).
- Een afspraak toevoegen vanuit de widget.
- Een eigen kleine variant van een rij (alleen de tellers, of een ring met "3 van 5").
- De widget laten verversen op het moment dat een dag begint (nu door de verversing van Android elk half uur en door de app).

## Proberen op je telefoon

Zie het eind van dit document zodra de widget klaar is.
