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
