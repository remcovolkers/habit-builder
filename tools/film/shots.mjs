// Hulpmiddel bij het maken van het filmpje: voert stappen uit op de set (/film/?dev) en maakt na elke stap een schermafbeelding op 1920×1080.
// Gebruik: node tools/film/shots.mjs stappen.json uitmap
//   stappen.json: [{ "run": "await F.startApp()", "shot": "start" }, { "run": "await F.tap('Habits')", "shot": "habits", "wait": 800 }]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, sleep } from './cdp.mjs';
import { startServer } from './server.mjs';

const [stepsFile, outDir] = process.argv.slice(2);
if (!stepsFile || !outDir) throw new Error('Gebruik: node tools/film/shots.mjs stappen.json uitmap');
mkdirSync(outDir, { recursive: true });
const steps = JSON.parse(readFileSync(stepsFile, 'utf8'));

const server = await startServer(5181);
const page = await launch({ port: 9342 });
try {
  await page.navigate('http://localhost:5181/film/?dev');
  await sleep(800);
  for (const step of steps) {
    if (step.run) {
      try {
        const value = await page.evaluate(`(async () => { ${step.run} })()`);
        if (value !== undefined && value !== null) console.log(`${step.shot ?? step.run.slice(0, 40)}:`, typeof value === 'string' ? value.slice(0, 1500) : JSON.stringify(value).slice(0, 1500));
      } catch (error) {
        console.log(`FOUT bij ${step.shot ?? step.run.slice(0, 40)}: ${error.message}`);
      }
    }
    await sleep(step.wait ?? 400);
    if (step.shot) {
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(outDir, `${step.shot}.png`), Buffer.from(data, 'base64'));
    }
  }
} finally {
  page.close();
  server.close();
}
