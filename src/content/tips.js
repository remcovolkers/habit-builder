// Korte stukjes gewoontetheorie, getoond op de habit-detailpagina (zie app/tips.js voor wanneer welke).
import { tipIconKey } from './ui-icons.js';

const TIP_TEXTS = {
  planned: {
    title: 'Bijna van start',
    text: 'Zodra de startdatum aanbreekt, verschijnt deze habit bij Vandaag. Een vaste cue ("na het ontbijt") helpt om meteen goed te beginnen.',
  },
  start_small: {
    title: 'Begin klein',
    text: 'De eerste week gaat om herhalen, niet om presteren. Een kleine versie die je altijd volhoudt, wint van een groot plan dat je loslaat.',
  },
  dip: {
    title: 'Week 2–3 voelt vaak moeilijk',
    text: 'De beginmotivatie zakt weg en de gewoonte is nog niet automatisch. Dat hoort erbij. Houd het klein en blijf komen.',
  },
  cue: {
    title: 'Koppel het aan een moment',
    text: 'Gewoontes blijven hangen als ze aan een vaste cue hangen: "Na … doe ik …". Heb je er al een? Vul die in bij bewerken.',
  },
  identity: {
    title: 'Word wie je wilt zijn',
    text: 'Elke keer dat je het doet, stem je op de persoon die je wilt worden. Kijk naar je "waarom", niet alleen naar het resultaat.',
  },
  automatic: {
    title: 'Bijna automatisch',
    text: 'Je zit dicht bij de 66 dagen. Let eens op: doe je dit al zonder erover na te denken? Geef het een cijfer bij Automatisme.',
  },
  never_miss_twice: {
    title: 'Nooit twee keer missen',
    text: 'Eén gemiste dag is geen ramp, twee achter elkaar is het begin van stoppen. Pak de volgende keer gewoon weer op, ook met de minimale versie.',
  },
  maintain: {
    title: 'Ingeburgerd',
    text: 'Deze gewoonte is van jou. Je hoeft hem niet meer elke dag te volgen, maar je kunt hem in onderhoud laten staan als je wilt.',
  },
  paused: {
    title: 'Gepauzeerd',
    text: 'Pauzeren telt niet als missen. Pak het weer op als het kan; begin dan klein.',
  },
};

// elke tip krijgt de sleutel van haar icoon (content/ui-icons.js)
export const TIPS = Object.freeze(
  Object.fromEntries(Object.entries(TIP_TEXTS).map(([key, tip]) => [key, Object.freeze({ ...tip, icon: tipIconKey(key) })])),
);

