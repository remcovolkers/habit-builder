# Habit Builder

Mobiel-eerst PWA om gewoontes te bouwen. Vanilla JS/CSS/HTML zonder frameworks of bouwstap, offline-first met sync naar Supabase, gehost op GitHub Pages.

Het volledige plan, de requirements en de domeinregels staan in [docs/PLAN.md](docs/PLAN.md).

## Lokaal draaien

Vereist Node 22 of hoger. Er zijn geen dependencies om te installeren.

```
npm run serve   # http://localhost:5173/
npm test        # unit- en guardrail-tests (node:test)
npm run stage   # kopieert de publiceerbare bestanden naar _site/ en vult de service worker in
# SERVE_ROOT=_site npm run serve   # de uitgerolde versie (met service worker) lokaal proberen
```

## Structuur

| Map | Inhoud |
|---|---|
| `src/domain/` | Pure logica (schema's, streaks, sterkte, achievements). Geen DOM, geen opslag. |
| `src/data/` | Opslag: repository-interface, IndexedDB, Supabase-adapter, sync. |
| `src/ui/` | Views en componenten. Alleen via `ui/dom.js`, nooit `innerHTML`. |
| `src/content/` | Teksten (`nl.js`), tips en achievement-definities. |
| `styles/` | `tokens.css` (structuur), `themes/` (kleuren per thema), component- en view-CSS en `layout.css` (tablet- en desktopindeling; mobiel eerst). |
| `fonts/` | Lokale lettertypen (Manrope, Chakra Petch); zie `fonts/README.md`. |
| `moda-themes/` | De Moda-ontwerpen, één map per thema-id (`v0lky1`, `mel`), als referentie (niet gepubliceerd). |
| `styles/themes/`, `themes/` | Kleuren per thema en de illustraties; zie `docs/THEMES.md`. |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA: offline werken, installeren en iconen. `sw.js` is een sjabloon; `npm run stage` vult de bestandslijst en een versie-id in (zie `tools/lib/pwa.mjs`). |
| `vendor/` | Vastgepinde externe code (supabase-js, als één bestand gebundeld); zie `vendor/README.md`. |
| `supabase/` | SQL-migraties en de test ervan. Zet-op-instructies: `docs/M4-SETUP.md`. |
| `tests/` | `node:test` voor domein, router en guardrails. |
| `tools/` | Dev-server, staging en `live-check.mjs` (controle van de echte Supabase), zonder dependencies. |

## Deployen

Push naar `main`: GitHub Actions draait de tests en publiceert daarna naar GitHub Pages
(Settings → Pages → Source: **GitHub Actions**).
