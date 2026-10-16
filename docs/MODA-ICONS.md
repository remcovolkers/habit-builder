# De iconenset: wat je aan Moda vraagt

Hoort bij [ITERATIE-1.2.md](ITERATIE-1.2.md) §6. **Eén iconenset voor alle thema's** (besluit Remco, 2026-10-16): de kleuren komen uit het thema (`currentColor` en `--icon-accent`), niet uit de tekening. Het doel is dat de app geen emoji van het toestel meer toont; alles komt uit deze set.

## Wat er nog moet
De set is **109 iconen**: 60 voor habits en 49 voor prestaties, tips en twee tekens. **12 zijn klaar** (de habit-iconen van ronde 1, in `moda-themes/icons/`), dus je vraagt Moda om nog **97** in vier batches:

| Batch | Inhoud | Aantal | Prompt |
|---|---|---|---|
| 1 | habit-iconen: Beweging, Eten en drinken, Slaap en rust, Gezondheid | 22 | "Eerste prompt" |
| 2 | habit-iconen: Geest en leren, Huis, Werk en geld, Creatief, Sociaal en natuur | 26 | "Batch 2" |
| 3 | bestaande prestaties (12), tips (9) en twee tekens | 23 | "Batch 3" |
| 4 | geplande prestaties (de regels in de app volgen nog) | 26 | "Batch 4" |

## Werkwijze
1. Open het Moda-gesprek waarin de eerste 12 zijn gemaakt (zo kent Moda de stijl al) en plak de **eerste prompt**. Staat dat gesprek er niet meer, plak hem dan in een nieuw gesprek en geef de bestaande `index.html` uit `moda-themes/icons/` erbij als voorbeeld.
2. Keur de stijl van de batch goed of vraag bij. Plak daarna **batch 2, 3 en 4** in hetzelfde gesprek. Vier batches van ± 25 houden de stijl gelijk en de kwaliteit hoog.
3. Zet wat Moda geeft in **`moda-themes/icons/`**: de HTML-pagina's (bijvoorbeeld `batch-1.html`) en/of de losse `<sleutel>.svg`-bestanden. Submappen mogen. Overschrijven mag: komt een sleutel in meer bestanden voor, dan wint het laatst gewijzigde.
4. Zeg het, of draai zelf `npm run icons:build`. Dat controleert elk icoon (viewBox, geen scripts, geen vaste kleuren, formaat), bouwt `icons/set.svg` en meldt welke sleutels nog ontbreken. Een icoon dat in de set staat vervangt direct de emoji in de app; wat ontbreekt blijft emoji tot het er is.
5. Een nieuwe sleutel (bijvoorbeeld bij een nieuwe prestatie) voeg je toe in `src/content/icons.js` of `src/content/ui-icons.js` en in de tabellen hieronder; een test bewaakt dat ze gelijk blijven.

## De 60 sleutels (habits)
| Sleutel | Nederlands | Emoji (terugval) | Wat tekenen | Stand |
|---|---|---|---|---|
| **Beweging** | | | | |
| `run` | hardlopen | 🏃 | a running figure or a running shoe with motion lines | klaar |
| `walk` | wandelen | 🚶 | walking legs/figure, or a footprint trail | open |
| `bike` | fietsen | 🚴 | a bicycle | open |
| `swim` | zwemmen | 🏊 | swimmer or goggles over waves | open |
| `strength` | krachttraining | 💪 | dumbbell or flexed arm | klaar |
| `yoga` | yoga | 🧘‍♀️ | a person in a yoga pose (tree or lotus) | open |
| `stretch` | rekken | 🤸 | a figure stretching arms overhead | open |
| `posture` | houding | 🪑 | straight spine / a seated figure with upright back | open |
| **Eten en drinken** | | | | |
| `water` | water drinken | 💧 | a water drop or a glass of water | klaar |
| `salad` | gezond eten | 🥗 | a bowl of salad/greens | open |
| `fruit` | fruit eten | 🍎 | an apple or a few pieces of fruit | open |
| `no-sugar` | geen suiker | 🍬 | a sweet/candy crossed out | open |
| `tea` | thee drinken | 🍵 | a cup of tea with steam | open |
| `cook` | koken | 🍳 | a pan or pot with a spoon | open |
| `meal-prep` | maaltijden voorbereiden | 🥡 | a lunch box or containers | open |
| **Slaap en rust** | | | | |
| `sleep` | goed slapen | 😴 | a crescent moon with 'z' marks | klaar |
| `bed` | op tijd naar bed | 🛌 | a bed with a pillow | open |
| `moon` | avondritueel | 🌙 | a crescent moon and a star | open |
| `sunrise` | vroeg opstaan | 🌅 | a sun rising over a horizon | open |
| `sun` | buiten in het licht | ☀️ | a sun with rays | open |
| `breathe` | ademhalen | 🌬️ | wind/breath curls or lungs | open |
| `meditate` | mediteren | 🧘 | a seated meditating figure | klaar |
| `cold-shower` | koud douchen | 🚿 | a shower head with drops (and a snowflake) | open |
| **Gezondheid** | | | | |
| `tooth` | tanden poetsen | 🦷 | a tooth, with a sparkle | klaar |
| `floss` | flossen | 🧵 | floss between two teeth | open |
| `pill` | medicijnen | 💊 | a capsule | open |
| `vitamins` | vitamines | 🍊 | a vitamin pill bottle or citrus slice | open |
| `no-smoking` | niet roken | 🚭 | a cigarette crossed out | open |
| **Geest en leren** | | | | |
| `book` | lezen | 📖 | an open book | klaar |
| `brain` | leren | 🧠 | a brain | open |
| `study` | studeren | 🎓 | a graduation cap or notebook and pencil | open |
| `language` | taal oefenen | 💬 | two speech bubbles | open |
| `journal` | dagboek | 📓 | a closed notebook with a bookmark ribbon | open |
| `gratitude` | dankbaarheid | 🙏 | a heart in hands or a heart with a sparkle | open |
| `note` | aantekening maken | 📝 | a note/page with a pencil | open |
| `focus` | focus | 🎯 | a target or crosshair | open |
| `screen-off` | scherm uit | 📵 | a phone with a slash | open |
| `plan` | plannen | 📅 | a calendar with a check | open |
| **Huis** | | | | |
| `clean` | schoonmaken | 🧹 | a broom | klaar |
| `laundry` | wassen | 🧺 | a laundry basket or a garment | open |
| `dishes` | afwassen | 🍽️ | a plate and a sponge or bubbles | open |
| `tidy` | opruimen | 📦 | a storage box or a tidy shelf | open |
| `plants` | planten verzorgen | 🪴 | a potted plant | open |
| `inbox` | inbox leegmaken | 📥 | a tray with an arrow into it | open |
| **Werk en geld** | | | | |
| `laptop` | werken | 💻 | a laptop | klaar |
| `budget` | budget bijhouden | 📊 | a bar chart or a coin with a chart | open |
| `save-money` | sparen | 🐷 | a piggy bank or coin dropping into a jar | open |
| `phone` | bellen | 📞 | a phone handset | klaar |
| **Creatief** | | | | |
| `guitar` | gitaar spelen | 🎸 | a guitar | open |
| `piano` | piano spelen | 🎹 | a few piano keys | open |
| `music` | muziek | 🎵 | music notes | open |
| `paint` | schilderen | 🎨 | a paint palette with a brush | open |
| `draw` | tekenen | ✏️ | a pencil drawing a line | open |
| `photo` | fotograferen | 📷 | a camera | open |
| `write` | schrijven | ✍️ | a hand writing / a fountain pen | open |
| **Sociaal en natuur** | | | | |
| `family` | gezin en familie | 👨‍👩‍👧 | two big and one small figure, or a house with a heart | open |
| `friends` | vrienden zien | 🧑‍🤝‍🧑 | two figures side by side | open |
| `dog` | hond uitlaten | 🐕 | a dog or a paw print with a leash | klaar |
| `outdoors` | naar buiten | 🌲 | a tree and a path or a mountain | open |
| `sprout` | nieuw begin | 🌱 | a seedling | klaar |

## De 49 sleutels (prestaties, tips en tekens)
Een prestatie `first_checkin` heet in de set `ach-first-checkin`, een tip `never_miss_twice` heet `tip-never-miss-twice`. De prestaties onder "gepland" hebben nog geen regel in de app ([ITERATIE-1.2.md](ITERATIE-1.2.md) §5); hun icoon wordt alvast gemaakt zodat de set in één keer af is.

| Sleutel | Nederlands | Wat tekenen | Stand |
|---|---|---|---|
| **Prestaties (bestaan al)** | | | |
| `ach-first-checkin` | Eerste stap | a seedling breaking through the soil, or a first footstep | open |
| `ach-days-7` | 7 dagen | a small flame | open |
| `ach-days-21` | 21 dagen | a young sprig with a few leaves | open |
| `ach-days-42` | 42 dagen | a young tree | open |
| `ach-days-66` | 66 dagen | a trophy or laurel wreath | open |
| `ach-days-100` | 100 dagen | a cut gem / diamond | open |
| `ach-days-365` | 365 dagen | a crown | open |
| `ach-perfect-week` | Perfecte week | a star above seven small dots in a row | open |
| `ach-comeback` | Comeback | a plant sprouting again from a cut stem, or a returning loop arrow | open |
| `ach-first-graduated` | Ingeburgerd | a full-grown tree with roots | open |
| `ach-three-active` | Drie tegelijk | three linked circles | open |
| `ach-review-streak-4` | Vier weken reflectie | a notebook with four tick marks | open |
| **Prestaties (gepland, regels volgen)** | | | |
| `ach-done-10` | 10 keer gedaan | a check mark in a simple ring | open |
| `ach-done-50` | 50 keer gedaan | the same check mark, ring with a second ring | open |
| `ach-done-100` | 100 keer gedaan | the same check mark inside a laurel | open |
| `ach-done-500` | 500 keer gedaan | the same check mark inside a laurel with small wings | open |
| `ach-done-1000` | 1000 keer gedaan | the same check mark, radiant, with rays and a crown (a clear progression of the same motif) | open |
| `ach-streak-7` | Reeks van 7 | a short chain of links | open |
| `ach-streak-14` | Reeks van 14 | a longer chain | open |
| `ach-streak-30` | Reeks van 30 | a long chain forming a loop | open |
| `ach-perfect-weeks-4` | 4 perfecte weken | four small stars in a row under a crown | open |
| `ach-recover-5` | Nooit twee keer missen | a shield with a bounce-back arrow | open |
| `ach-strong-return` | Sterk terug | a line dipping then rising steeply | open |
| `ach-minimal-5` | Tweeminutenregel | a stopwatch with a small 2 | open |
| `ach-minimal-first` | Kleine stap | a single small stair step with a foot | open |
| `ach-counter-week` | Vol doel | a full glass or a full gauge | open |
| `ach-pause-resume` | Pauzeren is oké | a pause symbol turning into a play triangle | open |
| `ach-first-review` | Eerste review | a notebook with a pen | open |
| `ach-automaticity-4` | Automatisme | two interlocking gears | open |
| `ach-why-3` | Je waarom | a compass with a heart at the needle | open |
| `ach-all-dayparts` | Hele dag | an arc from a sun to a moon | open |
| `ach-five-active` | Vijf tegelijk | five circles arranged as a pentagon | open |
| `ach-all-done-10` | Alles gedaan | a fully ticked checklist with a sparkle | open |
| `ach-first-friend` | Samen sterker | two figures with a small heart between them | open |
| `ach-first-invite` | Uitgenodigd | an envelope with a spark | open |
| `ach-friends-5` | Vijf vrienden | a group of five small figures | open |
| `ach-graduated-2` | Tweede ingeburgerd | two trees side by side | open |
| `ach-graduated-5` | Vijfde ingeburgerd | a small forest of five trees | open |
| **Tips** | | | |
| `tip-planned` | Bijna van start | a calendar page with a small starting flag | open |
| `tip-start-small` | Begin klein | a small seedling | open |
| `tip-dip` | De dip | a rain cloud, or a valley in a line | open |
| `tip-cue` | De cue | a chain link, or an anchor point | open |
| `tip-identity` | Identiteit | a compass, or a figure with a star | open |
| `tip-automatic` | Automatisme | a sparkle, or a gear that turns by itself | open |
| `tip-never-miss-twice` | Nooit twee keer missen | a knot of two ropes | open |
| `tip-maintain` | Onderhouden | a tree with a watering can | open |
| `tip-paused` | Pauze | a pause symbol | open |
| **In de app** | | | |
| `ui-streak` | Reeks (klein, naast tekst) | a flame; used inline next to text at the size of the letters (16px), so it must stay simple | open |
| `ui-celebrate` | Alles gedaan vandaag | a leaf with a few sparkles; shown big (40px) on the 'alles gedaan' card | open |

## Eerste prompt (batch 1)
Plak alles tussen de streepjes.

---

# Prompt for Moda: complete the Habit Builder icon set (batch 1 of 4: habit icons, part 1)

Continue the **icon set** of Habit Builder in this project.

## Where the icons are used, and the colors
Habit Builder is a Dutch habit-tracking PWA with **two color themes** (mint on near-black, and yellow on a blue night). **There is one icon set for all themes: the colors come from the theme through CSS**, so the SVG may only use `currentColor` and `var(--icon-accent, currentColor)`. Do not make theme-specific versions, and do not use any Pokémon character, Poké Ball or trademarked logo.
- **Habit icons** (the first two batches): 24px inside a 44px rounded tile, in the picker, on habit cards and on the habit page. `currentColor` is the light text color; the accent is the habit's own color.
- **Achievements** (`ach-*`): inside a **64px round medal filled with the theme's bright accent color**, shown at about 36px. The app sets the icon color to the **dark on-accent color**, so a glyph must read **dark on a bright disc**. Locked achievements are greyscale by CSS, so don't draw a locked version. Where keys form a progression (`ach-done-*`, `ach-streak-*`), draw one recognizable motif that grows.
- **Tips** (`tip-*`): about 28px in the accent color on a dark card.
- **`ui-streak`**: inline next to text at the size of the letters (16px), so it stays simple. **`ui-celebrate`**: 40px on the "all done today" card.

## The existing style (match it exactly)
You already drew 12 icons for this set (`water`, `book`, `run`, `meditate`, `sleep`, `strength`, `clean`, `phone`, `sprout`, `tooth`, `laptop`, `dog`). Draw every new icon with the same hand, so that all icons together look like one family:
- viewBox 0 0 24 24, artwork inside 2–22. **Lines 1.75px, round caps and round joins, fill none.**
- Shapes: rounded rectangles (rx 1–2), circles and soft curves; straight lines only at 0/45/90°.
- Main lines in `currentColor`; secondary details (ground line, leaf lines, motion dashes) in `currentColor` with `stroke-opacity="0.4"`.
- **Exactly one accent per icon**, in `var(--icon-accent, currentColor)`: either a leaf (the `0 100% 0 100%` shape: two quadratic curves between opposite corners, `fill-opacity="0.3"`), or a sparkle (four-pointed star with concave curves, `fill-opacity="0.3"`), or a rune line (tick, z-mark or small arcs, line only). The accent changes place from icon to icon.
- No glow, filters, gradients or hex colors in the SVG. Set the accent with the attributes `stroke="var(--icon-accent, currentColor)"` and `fill="var(--icon-accent, currentColor)"` on the accent element, not in a `style` attribute.

## Batch 1 of 4: 22 habit icons
Draw these 22:
- `walk`: walking legs/figure, or a footprint trail
- `bike`: a bicycle
- `swim`: swimmer or goggles over waves
- `yoga`: a person in a yoga pose (tree or lotus)
- `stretch`: a figure stretching arms overhead
- `posture`: straight spine / a seated figure with upright back
- `salad`: a bowl of salad/greens
- `fruit`: an apple or a few pieces of fruit
- `no-sugar`: a sweet/candy crossed out
- `tea`: a cup of tea with steam
- `cook`: a pan or pot with a spoon
- `meal-prep`: a lunch box or containers
- `bed`: a bed with a pillow
- `moon`: a crescent moon and a star
- `sunrise`: a sun rising over a horizon
- `sun`: a sun with rays
- `breathe`: wind/breath curls or lungs
- `cold-shower`: a shower head with drops (and a snowflake)
- `floss`: floss between two teeth
- `pill`: a capsule
- `vitamins`: a vitamin pill bottle or citrus slice
- `no-smoking`: a cigarette crossed out

## Deliverable
1. **One self-contained HTML page** with all icons of this batch: a grid of tiles, each showing the icon at 24px and 40px with its key under it, on the dark card color and on a bright accent disc. Every icon is an inline `<svg id="icon-<key>" viewBox="0 0 24 24">`.
2. If you can, also export **each icon as a separate file named `<key>.svg`** (for example `walk.svg`).
3. Name every icon by its **key, exactly as listed**. The key is the contract with my code: do not rename, merge or skip keys. If a key makes no sense in this style, keep the key and draw the closest sensible idea.

---

## Batch 2

---

Approved. Now batch 2 of 4: **26 habit icons (part 2)**, in exactly the same style as the earlier icons (same stroke, same corner treatment, same one-accent rule, same optical size). Same technical rules and same deliverable as before; repeat 3 of the approved icons at the start of the page for comparison.

Draw these 26:
- `brain`: a brain
- `study`: a graduation cap or notebook and pencil
- `language`: two speech bubbles
- `journal`: a closed notebook with a bookmark ribbon
- `gratitude`: a heart in hands or a heart with a sparkle
- `note`: a note/page with a pencil
- `focus`: a target or crosshair
- `screen-off`: a phone with a slash
- `plan`: a calendar with a check
- `laundry`: a laundry basket or a garment
- `dishes`: a plate and a sponge or bubbles
- `tidy`: a storage box or a tidy shelf
- `plants`: a potted plant
- `inbox`: a tray with an arrow into it
- `budget`: a bar chart or a coin with a chart
- `save-money`: a piggy bank or coin dropping into a jar
- `guitar`: a guitar
- `piano`: a few piano keys
- `music`: music notes
- `paint`: a paint palette with a brush
- `draw`: a pencil drawing a line
- `photo`: a camera
- `write`: a hand writing / a fountain pen
- `family`: two big and one small figure, or a house with a heart
- `friends`: two figures side by side
- `outdoors`: a tree and a path or a mountain

---

## Batch 3

---

Approved. Now batch 3 of 4: **23 icons for achievements, tips and two signs**, in exactly the same style as the earlier icons (same stroke, same corner treatment, same one-accent rule, same optical size).

This batch moves into the **medal context** described at the start (achievements are shown dark on a bright accent disc at about 36px; tips at 28px in the accent color; `ui-streak` at 16px inline; `ui-celebrate` at 40px). Show them in those contexts on the page. Same technical rules and same deliverable as before; repeat 3 of the approved icons at the start of the page for comparison.

Draw these 23:
- `ach-first-checkin`: a seedling breaking through the soil, or a first footstep
- `ach-days-7`: a small flame
- `ach-days-21`: a young sprig with a few leaves
- `ach-days-42`: a young tree
- `ach-days-66`: a trophy or laurel wreath
- `ach-days-100`: a cut gem / diamond
- `ach-days-365`: a crown
- `ach-perfect-week`: a star above seven small dots in a row
- `ach-comeback`: a plant sprouting again from a cut stem, or a returning loop arrow
- `ach-first-graduated`: a full-grown tree with roots
- `ach-three-active`: three linked circles
- `ach-review-streak-4`: a notebook with four tick marks
- `tip-planned`: a calendar page with a small starting flag
- `tip-start-small`: a small seedling
- `tip-dip`: a rain cloud, or a valley in a line
- `tip-cue`: a chain link, or an anchor point
- `tip-identity`: a compass, or a figure with a star
- `tip-automatic`: a sparkle, or a gear that turns by itself
- `tip-never-miss-twice`: a knot of two ropes
- `tip-maintain`: a tree with a watering can
- `tip-paused`: a pause symbol
- `ui-streak`: a flame; used inline next to text at the size of the letters (16px), so it must stay simple
- `ui-celebrate`: a leaf with a few sparkles; shown big (40px) on the 'alles gedaan' card

---

## Batch 4

---

Approved. Now batch 4 of 4: **26 icons for the planned achievements**, in exactly the same style as the earlier icons (same stroke, same corner treatment, same one-accent rule, same optical size).

Same medal context as batch 3. The `ach-done-*` and `ach-streak-*` keys are progressions: draw each series as one motif that grows. Same technical rules and same deliverable as before; repeat 3 of the approved icons at the start of the page for comparison.

Draw these 26:
- `ach-done-10`: a check mark in a simple ring
- `ach-done-50`: the same check mark, ring with a second ring
- `ach-done-100`: the same check mark inside a laurel
- `ach-done-500`: the same check mark inside a laurel with small wings
- `ach-done-1000`: the same check mark, radiant, with rays and a crown (a clear progression of the same motif)
- `ach-streak-7`: a short chain of links
- `ach-streak-14`: a longer chain
- `ach-streak-30`: a long chain forming a loop
- `ach-perfect-weeks-4`: four small stars in a row under a crown
- `ach-recover-5`: a shield with a bounce-back arrow
- `ach-strong-return`: a line dipping then rising steeply
- `ach-minimal-5`: a stopwatch with a small 2
- `ach-minimal-first`: a single small stair step with a foot
- `ach-counter-week`: a full glass or a full gauge
- `ach-pause-resume`: a pause symbol turning into a play triangle
- `ach-first-review`: a notebook with a pen
- `ach-automaticity-4`: two interlocking gears
- `ach-why-3`: a compass with a heart at the needle
- `ach-all-dayparts`: an arc from a sun to a moon
- `ach-five-active`: five circles arranged as a pentagon
- `ach-all-done-10`: a fully ticked checklist with a sparkle
- `ach-first-friend`: two figures with a small heart between them
- `ach-first-invite`: an envelope with a spark
- `ach-friends-5`: a group of five small figures
- `ach-graduated-2`: two trees side by side
- `ach-graduated-5`: a small forest of five trees

---
