# Documentatie

Een overzicht van alle documenten in deze map, per soort. Elk ontwerpdocument begint met een regel **Status** (gebouwd, voorstel, wat in welke versie zat); houd die bij als je iets verandert. Waar de tests of de code naar een document verwijzen, staat dat in het document zelf.

## Beginnen

| Je wilt weten… | Lees |
|---|---|
| wat de app is, de eisen en de domeinregels (ingeburgerd, streaks, aandacht) | [PLAN.md](PLAN.md) |
| hoe we werken: branches, releases, tests, terugdraaien, voorzichtig met de database | [WERKWIJZE.md](WERKWIJZE.md) |
| hoe je lokaal draait met een testdatabase en testaccounts | [DEV-OMGEVING.md](DEV-OMGEVING.md) |
| wat in welke versie zat, en welke servermigraties erbij hoorden | [RELEASES.md](RELEASES.md) |
| hoe je een functie met de hand probeert (draaiboeken per onderwerp) | [HOW-TO-TEST.md](HOW-TO-TEST.md) |
| welke gegevens er waar staan (lokaal, server) en wat we niet opslaan | [DATAMODEL.md](DATAMODEL.md) |

## Functies: ontwerp en besluiten

Per functie: het probleem, wat er is gebouwd, de besluiten (met reden) en wat nog open staat.

| Document | Gaat over |
|---|---|
| [SOCIAAL.md](SOCIAAL.md) | vrienden en ranglijst: punten, server, schermen (1.1) |
| [ITERATIE-1.2.md](ITERATIE-1.2.md) | uitnodigen, vrienden inzien, meer prestaties, meer iconen (1.2) |
| [ONBOARDING.md](ONBOARDING.md) | de eerste keer: stijl kiezen, een dag, installeren, de eerste habit, en "Zo werkt het" |
| [FLEXIBELE-TAKEN.md](FLEXIBELE-TAKEN.md) | taken met "N× per week of maand": de stapel, "dreigt te falen", Plan je week |
| [AUTOMATISME.md](AUTOMATISME.md) | het automatisme-cijfer, wat hielp en de proef zonder app |
| [WONT-DO.md](WONT-DO.md) | "Ga ik niet doen": een taak opgeven met reden en plan |
| [DAG-OVERSLAAN.md](DAG-OVERSLAAN.md) | een of meer dagen overslaan met een reden |
| [LOSSE-AFSPRAKEN.md](LOSSE-AFSPRAKEN.md) | eenmalige herinneringen op Vandaag |
| [AGENDA.md](AGENDA.md) | afspraken uit je agenda op Vandaag (Google-adres en agenda van de telefoon) |
| [DAGDEEL-EN-DAGREFLECTIE.md](DAGDEEL-EN-DAGREFLECTIE.md) | een taak naar een ander dagdeel slepen en "Hoe ging je dag?" |
| [FEEDBACK.md](FEEDBACK.md) | de feedbackhub: feedback geven en lezen |
| [FEEDBACKRONDE-2026-11.md](FEEDBACKRONDE-2026-11.md) | uitbouwen (een doel met treden), prestaties die kloppen, per habit, herijken, de review na drie dagen |
| [SCROLLEN.md](SCROLLEN.md) | scrollen op desktop en telefoon: de schil met kolommen |

## Android

| Document | Gaat over |
|---|---|
| [ANDROID-APP.md](ANDROID-APP.md) | de opzet van de app: schil, meldingen via FCM, updaten, inloggen met Google, pipeline |
| [ANDROID-SETUP.md](ANDROID-SETUP.md) | wat jij moet instellen: sleutel, secrets, Firebase, proberen |
| [ANDROID-WIDGET.md](ANDROID-WIDGET.md) | de widget voor Vandaag |

## De server instellen (Supabase)

| Document | Gaat over |
|---|---|
| [M4-SETUP.md](M4-SETUP.md) | URL's, inloggen met Google en e-mailcode, de database |
| [M7-SETUP.md](M7-SETUP.md) | de ochtendherinnering: sleutels, tabel, functie, planning |

## Uiterlijk

| Document | Gaat over |
|---|---|
| [THEMES.md](THEMES.md) | de twee thema's, een thema toevoegen en de bedoeling achter de stijl |
| [MODA-ICONS.md](MODA-ICONS.md) | de iconenset: sleutels, de prompt voor Moda, hoe je iconen toevoegt (`npm run icons:build`) |
| [icons/](icons/) | de bron van de iconenset (`icons-*.html`); `galerij.html` maak je opnieuw met `npm run icons:gallery` en staat niet in git |

## Juridisch

| Document | Gaat over |
|---|---|
| [PRIVACY.md](PRIVACY.md) | de privacyverklaring (een test controleert dat elke opgeslagen kolom erin staat) |
| [VOORWAARDEN.md](VOORWAARDEN.md) | de gebruiksvoorwaarden |

## Voorstellen: nog niet (helemaal) gebouwd

| Document | Gaat over |
|---|---|
| [USE-CASES-VOLGENDE-FEATURES.md](USE-CASES-VOLGENDE-FEATURES.md) | vier ideeën met use cases en onderzoek: nog steeds ingeburgerd?, terug naar af, groepen met taken, Play Store en App Store |
| [MELDINGEN-EN-OPSCHONEN.md](MELDINGEN-EN-OPSCHONEN.md) | de app opschonen is gebouwd; meer meldingen (avondcheck, "terugblik sluit bijna") is nog een voorstel |
