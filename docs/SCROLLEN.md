# Scrollen: stand van zaken en voorstel

Aanleiding: een blad ("Wat hield je tegen?", de iconenkiezer) liet de pagina erachter verschuiven, de zijbalk verdween, en je wilt zelf bepalen wat er scrolt: bij voorkeur alleen lijsten, met koppen die blijven staan, een scrollbalk in het thema en een 1080p-scherm met zo min mogelijk scrollen.

De cijfers hieronder komen uit `npm run audit:scroll` (meet elke pagina met het gevulde testaccount; dezelfde meting kun je na elke wijziging herhalen).

## 1. Wat er in deze ronde is opgelost

| Bevinding | Oorzaak | Oplossing |
|---|---|---|
| Het blad scrolt de achterliggende pagina weg; de zijbalk verdwijnt bij de iconenkiezer | Het scroll-slot zette `overflow: hidden` op `html` **én** `body`. Daardoor werd `body` zelf een scrollcontainer en raakte de plakkende zijbalk los van het scherm (gemeten: de zijbalk schuift 250 px omhoog zodra het blad opent) | alleen op `html` (`styles/components/dialog.css`). De controle `check:layout` faalt aantoonbaar met het oude slot |
| De pagina verspringt naar rechts | Met het slot verdween de scrollbalk en dus zijn plek | `scrollbar-gutter: stable` op `html`: de plek blijft altijd gereserveerd, ook bij een korte pagina |
| Een scrollbalk in het thema | Systeemgrijs | dun, accentkleur, doorzichtig spoor (`styles/base.css`; geldt ook voor elke lijst die later zelf scrolt) |

Bijvangst: de weekstrook en de voortgangsring maakten de kop van Vandaag bij 200% tekst breder dan het scherm; dat werd eerder per ongeluk verborgen door het oude slot en is hersteld.

## 2. Gebouwd: de desktop-schil (vanaf 960 px)

Op de telefoon is er niets veranderd (gemeten: dezelfde paginahoogtes als eerst). Vanaf 960 px scrolt **de pagina zelf nooit meer**:

- De zijbalk staat vast en het werkvlak ernaast is de scroller; zijn balk staat aan de rand van het scherm (de inhoud blijft op leesbare breedte in het midden).
- Een pagina met een kop en kolommen (`.page`) scrolt niet in zijn geheel: **de kop blijft staan en elke kolom scrolt zelf** (`.page__pane`, of `.page__scroll` voor één lijst). Kolommen reserveren hun eigen plek voor de balk, in het themakleur.
- Een hertekening (een tik op een vinkje) laat elke kolom op dezelfde plek staan (`src/ui/live.js`).

Wat scrolt waar, gemeten met `npm run audit:scroll` (met het gevulde account):

| Pagina | Blijft staan | Scrolt | 1920×1080 | 1536×730 (1080p op 125%) |
|---|---|---|---|---|
| Vandaag | groet, ring, dagnavigatie, weekstrook | linkerkolom (Even kijken, dagdelen) en rechterkolom (stapel) los van elkaar | 751 van 1090 px zichtbaar | 469 van 1090 px |
| Habits | titel en knoppen | de lijsten | past | 522 van 664 px |
| Habit: detail | terug, bewerken | hoofdkolom en zijkolom los van elkaar | past | 626 van 885 px |
| Habit: bewerken / nieuw | terug, titel, de knoppen Opslaan en Annuleren | het formulier, op ≥ 1200 px in twee kolommen | nieuw: past; bewerken (met teller): 908 van 1112 px | 578 van 855-1112 px |
| Voortgang | titel, vriendenkaart, overzicht (week of maand) met de datumkeuze | de taken eronder (met de twee tegels), en de terugblik rechts, los van elkaar | 469 (week) of 297 (maand) van 1623 px | 269 (week) of 191 (maand) van 1623 px |
| Prestaties | - | past | past | past |
| Instellingen | - | het werkvlak (balk aan de rand) | past | 730 van 846 px |

De kolommen hebben lucht tussen de inhoud en hun scrollbalk (16 px) en rondom ruimte voor de gloed van de kaarten. Het vaste deel van Voortgang is hoogstens 58% van de schermhoogte: bij het maandoverzicht op een laag scherm scrolt dat deel dan zelf een stukje, zodat de taken zichtbaar blijven; de maandvakjes zijn daarvoor laag (nog wel een tikvlak) in plaats van vierkant.

Aanpassingen onderweg: een compactere kop op Vandaag onder 900 px hoogte, een kleinere heatmap op de detailpagina, en een vaste opslaan-balk onderaan het formulier.

## 3. Waar het scrollgedrag is vastgelegd

| Waar | Effect |
|---|---|
| `styles/base.css` | geen rubberband, nooit zijwaarts (`overflow-x: clip`), scrollbalk in het thema (dun, accent) |
| `styles/layout.css`, blok ≥ 960 px | de schil: `html` en `body` scrollen niet, `.app__main` is de scroller, `.page` / `.page__frame` / `.page__panes` / `.page__pane` / `.page__scroll` voor pagina's met kolommen |
| `styles/components/dialog.css` | slot op `html` zolang een blad open is (alleen telefoon en brede schermen zonder schil; op desktop scrolt de pagina toch al niet) |
| `src/ui/live.js` | bewaart de scrollstand van elke kolom bij een hertekening |
| `src/router.js` | een nieuwe pagina begint bovenaan (pagina en werkvlak) |
| `styles/components/nav.css` | tabbalk en plusknop vast op de telefoon |

Een nieuwe pagina met kolommen maken: geef de wortel de klasse `page`, het eerste kind `page__frame`, het kolomraster `page__panes` en elke kolom `page__pane` (of zet één lijst in een `page__scroll` onder een kop; wil je een kolom met een vast deel en een lijst, gebruik `page__col` met `page__fixed` en `page__scroll`). Een pagina zonder die klassen scrolt gewoon in het werkvlak.

## 4. Nog te doen en bewust niet gedaan

- **Toetsenbord:** een kolom scrolt met het toetsenbord zodra er iets in focus staat (elke kolom bevat knoppen of links). Een kolom zonder bedienbare inhoud kan niet met het toetsenbord gescrold worden; die komen nu niet voor.
- **Telefoon:** blijft zoals hij was (een pagina die scrolt met de tabbalk onderaan). Een kop die blijft staan is daar optioneel te doen, maar kost beeldruimte.
- **Vrienden, inloggen en overige pagina's** hebben de kolomindeling nog niet en scrollen als geheel in het werkvlak.
- **Smalle laptopvensters bij 200% tekst of 320 px:** bekende afwijking van ongeveer 10 px op Vandaag (herstelmoment, kop van de stapel en knoppen in een stapelkaart); de lay-outcontrole meldt die als INFO.
