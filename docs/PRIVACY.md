# Privacyverklaring Habit Builder

Laatst bijgewerkt: 15 oktober 2026

Habit Builder is een hobbyproject van **Remco Volkers** (een particulier, geen bedrijf). Hij is verantwoordelijk voor de gegevens die je in de app invult. Contact: **remco.volkers1@gmail.com**.

## Kort samengevat

- Je habits blijven standaard **alleen op je eigen apparaat**.
- Maak je een account, dan staat een kopie ook op een server, zodat je je gegevens op meer apparaten hebt en ze niet kwijtraken.
- Er is **geen tracking, geen reclame en geen analyse**. Je gegevens worden niet verkocht of gedeeld met adverteerders.
- Je kunt je gegevens altijd downloaden en je account en alle gegevens op de server zelf verwijderen, in de app onder Instellingen.

## Welke gegevens

**Zonder account** (alleen op je apparaat, in de opslag van je browser):
- je habits, check-ins, pauzes, planning, prestaties, automatisme-cijfers en wekelijkse reviews;
- je instellingen (naam voor de begroeting, tijdzone, dagwissel).

**Met een account** komt daar bij:
- je **e-mailadres** (bij inloggen met Google ook de naam en profielfoto-URL die Google meestuurt; de app gebruikt die niet);
- een **kopie van de gegevens hierboven** op de server, gekoppeld aan jouw account en alleen voor jou leesbaar;
- technische gegevens die nodig zijn om in te loggen (een sessiesleutel in je browser).

Je habit-namen, cues, "waarom"-teksten, notities en reviews zijn vrije tekst die jij schrijft. Zet er geen gevoelige gegevens in die je niet op een server wilt hebben.

## Waarvoor

Uitsluitend om de app te laten werken: je habits tonen, je voortgang berekenen, je gegevens synchroniseren en je laten inloggen. De grondslag is dat dit nodig is om de dienst te leveren die jij vraagt (en voor de inlogmail: je eigen verzoek).

## Met wie gedeeld

Alleen met de diensten die de app laten draaien (verwerkers):

| Dienst | Waarvoor |
|---|---|
| **Supabase** | opslag van je account en gegevens, en het inloggen |
| **Google** | inloggen met Google, en het versturen van de inlogcode per e-mail (via Gmail) |
| **GitHub** | het aanbieden van de app zelf (GitHub Pages); GitHub ziet daarbij je IP-adres zoals bij elke website |

Verder niemand, tenzij een wet dat afdwingt.

## Cookies en opslag in je browser

De app gebruikt geen tracking-cookies. Wel bewaart je browser lokale opslag (IndexedDB en localStorage) met je gegevens, je inlogsessie en een paar voorkeuren (zoals "zetje om in te loggen weggeklikt"). Dat is nodig voor de werking.

## Hoe lang

Zolang je het apparaat of je account gebruikt. Verwijder je je account in de app, dan worden je account en alle bijbehorende gegevens direct van de server gewist. Kopieën in back-ups van de hostingdienst kunnen daarna nog kort bestaan. Gegevens op je eigen apparaat blijven staan tot je ze zelf wist.

## Jouw rechten

Je kunt inzage, correctie, overdracht (de back-up als JSON-bestand in Instellingen) en verwijdering vragen. Veel kun je zelf in de app. Voor de rest mail je het contactadres hierboven. Ben je het niet eens met hoe ik met je gegevens omga, dan kun je een klacht indienen bij de **Autoriteit Persoonsgegevens** (autoriteitpersoonsgegevens.nl).

## Beveiliging

Verkeer loopt via HTTPS. Op de server kan elke gebruiker alleen zijn eigen gegevens lezen of wijzigen (beveiliging per rij in de database). Het is een hobbyproject: er is geen garantie dat het nooit misgaat, daarom raad ik aan af en toe een back-up te downloaden.

## Wijzigingen

Verandert er iets wezenlijks aan hoe de app met gegevens omgaat, dan pas ik deze verklaring aan en pas ik de datum bovenaan aan. Eerdere versies zijn terug te vinden in de geschiedenis van deze repository.
