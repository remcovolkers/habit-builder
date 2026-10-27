# Android-app: wat jij moet instellen

Je hoeft mij **geen geheimen** te geven: de sleutel en de wachtwoorden komen alleen in je wachtwoordmanager en in de GitHub-secrets, nooit in de repo en nooit in een chat. Het plan en de achtergrond staan in [ANDROID-APP.md](ANDROID-APP.md).

Je hebt **geen Java en geen Android SDK** nodig: de APK wordt in GitHub Actions gebouwd. Alleen de sleutel maak je lokaal, met OpenSSL (zit in Git Bash).

---

## Stap 1 – De handtekeningsleutel maken

Elke APK moet met **dezelfde sleutel** getekend zijn, anders weigert Android een update ("app niet geïnstalleerd, strijdig met een bestaand pakket"). Je maakt hem één keer.

Open **Git Bash** en werk in een map **buiten** de repository:

```bash
mkdir -p ~/habit-builder-keys && cd ~/habit-builder-keys

# een willekeurig wachtwoord; het staat alleen in deze terminal tot je hem sluit
export HB_PASS=$(openssl rand -base64 24 | tr -d '/+=')
echo "$HB_PASS"        # ← kopieer dit nu naar je wachtwoordmanager

# de sleutel zelf (geldig tot 2054)
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:4096 -sha256 -days 10000 -nodes \
  -keyout key.pem -out cert.pem -subj "/CN=Habit Builder"
openssl pkcs12 -export -inkey key.pem -in cert.pem -name habit-builder \
  -out habit-builder.p12 -passout env:HB_PASS
rm key.pem cert.pem
```

(`MSYS_NO_PATHCONV=1` is nodig omdat Git Bash `/CN=…` anders als Windows-pad leest.)

Je houdt **`habit-builder.p12`** over. Bewaar dat bestand **en** het wachtwoord op **twee** plekken (bijvoorbeeld je wachtwoordmanager en een versleutelde back-up).

> **Raak je dit kwijt, dan** moeten alle gebruikers de app verwijderen en opnieuw installeren. Wie niet is ingelogd, verliest daarbij zijn lokale gegevens.

## Stap 2 – De vier GitHub-secrets

GitHub → de repository → **Settings → Secrets and variables → Actions → New repository secret**. Maak deze vier:

| Naam | Waarde |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | de inhoud van het bestand, als tekst: voer in Git Bash `base64 -w0 habit-builder.p12 \| clip` uit en plak (één lange regel) |
| `ANDROID_KEYSTORE_PASSWORD` | het wachtwoord uit stap 1 |
| `ANDROID_KEY_PASSWORD` | **hetzelfde** wachtwoord |
| `ANDROID_KEY_ALIAS` | `habit-builder` |

Daarna kun je de terminal sluiten (het wachtwoord verdwijnt dan uit het geheugen van de shell).

## Stap 3 – Proberen

1. Push naar `feature/android-app`. In **Actions → Android-app** draait de workflow. Staan de secrets er, dan bouwt hij twee APK's: een **debug**-versie en een met jouw sleutel getekende **proefversie**, en controleert hij de handtekening.
2. Onderaan de run staan de **artifacts**: `habit-builder-debug` en `habit-builder-release-proef`. Download er één (een zip met daarin de `.apk`).
3. Zet de APK op je telefoon (via USB, Google Drive of mail naar jezelf) en open hem. Android vraagt eenmalig om "installeren uit onbekende bronnen" toe te staan voor de app waarmee je hem opent (Bestanden, Drive of Chrome).

Let op: de **debug**- en de **release**-APK zijn met een andere sleutel getekend, dus je kunt de ene niet over de andere installeren. Verwijder de eerste voor je de tweede installeert.

Een rode stap "Sleutel" of "Handtekening controleren" betekent meestal een typfout in een secret, of in `ANDROID_KEYSTORE_BASE64` een regeleinde. Plak die waarde opnieuw.

## Stap 4 – Een debug-app tegen je eigen computer (optioneel)

De app laadt standaard `https://remcovolkers.github.io/habit-builder/`. Wijzigingen aan de webkant (zoals `src/native.js`) staan daar pas na een release. Wil je ze eerder in de app zien, dan laat je de **debug**-app een ander adres laden, bijvoorbeeld de dev-server op je computer:

1. Start `npm run serve` op je computer; je telefoon moet op hetzelfde wifi-netwerk zitten.
2. GitHub → **Settings → Secrets and variables → Actions → Variables → New repository variable**: naam `ANDROID_DEV_SERVER_URL`, waarde bijvoorbeeld `http://192.168.1.20:5173` (het IP-adres van je computer).
3. Een nieuwe run van de workflow bouwt de debug-app met dat adres. De app kiest dan, net als de browser, de lokale testdatabase (zie [DEV-OMGEVING.md](DEV-OMGEVING.md)).

De variabele geldt **alleen** voor de debug-app. De getekende release laadt altijd de live site. Verwijder de variabele als je hem niet meer nodig hebt.

---

## Stap 5 – Firebase (voor de meldingen)

Firebase is het kanaal waarlangs Google de melding naar je telefoon brengt. Een klein project met alleen Cloud Messaging is gratis en vraagt geen creditcard (controleer dat even op de prijspagina van Firebase; ik heb die niet opgehaald).

1. Ga naar <https://console.firebase.google.com> en log in met je Google-account → **Project toevoegen**. Naam bijvoorbeeld `habit-builder`. Zet **Google Analytics uit** (niet nodig) → **Project maken**.
2. Op de startpagina van het project: klik op het **Android-icoon** ("Een app toevoegen").
   - **Android-pakketnaam:** `io.github.remcovolkers.habitbuilder` (precies zo).
   - Bijnaam: `Habit Builder`. Het SHA-1-veld mag leeg.
   - **App registreren** → **`google-services.json` downloaden**. De volgende schermen (SDK toevoegen, enzovoort) kun je overslaan: **Volgende → Volgende → Doorgaan naar de console**.
3. Zet `google-services.json` in de repository op **`android/app/google-services.json`**. Dit bestand is geen geheim (het bevat het projectnummer en een beperkte API-sleutel), dus het mag in git. Ik commit het voor je als je het daar neerzet.
4. Haal de **service-account-sleutel** op: tandwiel linksboven → **Projectinstellingen → tabblad Service accounts → Nieuwe privésleutel genereren**. Er downloadt een `.json`.
   - Dit bestand **is wél een geheim**: nooit in de repo, nooit in een chat. Bewaar het in je wachtwoordmanager of in `~/habit-builder-keys`.
5. Controleer onder **Projectinstellingen → tabblad Cloud Messaging** dat **"Firebase Cloud Messaging API (V1)"** op *Ingeschakeld* staat. (Bij een nieuw project is dat zo; de oude "Legacy"-API hoort uit te staan en is niet nodig.)

## Stap 6 – De server (migratie, functie en secret)

Het hulpscript `tools/fcm-secret.mjs` maakt van de Firebase-JSON de waarde die Supabase nodig heeft (één regel, met de regeleinden in de sleutel intact).

### Eerst lokaal proberen (aanbevolen, raakt productie niet)

De debug-app met `ANDROID_DEV_SERVER_URL` (stap 4) praat met je lokale testdatabase. Daar komen de migraties vanzelf (ook `0009_native_push.sql`), maar de functie `send-reminders` draait er niet. Zo start je hem:

1. `npm run db:start` (Docker Desktop moet draaien).
2. Maak het bestand `supabase/functions/.env` (staat al in `.gitignore`) met deze inhoud. De VAPID-regels zijn lokaal niet echt nodig, maar de functie eist dat ze bestaan:
   ```
   VAPID_PUBLIC_KEY=lokaal
   VAPID_PRIVATE_KEY=lokaal
   VAPID_SUBJECT=mailto:test@example.com
   CRON_SECRET=lokaal
   ```
3. Voeg de sleutel toe (pas het pad aan):
   ```
   node tools/fcm-secret.mjs C:/pad/naar/je-sleutel.json --env >> supabase/functions/.env
   ```
4. Start de functie en laat dit venster open staan:
   ```
   npx supabase@2.121.0 functions serve send-reminders --env-file supabase/functions/.env --no-verify-jwt
   ```

### Productie (pas bij de release, zie WERKWIJZE.md)

De wijzigingen breiden alleen uit en kunnen dus vóór de release op productie, maar doe ze in deze volgorde:

1. Supabase → **SQL Editor → New query** → plak de inhoud van `supabase/migrations/0009_native_push.sql` → **Run**. Opnieuw uitvoeren kan geen kwaad.
2. Supabase → **Edge Functions → send-reminders** → vervang de code door de inhoud van `supabase/functions/send-reminders/index.ts` → **Deploy**.
3. Supabase → **Edge Functions → Secrets** → nieuw secret `FCM_SERVICE_ACCOUNT`. De waarde krijg je op je klembord met:
   ```
   node tools/fcm-secret.mjs C:/pad/naar/je-sleutel.json | clip
   ```
   Plak (Ctrl+V) in het waardeveld en bewaar. De bestaande VAPID-secrets blijven zoals ze zijn.

## Stap 7 – De melding op je telefoon proberen

1. Zet `google-services.json` neer (stap 5) en laat mij het committen en pushen. De workflow bouwt dan een debug-APK **mét** Firebase. (Zonder dat bestand waarschuwt de workflow en kan de app de herinnering niet aanzetten.)
2. Installeer de nieuwe `habit-builder-debug` (over de vorige heen).
3. Log in met een lokaal testaccount (zie [DEV-OMGEVING.md](DEV-OMGEVING.md): `npm run dev:seed` en `npm run dev:code`).
4. **Instellingen → Ochtendherinnering → Herinnering aanzetten.** Android vraagt om toestemming voor meldingen: **Toestaan**.
5. Zet de **ontwikkelaarsopties** aan (tik zeven keer op het versienummer onderaan Instellingen). Er verschijnen testknoppen.
   - **Stuur een testmelding:** moet binnen een paar seconden binnenkomen.
   - **Testmelding over 15 seconden:** druk daarna op de aan/uit-knop en sluit de app (veeg hem weg). Dit is de echte proef: komt hij ook aan als de app dicht is en het scherm vergrendeld?
6. Tik op de melding. De app opent op Vandaag.

Meld wat je ziet, vooral: komt de melding aan met de app dicht? Is het icoontje in de statusbalk een witte ring met vinkje (en geen vierkantje)? Gaat een tik naar de goede pagina?
