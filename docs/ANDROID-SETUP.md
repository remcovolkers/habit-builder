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

## Later: Firebase (komt bij onderdeel 4.2)

Voor de meldingen heb ik straks van je nodig: een Firebase-project (gratis) met een Android-app erin met pakketnaam `io.github.remcovolkers.habitbuilder`, het bestand `google-services.json`, en een service-account-sleutel als Supabase-secret `FCM_SERVICE_ACCOUNT`. De stappen schrijf ik erbij als we daar zijn.
