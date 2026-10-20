# Het uitlegfilmpje

Een volledig "hoe werkt het"-filmpje van de app (ongeveer tien minuten, in het Nederlands, met een stem en dezelfde tekst in beeld). Het wordt **opgenomen uit de echte app**: een headless Edge of Chrome bedient de app, vult hem met voorbeeldgegevens van "Sam" en neemt het beeld op. Daardoor kun je het opnieuw maken als de app verandert, in plaats van een film die veroudert.

```
npm run film                       # het hele filmpje  -> tools/film/out/habit-builder-uitleg.mp4
npm run film -- --scene vrienden   # één scène (of meer: --scene idee,dag), met een contactvel om snel te kijken
npm run film -- --out pad.mp4      # ergens anders heen
```

Nodig: Node 22+, Edge of Chrome (zet `BROWSER` op het pad als hij niet gevonden wordt), **ffmpeg** en voor de stem **edge-tts**. Die staan niet in de repo.

ffmpeg, kies één:

- `npm install --no-save @ffmpeg-installer/ffmpeg` (in de hoofdmap; komt niet in `package.json`), of
- ffmpeg op je `PATH`, of `FFMPEG=pad\naar\ffmpeg.exe npm run film`.

## Stem

De stem is Microsofts neurale stem `nl-NL-ColetteNeural`, via het Python-pakket `edge-tts`. Eenmalig installeren (de map `.venv` staat in `.gitignore`):

```
python -m venv tools/film/.venv
tools/film/.venv/Scripts/python -m pip install edge-tts      # op Linux/macOS: .venv/bin/python
```

- **De uitlegteksten gaan naar de online spraakdienst van Microsoft** (alleen die teksten, niets uit de app of van jou). edge-tts is een onofficiële manier om die dienst te gebruiken; mocht hij ooit stoppen, dan wordt het filmpje stil (met een melding) en blijft de rest werken.
- De stem volgt het beeld, niet andersom: elke uitleg blijft staan tot zijn fragment klaar is en de volgende wacht daarop. Zonder stem bepaalt de leestijd hoe lang een uitleg blijft staan.
- Wat er gezegd wordt, is standaard de titel, de tekst en de punten van een uitleg. Wijkt het af (pijltjes, tekens), zet dan `voice: '...'` bij de uitleg. Uitspraak van Engelse woorden (habit, streak, cue) staat in `stage/narration.js` (`PRONUNCIATION`); pas die aan als je iets vals hoort.
- Fragmenten worden bewaard in `out/voice/`; alleen nieuwe of gewijzigde teksten worden opnieuw gemaakt.
- Opties: `--no-voice` (stil), `--voice nl-NL-MaartenNeural` (een mannenstem; ook `nl-NL-FennaNeural`, `nl-BE-ArnaudNeural`, `nl-BE-DenaNeural`), `--rate=-10%` (trager; als `--rate -10%`).
- Een eigen stem: maak met `--no-voice` een stille versie en spreek de teksten uit `stage/script.js` zelf in; leg het geluid er zelf onder.

Een opname duurt even lang als het filmpje zelf (de browser speelt het in real time af), plus een paar minuten coderen. Doe er tijdens het opnemen niets zwaars naast: dan vallen er beelden weg.

## Hoe het in elkaar zit

| Bestand | Wat |
|---|---|
| `stage/script.js` | **het draaiboek**: de scènes, de teksten en wat er in de app wordt aangetikt. Hier pas je iets aan. |
| `stage/film.js` | de motor: bestuurt de app in het iframe (tikken, typen, scrollen), toont de uitleg en de titelkaarten |
| `stage/index.html`, `stage.css` | de set: telefoon links, uitleg rechts, voortgang onderaan |
| `stage/data.js` | de voorbeeldgegevens van Sam (relatief aan "vandaag", dus het blijft kloppen); `variant: 'daily'` is een rustige Vandaag, `'full'` heeft ook taken die stilliggen |
| `stage/seed.html` | maakt de opslag van de app leeg en vult hem (draait in een verborgen iframe) |
| `stage/clock.js` | een nepklok: het filmpje speelt altijd op dinsdag 20 oktober om 8:12 (en vrijdag 23 oktober voor de weekreview) |
| `stage/mock.js` | een nagebootste server voor het hoofdstuk Vrienden: Sam lijkt ingelogd, met vier vrienden. Er gaat niets naar een echte server |
| `server.mjs` | serveert de app (zoals `tools/serve.mjs`) en de set op `/film/` |
| `voice.mjs`, `stage/narration.js` | de stem: teksten verzamelen, geluid maken met edge-tts, de lengtes meten en de fragmenten onder het beeld zetten |
| `cdp.mjs`, `record.mjs` | de browser besturen, de beelden opnemen en met ffmpeg een mp4 maken |
| `shots.mjs` | hulpmiddel: stappen uitvoeren en schermafbeeldingen maken, om de app te bekijken terwijl je het draaiboek schrijft |

## Het draaiboek aanpassen

Een scène is een functie met hulpfuncties uit `film.js`:

```js
await F.chapter(2, { sub: 'Afvinken, tellen en een slechte dag', start: { kind: 'demo', variant: 'daily', now: MORNING } });
await F.say({ title: 'Een teller voor een hoeveelheid', body: 'Bij water tik je **plus** voor elk glas.' });
await F.tap('Eén erbij: Water drinken');           // tikken op tekst (of aria-label) in de app
await F.type({ css: '#name' }, 'Wandelen');        // typen in een veld
await F.scrollToText('Ingeburgerd?');              // naar een kop scrollen
await F.hold(2000);                                // even wachten
```

`F.sayAndRead` toont een uitleg en wacht zo lang als een rustige lezer nodig heeft (ongeveer 0,27 s per woord, minstens 3 s). Zoeken op tekst kan exact of "bevat"; met `{ text, inside: 'Hardlopen', css: 'li button', nth: -1 }` word je specifieker. Na elke wijziging draai je de scène los (`--scene id`) en kijk je naar het contactvel (`out/scene-<id>-sheet.png`).

## Bekende beperkingen

- **De stem is niet te controleren zonder luisteren.** Weet je zeker dat de uitspraak klopt? Luister het filmpje één keer helemaal af na elke grotere wijziging.
- De prestatiedata van Sam staat allemaal op "vandaag" (de app ontgrendelt ze in één keer bij het vullen).
- Het filmpje toont de app op localhost; de regel "testomgeving" onderaan Instellingen wordt eruit gehaald.
