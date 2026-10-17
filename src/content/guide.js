// De uitleg op "Zo werkt het" (#/uitleg) en de voorbeelden in de introductie. Een test controleert dat elk ritme uit het formulier hier staat.
// `types` heeft dezelfde sleutels als nl.form.scheduleTypes.

export const GUIDE_TYPES = Object.freeze([
  { key: 'daily', text: 'Voor wat je elke dag doet.', example: 'Water drinken, 10 minuten lezen.' },
  { key: 'weekdays', text: 'Voor wat bij bepaalde weekdagen hoort.', example: 'Zwemmen op dinsdag en vrijdag.' },
  { key: 'per_week', text: 'Het aantal staat vast, de dag kies je zelf. Past het niet op een vaste dag, dan is dit het ritme.', example: 'Hardlopen, 3 keer per week.' },
  { key: 'per_month', text: 'Hetzelfde, maar dan per maand.', example: 'Grote schoonmaak, 2 keer per maand.' },
  { key: 'day_of_month', text: 'Een vaste datum. Heeft een maand die dag niet, dan telt de laatste dag van die maand.', example: 'Je budget bijwerken op de 25e.' },
].map(Object.freeze));

/** Een teller hoort bij "Elke dag" en "Vaste dagen": voor een hoeveelheid in plaats van een vinkje. */
export const GUIDE_COUNTER = Object.freeze({
  text: 'Voor een hoeveelheid in plaats van een vinkje. Je telt met plus en min; de dag is gedaan zodra je je doel haalt.',
  example: 'Water drinken: 8 glazen.',
});

export const GUIDE_SECTIONS = Object.freeze([
  {
    id: 'idea',
    title: 'Waar het om gaat',
    paragraphs: [
      'Een gewoonte wordt vanzelf door herhalen. Dat duurt gemiddeld ongeveer 66 dagen: bij de een korter, bij de ander langer.',
      'Een gemiste dag is geen ramp. Twee keer achter elkaar is het begin van stoppen, dus pak de volgende keer gewoon weer op.',
    ],
  },
  {
    id: 'types',
    title: 'Hoe vaak? Vijf soorten',
    paragraphs: ['Bij elke habit kies je een ritme. Het past zich aan jouw leven aan, niet andersom.'],
    types: true,
  },
  {
    id: 'small',
    title: 'Klein beginnen',
    paragraphs: [
      'De eerste weken gaan om herhalen, niet om presteren. Een kleine versie die je altijd volhoudt, wint van een groot plan dat je loslaat.',
      'Minimale versie: wat je doet op een slechte dag, bijvoorbeeld "schoenen aan en 1 minuut lopen". Dat telt als doorgaan, niet als missen.',
      'Cue: een vast moment waaraan je de gewoonte ophangt, zoals "na het ontbijt". Dat helpt je het niet te vergeten.',
      'Waarom: één zin over wat je ermee wilt. Daar kijk je naar als de motivatie zakt.',
    ],
  },
  {
    id: 'day',
    title: 'Een dag in de app',
    paragraphs: [
      'Op Vandaag staat wat je vandaag wilt doen. Tik een habit aan om af te vinken. Bij een teller tik je plus en min.',
      'Lukt het niet helemaal? Kies de minimale versie. Wil je vandaag bewust niets doen, kies dan Overslaan. Dat is geen missen.',
      'Doe je iets op meerdere momenten, zoals tandenpoetsen \'s ochtends en \'s avonds? Kies dan meer dan één dagdeel. De habit staat in elk dagdeel en je vinkt ze apart af; de dag is gedaan als ze allemaal gedaan zijn. Alleen de ochtend gedaan telt als "deels".',
      'Pauzeren (bij de habit zelf) gebruik je voor een vakantie of een drukke tijd. Een pauze telt ook niet als missen.',
    ],
  },
  {
    id: 'miss',
    title: 'Als het even niet lukt',
    paragraphs: [
      'Na een gemiste dag zie je een herstelmoment: pak het nu weer op, ook met een klein begin.',
      'Onder "Even kijken" staat wat langer stilligt dan je had afgesproken. Je kunt met één tik zeggen wat je tegenhield, zodat je later ziet waar het misging. Dat is geen verwijt.',
      'De weekreview laat alleen zien wat er is blijven liggen. Is alles gelukt, dan staat er dat ook.',
    ],
  },
  {
    id: 'rooted',
    title: 'Ingeburgerd',
    paragraphs: [
      'Na ongeveer 66 dagen kan een habit ingeburgerd zijn: hij is van jou. Je hoeft hem dan niet meer elke dag te volgen, maar je kunt hem in onderhoud laten staan.',
      'Bij taken die zelden voorkomen telt het aantal keren in plaats van de dagen.',
    ],
  },
  {
    id: 'more',
    title: 'Punten, prestaties en vrienden',
    paragraphs: [
      'Prestaties vieren mijlpalen. Tik er een aan en je ziet waarom je hem hebt, of wat er nog voor nodig is.',
      'Met vrienden (optioneel) vergelijk je je punten. Zij zien alleen je naam en je cijfers, nooit wat je precies doet.',
    ],
  },
  {
    id: 'data',
    title: 'Je gegevens',
    paragraphs: [
      'Alles staat op dit apparaat. Met een account staat er ook een kopie op de server, zodat je op meer apparaten kunt werken.',
      'Een back-up maak je onder Instellingen. Die kun je altijd terugzetten.',
    ],
  },
]);
