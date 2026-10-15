# Werkwijze: de productieversie beschermen en toch blijven groeien

`main` is de **productieapp**: alles wat daar binnenkomt wordt automatisch uitgerold naar GitHub Pages (https://remcovolkers.github.io/habit-builder/) en komt bij gebruikers terecht. Nieuwe ideeën gaan daarom eerst langs een andere branch.

## Branches

| Branch | Waarvoor | Uitrol |
|---|---|---|
| `main` | de versie die gebruikers hebben; elke release heeft een tag (`v1.0`, `v1.1`, …) | automatisch naar Pages |
| `develop` | waar nieuwe features samenkomen en groeien | **niet** uitgerold; wel getest |
| `feature/<naam>` | één onderwerp, vanaf `develop`, kort leven | niet uitgerold; wel getest |
| `hotfix/<naam>` | een spoedfix op productie, vanaf `main` | via een PR naar `main` |

Op elke push naar `main`, `develop` en `feature/**`, en op elke pull request, draaien de tests (`npm test`). Alleen `main` rolt uit.

## Een nieuwe feature

```
git switch develop
git switch -c feature/weekweergave      # klein, één onderwerp
# … bouwen, committen …
git push -u origin feature/weekweergave # de tests draaien
# pull request naar develop, mergen als de tests groen zijn
```

Een **release** is een pull request van `develop` naar `main`:

1. Alle tests groen (`npm test`) en de app zelf doorlopen op je telefoon (zie "Proberen" hieronder).
2. Pull request `develop` → `main`, mergen. De uitrol start vanzelf.
3. Een tag op de merge, zodat je later kunt terugvinden wat er in welke versie zat:
   ```
   git switch main && git pull
   git tag -a v1.1 -m "korte omschrijving"
   git push origin v1.1
   ```
4. Verhoog `appVersion` in `src/config.js` (staat onderaan Instellingen) in de release-PR.

Een **spoedfix** op productie: `git switch -c hotfix/<naam> main`, fixen, pull request naar `main`, daarna `main` terug mergen in `develop` zodat de fix niet verloren gaat.

## Instellen op GitHub (eenmalig, in de browser)

Dit kan alleen jij, het zit in de instellingen van de repository: **Settings → Branches → Add branch ruleset** (of "Add classic branch protection rule") voor `main`:

- *Require a pull request before merging* (niemand pusht rechtstreeks naar productie, ook jij en ik niet per ongeluk);
- *Require status checks to pass*: kies de check **test** (uit de workflow "Test & deploy");
- *Block force pushes* en *Restrict deletions*.

Pas daarna werkt "beschermen" ook echt: zonder deze regel is het een afspraak, met deze regel een slot.

## Proberen zonder productie aan te raken

- Lokaal: `npm run serve` (http://localhost:5173) toont de branch waar je op staat. Voor een uitrol-achtige proef met service worker: `npm run stage` en `SERVE_ROOT=_site npm run serve`.
- Op je telefoon kan dat via het IP-adres van je computer, of na een release. Een tweede publieke versie naast productie bestaat niet: GitHub Pages heeft één site per repository.
- **De database is gescheiden.** Alles wat niet op de productie-site draait (localhost, het IP-adres van je computer) praat met een **lokale testdatabase** (Docker), niet met de echte gegevens. Zie [DEV-OMGEVING.md](DEV-OMGEVING.md). Zolang die niet is ingericht, geldt het oude voorbehoud: probeer schrijf-acties met een testaccount, of anoniem.

## Wijzigingen aan de database (Supabase) zijn extra voorzichtig

Gebruikers draaien soms nog een oudere app-versie (de app-cache werkt pas bij na "Vernieuwen"). Elke wijziging aan de server moet daarom **achterwaarts compatibel** zijn:

1. **Eerst uitbreiden**: nieuwe kolommen met een standaardwaarde, nieuwe tabellen, nieuwe functies. Daarna pas de app die ze gebruikt uitrollen.
2. **Nooit in één stap hernoemen of verwijderen** wat de huidige productie-app nog gebruikt. Eerst de app uitrollen die het niet meer nodig heeft; in een latere release opruimen.
3. Migraties staan in `supabase/migrations/` (genummerd, herhaalbaar) en worden met de hand in de SQL-editor uitgevoerd; lokaal pakt `npm run db:start` ze zelf op. De server-tests (`tests/server/`, Postgres in Node) draaien mee in `npm test` en in CI, en bewijzen onder meer dat een gebruiker nooit andermans gegevens ziet. Een migratie gaat **eerst lokaal** getest naar productie bij de release, vóórdat de nieuwe app wordt uitgerold.
4. De Edge Function (`send-reminders`) wordt met de hand geplakt in het dashboard. Houd het bestand in de repo gelijk aan wat er live staat.

Schema-wijzigingen worden **eerst op de lokale testdatabase** geprobeerd en pas bij de release op productie gezet (zie DEV-OMGEVING.md).

## Terugdraaien

- Een release terugdraaien: een pull request die de merge terugdraait (`git revert -m 1 <merge-commit>`) en naar `main` gaat. De uitrol zet de oude versie weer neer; gebruikers krijgen hem na "Vernieuwen".
- Zien wat versie 1.0 was: `git checkout v1.0` (of `git diff v1.0 main`).

## Wat de tests beschermen

`npm test` (in CI, bij elke push en pull request) toetst de logica, de data-laag, sync, de service worker, de thema's en de push-functie, plus afspraken als "geen `innerHTML`", "geen service-sleutel in de repo" en "geen `dvh` in hoogtes".

De **browsertests** (de flows in Chrome op telefoon- en desktopformaat) staan nog niet in de repository en draaien dus niet in CI. Die in de repo zetten en in CI draaien is de logische eerste stap om de productieversie echt te beschermen.
