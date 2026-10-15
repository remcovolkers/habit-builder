# M4 – wat jij moet instellen

Je hoeft mij **geen geheimen** te geven. Het Google-secret en het Gmail-app-wachtwoord komen alleen in het Supabase-dashboard te staan, nooit in de repo en nooit in een chat.

Dashboard: https://supabase.com/dashboard/project/rbsqafttotdaakpwtjmh
Project-URL: `https://rbsqafttotdaakpwtjmh.supabase.co`
App-URL: `https://remcovolkers.github.io/habit-builder/`

---

## Stap 1 – URL's (Authentication → URL Configuration)

| Veld | Waarde |
|---|---|
| Site URL | `https://remcovolkers.github.io/habit-builder/` |
| Redirect URLs (toevoegen) | `https://remcovolkers.github.io/habit-builder/**` |
| Redirect URLs (toevoegen) | `http://localhost:5173/**` |

Zonder deze lijst weigert Supabase na het inloggen de terugsprong naar de app.

## Stap 2 – Google-login

Je hebt dit al eens gedaan voor Crusaders. Maak voor deze app een **eigen OAuth-client** (hergebruik gerust hetzelfde Google Cloud-project).

1. https://console.cloud.google.com → kies of maak een project.
2. **APIs & Services → OAuth consent screen**
   - Kies bij gebruikerstype **Extern**.
   - Vul app-naam ("Habit Builder"), je e-mailadres als support- en contactadres in.
   - Scopes: alleen de standaardscopes (`email`, `profile`, `openid`). Meer is niet nodig.
   - **Belangrijk:** zet de publicatiestatus op **In productie** ("Publish app"). Blijft het op "Testing", dan kunnen alleen handmatig toegevoegde testgebruikers inloggen, dus je vrienden en familie niet. Met alleen de basisscopes is er geen verificatie van Google nodig.
   **Branding-pagina, wat er echt nodig is:**
   - App-naam `Habit Builder`, support-e-mail en contact-e-mail.
   - **Géén logo uploaden.** Met een logo eist Google verificatie zodra de app in productie gaat (dagen werk). Zonder logo en met alleen de basisscopes niet.
   - App-domein: homepage `https://github.com/remcovolkers/habit-builder`, privacybeleid `https://github.com/remcovolkers/habit-builder/blob/main/docs/PRIVACY.md`, voorwaarden `https://github.com/remcovolkers/habit-builder/blob/main/docs/VOORWAARDEN.md`.
   - Geautoriseerd domein: `github.com`.
   - Opslaan, daarna op de Doelgroep-pagina **Publish app**. Lukt publiceren niet, dan kan de app in "Testing" blijven en voeg je onder **Test users** de Google-adressen van je gebruikers toe (maximaal 100).
3. **Credentials → Create credentials → OAuth client ID**
   - Type: **Web application**, naam bijvoorbeeld "Habit Builder (Supabase)".
   - **Authorized redirect URIs:** `https://rbsqafttotdaakpwtjmh.supabase.co/auth/v1/callback`
   - (Authorized JavaScript origins mag leeg blijven.)
4. Kopieer **Client ID** en **Client secret**.
5. Supabase → **Authentication → Sign In / Providers → Google**: zet het aan en plak Client ID en Client secret. Laat "Skip nonce checks" uit.

## Stap 3 – E-mail via je Gmail (inlogcode voor wie geen Google gebruikt, en voor iPhone-gebruikers)

1. Zet bij je Google-account **2-stapsverificatie** aan (nodig voor app-wachtwoorden).
2. Maak een app-wachtwoord: https://myaccount.google.com/apppasswords → naam "Habit Builder" → je krijgt 16 tekens. Bewaar ze in je wachtwoordmanager.
3. Supabase → **Authentication → Emails → SMTP Settings → Enable custom SMTP**:

| Veld | Waarde |
|---|---|
| Sender email | je Gmail-adres |
| Sender name | `Habit Builder` |
| Host | `smtp.gmail.com` |
| Port | `587` (lukt dat niet: probeer `465`) |
| Username | je volledige Gmail-adres |
| Password | het app-wachtwoord van 16 tekens |

4. **Authentication → Rate Limits**: zet "Rate limit for sending emails" op bijvoorbeeld 30 per uur (met eigen SMTP begint dit laag).
5. **Authentication → Emails → Templates**: pas **zowel "Magic Link" als "Confirm signup"** aan. Nieuwe gebruikers krijgen de tweede, bestaande de eerste. De code moet erin staan:

   Onderwerp: `Je inlogcode voor Habit Builder`

   ```html
   <h2>Habit Builder</h2>
   <p>Je inlogcode is:</p>
   <p style="font-size:32px;font-weight:700;letter-spacing:6px;">{{ .Token }}</p>
   <p>De code is een uur geldig. Heb je dit niet aangevraagd? Dan kun je deze mail negeren.</p>
   ```

6. Controleer **Authentication → Sign In / Providers → Email**: "Enable Email provider" aan en "Enable email signups" aan. Laat de rest op de standaardwaarden staan.

Let op: mails vanaf een Gmail-adres komen soms eerst in de spam. Ik bouw de inlogcode-flow daarom met een duidelijke melding ("kijk ook in je spam").

## Stap 4 – Database

Het bestand staat klaar: `supabase/migrations/0001_init.sql`.

1. Supabase → **SQL Editor → New query**.
2. Plak de hele inhoud van dat bestand, klik **Run**. Je ziet "Success". Opnieuw uitvoeren kan geen kwaad.
3. Daarna staat er een tabel `records` met beveiliging (RLS), een functie `delete_my_account()` en een functie `ping()` voor de dagelijkse keepalive.
4. Controle zonder in te loggen: draai in de projectmap `node tools/live-check.mjs`. Alle vijf regels moeten **OK** zijn.

De migratie is vooraf getest in een echte Postgres (PGlite, zie `supabase/tests/rls-check.mjs`): gebruiker A kan de gegevens van B niet lezen, wijzigen of verwijderen, en een niet-ingelogde bezoeker kan niets.

## Wat ik zelf regel

- De SQL-migratie met Row Level Security, en een controle dat een niet-ingelogde bezoeker niets kan lezen of schrijven. ✔
- Inloggen met Google en met een e-mailcode, uitloggen en account verwijderen. ✔
- De synchronisatie (offline-first): wijzigingen blijven eerst lokaal en gaan op de achtergrond mee. ✔
- De dagelijkse "keepalive" in GitHub Actions (`.github/workflows/keepalive.yml`), zodat het gratis project niet na een week inactiviteit pauzeert. ✔

## Eerste keer testen na je configuratie

1. Open de app (lokaal of op Pages) → Instellingen → **Inloggen of account maken**.
2. Probeer **Google** en daarna, op een tweede apparaat of in een privévenster, **een code per e-mail**.
3. Maak op apparaat 1 een habit, wacht een paar seconden, open de app op apparaat 2: de habit staat er.
4. Test het ook zonder internet: vink iets af in vliegtuigmodus, zet internet weer aan, en kijk of het bij het andere apparaat aankomt.
