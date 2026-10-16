# Prompt voor Moda – Habit Builder

Plak alles onder de streep in Moda. Bronnen voor de stijl: `D:\dev\v0lky1-streamoverlay\css\style.css`, `scenes\scenes.css` en `css\fonts.css`.

---

Design a mobile-first habit-tracking app called **Habit Builder** (PWA, 390×844 viewport, Dutch UI). Design **three screens plus one component sheet**, nothing else.

## Visual identity (must follow exactly)
Dark "forest druid" look, taken from my stream overlay. Dark mode only. Calm, focused, a little magical, but never cluttered.

**Colors**
- Accent (neon mint): `#29ffb9`, light tint `#8fffdc`
- Page background: radial gradient `#10221d` → `#0c1513` → `#090c0c`, with a soft mint aura (accent at ~10% opacity) and a subtle dark vignette at the edges
- Panel / card surface: `#18181a` (~82% opacity), frame/elevated: `#1c1c1f`
- Text: `#e4e9f2`, muted text: `#8d919a`
- Panel border: 1px mint at 50% opacity; hairlines: white at 8%
- Glow: `0 0 18px` mint at 22% (use sparingly, only on primary/active elements)
- Error/at risk: soft coral `#ff6b6b`. Propose a warm amber for "at risk" and a quiet grey for skipped/paused that fit the palette.

**Type** (Google Fonts, free): **Chakra Petch** (600/700) for headings and big numbers, often UPPERCASE; **Manrope** (400–800) for body and UI. Small "kicker" labels: Manrope 700–800, 11–13px, uppercase, letter-spacing 0.22–0.3em, mint. Hero titles may use a white → `#8fffdc` vertical gradient on the text.

**Shape and details**
- Radius: 14px (cards), 8–10px (pills, buttons), 22px (large hero cards), full circle for rings and avatars
- Cards: 1px mint border at 50%, soft mint glow, optional faint diagonal light sweep
- Progress rings with a conic-gradient mint stroke and a bright white highlight dot at the head
- Tiny animated details are welcome (pulsing status dot, shimmering streak), but they must also work as a static design (respect reduced motion)
- Optional background decoration: a few falling leaf shapes (`border-radius: 0 100% 0 100%`, mint gradient) and glowing motes, very low opacity
- No stock photos, no illustrations of people, no purple/blue gradients. Habit icons are emoji picked by the user.

## Navigation
Fixed bottom tab bar, 5 tabs: **Vandaag, Habits, Voortgang, Prestaties, Instellingen**. Active tab in mint with a subtle glow. Respect the iPhone safe area. Tap targets at least 44px. Text contrast WCAG AA (mint text only on dark surfaces).

## Screen 1 – Vandaag (most important, spend the most effort here)
- Header: kicker "DONDERDAG 15 OKTOBER", greeting "Goedemorgen, Remco", and a progress ring "3 van 5 gedaan"
- Section **Ochtend**: habit cards, each with emoji icon, name, optional cue line (muted), and a large circular check button.
  - "💧 Water drinken", state **gedaan** (filled mint, check mark)
  - "📖 10 minuten lezen", state **open**, cue "Na het ontbijt"
  - "🧘 Meditatie", state **minimale versie gedaan** (half-filled ring, label "Minimale versie")
- Section **Avond**: "🏃 Hardlopen", open; has a secondary action "Overslaan" and "Minimale versie: schoenen aan"
- Section **Oningepland deze week** (the pool, visually distinct but related): cards for flexible habits without a fixed day. Each shows progress as small dots or a ring ("1 van 2") and "nog 4 dagen", plus a button **"Neem mee vandaag"**.
  - "🎸 Gitaar oefenen" 1/2, calm state
  - "🧹 Garage opruimen" 0/1 with an **at risk** state ("nog 1 dag") using the amber warning
  - "📞 Oma bellen" 1/1 **satisfied**, collapsed/dimmed
- Footer of the pool: a small muted link "Plan voor een andere dag"
- Small banner at the bottom of the day when everything is done: a celebratory empty state ("Alles gedaan vandaag")

## Screen 2 – Habit detail ("Hardlopen")
- Hero card: emoji, name, **phase badge** (three variants to design: "OPSTARTEN", "OPBOUW", "INGEBURGERD"), "Dag 34 van ~66". A segmented progress bar for the phases with a marker. Short muted note: "Gemiddeld duurt het ~9 weken voor iets automatisch voelt."
- Stat tiles (2×2): **Gewoontesterkte 72%** (meter), **Reeks 3 weken**, **Consistentie 85%** ("laatste 6 weken"), **Totaal 41×**
- **Heatmap calendar** of the last 6 weeks (Mon–Sun columns). Cell states: gedaan, minimaal, overgeslagen, gepauzeerd, gemist, niet gepland, vandaag.
- Card **Ingeburgerd?** with a checklist of three criteria ("66 actieve dagen 34/66", "80% consistentie 85% ✓", optional "Automatisme ≥ 4 niet ingevuld") and a disabled primary button "Markeer als ingeburgerd" (also design the enabled state).
- Cards for the personal fields: **Waarom** (identity statement, e.g. "Ik ben iemand die elke week beweegt."), **Cue** ("Na het ontbijt, bij de voordeur"), **Minimale versie** ("Schoenen aan en 1 minuut lopen").
- Tip card with a theory nugget ("Week 2–3 voelt vaak moeilijk. Dat hoort erbij.")
- Secondary actions: Bewerken, Pauzeren, Archiveren

## Screen 3 – Nieuwe habit (form, single scrolling page or bottom sheet)
Fields in this order: **Naam**, **Icoon** (emoji picker row), **Kleur** (propose 8 habit colors that harmonize with mint on the dark surface), **Herhaling** as a segmented choice with five options: *Dagelijks · Vaste dagen · X keer per week · Dag van de maand · X keer per maand*. Show the matching control for each:
- Vaste dagen: seven weekday chips (Ma–Zo)
- X keer per week/maand: stepper
- Dag van de maand: number 1–31 with a hint "Korte maand? Dan de laatste dag."
Then: **Dagdeel** (Ochtend / Middag / Avond / Overdag), **Startdatum**, **Cue** ("Na … doe ik …"), **Waarom**, **Minimale versie**, and a primary button "Habit opslaan". Include one field in an error state and one in focus state.

## Component sheet
One board with: buttons (primary, secondary, ghost, destructive, disabled), the check button in all states (open, gedaan, minimaal, overgeslagen, gepauzeerd, gemist), habit card, pool card (normal / at risk / satisfied), badges for the three phases, segmented control, chips, stepper, text input / textarea (default, focus, error), toast, dialog/bottom sheet, tab bar, progress ring, meter, heatmap cell states, achievement badge (locked / unlocked), and the color, type, radius and spacing scale.

## Icon sheet (hoort bij elke aanvraag)
A second board, delivered **together with every design or theme request**: the habit icons, drawn in the same visual language as the rest of the theme (same stroke weight, corner radius, color use and level of detail as the components above). Habit icons replace emoji, so they must look like they belong to this theme and nothing else.

- **Grid:** 24×24 viewBox, 2px safe margin, one consistent stroke width (or one consistent fill style). Single color via `currentColor`, plus at most one accent color via `var(--color-accent)`. No gradients, no text, no raster images, no scripts.
- **One SVG per icon**, named exactly by its **key** (lowercase, e.g. `water.svg`), so I can drop the files into `themes/<theme-id>/icons/`. A sheet that shows all icons on a grid with their keys under each is welcome, as is each icon shown at 24, 40 and 56px, on the card surface and on the page background, and in the selected state (accent ring).
- **Must read at 24px** and on a dark surface; contrast of the icon against its background at least 3:1 (WCAG non-text contrast).
- **Keys:** use the list in `src/content/icons.js` (kept in sync with this file). Start set: `water`, `book`, `run`, `meditate`, `salad`, `sleep`, `strength`, `guitar`, `clean`, `phone`, `write`, `bike`, `brain`, `sprout`, `sun`, `tooth`, `pill`, `no-smoking`, `note`, `paint`, `dog`, `laundry`, `laptop`, `bed`, `walk`, `swim`, `yoga`, `stretch`, `fruit`, `no-sugar`, `tea`, `cook`, `meal-prep`, `dishes`, `plants`, `tidy`, `budget`, `save-money`, `study`, `language`, `piano`, `draw`, `photo`, `journal`, `gratitude`, `call-friend`, `family`, `outdoors`, `sunrise`, `moon`, `screen-off`, `breathe`, `cold-shower`, `posture`, `floss`, `vitamins`, `medication`, `inbox`, `plan`, `focus`, `music`. If a key makes no sense in this theme, propose a theme-fitting replacement and keep the key.
- **Theme motif:** say in one line what the motif is (for example "forest druid: runes and leaves" or "monster-collector: bold outlines, rounded and playful") and apply it to every icon.

## Deliverable
Export as clean **HTML + CSS** if possible (CSS custom properties for every color, font size, radius and spacing value, no inline styles). Otherwise give me screenshots plus a complete list of the exact hex values, font sizes, line heights, radii, spacing and shadow values. Keep names generic (`--color-accent`, `--radius-card`) so I can map them to my own token file.

Also deliver the **Icon sheet** as separate SVG files (see above), next to the HTML and CSS.

Do **not** design Achievements, Settings, Stats overview, weekly review or login; I will derive those from the system you create here.
