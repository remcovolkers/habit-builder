// De Android-widget (docs/ANDROID-WIDGET.md) wordt pas in CI gebouwd. Dit vangt vooraf de fouten die daar anders pas laat blijken:
// een verwijzing naar een bron die niet bestaat, een weergave die een widget niet mag gebruiken, en een klasse in het manifest die er niet is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MAIN = join(ROOT, 'android/app/src/main');
const RES = join(MAIN, 'res');
const JAVA = join(MAIN, 'java/io/github/remcovolkers/habitbuilder');

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));
const read = (file) => readFileSync(file, 'utf8');

const widgetJava = walk(join(JAVA, 'widget')).filter((file) => file.endsWith('.java'));
const widgetLayouts = readdirSync(join(RES, 'layout')).filter((name) => name.startsWith('widget_')).map((name) => join(RES, 'layout', name));
const valuesText = readdirSync(join(RES, 'values')).map((name) => read(join(RES, 'values', name))).join('\n');
const layoutText = walk(join(RES, 'layout')).map(read).join('\n');

test('widget: er zijn Java-bestanden en layouts om te controleren', () => {
  assert.ok(widgetJava.length >= 4, `${widgetJava.length} Java-bestanden`);
  assert.ok(widgetLayouts.length >= 4, `${widgetLayouts.length} layouts`);
});

test('widget: elke R.…-verwijzing in de Java-code bestaat', () => {
  const missing = [];
  for (const file of widgetJava) {
    for (const [, kind, name] of read(file).matchAll(/\bR\.(id|layout|drawable|color|string|xml)\.(\w+)/g)) {
      const found = {
        id: () => layoutText.includes(`@+id/${name}`),
        layout: () => existsSync(join(RES, 'layout', `${name}.xml`)),
        drawable: () => existsSync(join(RES, 'drawable', `${name}.xml`)),
        xml: () => existsSync(join(RES, 'xml', `${name}.xml`)),
        color: () => new RegExp(`<color name="${name}"`).test(valuesText),
        string: () => new RegExp(`<string name="${name}"`).test(valuesText),
      }[kind]();
      if (!found) missing.push(`${relative(ROOT, file)}: R.${kind}.${name}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('widget: de layouts verwijzen alleen naar bestaande kleuren, teksten en tekeningen', () => {
  const missing = [];
  for (const file of [...widgetLayouts, ...walk(join(RES, 'drawable')).filter((f) => /widget_/.test(f)), join(RES, 'xml/habit_widget_info.xml')]) {
    for (const [, kind, name] of read(file).matchAll(/@(color|string|drawable|layout)\/(\w+)/g)) {
      const found = {
        color: () => new RegExp(`<color name="${name}"`).test(valuesText),
        string: () => new RegExp(`<string name="${name}"`).test(valuesText),
        drawable: () => existsSync(join(RES, 'drawable', `${name}.xml`)),
        layout: () => existsSync(join(RES, 'layout', `${name}.xml`)),
      }[kind]();
      if (!found) missing.push(`${relative(ROOT, file)}: @${kind}/${name}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('widget: een widget-layout gebruikt alleen weergaven die RemoteViews toestaat (een gewone <View> breekt de widget)', () => {
  const allowed = new Set(['FrameLayout', 'LinearLayout', 'RelativeLayout', 'GridLayout', 'TextView', 'ImageView', 'ImageButton', 'Button', 'ProgressBar', 'ListView', 'GridView', 'StackView', 'ViewFlipper', 'AdapterViewFlipper', 'Chronometer', 'TextClock', 'AnalogClock']);
  const offenders = [];
  for (const file of widgetLayouts) {
    for (const [, tag] of read(file).matchAll(/<([A-Za-z][\w.]*)[\s/>]/g)) {
      if (!allowed.has(tag)) offenders.push(`${relative(ROOT, file)}: <${tag}>`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('widget: de ontvanger en de service in het manifest bestaan als klasse, en de plugin wordt aangemeld', () => {
  const manifest = read(join(MAIN, 'AndroidManifest.xml'));
  for (const [, name] of manifest.matchAll(/android:name="\.widget\.(\w+)"/g)) {
    assert.ok(existsSync(join(JAVA, 'widget', `${name}.java`)), `${name}.java ontbreekt`);
  }
  assert.match(manifest, /android\.appwidget\.provider/);
  assert.match(manifest, /BIND_REMOTEVIEWS/);
  assert.match(read(join(JAVA, 'MainActivity.java')), /registerPlugin\(HabitWidgetPlugin\.class\);\s*super\.onCreate/, 'de plugin moet vóór super.onCreate worden aangemeld');
});

test('widget: elke klasse heeft het goede pakket en de bestandsnaam van zijn klasse', () => {
  for (const file of widgetJava) {
    const text = read(file);
    assert.match(text, /^package io\.github\.remcovolkers\.habitbuilder\.widget;/m, relative(ROOT, file));
    const name = file.split(/[\\/]/).pop().replace('.java', '');
    assert.match(text, new RegExp(`(class|final class) ${name}\\b`), `${name} staat niet in ${name}.java`);
  }
});

test('widget: de sleutels en velden die de Java-kant en de app delen komen in beide voor', () => {
  const store = read(join(JAVA, 'widget/WidgetStore.java'));
  const appSide = read(join(ROOT, 'src/app/widget.js'));
  for (const field of ['key', 'date', 'done', 'delta', 'value', 'target', 'expiresAt', 'items', 'group', 'title', 'kind', 'labels']) {
    assert.ok(store.includes(`"${field}"`) || read(join(JAVA, 'widget/HabitWidgetService.java')).includes(`"${field}"`) || read(join(JAVA, 'widget/HabitWidgetProvider.java')).includes(`"${field}"`), `Java kent "${field}" niet`);
    assert.ok(appSide.includes(field), `de app kent "${field}" niet`);
  }
  for (const kind of ['counter', 'appointment']) {
    assert.ok(store.includes(`"${kind}"`) && appSide.includes(`'${kind}'`), `soort ${kind}`);
  }
});
