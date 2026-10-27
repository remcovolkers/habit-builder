# Release 1.4: de widget voor Vandaag

Een korte checklist in dezelfde opzet als [RELEASE-v1.3.md](RELEASE-v1.3.md). De widget, de opschoning van de app en de tijdzone staan al in `main`; deze release zet alleen de versie op `1.4`, zodat de workflow **Android-app** een nieuwe getekende APK bouwt en de GitHub Release **v1.4.0** maakt. Zonder nieuwe versie slaat de workflow dat over (de release v1.3.0 bestaat al), en bevat de APK van 1.3.0 de widget niet.

Ontwerp van de widget: [ANDROID-WIDGET.md](ANDROID-WIDGET.md).

## Wat er in zit

| Onderdeel | Toelichting |
|---|---|
| Widget voor het startscherm met de lijst van vandaag, vinkjes en tellers (− en +) | Alleen in de APK; de webkant werkt zichzelf bij |
| Dagdelen als bovenste regel, een gedaan dagdeel verdwijnt, voortgang rechtsboven | |
| Kleuren van je thema, en een icoon voor "niet gesynct" | |
| Geen installatie-uitleg in de app, tijdzone automatisch, Instellingen opgeschoond | Al live via de site |

Geen servermigratie en geen nieuwe secrets: de widget praat niet met de server, alleen met de app.

## 1. De release

1. Pull request `release/1.4` → `main`, merge. De PWA rolt uit en de workflow bouwt de APK.
2. Controleer onder **Actions** dat **Android-app** groen is, en onder **Releases** dat **v1.4.0** `habit-builder.apk` heeft.
3. Zet daarna `main` terug in `develop` (zodat de versie en deze checklist daar ook staan).

## 2. Na de release (Jij, op je telefoon)

1. **De updatemelding, de eerste echte proef:** open de app met versie 1.3.0 (de release-APK die je nu hebt). Binnen een dag, of meteen via Instellingen met ontwikkelaarsopties → "Controleer op een nieuwe app-versie", moet "Nieuwe versie (1.4.0) staat klaar. Downloaden?" verschijnen. **Downloaden** opent de APK in Chrome; installeer hem over de oude heen (zelfde handtekening, dus de gegevens blijven).
2. **Widget toevoegen:** open de app één keer, tik lang op je startscherm → Widgets → Habit Builder → Vandaag.
3. **Proeven:** vinkjes aan en uit, een teller met − en +, het icoon voor niet gesynct na een tik in de widget, een gedaan dagdeel dat verdwijnt nadat je de app opent, en een themawissel in de app.

## Terugdraaien

- Een pull request die de merge terugdraait (`git revert -m 1 <merge-commit>`). Een al gepubliceerde GitHub Release blijft staan; verwijder die zo nodig met de hand, anders blijft de app melden dat 1.4.0 klaarstaat.
- Gaat alleen de widget mis, dan is dat een kleine hotfix-release (`1.4.1`); de rest van de app blijft werken.
