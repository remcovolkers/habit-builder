# Ontwikkelomgeving: een eigen testdatabase

Tot nu toe is er **één** Supabase-project en dat is productie: wie inlogt, praat met de echte gegevens. Voor nieuwe features (vooral de sociale, waar je minstens twee accounts nodig hebt) is dat te riskant. Daarom komt er een tweede, gratis project: **`habit-builder-dev`**.

## Hoe de app kiest

De app kijkt naar waar hij draait (`src/config.js`, functie `pickEnvironment`):

| Waar | Project |
|---|---|
| `remcovolkers.github.io` (de productie-site) | **productie** |
| `localhost`, het IP-adres van je computer, alles anders | **ontwikkeling** (zodra dat is ingevuld; anders productie) |

Gevolgen:
- Een feature-versie die je lokaal draait kan de echte gegevens **niet** raken, want de browser praat met het testproject.
- Productie en test hebben een eigen opslag in de browser (verschillende adressen), dus de gegevens van beide lopen nooit door elkaar.
- Onder in Instellingen staat in de testomgeving **"· testomgeving"** achter het versienummer, zodat je het ziet.
- De ochtendherinnering (Web Push) bestaat in de testomgeving niet: de knop is er verborgen. Die functie test je op productie of niet; de sociale feature heeft hem niet nodig.

## Stap 1 – Het project aanmaken

1. https://supabase.com/dashboard → **New project**.
2. Naam: `habit-builder-dev`. Regio: dezelfde als het productieproject. Kies een sterk databasewachtwoord en bewaar het in je wachtwoordmanager (je hebt het zelden nodig).
3. **Let op:** een gratis organisatie mag **2 actieve projecten** hebben. Heb je er al twee (bijvoorbeeld Habit Builder en Crusaders)? Dan kun je een ander project pauzeren, of een tweede (gratis) organisatie aanmaken en het testproject daar zetten. Zeg het als dit speelt, dan denk ik mee.

## Stap 2 – De database vullen

Dezelfde migraties als productie, in volgorde. **SQL Editor → New query →** inhoud plakken **→ Run**. Elk bestand is idempotent.

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_push.sql` (alleen om het schema gelijk te houden; de herinnering zelf werkt in de testomgeving niet)
3. later: `0003_social.sql` en verder, **eerst hier**, en pas na de test op productie.

Controle: draai in de projectmap `node tools/live-check.mjs --dev` (kan pas nadat stap 5 klaar is). Alle regels moeten OK zijn.

## Stap 3 – Inloggen mogelijk maken

**Authentication → URL Configuration**

| Veld | Waarde |
|---|---|
| Site URL | `http://localhost:5173/` |
| Redirect URLs | `http://localhost:5173/**` |
| Redirect URLs | `http://192.168.*.*:5173/**` (voor testen op je telefoon via je eigen wifi) |

**Authentication → Emails**: zelfde instellingen als productie (zie `docs/M4-SETUP.md`, stap 3):
- **SMTP**: dezelfde Gmail-gegevens (`smtp.gmail.com`, poort 587, je app-wachtwoord). Het wachtwoord komt alleen in het dashboard.
- **Rate limit** voor e-mail op bijvoorbeeld 30 per uur.
- **Templates**: zowel "Magic Link" als "Confirm signup" met de code erin (`{{ .Token }}`, de tekst staat in M4-SETUP).
- **Providers → Email**: aan, en "Enable email signups" aan.

Inloggen met Google is in de testomgeving **niet nodig**: de e-mailcode volstaat. (Wil je het toch, dan moet je in de Google-console het adres `https://<testproject>.supabase.co/auth/v1/callback` toevoegen aan de OAuth-client.)

## Stap 4 – Testaccounts

Voor vrienden en ranglijst heb je **minstens twee accounts** nodig. Zonder tweede mailadres kan dat met Gmail-"plusadressen": alles komt in dezelfde inbox terecht, maar Supabase ziet het als verschillende accounts.

| Account | E-mailadres |
|---|---|
| Test 1 | `jouwnaam+test1@gmail.com` |
| Test 2 | `jouwnaam+test2@gmail.com` |
| Test 3 (voor een groep van drie) | `jouwnaam+test3@gmail.com` |

Twee accounts tegelijk in beeld: gebruik **twee browserprofielen of een privévenster** op je computer, of je computer en je telefoon. Elk heeft zijn eigen sessie. Accounts weer weggooien kan altijd: **Authentication → Users → ⋯ → Delete user** (de gegevens verdwijnen mee).

## Stap 5 – Mij de gegevens geven

Uit het dashboard van het testproject, **Project Settings → API Keys** (of **Connect**):

- de **Project URL** (`https://xxxx.supabase.co`);
- de **publishable key** (`sb_publishable_…`).

Beide zijn publiek bedoeld; je mag ze gewoon in de chat zetten. **Nooit** de secret / service-role key. Ik vul ze dan in `src/config.js` in, zet de URL in de CSP van `index.html` en laat de dagelijkse keepalive ook het testproject aanroepen (een gratis project pauzeert anders na een week stilte; je kunt het dan altijd zelf weer aanzetten in het dashboard).

## Proberen

```
npm run serve
```

- Op je computer: http://localhost:5173/ → Instellingen → **Inloggen of account maken**. Onderaan staat "testomgeving".
- Op je telefoon (zelfde wifi): `ipconfig` geeft het IPv4-adres van je computer, bijvoorbeeld `192.168.1.20`; open `http://192.168.1.20:5173/`. Windows vraagt eenmalig om toestemming voor de firewall. Via dit gewone http werken de service worker en meldingen niet, dus de offline-app en pushmeldingen proef je daar niet; inloggen, synchroniseren en de sociale functies wel.

## Een wijziging aan de database uitrollen

1. Schrijf de migratie (`supabase/migrations/000N_….sql`, **achterwaarts compatibel**, zie WERKWIJZE).
2. Draai het RLS-testscript (`supabase/tests/rls-check.mjs`; het heeft PGlite nodig en staat daarom niet in `npm test`, zie de kop van het bestand). Dit nemen we voor de sociale feature op in de CI (milestone S2).
3. Plak de migratie in het **testproject** en test de app lokaal met twee accounts.
4. Pas bij de release plak je dezelfde migratie op **productie**, vóórdat de nieuwe app uitgerold wordt.
