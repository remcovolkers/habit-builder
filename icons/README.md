# icons/

`icon.svg` is de bron. De PNG's zijn daaruit gerenderd:

| Bestand | Gebruik |
|---|---|
| `icon-192.png`, `icon-512.png` | manifest, `purpose: any` |
| `icon-maskable-512.png` | manifest, `purpose: maskable` (alle inhoud ligt binnen de safe zone van 40% straal) |
| `apple-touch-icon.png` (180) | iOS-beginscherm |

Opnieuw maken na een wijziging in `icon.svg`: render de SVG op 512, 192 en 180 pixels naar PNG
(bijvoorbeeld met headless Edge: `msedge --headless=new --screenshot=out.png --window-size=512,512 pagina.html`
met de SVG ingesloten). De unit-tests controleren dat de afmetingen kloppen met het manifest.

## `set.svg`: de iconenset van de app

Eén sprite met een `<symbol id="<sleutel>">` per icoon (habits, prestaties, tips), voor alle thema's. **Niet met de hand bewerken**: hij wordt gebouwd door `npm run icons:build` uit de bestanden van Moda in `docs/icons/`, samen met `src/content/icon-set.js`. De kleuren komen uit het thema. Zie `docs/MODA-ICONS.md`.
