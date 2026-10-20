// Wat de stem zegt bij een uitleg of kaart. Gedeeld door de browser (film.js) en Node (voice.mjs), zodat ze dezelfde tekst als sleutel gebruiken.
// Standaard: de titel, de lopende tekst en de punten, zonder opmaak. Wijkt het gesproken van het geschrevene af, zet dan `voice` op de uitleg.

// Hoe de stem woorden uitspreekt die hij verkeerd leest: Engelse woorden en tekens. Past hier aan als je iets vals hoort; de teksten in beeld blijven gelijk.
const PRONUNCIATION = [
  [/\bHabit Builder\b/g, 'Hebbit Bilder'],
  [/\bhabits\b/gi, 'hebbits'],
  [/\bhabit\b/gi, 'hebbit'],
  [/\bstreaks?\b/gi, 'strieks'],
  [/\bcue\b/gi, 'kjoe'],
  [/\bX keer\b/g, 'een aantal keer'],
  [/\b(\d{1,2}):00\b/g, '$1 uur'],
  [/\bback-up\b/gi, 'bekkup'],
  [/\s*[·→]\s*/g, ', '],
];
const speakable = (text) => PRONUNCIATION.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);

const strip = (text) => speakable(String(text ?? '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\{\{([^}]+)\}\}/g, '$1').replace(/\s+/g, ' ').trim());
const sentence = (text) => {
  const clean = strip(text);
  return clean && !/[.!?:]$/.test(clean) ? `${clean}.` : clean;
};

/** De gesproken tekst voor { title, body, points, voice }. Leeg = niets zeggen. */
export function narrationFor({ title = '', body = '', points = [], voice } = {}) {
  if (voice !== undefined) return strip(voice);
  return [sentence(title), sentence(body), ...points.map(sentence)].filter(Boolean).join(' ');
}

/** De gesproken tekst bij een hoofdstukkaart. */
export const chapterNarration = (index, name, sub) => strip(`Hoofdstuk ${index + 1}. ${sentence(name)} ${sentence(sub)}`);
