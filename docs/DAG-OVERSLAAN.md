# Een dag overslaan: voor al je taken tegelijk, met een reden

Status: **gebouwd** · 2026-11-01 · bouwt voort op [PLAN.md](PLAN.md) §4.3 (eenheden) en [DATAMODEL.md](DATAMODEL.md) · werkwijze: [WERKWIJZE.md](WERKWIJZE.md)

## Het probleem

Twee dagen van huis weg (een vriendenweekend): je bent sowieso uit je ritme. Daarna terugkijken en die dagen als "verkeerd gedaan" zien voelt niet goed en klopt niet. Pauzeren past er niet bij: dat is per taak, loopt door tot je hervat en is bedoeld voor een periode, niet voor een weekend dat al voorbij is. Overslaan per taak (de ⋯ op de kaart) kan wel, maar is veertien keer tikken, en de reden staat dan verspreid over veertien kaarten.

## Wat het is

Een dag (of een reeks dagen) die je **voor alle taken tegelijk** overslaat, met een **verplichte reden**.

| | Pauzeren | Taak overslaan | **Dag overslaan** |
|---|---|---|---|
| Voor | één taak, of alles | één taak op één dag | **alle taken, losse dagen** |
| Terug in de tijd | nee, loopt vanaf vandaag | 14 dagen | **14 dagen terug, 31 vooruit** |
| Reden | nee | een notitie, vrij | **verplicht** |
| Telt als | gepauzeerd | overgeslagen | **gepauzeerd** |

## Hoe het werkt

| Plek | Wat |
|---|---|
| **Vandaag, onder de dagdelen** | De knop **Deze dag niet meetellen**, met een eigen icoon, naast **Iets inplannen** (zie [LOSSE-AFSPRAKEN.md](LOSSE-AFSPRAKEN.md)); de eerste is de dagelijkse en heeft de accentrand, deze is de zeldzame en blijft grijs (voor de dag die je bekijkt; ook voor een dag terug in de tijd, of later vandaag voor een dag die je al weet) |
| **Het blad** | Eerst de reden (verplicht): *Van huis weg*, *Ziek*, *Bijzondere of drukke dag* of *Anders*. Bij *Anders* is de toelichting de reden en dus verplicht; bij de rest is ze optioneel. Daaronder **Van** en **Tot en met**, standaard de dag die je bekijkt: zo sla je een weekend in één keer over |
| **Een overgeslagen dag** | Bovenaan een banner (*Telt niet mee: Ziek*) met de reden en de toelichting, en de knoppen **Reden aanpassen** en **Weer meetellen** (met "Ongedaan maken" in de melding). De taken van die dag staan niet open; wat je die dag al had afgevinkt blijft gedaan |
| **Voortgang, onderaan** | **Dagen die niet meetellen**: alle dagen met hun reden, de laatste bovenaan. Zo kun je ook na meer dan 14 dagen nog terugzien waarom |

## Wat het verandert in de telling

Een overgeslagen dag **is een pauze voor elke taak**. Alles wat al met pauzes rekent doet dus vanzelf het goede:

- een vaste dag is `paused`, geen `missed`; een week- of maandtaak heeft die dag niet meer nodig (`availableDays`);
- de **reeks** breekt niet, **consistentie** en **sterkte** laten de dag buiten beschouwing;
- de dag telt niet mee naar **ingeburgerd** (de 66 dagen lopen niet door, zie `countActiveDays`);
- **Even kijken** meldt niets over die dag;
- de **heatmap** toont hem als gepauzeerd;
- een taak die je op die dag al afvinkte blijft **gedaan** (en telt dus voor je reeks en punten).

Het is geen stille toverknop: een dag die je overslaat, kost geen punten maar levert er ook geen op, en zoals bij pauzeren valt wie ruim `activeDays` dagen niets afvinkt even weg uit de vriendenlijst (zie [SOCIAAL.md](SOCIAAL.md)).

## Gegevens

Een nieuwe collectie **`skipDays`**, dus een **servermigratie** (`supabase/migrations/0010_skipdays.sql`, die alleen de collectienaam toevoegt) en een nieuwe IndexedDB-versie (6).

| Waar | Wat |
|---|---|
| `skipDays` | `id` = de datum, `date`, `reason` (`away`/`sick`/`event`/`other`), `note` (max. 200 tekens; verplicht bij `other`). Eén record per dag, zodat één dag weer meetellen of een andere reden geven eenvoudig blijft |
| `repo.snapshot()` | Naast `skipDays` bevat `pauses` voor elke habit **afgeleide pauzes** (`derived: true`, opeenvolgende dagen samengevoegd, nooit opgeslagen). Daardoor hoeft geen van de rekenlagen iets te weten van overgeslagen dagen |

Die afgeleide pauzes horen er niet in waar het om een **eigen pauze** gaat: de back-up (`buildExport` laat ze weg; de overgeslagen dagen staan er zelf in), de sectie *Gepauzeerd* op Habits, de knop *Hervat* en de prestatie voor het hervatten van een pauze. Dat loopt via `isOwnPause` ([skipdays.js](../src/domain/skipdays.js)).

**Volgorde bij de release**: eerst migratie 0010 op productie (zie [WERKWIJZE.md](WERKWIJZE.md)), dan de app. Zonder de migratie weigert de server de records en blijven ze alleen op het toestel staan. Een oudere appversie kent `skipDays` niet en negeert ze (`DATA_COLLECTIONS`): daar telt zo'n dag dan nog als gemist, tot die app is bijgewerkt.

## Besluiten

| # | Besluit | Reden |
|---|---|---|
| D1 | Gepauzeerd, niet "overgeslagen" | Besloten 2026-11-01. Een overgeslagen dag telt wel mee naar "ingeburgerd" en voor de fase; een dag dat je niet thuis bent hoort daar niet bij |
| D2 | Eén record per dag, geen bereik | Eén dag weer laten meetellen of een andere reden geven is dan één handeling; een bereik moet je dan splitsen |
| D3 | Een vaste lijst redenen, plus *Anders* met een verplichte toelichting | Zo is de lijst later te lezen en te tellen, en blijft *waarom* nooit leeg |
| D4 | Terug tot 14 dagen (zoals afvinken), vooruit tot 31 dagen | Terugkijken hoort bij hetzelfde venster als corrigeren; een weekend dat je al weet mag je vooraf aangeven. Langer weg: gebruik Pauzeer alles |
| D5 | De knop heet "Deze dag niet meetellen", niet "Dag overslaan" | Besloten 2026-11-05 (met Remco). Het zegt wat het doet (geen gemiste dag, geen gebroken reeks) en klinkt niet als opgeven. De woorden in het blad, de banner, de meldingen en de lijst volgen; in de code en in de data blijft het `skipDay` en "overgeslagen" |
