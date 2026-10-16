# Iconensets: wat je aan Moda vraagt

Hoort bij [ITERATIE-1.2.md](ITERATIE-1.2.md) §6 (trap 2) en [MODA-PROMPT.md](MODA-PROMPT.md) (onderdeel "Icon sheet"). Elk thema krijgt een eigen set van **60 iconen** met dezelfde **sleutels**. De sleutel is het contract met de code (`habit.icon` wordt straks `icon:<sleutel>|<emoji>`); de emoji hieronder is de terugval voor oudere appversies, export en thema's zonder set. De 24 emoji die er nu zijn staan allemaal in de lijst.

## Werkwijze
1. **Ronde 1, per thema: 12 iconen** om de stijl vast te leggen. Plak de prompt van dat thema (hieronder) in Moda. Doe de twee thema's in aparte gesprekken.
2. Beoordeel op: leesbaar op 24 px, gelijke visuele grootte, één accent per icoon, past bij de rest van het thema. Vraag zo nodig bij ("lijnen dunner", "accent minder vaak").
3. **Ronde 2: de overige 48** met de vervolgprompt onderaan. Zo blijft de stijl gelijk.
4. Lever de HTML-pagina en (als Moda dat kan) de losse `<sleutel>.svg`-bestanden aan. Ik zet ze in `themes/<id>/icons/`, controleer ze (viewBox, geen scripts, geen vaste kleuren, contrast) en bouw de kiezer en de weergave.
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
