# Iconensets: wat je aan Moda vraagt

Hoort bij [ITERATIE-1.2.md](ITERATIE-1.2.md) §6 (trap 2) en [MODA-PROMPT.md](MODA-PROMPT.md) (onderdeel "Icon sheet"). Elk thema krijgt een eigen set van **60 habit-iconen en 49 iconen voor prestaties, tips en tekens** (zie onderaan), met voor elk thema dezelfde **sleutels**. De sleutel is het contract met de code (`habit.icon` wordt straks `icon:<sleutel>|<emoji>`); de emoji hieronder is de terugval voor oudere appversies, export en thema's zonder set. De 24 emoji die er nu zijn staan allemaal in de lijst.

## Werkwijze
1. **Ronde 1, per thema: 12 iconen** om de stijl vast te leggen. Plak de prompt van dat thema (hieronder) in Moda. Doe de twee thema's in aparte gesprekken.
2. Beoordeel op: leesbaar op 24 px, gelijke visuele grootte, één accent per icoon, past bij de rest van het thema. Vraag zo nodig bij ("lijnen dunner", "accent minder vaak").
3. **Ronde 2: de overige 48** met de vervolgprompt onderaan. Zo blijft de stijl gelijk.
4. Lever de HTML-pagina en (als Moda dat kan) de losse `<sleutel>.svg`-bestanden aan. Het gereedschap `npm run icons:build -- <thema> <map of html-bestand>` controleert elk icoon (viewBox, geen scripts, geen vaste kleuren, formaat) en maakt `themes/<thema>/icons.svg`; de app gebruikt een icoon zodra het in die sprite staat en toont anders de emoji. Het uiterlijk (grootte, accentkleur) stel ik daarna per thema af.
5. Een toekomstig thema: dezelfde stappen; de sleutellijst blijft gelijk.

Let op bij **Mel**: laat geen bestaande Pokémon, Poké Ball of logo's tekenen (zie de waarschuwing in [THEMES.md](THEMES.md)); de prompt zegt dat al.

## De 60 sleutels
| Sleutel | Nederlands | Emoji (terugval) | Wat tekenen |
|---|---|---|---|
| **Beweging** | | | |
| `run` | hardlopen | 🏃 | a running figure or a running shoe with motion lines |
| `walk` | wandelen | 🚶 | walking legs/figure, or a footprint trail |
| `bike` | fietsen | 🚴 | a bicycle |
| `swim` | zwemmen | 🏊 | swimmer or goggles over waves |
| `strength` | krachttraining | 💪 | dumbbell or flexed arm |
| `yoga` | yoga | 🧘‍♀️ | a person in a yoga pose (tree or lotus) |
| `stretch` | rekken | 🤸 | a figure stretching arms overhead |
| `posture` | houding | 🪑 | straight spine / a seated figure with upright back |
| **Eten en drinken** | | | |
| `water` | water drinken | 💧 | a water drop or a glass of water |
| `salad` | gezond eten | 🥗 | a bowl of salad/greens |
| `fruit` | fruit eten | 🍎 | an apple or a few pieces of fruit |
| `no-sugar` | geen suiker | 🍬 | a sweet/candy crossed out |
| `tea` | thee drinken | 🍵 | a cup of tea with steam |
| `cook` | koken | 🍳 | a pan or pot with a spoon |
| `meal-prep` | maaltijden voorbereiden | 🥡 | a lunch box or containers |
| **Slaap en rust** | | | |
| `sleep` | goed slapen | 😴 | a crescent moon with 'z' marks |
| `bed` | op tijd naar bed | 🛌 | a bed with a pillow |
| `moon` | avondritueel | 🌙 | a crescent moon and a star |
| `sunrise` | vroeg opstaan | 🌅 | a sun rising over a horizon |
| `sun` | buiten in het licht | ☀️ | a sun with rays |
| `breathe` | ademhalen | 🌬️ | wind/breath curls or lungs |
| `meditate` | mediteren | 🧘 | a seated meditating figure |
| `cold-shower` | koud douchen | 🚿 | a shower head with drops (and a snowflake) |
| **Gezondheid** | | | |
| `tooth` | tanden poetsen | 🦷 | a tooth, with a sparkle |
| `floss` | flossen | 🧵 | floss between two teeth |
| `pill` | medicijnen | 💊 | a capsule |
| `vitamins` | vitamines | 🍊 | a vitamin pill bottle or citrus slice |
| `no-smoking` | niet roken | 🚭 | a cigarette crossed out |
| **Geest en leren** | | | |
| `book` | lezen | 📖 | an open book |
| `brain` | leren | 🧠 | a brain |
| `study` | studeren | 🎓 | a graduation cap or notebook and pencil |
| `language` | taal oefenen | 💬 | two speech bubbles |
| `journal` | dagboek | 📓 | a closed notebook with a bookmark ribbon |
| `gratitude` | dankbaarheid | 🙏 | a heart in hands or a heart with a sparkle |
| `note` | aantekening maken | 📝 | a note/page with a pencil |
| `focus` | focus | 🎯 | a target or crosshair |
| `screen-off` | scherm uit | 📵 | a phone with a slash |
| `plan` | plannen | 📅 | a calendar with a check |
| **Huis** | | | |
| `clean` | schoonmaken | 🧹 | a broom |
| `laundry` | wassen | 🧺 | a laundry basket or a garment |
| `dishes` | afwassen | 🍽️ | a plate and a sponge or bubbles |
| `tidy` | opruimen | 📦 | a storage box or a tidy shelf |
| `plants` | planten verzorgen | 🪴 | a potted plant |
| `inbox` | inbox leegmaken | 📥 | a tray with an arrow into it |
| **Werk en geld** | | | |
| `laptop` | werken | 💻 | a laptop |
| `budget` | budget bijhouden | 📊 | a bar chart or a coin with a chart |
| `save-money` | sparen | 🐷 | a piggy bank or coin dropping into a jar |
| `phone` | bellen | 📞 | a phone handset |
| **Creatief** | | | |
| `guitar` | gitaar spelen | 🎸 | a guitar |
| `piano` | piano spelen | 🎹 | a few piano keys |
| `music` | muziek | 🎵 | music notes |
| `paint` | schilderen | 🎨 | a paint palette with a brush |
| `draw` | tekenen | ✏️ | a pencil drawing a line |
| `photo` | fotograferen | 📷 | a camera |
| `write` | schrijven | ✍️ | a hand writing / a fountain pen |
| **Sociaal en natuur** | | | |
| `family` | gezin en familie | 👨‍👩‍👧 | two big and one small figure, or a house with a heart |
| `friends` | vrienden zien | 🧑‍🤝‍🧑 | two figures side by side |
| `dog` | hond uitlaten | 🐕 | a dog or a paw print with a leash |
| `outdoors` | naar buiten | 🌲 | a tree and a path or a mountain |
| `sprout` | nieuw begin | 🌱 | a seedling |

## Prompt 1: v0lky1 Theme (ronde 1)
Plak alles tussen de streepjes.

---

# Prompt for Moda: icon sheet, v0lky1 Theme

Use the existing **Habit Builder – v0lky1 Theme** design in this project (dark "forest druid", neon mint). Now design the **habit icon set** for it.

## What the icons are for
Habit Builder is a Dutch habit-tracking PWA. Users pick one icon per habit. Icons appear in a 44px picker grid, on habit cards (40px), and on the habit detail page (56px), inside a rounded tile. Today these are emoji; they must be replaced by icons that belong to this theme and to nothing else.

## Style: v0lky1 (forest druid)
- **Line icons**, calm and focused, a little magical, never cluttered. Dark UI, so icons are light lines on dark.
- **Stroke 1.75px**, round caps and round joins, no fills except a small accent area at 25–35% opacity.
- **Motif:** druid and forest. Fold a small **leaf** (the `border-radius: 0 100% 0 100%` leaf shape from the design), a **rune-like tick**, or a **sparkle** into each icon as its single accent detail, colored with `var(--icon-accent, currentColor)`. Keep it to one accent per icon, and not in the same place on every icon.
- Geometry: slightly rounded rectangles (radius ~2), circles and gentle curves; no sharp spikes; straight lines at 45° and 90° angles.
- No glow baked into the SVG (the app adds the neon glow with CSS on the selected state). No gradients.
- Colors for context: mint accent `#29ffb9`; the 8 habit tile colors are `#29ffb9`, `#2ed3c6`, `#5cc8ff`, `#b6f25c`, `#ffc857`, `#ff8a7a`, `#ff7eb6`, `#d9c7a3`. Card surface `#18181a`, elevated `#1c1c1f`, page background `#090c0c`.

## Technical rules (must follow exactly)
- Each icon is an inline **SVG with `viewBox="0 0 24 24"`**, no width/height attributes, no `<style>` blocks, no `<script>`, no external references, no raster images, no text, no filters or gradients.
- Keep the artwork inside a **2px safe margin** (content between 2 and 22).
- **Colors:** use `currentColor` for the main strokes/fills and `var(--icon-accent, currentColor)` for the single accent detail. Use `fill-opacity` / `stroke-opacity` between 0.25 and 0.4 for a softer second tone. Never hard-code a hex color: the icon sits on a tile whose color depends on the user's chosen habit color, and the theme changes the surroundings.
- **Legible at 24px** (that is how it is used in the picker), crisp at 40px and 56px (habit cards and detail page). Contrast of the icon against its tile at least 3:1.
- One icon = one clear object or action. Same optical size across the set: a `bike` must not look smaller than a `book`.
- Name every icon by its **key**, exactly as listed (`water`, `no-sugar`, ...). The key is the contract with my code: do not rename, merge or skip keys. If a key makes no sense in this style, keep the key and draw the closest sensible idea.

## Round 1 (this prompt): 12 icons to lock the style
Draw only these 12 first, so we can agree on the style before the full set:
- **Beweging:** `run` (a running figure or a running shoe with motion lines); `strength` (dumbbell or flexed arm)
- **Eten en drinken:** `water` (a water drop or a glass of water)
- **Slaap en rust:** `sleep` (a crescent moon with 'z' marks); `meditate` (a seated meditating figure)
- **Gezondheid:** `tooth` (a tooth, with a sparkle)
- **Geest en leren:** `book` (an open book)
- **Huis:** `clean` (a broom)
- **Werk en geld:** `laptop` (a laptop); `phone` (a phone handset)
- **Sociaal en natuur:** `dog` (a dog or a paw print with a leash); `sprout` (a seedling)

## Deliverable
1. **One self-contained HTML page** with all icons: a grid of tiles, each showing the icon at 24px, 40px and 56px with its key under it, on three tile colors (the theme card surface, the theme page background, and a tile tinted with each of the 8 habit colors below), plus a "selected" state (accent ring). Each icon is an inline `<svg id="icon-<key>" viewBox="0 0 24 24">` so I can extract it.
2. If you can, also export **each icon as a separate `.svg` file** named `<key>.svg`.
3. Put the style rules you used (stroke width, corner treatment, how the accent is used) in one short paragraph at the top of the page so a later batch can match it exactly.

After I approve the style I will ask for the remaining 48 icons in the same style.

---

## Prompt 2: Mel Theme (ronde 1)
Plak alles tussen de streepjes.

---

# Prompt for Moda: icon sheet, Mel Theme

Use the existing **Habit Builder – Mel Theme** design in this project (Pokémon-inspired: yellow on a blue night). Now design the **habit icon set** for it.

## What the icons are for
Habit Builder is a Dutch habit-tracking PWA. Users pick one icon per habit. Icons appear in a 44px picker grid, on habit cards (40px), and on the habit detail page (56px), inside a rounded tile. Today these are emoji; they must be replaced by icons that belong to this theme and to nothing else.

## Style: Mel (monster-collector adventure)
- **Playful, bold and friendly**: think the items, badges and berries of a creature-collecting adventure game. Chunky, rounded, sticker-like.
- **Stroke 2.25px**, round caps and joins, **plus filled shapes**: fill the main body of the object at 30–40% opacity of `currentColor` and outline it with a full-opacity `currentColor` stroke. That gives a two-tone look without extra colors.
- **Accent:** one small bright detail per icon (a highlight dot, a little sparkle, a berry, a star) in `var(--icon-accent, currentColor)`. A small **glossy highlight dot** in the upper left of the main shape is part of the style.
- Geometry: soft blobby corners (radius ~3), slightly exaggerated proportions, a tiny bit of asymmetry for charm. No sharp spikes, no hairlines.
- **Do NOT draw any existing Pokémon character, the Poké Ball, or any trademarked logo or name.** Use only generic adventure-game objects and symbols (potions, berries, badges, stars, leaves, sparkles).
- No glow, no gradients baked in.
- Colors for context: accent yellow `#ffcb05` (tint `#ffe36e`), blue night background `#2a75bb` → `#16205a` → `#0c1238`, card surface `#22307a`, elevated `#2b3a8c`. The 8 habit tile colors are `#ffcb05`, `#3fa9f5`, `#78c850`, `#e8d36a`, `#ffb648`, `#ff5a4e`, `#e79bc4`, `#c3b8a5`.

## Technical rules (must follow exactly)
- Each icon is an inline **SVG with `viewBox="0 0 24 24"`**, no width/height attributes, no `<style>` blocks, no `<script>`, no external references, no raster images, no text, no filters or gradients.
- Keep the artwork inside a **2px safe margin** (content between 2 and 22).
- **Colors:** use `currentColor` for the main strokes/fills and `var(--icon-accent, currentColor)` for the single accent detail. Use `fill-opacity` / `stroke-opacity` between 0.25 and 0.4 for a softer second tone. Never hard-code a hex color: the icon sits on a tile whose color depends on the user's chosen habit color, and the theme changes the surroundings.
- **Legible at 24px** (that is how it is used in the picker), crisp at 40px and 56px (habit cards and detail page). Contrast of the icon against its tile at least 3:1.
- One icon = one clear object or action. Same optical size across the set: a `bike` must not look smaller than a `book`.
- Name every icon by its **key**, exactly as listed (`water`, `no-sugar`, ...). The key is the contract with my code: do not rename, merge or skip keys. If a key makes no sense in this style, keep the key and draw the closest sensible idea.

## Round 1 (this prompt): 12 icons to lock the style
Draw only these 12 first, so we can agree on the style before the full set:
- **Beweging:** `run` (a running figure or a running shoe with motion lines); `strength` (dumbbell or flexed arm)
- **Eten en drinken:** `water` (a water drop or a glass of water)
- **Slaap en rust:** `sleep` (a crescent moon with 'z' marks); `meditate` (a seated meditating figure)
- **Gezondheid:** `tooth` (a tooth, with a sparkle)
- **Geest en leren:** `book` (an open book)
- **Huis:** `clean` (a broom)
- **Werk en geld:** `laptop` (a laptop); `phone` (a phone handset)
- **Sociaal en natuur:** `dog` (a dog or a paw print with a leash); `sprout` (a seedling)

## Deliverable
1. **One self-contained HTML page** with all icons: a grid of tiles, each showing the icon at 24px, 40px and 56px with its key under it, on three tile colors (the theme card surface, the theme page background, and a tile tinted with each of the 8 habit colors below), plus a "selected" state (accent ring). Each icon is an inline `<svg id="icon-<key>" viewBox="0 0 24 24">` so I can extract it.
2. If you can, also export **each icon as a separate `.svg` file** named `<key>.svg`.
3. Put the style rules you used (stroke width, corner treatment, how the accent is used) in one short paragraph at the top of the page so a later batch can match it exactly.

After I approve the style I will ask for the remaining 48 icons in the same style.

---

## Vervolgprompt (ronde 2, voor beide thema's)
Plak dit in hetzelfde gesprek nadat je de stijl van ronde 1 hebt goedgekeurd.

---

Approved. Now draw the **remaining 48 icons** in exactly the same style as the 12 you made (same stroke width, same corner treatment, same use of the accent, same optical size). Same technical rules and same deliverable as before, with the 12 approved icons repeated at the start of the sheet for comparison. Keys:
- **Beweging:** `walk` (walking legs/figure, or a footprint trail); `bike` (a bicycle); `swim` (swimmer or goggles over waves); `yoga` (a person in a yoga pose (tree or lotus)); `stretch` (a figure stretching arms overhead); `posture` (straight spine / a seated figure with upright back)
- **Eten en drinken:** `salad` (a bowl of salad/greens); `fruit` (an apple or a few pieces of fruit); `no-sugar` (a sweet/candy crossed out); `tea` (a cup of tea with steam); `cook` (a pan or pot with a spoon); `meal-prep` (a lunch box or containers)
- **Slaap en rust:** `bed` (a bed with a pillow); `moon` (a crescent moon and a star); `sunrise` (a sun rising over a horizon); `sun` (a sun with rays); `breathe` (wind/breath curls or lungs); `cold-shower` (a shower head with drops (and a snowflake))
- **Gezondheid:** `floss` (floss between two teeth); `pill` (a capsule); `vitamins` (a vitamin pill bottle or citrus slice); `no-smoking` (a cigarette crossed out)
- **Geest en leren:** `brain` (a brain); `study` (a graduation cap or notebook and pencil); `language` (two speech bubbles); `journal` (a closed notebook with a bookmark ribbon); `gratitude` (a heart in hands or a heart with a sparkle); `note` (a note/page with a pencil); `focus` (a target or crosshair); `screen-off` (a phone with a slash); `plan` (a calendar with a check)
- **Huis:** `laundry` (a laundry basket or a garment); `dishes` (a plate and a sponge or bubbles); `tidy` (a storage box or a tidy shelf); `plants` (a potted plant); `inbox` (a tray with an arrow into it)
- **Werk en geld:** `budget` (a bar chart or a coin with a chart); `save-money` (a piggy bank or coin dropping into a jar)
- **Creatief:** `guitar` (a guitar); `piano` (a few piano keys); `music` (music notes); `paint` (a paint palette with a brush); `draw` (a pencil drawing a line); `photo` (a camera); `write` (a hand writing / a fountain pen)
- **Sociaal en natuur:** `family` (two big and one small figure, or a house with a heart); `friends` (two figures side by side); `outdoors` (a tree and a path or a mountain)

---


---

# Tweede lijst: prestaties, tips en tekens in de app

Naast de 60 habit-iconen gebruikt de app nog emoji voor **prestaties, tips en twee kleine tekens** (de vlam bij je reeks en het blaadje bij "alles gedaan"). Ook die komen uit de iconenset van het thema; samen met de habit-iconen is de app dan helemaal vrij van emoji van het toestel. Dat zijn **49 sleutels**, vastgelegd in `src/content/ui-icons.js`. De prestaties onder "gepland" hebben nog geen regel in de app ([ITERATIE-1.2.md](ITERATIE-1.2.md) §5); hun icoon wordt alvast gemaakt zodat Moda de set in één keer kan afmaken. Een prestatie `first_checkin` heet in de set `ach-first-checkin`.

## De 49 sleutels
| Sleutel | Nederlands | Wat tekenen |
|---|---|---|
| **Prestaties (bestaan al)** | | |
| `ach-first-checkin` | Eerste stap | a seedling breaking through the soil, or a first footstep |
| `ach-days-7` | 7 dagen | a small flame |
| `ach-days-21` | 21 dagen | a young sprig with a few leaves |
| `ach-days-42` | 42 dagen | a young tree |
| `ach-days-66` | 66 dagen | a trophy or laurel wreath |
| `ach-days-100` | 100 dagen | a cut gem / diamond |
| `ach-days-365` | 365 dagen | a crown |
| `ach-perfect-week` | Perfecte week | a star above seven small dots in a row |
| `ach-comeback` | Comeback | a plant sprouting again from a cut stem, or a returning loop arrow |
| `ach-first-graduated` | Ingeburgerd | a full-grown tree with roots |
| `ach-three-active` | Drie tegelijk | three linked circles |
| `ach-review-streak-4` | Vier weken reflectie | a notebook with four tick marks |
| **Prestaties (gepland, regels volgen)** | | |
| `ach-done-10` | 10 keer gedaan | a check mark in a simple ring |
| `ach-done-50` | 50 keer gedaan | the same check mark, ring with a second ring |
| `ach-done-100` | 100 keer gedaan | the same check mark inside a laurel |
| `ach-done-500` | 500 keer gedaan | the same check mark inside a laurel with small wings |
| `ach-done-1000` | 1000 keer gedaan | the same check mark, radiant, with rays and a crown (a clear progression of the same motif) |
| `ach-streak-7` | Reeks van 7 | a short chain of links |
| `ach-streak-14` | Reeks van 14 | a longer chain |
| `ach-streak-30` | Reeks van 30 | a long chain forming a loop |
| `ach-perfect-weeks-4` | 4 perfecte weken | four small stars in a row under a crown |
| `ach-recover-5` | Nooit twee keer missen | a shield with a bounce-back arrow |
| `ach-strong-return` | Sterk terug | a line dipping then rising steeply |
| `ach-minimal-5` | Tweeminutenregel | a stopwatch with a small 2 |
| `ach-minimal-first` | Kleine stap | a single small stair step with a foot |
| `ach-counter-week` | Vol doel | a full glass or a full gauge |
| `ach-pause-resume` | Pauzeren is oké | a pause symbol turning into a play triangle |
| `ach-first-review` | Eerste review | a notebook with a pen |
| `ach-automaticity-4` | Automatisme | two interlocking gears |
| `ach-why-3` | Je waarom | a compass with a heart at the needle |
| `ach-all-dayparts` | Hele dag | an arc from a sun to a moon |
| `ach-five-active` | Vijf tegelijk | five circles arranged as a pentagon |
| `ach-all-done-10` | Alles gedaan | a fully ticked checklist with a sparkle |
| `ach-first-friend` | Samen sterker | two figures with a small heart between them |
| `ach-first-invite` | Uitgenodigd | an envelope with a spark |
| `ach-friends-5` | Vijf vrienden | a group of five small figures |
| `ach-graduated-2` | Tweede ingeburgerd | two trees side by side |
| `ach-graduated-5` | Vijfde ingeburgerd | a small forest of five trees |
| **Tips** | | |
| `tip-planned` | Bijna van start | a calendar page with a small starting flag |
| `tip-start-small` | Begin klein | a small seedling |
| `tip-dip` | De dip | a rain cloud, or a valley in a line |
| `tip-cue` | De cue | a chain link, or an anchor point |
| `tip-identity` | Identiteit | a compass, or a figure with a star |
| `tip-automatic` | Automatisme | a sparkle, or a gear that turns by itself |
| `tip-never-miss-twice` | Nooit twee keer missen | a knot of two ropes |
| `tip-maintain` | Onderhouden | a tree with a watering can |
| `tip-paused` | Pauze | a pause symbol |
| **In de app** | | |
| `ui-streak` | Reeks (klein, naast tekst) | a flame; used inline next to text at the size of the letters (16px), so it must stay simple |
| `ui-celebrate` | Alles gedaan vandaag | a leaf with a few sparkles; shown big (40px) on the 'alles gedaan' card |

## Prompt 3: v0lky1 Theme, tweede lijst (ronde 1)
Plak dit in een nieuw gesprek (of hetzelfde als de habit-iconen, zodat Moda de stijl al kent).

---

# Prompt for Moda: icon sheet 2 (achievements, tips, signs), v0lky1 Theme

Use the existing **Habit Builder – v0lky1 Theme** design in this project and the **habit icon set you already made for it** (same hand, same stroke, same accent logic). Now design the second icon list.

## Where these icons are used
Habit Builder is a Dutch habit-tracking PWA. This is the **second icon list** (the habit icons are done separately): achievements, tips and two small signs.
- **Achievements (`ach-*`)** sit in a **64px round medal** filled with the theme's bright accent color (white ring, soft glow). The app sets the icon color to the **dark on-accent color**, so the glyph must read **dark on a bright disc**; it is shown at about 36px. Locked achievements are shown in greyscale by CSS, so don't draw a locked version.
- **Tips (`tip-*`)** sit at about 28px in the accent color, on a dark card.
- **`ui-streak`** is inline next to text, at the size of the letters (16px). **`ui-celebrate`** is shown at 40px on the "all done today" card.

## Style
Exactly the v0lky1 icon language of the habit icons: **line icons, 1.75px stroke, round caps and joins**, soft geometry, one small accent per icon (leaf, rune-like tick or sparkle) via `var(--icon-accent, currentColor)`. Because achievements sit on a bright mint disc, give them slightly more presence than the habit icons: a few filled areas at 25–35% opacity are welcome, but keep the same line language. Druid and forest motifs fit (leaves, runes, trees, roots).
Colors for context: mint accent `#29ffb9`, on-accent dark `#06140f`, card surface `#18181a`, page background `#090c0c`.

## Technical rules (must follow exactly)
- Each icon is an inline **SVG with `viewBox="0 0 24 24"`**, no width/height attributes, no `<style>` blocks, no `<script>`, no external references, no raster images, no text, no filters or gradients.
- Keep the artwork inside a **2px safe margin** (content between 2 and 22).
- **Colors:** `currentColor` for the main strokes/fills and `var(--icon-accent, currentColor)` for one accent detail; `fill-opacity` / `stroke-opacity` between 0.25 and 0.4 for a softer second tone. Never hard-code a hex color. Put the accent on the element with the attributes `stroke="var(--icon-accent, currentColor)"` and `fill="var(--icon-accent, currentColor)"` (not in a `style` attribute).
- One icon = one clear idea. Same optical size across the set.
- Name every icon by its **key**, exactly as listed. The key is the contract with my code: do not rename, merge or skip keys. If a key makes no sense in this style, keep the key and draw the closest sensible idea.
- Where several keys are a progression (the `ach-done-*` and `ach-streak-*` series), draw them as one recognizable motif that grows.

## Round 1 (this prompt): 12 icons to lock the style
- **Prestaties (bestaan al):** `ach-first-checkin` (a seedling breaking through the soil, or a first footstep); `ach-days-7` (a small flame); `ach-days-66` (a trophy or laurel wreath); `ach-perfect-week` (a star above seven small dots in a row); `ach-comeback` (a plant sprouting again from a cut stem, or a returning loop arrow)
- **Prestaties (gepland, regels volgen):** `ach-done-100` (the same check mark inside a laurel); `ach-first-friend` (two figures with a small heart between them)
- **Tips:** `tip-dip` (a rain cloud, or a valley in a line); `tip-identity` (a compass, or a figure with a star); `tip-never-miss-twice` (a knot of two ropes)
- **In de app:** `ui-streak` (a flame; used inline next to text at the size of the letters (16px), so it must stay simple); `ui-celebrate` (a leaf with a few sparkles; shown big (40px) on the 'alles gedaan' card)

## Deliverable
1. **One self-contained HTML page** with all icons of this round: a grid of tiles, each showing the icon at 24px and 36px with its key under it, on a medal disc in the theme's accent color (for `ach-*`), on the dark card surface (for `tip-*` and `ui-*`), and in its greyscale locked state. Each icon is an inline `<svg id="icon-<key>" viewBox="0 0 24 24">`.
2. If you can, also export **each icon as a separate `.svg` file** named `<key>.svg`.
3. A short paragraph at the top with the style rules you used, so a later batch matches exactly.

After I approve the style I will ask for the remaining 37 icons.

---

## Prompt 4: Mel Theme, tweede lijst (ronde 1)

---

# Prompt for Moda: icon sheet 2 (achievements, tips, signs), Mel Theme

Use the existing **Habit Builder – Mel Theme** design in this project and the **habit icon set you already made for it** (same hand, same stroke, same accent logic). Now design the second icon list.

## Where these icons are used
Habit Builder is a Dutch habit-tracking PWA. This is the **second icon list** (the habit icons are done separately): achievements, tips and two small signs.
- **Achievements (`ach-*`)** sit in a **64px round medal** filled with the theme's bright accent color (white ring, soft glow). The app sets the icon color to the **dark on-accent color**, so the glyph must read **dark on a bright disc**; it is shown at about 36px. Locked achievements are shown in greyscale by CSS, so don't draw a locked version.
- **Tips (`tip-*`)** sit at about 28px in the accent color, on a dark card.
- **`ui-streak`** is inline next to text, at the size of the letters (16px). **`ui-celebrate`** is shown at 40px on the "all done today" card.

## Style
Exactly the Mel icon language of the habit icons: **chunky, rounded, sticker-like, 2.25px stroke plus a 30–40% filled body, glossy highlight dot**, one small bright accent per icon via `var(--icon-accent, currentColor)`. Achievements sit on a yellow medal disc, so keep them bold and clear: think badges and trophies of a creature-collecting adventure game.
**Do NOT draw any existing Pokémon character, the Poké Ball, or any trademarked logo or name.** Use generic adventure-game objects only (badges, stars, berries, potions, crowns, leaves).
Colors for context: accent yellow `#ffcb05`, on-accent dark `#1a1206`, card surface `#22307a`, blue night background `#2a75bb` → `#16205a` → `#0c1238`.

## Technical rules (must follow exactly)
- Each icon is an inline **SVG with `viewBox="0 0 24 24"`**, no width/height attributes, no `<style>` blocks, no `<script>`, no external references, no raster images, no text, no filters or gradients.
- Keep the artwork inside a **2px safe margin** (content between 2 and 22).
- **Colors:** `currentColor` for the main strokes/fills and `var(--icon-accent, currentColor)` for one accent detail; `fill-opacity` / `stroke-opacity` between 0.25 and 0.4 for a softer second tone. Never hard-code a hex color. Put the accent on the element with the attributes `stroke="var(--icon-accent, currentColor)"` and `fill="var(--icon-accent, currentColor)"` (not in a `style` attribute).
- One icon = one clear idea. Same optical size across the set.
- Name every icon by its **key**, exactly as listed. The key is the contract with my code: do not rename, merge or skip keys. If a key makes no sense in this style, keep the key and draw the closest sensible idea.
- Where several keys are a progression (the `ach-done-*` and `ach-streak-*` series), draw them as one recognizable motif that grows.

## Round 1 (this prompt): 12 icons to lock the style
- **Prestaties (bestaan al):** `ach-first-checkin` (a seedling breaking through the soil, or a first footstep); `ach-days-7` (a small flame); `ach-days-66` (a trophy or laurel wreath); `ach-perfect-week` (a star above seven small dots in a row); `ach-comeback` (a plant sprouting again from a cut stem, or a returning loop arrow)
- **Prestaties (gepland, regels volgen):** `ach-done-100` (the same check mark inside a laurel); `ach-first-friend` (two figures with a small heart between them)
- **Tips:** `tip-dip` (a rain cloud, or a valley in a line); `tip-identity` (a compass, or a figure with a star); `tip-never-miss-twice` (a knot of two ropes)
- **In de app:** `ui-streak` (a flame; used inline next to text at the size of the letters (16px), so it must stay simple); `ui-celebrate` (a leaf with a few sparkles; shown big (40px) on the 'alles gedaan' card)

## Deliverable
1. **One self-contained HTML page** with all icons of this round: a grid of tiles, each showing the icon at 24px and 36px with its key under it, on a medal disc in the theme's accent color (for `ach-*`), on the dark card surface (for `tip-*` and `ui-*`), and in its greyscale locked state. Each icon is an inline `<svg id="icon-<key>" viewBox="0 0 24 24">`.
2. If you can, also export **each icon as a separate `.svg` file** named `<key>.svg`.
3. A short paragraph at the top with the style rules you used, so a later batch matches exactly.

After I approve the style I will ask for the remaining 37 icons.

---

## Vervolgprompt tweede lijst (ronde 2, voor beide thema's)

---

Approved. Now draw the **remaining 37 icons** of this list in exactly the same style as the 12 you made. Same technical rules and deliverable, with the 12 approved icons repeated at the start of the sheet for comparison. Keys:
- **Prestaties (bestaan al):** `ach-days-21` (a young sprig with a few leaves); `ach-days-42` (a young tree); `ach-days-100` (a cut gem / diamond); `ach-days-365` (a crown); `ach-first-graduated` (a full-grown tree with roots); `ach-three-active` (three linked circles); `ach-review-streak-4` (a notebook with four tick marks)
- **Prestaties (gepland, regels volgen):** `ach-done-10` (a check mark in a simple ring); `ach-done-50` (the same check mark, ring with a second ring); `ach-done-500` (the same check mark inside a laurel with small wings); `ach-done-1000` (the same check mark, radiant, with rays and a crown (a clear progression of the same motif)); `ach-streak-7` (a short chain of links); `ach-streak-14` (a longer chain); `ach-streak-30` (a long chain forming a loop); `ach-perfect-weeks-4` (four small stars in a row under a crown); `ach-recover-5` (a shield with a bounce-back arrow); `ach-strong-return` (a line dipping then rising steeply); `ach-minimal-5` (a stopwatch with a small 2); `ach-minimal-first` (a single small stair step with a foot); `ach-counter-week` (a full glass or a full gauge); `ach-pause-resume` (a pause symbol turning into a play triangle); `ach-first-review` (a notebook with a pen); `ach-automaticity-4` (two interlocking gears); `ach-why-3` (a compass with a heart at the needle); `ach-all-dayparts` (an arc from a sun to a moon); `ach-five-active` (five circles arranged as a pentagon); `ach-all-done-10` (a fully ticked checklist with a sparkle); `ach-first-invite` (an envelope with a spark); `ach-friends-5` (a group of five small figures); `ach-graduated-2` (two trees side by side); `ach-graduated-5` (a small forest of five trees)
- **Tips:** `tip-planned` (a calendar page with a small starting flag); `tip-start-small` (a small seedling); `tip-cue` (a chain link, or an anchor point); `tip-automatic` (a sparkle, or a gear that turns by itself); `tip-maintain` (a tree with a watering can); `tip-paused` (a pause symbol)

---
