# Flexibele taken: overzicht houden, inplannen en op tijd gewaarschuwd worden

Status: **gebouwd** · 2026-10-17 · bouwt voort op [PLAN.md](PLAN.md) §4.6 (de stapel) en §4.9 (aandacht) · werkwijze: [WERKWIJZE.md](WERKWIJZE.md)

## Het probleem

Een flexibele taak is een taak zonder vaste dag: "2× per week" of "2× per maand". Met een paar van die taken is de stapel "Oningepland" op Vandaag prima. Met tien wordt het een rommeltje:

- Elke kaart in de stapel had drie knoppen en nam ruim 230 px in beslag. Vier taken waren al een kwart van de pagina.
- Er was geen plek om de week in één keer te overzien en te verdelen.
- De waarschuwing kwam te laat. De badge "Risico" verschijnt pas als de afspraak **niet meer te halen is**. Donderdag 0 van 2 in de week gaf nog niets, terwijl de kans om het te halen al kleiner wordt.

## Wat er is gebouwd

| Onderdeel | Wat |
|---|---|
| **Vroege waarschuwing** | Een taak "dreigt te falen" zodra het deel van de periode dat nog over is kleiner is dan **60%** van het deel van de afspraak dat nog moet (`TIGHT_RATIO`, [tight.js](../src/domain/tight.js)). Donderdag 0 van 2: 4 van 7 dagen over (57%) tegen 100% nog te doen: krap. Met één keer gedaan niet. 2× per maand: vanaf ongeveer de veertiende. |
| **Compacte stapel op Vandaag** | Een regel per taak met de voortgang en één knop ("＋ Vandaag"). "Een andere dag" en "Al gedaan" zitten achter ⋯. Wat dreigt te falen staat bovenaan onder **Dreigt te falen** en blijft altijd in beeld; daarna **Verder deze week**. Hoogstens vier kaarten staan in beeld; de rest zit ingeklapt onder "Nog n taken tonen". |
| **Plan je week** | Een blad (via een knop in de kop van **Flexibel** op Habits, en in de kop van de stapel op Vandaag) met per flexibele taak de komende acht dagen (vandaag en zeven vooruit) om aan te tikken. De knop **Verdeel voor mij** verdeelt de ontbrekende keren ([week-plan.js](../src/app/week-plan.js)). |
| **Habits** | Eén werkbalk (Volgorde, Pauzeer alles). Lopende habits staan in **Vaste dagen** en **Flexibel**. Elke rij heeft een statusregel: de fase en dag ("Opbouw · dag 24"), en bij een flexibele taak de voortgang van de week of maand en eventueel "Dreigt te falen" ([habits-overview.js](../src/app/habits-overview.js)). |

## Hoe "Verdeel voor mij" kiest

1. Alleen wat nog ontbreekt: het aantal keren dat de afspraak vraagt, min wat al gedaan is, min wat al gepland staat.
2. Alleen vrije dagen **in de lopende week of maand**. Een gepauzeerde dag, een overgeslagen dag en een dag buiten de looptijd tellen niet.
3. Per taak zo ver mogelijk uit elkaar, tot de afstand die bij het ritme past (de periode gedeeld door het aantal keren: bij 2× per week 3 dagen), en zo vroeg mogelijk. Donderdag 0 van 2 geeft donderdag en zondag. Eén keer gedaan op maandag en één nodig geeft donderdag.
4. Op de dag met de minste andere taken. Twee taken die elk één keer nodig hebben komen niet op dezelfde dag.
5. De taak met de minste ruimte gaat eerst.

## Besluiten

| # | Besluit | Reden |
|---|---|---|
| F1 | De drempel is 60% | Besloten 2026-10-17. Dit geeft precies het voorbeeld (donderdag 0 van 2), en een wekelijkse taak krijgt pas laat een waarschuwing |
| F2 | Alleen de komende 7 dagen te plannen | Dat is de grens van de bestaande dagplanning (`PLAN_AHEAD_DAYS`). Voor een taak per maand plan je dus alleen wat in die week valt |
| F3 | De vroege waarschuwing zit in de stapel, niet in "Even kijken" | Dat systeem werkt met redenen ("Wat hield je tegen?"), de ochtendmelding en de weekreview. Dat is te zwaar voor een taak die nog te halen is |
| F4 | De waarschuwing verandert de ochtendmelding niet | Die blijft rustig en gaat alleen over wat al stilligt of mislukt is |
| F6 | Plan je week staat bij de groep Flexibel, in een melding met tekst: "Nog 2 taken om in te plannen" met de knop ernaast. Is alles ingepland, dan staat er "Alles is ingepland of gedaan" en is de knop stil | Eerst stond de knop in de werkbalk naast Volgorde, in de stijl van een actieve knop. Dat leek een aan/uit-stand ("ik zit in de planmodus"). Alleen Volgorde is een echte aan/uit-stand (en toont dan "Klaar"). Een los getal op de knop (eerst geprobeerd) was ook onduidelijk: een zin zegt wat er te doen is en waarom je klikt. Gepauzeerde taken tellen niet mee |
| F5 | Satisfied taken staan achter "Nog n taken tonen" als er meer dan vier zijn | Wat klaar is, is geen werk meer |

## Weten

- Een taak die je vandaag al deed staat bij de dagdelen, niet meer in de stapel. Dat was al zo.
- De werkbalk op Habits laat Plan je week alleen zien als er een flexibele taak loopt.
- Bij het bouwen bleek dat de lay-outcontrole (`npm run check:layout`) bij elke run een browserprofiel van ongeveer 475 MB in Temp achterliet. Na enkele honderden runs was de schijf vol. De drie browsertools (`layout-check`, `scroll-audit`, `social-browser-check`) ruimen dat profiel nu zelf op.
