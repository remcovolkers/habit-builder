// De agenda van de telefoon (docs/AGENDA.md): de Android-kant wordt pas in CI gebouwd. Dit vangt vooraf de fouten die daar anders pas laat blijken:
// een plugin die niet is aangemeld, een naam die de app niet vindt, een Capacitor-klasse die niet bestaat, en een recht dat te veel is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MAIN = join(ROOT, 'android/app/src/main');
const JAVA = join(MAIN, 'java/io/github/remcovolkers/habitbuilder');
const CAPACITOR = join(ROOT, 'node_modules/@capacitor/android/capacitor/src/main/java');
const read = (file) => readFileSync(file, 'utf8');

const plugin = read(join(JAVA, 'calendar/DeviceCalendarPlugin.java'));
const manifest = read(join(MAIN, 'AndroidManifest.xml'));
const activity = read(join(JAVA, 'MainActivity.java'));
const bridge = read(join(ROOT, 'src/data/device-calendar.js'));

test('agenda: het recht om te lezen staat in het manifest, en er is geen recht om te schrijven', () => {
  assert.match(manifest, /<uses-permission android:name="android\.permission\.READ_CALENDAR"\s*\/>/);
  assert.doesNotMatch(manifest, /WRITE_CALENDAR/);
  assert.doesNotMatch(plugin, /WRITE_CALENDAR|ContentValues|\.insert\(|\.update\(|\.delete\(/, 'de plugin leest alleen');
});

test('agenda: de plugin is aangemeld in MainActivity, vóór super.onCreate', () => {
  assert.match(activity, /import io\.github\.remcovolkers\.habitbuilder\.calendar\.DeviceCalendarPlugin;/);
  const register = activity.indexOf('registerPlugin(DeviceCalendarPlugin.class)');
  assert.ok(register > 0);
  assert.ok(register < activity.indexOf('super.onCreate(savedInstanceState)'), 'plugins moeten vóór super.onCreate worden aangemeld');
});

test('agenda: de naam, het recht en de methode kloppen met wat de app aanroept', () => {
  const name = /@CapacitorPlugin\([^)]*name = "(\w+)"/s.exec(plugin)?.[1];
  assert.equal(name, 'DeviceCalendar');
  assert.ok(bridge.includes(`nativePlugin('${name}')`));
  const alias = /@Permission\(alias = "(\w+)"/.exec(plugin)?.[1];
  assert.equal(alias, 'calendar');
  assert.ok(bridge.includes(`?.${alias}`), 'de app leest de toestemming onder dezelfde naam');
  assert.ok(bridge.includes("permissions: ['calendar']"));
  assert.match(plugin, /@PluginMethod\s+public void getEvents\(PluginCall call\)/);
  assert.ok(bridge.includes('native.getEvents('));
  assert.ok(bridge.includes('native.checkPermissions()') && bridge.includes('native.requestPermissions('));
});

test('agenda: elke Capacitor-klasse die de plugin gebruikt bestaat in de bibliotheek', () => {
  const imports = [...plugin.matchAll(/^import (com\.getcapacitor\.[\w.]+);/gm)].map((m) => m[1]);
  assert.ok(imports.length >= 6, `${imports.length} imports`);
  const missing = imports.filter((name) => !existsSync(join(CAPACITOR, `${name.replaceAll('.', '/')}.java`)));
  assert.deepEqual(missing, []);
});

test('agenda: de plugin geeft terug wat de app verwacht (id, title, begin, end, allDay, calendar in een lijst "events")', () => {
  for (const field of ['id', 'title', 'begin', 'end', 'allDay', 'calendar']) assert.ok(plugin.includes(`event.put("${field}"`), field);
  assert.ok(plugin.includes('result.put("events", events)'));
  assert.ok(read(join(ROOT, 'src/data/device-calendar.js')).includes('const { events } = await native.getEvents('));
});

test('agenda: wat je afwees, wat geannuleerd is en wat verborgen is, komt er niet in; en er is een grens aan het aantal', () => {
  assert.match(plugin, /Calendars\.VISIBLE/);
  assert.match(plugin, /STATUS_CANCELED/);
  assert.match(plugin, /ATTENDEE_STATUS_DECLINED/);
  assert.match(plugin, /MAX_EVENTS\s*=\s*1500/);
});
