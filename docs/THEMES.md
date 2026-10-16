# Thema's

De app heeft twee thema's. De gebruiker kiest ze onder **Instellingen → Uiterlijk**; de keuze geldt direct, wordt bewaard en synchroniseert mee naar andere apparaten als je bent ingelogd (zonder account geldt hij alleen op dit apparaat).

| Thema | Naam in de app | Uiterlijk |
|---|---|---|
| `v0lky1` (standaard) | v0lky1 Theme | donker bos, neon-munt |
| `mel` | Mel Theme | Pokémon: geel op een blauwe nacht, met illustraties |

Een thema delen kan met een link: `https://remcovolkers.github.io/habit-builder/?theme=mel`. Die zet het thema meteen, bewaart het als keuze en haalt de parameter uit de adresbalk.

## Hoe het werkt

| Onderdeel | Plek |
|---|---|
| Ontwerpbronnen van Moda (alleen referentie, niet gepubliceerd) | `moda-themes/<thema-id>/` (zelfde naam als het thema, bv. `v0lky1`, `mel`) |
| Register: id, naam, themakleur, kleurstalen, illustraties per plek | `src/app/themes.js` |
| Kleuren, achtergrond, gloed (alle tokens) | `styles/themes/<id>.css`, gekozen via `data-theme` op `<html>` |
| Structuur: typografie, ruimte, vorm, maten | `styles/tokens.css` (voor alle thema's gelijk) |
| Opstartcode tegen flikkeren (zet `data-theme` vóór de eerste weergave) | `src/theme-boot.js` |
| Toepassen (kenmerk, browserkleur, logo) | `src/ui/theme.js` |
| Illustratie voor een plek in het huidige thema | `src/ui/components/mascot.js` |
| Illustraties zelf (gepubliceerd) | `themes/<id>/…` |
| Iconen (habits, prestaties, tips): **één set voor alle thema's**, kleuren uit het thema | `icons/set.svg`, gebouwd uit `moda-themes/icons/` met `npm run icons:build`; zie [MODA-ICONS.md](MODA-ICONS.md) |

## Een nieuw thema toevoegen

1. Maak `styles/themes/<id>.css` met `:root[data-theme='<id>'] { … }`. Kopieer een bestaand thema: **elk thema moet exact dezelfde variabelen definiëren** (een test bewaakt dat).
2. Kleurtriplets (`--accent-rgb` enz.) schrijf je met **spaties** (`255 203 5`), niet met komma's; anders is `rgb(var(--accent-rgb) / 0.3)` ongeldig en valt de regel stil weg. Een test bewaakt dat ook.
3. Voeg het thema toe aan `THEMES` in `src/app/themes.js` en aan de lijst in `src/theme-boot.js`, en laad het CSS-bestand in `index.html`.
4. Illustraties (optioneel): zet SVG's in `themes/<id>/` en koppel ze per plek in `mascots`. Een plek zonder illustratie toont gewoon de standaard-emoji.
5. **Iconen:** een nieuw thema heeft geen eigen iconen nodig. De iconenset (`icons/set.svg`) is voor alle thema's gelijk en gebruikt `currentColor` en `--icon-accent`; controleer dat de iconen er in het nieuwe thema goed uitzien (contrast op het tegelvlak en op de medaille) en pas zo nodig `--color-text`, `--color-accent` of `--color-on-accent` aan.
6. `npm test` controleert contrast (WCAG AA) per thema, dat elke `var(--…)` bestaat, en dat de illustraties bestaan en geen scripts bevatten.

## Let op bij Pokémon

De Pokémon in het Mel Theme zijn auteursrechtelijk beschermd werk van Nintendo, Game Freak en The Pokémon Company. Dit is een privé-hobbyproject voor eigen gebruik. De repository en de site zijn wel publiek: wie dat anders wil, kan het Mel Theme uit de publieke versie halen of de illustraties vervangen.
