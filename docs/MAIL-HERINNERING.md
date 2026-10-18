# E-mailherinnering voor de week- en maandreview: wat jij moet instellen

Je hoeft mij **geen geheimen** te geven. De API-sleutel van Resend en de andere geheimen komen alleen in het Supabase-dashboard te staan, nooit in de repo en nooit in een chat.

## Hoe het werkt (kort)

1. Accounts met een e-mailadres die **14 dagen niets hebben gewijzigd** ("stale": het laatste `updated_at` in `records`, of de aanmaakdatum als er nog niets is) komen in aanmerking.
2. **Vrijdag** krijgen ze een mail voor de weekreview, de **25e** een mail voor de maandreview. Valt de 25e op een vrijdag, dan komt er **één** mail met twee knoppen.
3. Verstuurd tussen **16:00 en 20:00 lokale tijd** van het account (tijdzone uit de instellingen, anders Amsterdam). Hoogstens één mail per dag per account.
4. Na **3 mails achter elkaar zonder dat het account daarna iets deed** stopt het. Zodra het account weer iets schrijft begint het tellen opnieuw.
5. Elke mail heeft een knop naar de review (`#/stats?review=week|month&date=…`: Voortgang opent op die periode en markeert de kaart) en een link **Geen mails meer** die zonder inloggen werkt, plus de `List-Unsubscribe`-header voor de knop "Afmelden" van Gmail en Apple Mail. In **Instellingen → E-mail als je even weg bent** zet je het ook uit en weer aan.
6. pg_cron roept elk uur de Edge Function `send-review-mails` aan; die vraagt de kandidaten op (`review_mail_candidates()`), mailt via **Resend** (HTTP-API; SMTP-poorten zijn op Supabase dicht) en meldt per mail terug (`review_mail_mark_sent()`).

De mail bevat geen namen van gewoontes: de server kent die niet.

---

## Stap 1 – Een domein en Resend

Een mail vanaf een afzender die je niet hebt geverifieerd komt in de spam of wordt geweigerd. Je hebt dus een **eigen domein** nodig (de app draait op `github.io`; dat is niet van jou).

1. Maak een account op https://resend.com. Kies bij **Domains → Add domain** de regio **EU (Ierland)**: de gegevens blijven dan in Europa (past bij `docs/PRIVACY.md`).
2. Voeg bij je domeinbeheerder de DNS-records toe die Resend toont (SPF en DKIM) en klik **Verify**. Zet daarnaast een DMARC-record, bijvoorbeeld `v=DMARC1; p=none; rua=mailto:jouw@adres`.
3. Maak een **API key** met alleen het recht *Sending access* voor dat domein. Bewaar hem in je wachtwoordmanager.
4. Kies het afzenderadres, bijvoorbeeld `Habit Builder <herinnering@jouwdomein.nl>`.

Het gratis plan van Resend (100 mails per dag, 3.000 per maand, één domein) is ruim genoeg zolang je minder dan een paar honderd stale accounts hebt. De functie verstuurt hoogstens 100 mails per aanroep; de rest volgt een uur later binnen het tijdvenster.

Een verwerkersovereenkomst met Resend: die sluit je in het dashboard (Settings → Legal / DPA), voor je echte gebruikers mailt.

## Stap 2 – De tabel en functies (SQL Editor)

Supabase → **SQL Editor → New query** → plak de volledige inhoud van `supabase/migrations/0008_review_mails.sql` → **Run**. Opnieuw uitvoeren kan geen kwaad. Lokaal doet `npm run db:reset` het.

## Stap 3 – De Edge Function

Supabase → **Edge Functions → Deploy a new function → Via Editor**.

1. Naam: **`send-review-mails`** (precies zo).
2. Plak de volledige inhoud van `supabase/functions/send-review-mails/index.ts`.
3. Deploy, en zet bij de instellingen van de functie **Verify JWT** uit: de functie controleert zelf wie er belt (het cron-geheim) of dat de afmeldcode klopt (ondertekend).

## Stap 4 – Geheimen

Supabase → **Edge Functions → Secrets → Add new secret**:

| Naam | Waarde |
|---|---|
| `RESEND_API_KEY` | de API key uit stap 1 |
| `MAIL_FROM` | `Habit Builder <herinnering@jouwdomein.nl>` |
| `APP_URL` | `https://remcovolkers.github.io/habit-builder/` (met slash aan het eind) |
| `UNSUBSCRIBE_SECRET` | een lang willekeurig geheim: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. **Wijzig dit niet meer**: dan werken de afmeldlinks in verstuurde mails niet meer |
| `CRON_SECRET` | hetzelfde geheim als bij `send-reminders` (staat er al) |

`SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY` zet Supabase zelf.

## Stap 5 – De planning (SQL Editor)

Vervang `<CRON_SECRET>` door het cron-geheim en voer uit:

```sql
select cron.schedule(
  'send-review-mails',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://rbsqafttotdaakpwtjmh.supabase.co/functions/v1/send-review-mails',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
```

`pg_cron` en `pg_net` staan al aan sinds `docs/M7-SETUP.md`. Stoppen kan met `select cron.unschedule('send-review-mails');`. Controleren:

```sql
select jobid, jobname, schedule, active from cron.job;
select status_code, content, created from net._http_response order by created desc limit 5;
```

## Stap 6 – Eerst droog proberen

Zonder iets te versturen: kijk wie er op een bepaald moment een mail zou krijgen (met het cron-geheim; `now` kan alleen met dat geheim):

```
curl -X POST https://rbsqafttotdaakpwtjmh.supabase.co/functions/v1/send-review-mails \
  -H "x-cron-secret: <CRON_SECRET>" -H "Content-Type: application/json" \
  -d '{"dryRun": true, "now": "2026-10-23T14:00:00Z"}'
```

In het antwoord staat per account (met de eerste 8 tekens van het id) `zou_mailen`, `geen_mailmoment_vandaag`, `buiten_het_tijdvenster`, `vandaag_al_gemaild` of `onbekende_tijdzone`. Daarna een echte proef met een testaccount met je eigen adres (zie `docs/HOW-TO-TEST.md`, D2).

Als het niet lukt:

| Antwoord of gedrag | Oorzaak |
|---|---|
| `niet ingesteld` met een lijst namen | een of meer geheimen uit stap 4 ontbreken |
| `mailservice_weigerde_403` of `_422` | het domein is nog niet geverifieerd, of `MAIL_FROM` hoort niet bij het geverifieerde domein |
| `mailservice_weigerde_429` | het daglimiet van Resend is bereikt; de rest volgt morgen |
| 401 | `x-cron-secret` klopt niet, of **Verify JWT** staat nog aan |
| Een `404` of "function not found" bij `review_mail_candidates` | de migratie (stap 2) is niet uitgevoerd |
| Geen mail terwijl het antwoord `verstuurd` zegt | spam, of de DNS-records (SPF/DKIM) kloppen nog niet: kijk in het Resend-dashboard bij **Emails** |

## Opruimen en privacy

- Een account verwijderen ruimt zijn stand op (cascade). Wat de server bewaart staat in `docs/PRIVACY.md` en `docs/DATAMODEL.md`.
- Mails stoppen vanzelf na 3 onbeantwoorde mails, bij afmelden, en zodra het account weer actief is.

---

# Checklist: alles wat jij moet regelen voor deze release

Dit is de lijst voor alles wat in deze ronde is veranderd (voortgang met week/maand, week- en maandreview, de maandtaak, de meldingen, de e-mailherinnering).

## A. Code naar productie
- [ ] `npm test` en `npm run check:layout` draaien lokaal groen (zijn groen bij oplevering).
- [ ] Wijzigingen committen op `develop`, laten testen door de GitHub Action, daarna `develop` → `main` (pull request). Pas `main` rolt uit via GitHub Pages.
- [ ] Wacht tot de Action "Test & deploy" groen is, en open de app daarna één keer (de nieuwe versie komt via de updatebalk).
- [ ] Optioneel: `appVersion` in `src/config.js` ophogen (nu `1.2`) en een `docs/RELEASE-v1.3.md` maken.

## B. Supabase (productie), in deze volgorde
- [ ] **Migratie 0008** uitvoeren (stap 2 hierboven). De overige wijzigingen (reviews, maandtaak) hebben **geen** migratie nodig: ze gebruiken de bestaande collectie `reviews`.
- [ ] **`send-reminders` opnieuw uitrollen**: plak de volledige inhoud van `supabase/functions/send-reminders/index.ts` in de bestaande functie en deploy. Zonder dit blijven de pushmeldingen zonder review-tekst en zonder doorverwijzing naar Voortgang. Een oudere app blijft werken.
- [ ] **`send-review-mails` uitrollen** (stap 3) met **Verify JWT uit**.
- [ ] **Geheimen** toevoegen (stap 4).
- [ ] **Cron-job** `send-review-mails` plannen (stap 5).

## C. Resend en je domein (stap 1)
- [ ] Domein kiezen (heb je er nog geen: eerst een domein regelen; zonder eigen domein kun je niet betrouwbaar mailen).
- [ ] Resend-account, domein toevoegen in de regio **EU**, SPF/DKIM/DMARC in je DNS zetten en verifiëren.
- [ ] API key maken (alleen *Sending access*) en afzenderadres kiezen.
- [ ] Verwerkersovereenkomst (DPA) met Resend afsluiten.

## D. Privacy en voorwaarden
- [ ] `docs/PRIVACY.md` is bijgewerkt (e-mailherinnering, Resend als verwerker, de kolommen van `review_mail_state`). Lees hem zelf na en controleer of je het zo wilt: de mail staat **standaard aan** voor accounts met een adres (met afmelden in elke mail en in Instellingen). Wil je liever **toestemming vooraf** (standaard uit), zeg het: dat is een kleine aanpassing in `review_mail_candidates()` en in de schakelaar.
- [ ] Controleer of `docs/VOORWAARDEN.md` iets moet zeggen over mails (nu niet aangepast).

## E. Uitproberen na het uitrollen
- [ ] **Droog proberen** (stap 6) met `now` op een vrijdag, de 25e en een vrijdag die de 25e is (25 september 2026 is zo'n dag).
- [ ] **Testaccount** met je eigen adres, `updated_at` van zijn `records` op 20 dagen geleden, en één echte mail laten komen. Controleer: de knop opent Voortgang op de goede periode en markeert de reviewkaart; **Geen mails meer** meldt af en **Toch weer ontvangen** zet het terug; in Instellingen staat de schakelaar in dezelfde stand.
- [ ] **Pushmelding** testen: Instellingen → Ochtendherinnering → testmelding, en controleer op een zondag (week) of de laatste dag van de maand dat de tik op de melding Voortgang opent met de gemarkeerde reviewkaart. Pas wanneer `send-reminders` is bijgewerkt (B).
- [ ] In de app zelf: weekreview invullen (twee velden, kaart met Bewerk), maandreview (op slot tot de laatste 7 dagen van de maand, een vorige maand kan alsnog) en de maandtaak op Vandaag afvinken (zie `docs/HOW-TO-TEST.md`, D en D2).

## F. Eigen keuzes die ik voor je maakte (zeg het als je ze anders wilt)
- "Stale" = 14 dagen geen enkele wijziging in je gegevens. Aanpasbaar in `STALE_DAYS` (functie) en de standaard van `review_mail_candidates()`.
- Hoogstens 3 onbeantwoorde mails achter elkaar (`MAX_UNANSWERED`).
- Verzendtijd 16:00 tot 20:00 lokaal (`SEND_FROM_HOUR`, `SEND_WINDOW_HOURS`).
- De mail staat standaard **aan** voor accounts met een e-mailadres; anonieme accounts krijgen niets.
- De maandmail op de 25e geldt elke maand; de 25e is altijd binnen de laatste 7 dagen van de maand, dus de maandreview in de app staat dan open.
- Staan week- en maandreview op dezelfde dag klaar in de **pushmelding**, dan gaat de tik naar de weekreview.
