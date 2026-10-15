# Habit Builder

Mobiel-eerst PWA om gewoontes te bouwen. Vanilla JS/CSS/HTML zonder frameworks of bouwstap, offline-first met sync naar Supabase, gehost op GitHub Pages.

Het volledige plan, de requirements en de domeinregels staan in [docs/PLAN.md](docs/PLAN.md).

## Lokaal draaien

Vereist Node 22 of hoger. Er zijn geen dependencies om te installeren.

```
npm run serve   # http://localhost:5173/
npm test        # unit- en guardrail-tests (node:test)
npm run stage   # kopieert de publiceerbare bestanden naar _site/
```

## Structuur

| Map | Inhoud |
|---|---|
| `src/domain/` | Pure logica (schema's, streaks, sterkte, achievements). Geen DOM, geen opslag. |
| `src/data/` | Opslag: repository-interface, IndexedDB, Supabase-adapter, sync. |
| `src/ui/` | Views en componenten. Alleen via `ui/dom.js`, nooit `innerHTML`. |
| `src/content/` | Teksten (`nl.js`), tips en achievement-definities. |
| `styles/` | `tokens.css` (design tokens uit het Moda-ontwerp, alleen donker) plus component- en view-CSS. |
| `fonts/` | Lokale lettertypen (Manrope, Chakra Petch); zie `fonts/README.md`. |
| `habit-builder-moda-files/` | Het originele Moda-ontwerp, als referentie. |
| `supabase/` | SQL-migraties en Edge Functions. |
| `tests/` | `node:test` voor domein, router en guardrails. |
| `tools/` | Dev-server en staging, zonder dependencies. |

## Deployen

Push naar `main`: GitHub Actions draait de tests en publiceert daarna naar GitHub Pages
(Settings → Pages → Source: **GitHub Actions**).
