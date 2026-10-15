# Release 1.1: vrienden en ranglijst

Een checklist, in volgorde. Wat in de repo staat is klaar en getest; de stappen met **Jij** kan alleen jij doen (telefoons, het Supabase-dashboard, op "Merge" drukken).
Algemene werkwijze: [WERKWIJZE.md](WERKWIJZE.md). Wat de feature doet: [SOCIAAL.md](SOCIAAL.md).

## 1. Proberen op twee echte telefoons (Jij)

De automatische tests draaien in headless Edge en Chrome. Wat daarin niet zit: een echte telefoon, het deelmenu, het toetsenbord en de schermafmetingen van jouw toestellen.

1. Docker Desktop aan, `npm run db:start`, `npm run serve`. Zet je computer en beide telefoons op hetzelfde wifi.
2. Open op elke telefoon `http://<ip-van-je-computer>:5173/` (IP: `ipconfig`). Windows vraagt eenmalig om toestemming voor de firewall.
3. Log in met twee verschillende adressen (de code staat in het lokale mailvenster, http://localhost:54324 op je computer).
4. Loop door: meedoen met een gebruikersnaam · de ander zoeken en een verzoek sturen · accepteren · de ranglijst op beide telefoons · een uitnodigingslink delen via het deelmenu en openen op de andere telefoon · iets afvinken en kijken of de punten meebewegen · vliegtuigmodus · uitzetten.
5. Let op: past alles op jouw scherm, is niets afgeknipt, voelt het typen van een gebruikersnaam goed, en zijn de teksten duidelijk?

## 2. Samenvoegen in develop

- Pull request `feature/vrienden` → `develop`. Beide workflows moeten groen zijn: **Test & deploy** (`test`) en **Integratie**.

## 3. De productiedatabase voorbereiden (Jij, vóór de uitrol)

De migratie is **alleen uitbreiding** (nieuwe tabellen en functies): de huidige app merkt er niets van, dus dit kan veilig vóór de uitrol.

1. Supabase-dashboard van het **productieproject** → SQL Editor → New query.
2. Plak de volledige inhoud van `supabase/migrations/0003_social.sql` → Run. Opnieuw uitvoeren kan geen kwaad.
3. Controleer in de projectmap: `node tools/live-check.mjs`. Alle regels moeten **OK** zijn, inclusief de regels "vrienden: …". Staat er "migratie 0003 is hier nog niet uitgevoerd", dan is stap 2 niet gelukt.

Zonder deze stap rolt de app wel uit, maar blijft hij stil op "Nog niet beschikbaar": er breekt niets.

## 4. De release zelf

1. In de release-pull-request `develop` → `main`: verhoog `appVersion` in `src/config.js` naar `'1.1'` en zet de status bovenaan [PLAN.md](PLAN.md) op versie 1.1.
2. Merge. De uitrol start vanzelf (`main` → GitHub Pages).
3. Tag: `git switch main && git pull && git tag -a v1.1 -m "vrienden en ranglijst" && git push origin v1.1`.

## 5. Na de uitrol (Jij)

1. Open de app op je telefoon, ververs via "Vernieuwen" als de updatemelding komt, en controleer onderaan Instellingen het versienummer (1.1).
2. Voortgang toont de kaart "Vrienden en ranglijst".
3. Doe mee met je echte account, voeg iemand toe die ook meedoet (of vraag een tweede account), en controleer de ranglijst.
4. Controleer dat Google-login en de ochtendherinnering nog werken (die raken we niet, maar het is je productie).

## Terugdraaien

- **De app:** een pull request die de merge terugdraait (`git revert -m 1 <merge-commit>`), zoals in WERKWIJZE. Gebruikers krijgen de oude versie na "Vernieuwen".
- **De database:** niet nodig. De migratie is additief en de oude app negeert de nieuwe tabellen. Wil je de feature toch uitzetten zonder terug te draaien, dan kan dat per gebruiker (Beheren → Sociaal uitzetten).
- **Gebruikersnamen die je niet wilt:** voeg een woord toe in de SQL-editor: `insert into public.social_blocked_terms (term) values ('woord');`.

## Weten voor je begint

- **Vrienden zien je naam.** Gebruikers die al een naam hebben ingesteld, behouden die; wie nog geen naam heeft, vult hem in bij het meedoen.
- **Zet je sociaal uit, dan blijven je gebruikersnaam en vriendschappen bewaard** (onzichtbaar), tot je je account verwijdert. Dat staat zo in de privacyverklaring. Wil je een knop "alles wissen" zonder je account te verwijderen, dan is dat een vervolgstap.
- **Knoppen om aan te draaien als de ranglijst in de praktijk scheef voelt:** zie [SOCIAAL.md §4.7](SOCIAAL.md) (de bedragen staan in `src/domain/constants.js`).
