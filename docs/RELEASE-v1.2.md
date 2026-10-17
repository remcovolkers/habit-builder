# Release 1.2: uitnodigen, prestaties, onboarding en meerdere dagdelen

Een checklist, in volgorde, in dezelfde opzet als [RELEASE-v1.1.md](RELEASE-v1.1.md). Wat in de repo staat is klaar en getest; de stappen met **Jij** kan alleen jij doen (telefoons, het Supabase-dashboard, op "Merge" drukken).
Algemene werkwijze: [WERKWIJZE.md](WERKWIJZE.md).

## Wat er in zit

| Onderdeel | Waar uitgelegd |
|---|---|
| Uitnodigen voor nieuwe gebruikers, vrienden inzien | [ITERATIE-1.2.md](ITERATIE-1.2.md) §1–§3 |
| Prestaties: 22 nieuwe, voortgang per groep, aantikken voor uitleg waarom je ze hebt | [ITERATIE-1.2.md](ITERATIE-1.2.md) §5 |
| Iconenset en iconenkiezer | [ITERATIE-1.2.md](ITERATIE-1.2.md) §6 |
| Aandacht voor taken die blijven liggen, zeldzame taken | [PLAN.md](PLAN.md) §4.9 |
| Desktop-schil met kolommen die zelf scrollen | [SCROLLEN.md](SCROLLEN.md) |
| **Onboarding** (stijl kiezen, een dag, de app installeren, de eerste habit) en **Zo werkt het** | [ONBOARDING.md](ONBOARDING.md) |
| **Meerdere dagdelen** per habit (tandenpoetsen 's ochtends en 's avonds) | [DATAMODEL.md](DATAMODEL.md) |
| **Flexibele taken**: compacte stapel, "Dreigt te falen", Plan je week en een verbeterd Habits-scherm | [FLEXIBELE-TAKEN.md](FLEXIBELE-TAKEN.md) |
| **Feedbackhub**: feedback geven (ook zonder account) en een tabje Feedback voor jou op de computer | [FEEDBACK.md](FEEDBACK.md) |
| Teller voor de ontwikkelaar (aantal gebruikers, vandaag actief) | migratie `0006_dev_usage.sql` |

## 1. Proberen op echte telefoons (Jij)

De automatische tests draaien in headless Edge en Chrome. Wat daarin niet zit, en voor deze release belangrijk is:

1. **iPhone in Safari**: de stap "Zet de app op je beginscherm" toont drie stappen (Delen, Zet op beginscherm, Voeg toe). Kloppen de volgorde en de woorden met wat je ziet?
2. **Android in Chrome**: de knop Installeren op die stap werkt en daarna staat er "Gelukt!".
3. **Een schone browser of een tweede profiel**: loop de onboarding door (stijl kiezen, vier stappen, een sjabloon, opslaan). Open daarna de app vanaf het beginscherm: dan zijn het drie stappen.
4. **Een uitnodigingslink als nieuwe gebruiker** (zie [HOW-TO-TEST.md](HOW-TO-TEST.md) onder K en M): na "Jij en Anna zijn nu vrienden!" staat "Laten we beginnen".
5. **Tandenpoetsen**: maak de habit uit het sjabloon, vink de ochtend af, kijk of de avond open blijft staan, en vink hem af.
6. Een liggende telefoon en grote tekst (de onboarding scrolt dan als geheel).

## 2. Samenvoegen in develop

- Pull request naar `develop`. Beide workflows moeten groen zijn: **Test & deploy** (`test`) en **Integratie**.

## 3. De productiedatabase voorbereiden (Jij, vóór de uitrol)

Alle migraties zijn **alleen uitbreiding** en opnieuw uit te voeren: de huidige app merkt er niets van. Voer in het Supabase-dashboard van het **productieproject** (SQL Editor, New query) de migraties uit die er nog niet staan, in volgorde:

1. `supabase/migrations/0004_reasons.sql` (redenen bij taken die blijven liggen)
2. `supabase/migrations/0005_invites.sql` (uitnodigen voor nieuwe gebruikers)
3. `supabase/migrations/0006_dev_usage.sql` (de teller voor de ontwikkelaar)
4. `supabase/migrations/0007_feedback.sql` (de feedbackhub; vereist 0006). **Zonder deze migratie zegt de feedbackknop "Feedback versturen kan nog niet"**
5. Voeg jezelf toe als beheerder (alleen als je dat nog niet deed), anders blijven de teller en het tabje Feedback verborgen:
   ```sql
   insert into public.app_admins (user_id) select id from auth.users where email = 'jouw-adres';
   ```
6. Plak de Edge Function `send-reminders` opnieuw (de ochtendmelding is aangepast; zie [M7-SETUP.md](M7-SETUP.md)).
7. Controleer in de projectmap: `node tools/live-check.mjs`. Alle regels moeten **OK** zijn (die kent 0006 en 0007 niet: test de teller en de feedback dus zelf, zie hieronder).

Meerdere dagdelen vragen **geen** migratie: het zit in de gegevens van een habit en een check-in (`dayparts`, `parts`), en de server bewaart dat als JSON.

## 4. De release zelf

1. `appVersion` in `src/config.js` staat al op `'1.2'` en de status bovenaan [PLAN.md](PLAN.md) ook.
2. Pull request `develop` → `main`, merge. De uitrol start vanzelf (`main` → GitHub Pages).
3. Tag: `git switch main && git pull && git tag -a v1.2 -m "uitnodigen, prestaties, onboarding en meerdere dagdelen" && git push origin v1.2`.

## 5. Na de uitrol (Jij)

1. Open de app op je telefoon, ververs via "Vernieuwen" als de updatemelding komt, en controleer onderaan Instellingen het versienummer (1.2).
2. **Bestaande gebruikers** zien de onboarding niet (ze hebben habits) en krijgen wel de nieuwe prestaties in één viering. Controleer dat met je eigen account.
3. Het tabje **Feedback** staat in de zijbalk (alleen op de computer en alleen als je in `app_admins` staat). Verstuur zelf een testbericht via "Feedback geven" onderaan de zijbalk (met en zonder het mailvinkje) en kijk of het in de lijst komt; verwijder het daarna.
4. Instellingen → Ontwikkelaarsopties (zeven tikken op het versienummer): de regel met het aantal gebruikers en wie vandaag actief was.
5. Controleer dat Google-login, vrienden en de ochtendherinnering nog werken.

## Terugdraaien

- **De app:** een pull request die de merge terugdraait (`git revert -m 1 <merge-commit>`), zoals in WERKWIJZE. Gebruikers krijgen de oude versie na "Vernieuwen".
- **Let op bij meerdere dagdelen:** een habit die je op 1.2 met meerdere dagdelen maakt, ziet een oudere app als een habit met alleen het eerste dagdeel. Een dag die op 1.2 deels is afgevinkt staat daar als "deels". Er gaat niets verloren, maar het kan er vreemd uitzien tot je weer op 1.2 zit.
- **De database:** niet nodig, de migraties zijn additief.

## Weten voor je begint

- **Wie nu al op de app zit, merkt de onboarding niet.** Hij verschijnt alleen voor wie nog geen habits heeft en hem niet eerder zag, op dat apparaat.
- **De teller telt alleen accounts.** Wie de app alleen lokaal gebruikt, staat niet op de server en is niet te tellen.
