# Release 1.4.1: de widget alleen nog weergave

Een kleine aanpassing na een paar weken gebruik van de widget uit [RELEASE-v1.4.md](RELEASE-v1.4.md), in dezelfde opzet. Deze release zet de versie op `1.4.1`, zodat de workflow **Android-app** een nieuwe getekende APK bouwt en de GitHub Release **v1.4.1** maakt (bij `1.4.0` bestaat de release al en slaat de workflow dat over). De widget zit alleen in de APK; de webkant verandert niet.

Ontwerp van de widget: [ANDROID-WIDGET.md](ANDROID-WIDGET.md).

## Wat er in zit

| Onderdeel | Toelichting |
|---|---|
| De widget is alleen weergave: een tik op een rij, een dagdeel of de voortgang opent de app | Scrollen laat de rest van de lijst zien |
| Geen − en + meer bij tellers; een teller toont titel en stand ("3 / 8 glazen") | Afvinken en tellen doe je in de app |
| Volgorde Ochtend, Middag, Overdag, Avond | "Overdag" staat vóór de avond; op Vandaag in de app verandert niets |

Geen servermigratie en geen nieuwe secrets. Een tik in de widget van vóór de update die de app nog niet had verwerkt, gaat niet verloren: de app verwerkt de wachtrij nog bij het openen.

## 1. De release

1. Pull request `release/1.4.1` → `main`, merge. De workflow bouwt de APK.
2. Controleer onder **Actions** dat **Android-app** groen is, en onder **Releases** dat **v1.4.1** `habit-builder.apk` heeft.
3. Zet daarna `main` terug in `develop`.

## 2. Na de release (Jij, op je telefoon)

1. **Updatemelding:** open de app met versie 1.4.0. Binnen een dag, of via Instellingen met ontwikkelaarsopties → "Controleer op een nieuwe app-versie", moet "Nieuwe versie (1.4.1) staat klaar" verschijnen. Installeer de APK over de oude heen; de widget die al op je startscherm staat blijft staan.
2. **Proeven:** een tik op een gewone rij, op een teller, op een dagdeelstreepje en op de voortgang opent steeds de app; scrollen door de lijst werkt; "Overdag" staat vóór "Avond"; er zijn geen − en + meer.

## Terugdraaien

Een pull request die de merge terugdraait (`git revert -m 1 <merge-commit>`). Een al gepubliceerde GitHub Release blijft staan; verwijder die zo nodig met de hand, anders blijft de app melden dat 1.4.1 klaarstaat.
