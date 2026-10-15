# vendor/

## supabase-js.min.mjs

`@supabase/supabase-js` **2.117.2** (MIT), gebundeld tot één ES-module zonder externe imports, zodat de app
offline werkt en de CSP (`script-src 'self'`) niet versoepeld hoeft te worden. Alleen `createClient` wordt geëxporteerd.

Opnieuw maken (in een lege tijdelijke map, buiten dit project):

```
npm init -y
npm install @supabase/supabase-js@2.117.2 esbuild
echo "export { createClient } from '@supabase/supabase-js';" > entry.js
npx esbuild entry.js --bundle --format=esm --platform=browser --target=es2022 --minify --legal-comments=none --outfile=supabase-js.min.mjs
```

Een nieuwe versie vraagt: versienummer hier aanpassen, bundel vervangen, en `npm test` plus de browsertests draaien.
