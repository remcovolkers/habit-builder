# Release 1.5.1: afspraken uit je agenda afvinken, en zien uit welke agenda ze komen

Een kleine aanvulling op [RELEASE-v1.5.0.md](RELEASE-v1.5.0.md), na het proberen van de agenda met een gedeelde agenda. Deze release zet de versie op `1.5.1`, zodat de workflow **Android-app** een nieuwe getekende APK bouwt en de GitHub Release **v1.5.1** maakt. De APK is nodig voor de naam van de agenda van de telefoon (de plugin geeft die nu mee); het afvinken en de naam uit de Google-feed werken via de webkant.

Ontwerp: [AGENDA.md](AGENDA.md).

## Wat er in zit

| Onderdeel | Toelichting |
|---|---|
| **Afvinken** | Een afspraak uit je agenda heeft een vinkje, met "Ongedaan maken". Het blijft op je toestel (geen sync) en telt nergens mee. Een afspraak blijft afgevinkt als hij de volgende keer uit de andere bron komt. Je kunt het op de dag zelf doen en tot 14 dagen terug |
| **De naam van de agenda** | "14:30–15:30 · Agenda · Mel": achter het woord Agenda staat de naam van de agenda waar de afspraak uit komt. Van de telefoon is dat de naam uit je agenda-app (een gedeelde agenda heeft zijn eigen naam), uit het Google-adres de naam van die agenda. Een lange naam breekt af |

Wat je afvinkt staat als een onleesbaar nummer op je toestel, niet met de titel van de afspraak; uitloggen wist het. Zie [PRIVACY.md](PRIVACY.md).

Geen servermigratie, geen nieuwe functie en geen nieuwe rechten.

## 1. De release

1. Pull request `release/1.5.1` → `main`; wacht tot de tests groen zijn; merge.
2. Controleer onder **Actions** dat **Test & deploy** en **Android-app** groen zijn, en onder **Releases** dat **v1.5.1** `habit-builder.apk` heeft.
3. Zet daarna `main` terug in `develop`.

## 2. Na de release (jij, op je telefoon)

1. **Updatemelding:** open de app met versie 1.5.0. Binnen een dag, of via Instellingen met ontwikkelaarsopties → "Controleer op een nieuwe app-versie", moet "Nieuwe versie (1.5.1) staat klaar" verschijnen. Installeer de APK over de oude heen.
2. **De naam van de agenda:** met **Agenda van deze telefoon gebruiken** aan staat achter het woord Agenda de naam van de agenda uit je agenda-app. Een afspraak uit de gedeelde agenda met Mel heeft de naam van die agenda. Heb je ook het adres gekoppeld, dan wint de naam van de telefoon.
3. **Afvinken:** tik het rondje van een afspraak. Verwacht "Gedaan" en een melding met **Ongedaan maken**; de ring en de tellers bij de dagdelen veranderen niet. Sluit de app en open hem opnieuw: het staat er nog.

Het hele draaiboek staat in HOW-TO-TEST §T (stap 4, 4b en 12b).

## Terugdraaien

Een pull request die de merge terugdraait (`git revert -m 1 <merge-commit>`). Een al gepubliceerde GitHub Release blijft staan; verwijder die zo nodig met de hand, anders blijft de app melden dat 1.5.1 klaarstaat.
