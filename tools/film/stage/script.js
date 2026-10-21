// Het draaiboek van het uitlegfilmpje. Elke scène opent met een titelkaart (hoofdstuk), speelt dan de echte app af en zet de uitleg ernaast.
// Hulpfuncties (F) staan in film.js. Teksten: kort, in "je"-vorm, en elke uitleg blijft zo lang staan als een rustige lezer nodig heeft.
// Een scène draai je los met `npm run film -- --scene idee` (of meerdere: --scene idee,dag).

const CHAPTERS = ['Het idee', 'Beginnen', 'Een dag', 'Je eigen habit', 'Flexibele taken', 'Als het stokt', 'Groeien', 'Voortgang', 'Vrienden', 'Je gegevens'];
const MORNING = '2026-10-20T08:12';
const FRIDAY = '2026-10-23T09:05';

const scenes = [
  // ------------------------------------------------------------------------------------------------------------------------
  {
    id: 'titel',
    async run(F) {
      await F.startApp({ kind: 'demo', variant: 'daily', now: MORNING }); // de app alvast klaar, achter de kaart
      F.renderProgress(-1);
      await F.showCard({ kicker: 'Uitleg', title: 'Habit Builder', sub: 'Bouw gewoontes op die blijven. In een paar minuten weet je hoe het werkt.', icon: '/icons/icon-512.png', ms: 7000 });
      await F.hideCard();
      await F.sayAndRead({
        kicker: 'Waar is het voor?',
        title: 'Een gewoonte bouw je met herhalen',
        body: 'Habit Builder helpt je dat vol te houden, zonder streng te zijn. Op je telefoon, ook zonder internet.',
        points: ['**Afvinken** met één tik, en een slechte dag is geen ramp', '**Zien hoe sterk** een gewoonte al is, in plaats van een streak die breekt', '**Klein beginnen**: een minimale versie, een vaste cue, één zin als reden', 'Optioneel: een **account**, een **back-up** en **vrienden**'],
      });
      await F.sayAndRead({
        kicker: 'Wat je ziet',
        title: 'Tien korte stappen',
        body: 'Het idee · Beginnen · Een dag · Je eigen habit · Flexibele taken · Als het stokt · Groeien · Voortgang · Vrienden · Je gegevens',
        voice: 'Tien korte stappen: het idee, beginnen, een dag, je eigen habit, flexibele taken, als het stokt, groeien, voortgang, vrienden en je gegevens.',
      });
    },
  },

  // ------------------------------------------------------------------------------------------------------------------------
  {
    id: 'idee',
    async run(F) {
      await F.chapter(0, { sub: 'Waar de app voor is', start: { kind: 'empty', intro: '', hash: '#/welkom/1', now: MORNING } });
      await F.sayAndRead({
        title: 'Gewoontes groeien door herhalen',
        body: 'Een gewoonte wordt vanzelf als je hem vaak genoeg doet. Gemiddeld duurt dat ongeveer **66 dagen**: bij de één korter, bij de ander langer.',
      });
      await F.sayAndRead({
        title: 'Kies je stijl',
        body: 'Een donker bos met neon-munt, of geel op een blauwe nacht. Kleuren en tekeningen veranderen meteen mee.',
      });
      await F.tap('Mel Theme');
      await F.hold(2800);
      await F.tap('v0lky1 Theme');
      await F.hold(1200);
      await F.scrollBy(380, 1100);
      await F.sayAndRead({
        title: 'Drie fases',
        points: ['**Opstarten**: de eerste 21 dagen', '**Opbouw**: tot dag 66', '**Ingeburgerd**: het is van jou geworden'],
      });
      await F.scrollBy(420, 1100);
      await F.sayAndRead({
        title: 'Missen mag. Twee keer achter elkaar niet.',
        body: 'Eén gemiste dag schaadt nauwelijks. Twee keer is het begin van stoppen: pak het dan gewoon weer op.',
        points: ['Begin klein: een kleine versie die je altijd volhoudt, wint van een groot plan'],
      });
    },
  },

  // ------------------------------------------------------------------------------------------------------------------------
  {
    id: 'beginnen',
    async run(F) {
      await F.chapter(1, { sub: 'Je eerste minuut in de app', start: { kind: 'empty', intro: '', hash: '#/welkom/1', now: MORNING } });
      await F.say({ title: 'Een introductie van vier schermen', body: 'Wie voor het eerst begint, loopt er één keer doorheen. Overslaan kan altijd.' });
      await F.hold(3800);
      await F.tap('Volgende');
      await F.say({ title: 'Zo ziet een dag eruit', body: 'Op Vandaag staat wat je wilt doen. Tik op het rondje om af te vinken. Probeer het maar.' });
      await F.hold(1200);
      await F.tap({ css: '.welcome__demo li:nth-child(2) button', nth: 0 });
      await F.hold(1200);
      await F.tap({ css: '.welcome__demo li:nth-child(1) button', nth: 0 });
      await F.hold(1500);
      await F.sayAndRead({
        title: 'Lukt het niet helemaal?',
        body: 'Kies de **minimale versie** voor een slechte dag, of **sla over** als je bewust niets doet. Dat is geen missen.',
      });
      await F.scrollBy(520, 1100);
      await F.sayAndRead({
        title: 'Vijf soorten ritme',
        body: 'Hoe vaak je iets doet bepaal je zelf. De app past zich aan jouw leven aan.',
        points: ['**Elke dag**: water drinken', '**Vaste dagen**: zwemmen op dinsdag en vrijdag', '**X keer per week**: hardlopen, 3 keer', '**X keer per maand**: grote schoonmaak', '**Dag van de maand**: je budget bijwerken'],
      });
      await F.tap('Volgende');
      await F.sayAndRead({ title: 'Zet de app op je beginscherm', body: 'Dan opent hij als een gewone app: schermvullend, snel en ook zonder internet.' });
      await F.tap('Volgende');
      await F.sayAndRead({ title: 'Kies je eerste habit', body: 'Eén is genoeg om te starten. Een voorbeeld staat al ingevuld en past je altijd nog aan.' });
      await F.tap('Water drinken');
      await F.hold(900);
      await F.say({ title: 'Even nakijken en opslaan', body: 'Het formulier is al ingevuld. Klopt het? Dan sla je het op.' });
      await F.hold(3600);
      await F.scrollBy(1400, 1400);
      await F.tap('Habit opslaan', { after: 1400 });
      await F.sayAndRead({ title: 'Je eerste habit staat klaar', body: 'Op Vandaag zie je hem terug, met één rustige tip. Daarna is de app van jou.' });
    },
  },

  // ------------------------------------------------------------------------------------------------------------------------
  {
    id: 'dag',
    async run(F) {
      await F.chapter(2, { sub: 'Afvinken, tellen en een slechte dag', start: { kind: 'demo', variant: 'daily', now: MORNING } });
      await F.sayAndRead({
        title: 'Dit is Vandaag',
        body: 'Alles wat je vandaag wilt doen, per dagdeel. De ring bovenin telt mee. Tik een habit aan om hem af te vinken.',
      });
      await F.say({ title: 'Een teller voor een hoeveelheid', body: 'Bij water tik je **plus** voor elk glas. De dag is gedaan zodra je je doel haalt.' });
      await F.hold(1500);
      for (let i = 0; i < 8; i += 1) await F.tap('Eén erbij: Water drinken', { after: 420 });
      await F.hold(2800);
      await F.say({ title: 'Eén tik is gedaan', body: 'Een rondje aantikken en klaar.' });
      await F.tap('Afvinken: Meditatie');
      await F.hold(2600);
      await F.sayAndRead({
        title: 'Meer dan één dagdeel',
        body: 'Tandenpoetsen \'s ochtends én \'s avonds? Je vinkt elk dagdeel apart af. Alleen de ochtend telt als **deels**.',
      });
      await F.tap({ text: 'Afvinken: Tandenpoetsen', nth: 0 });
      await F.hold(2600);
      await F.say({ title: 'Een slechte dag?', body: 'Kies de **minimale versie**: een kleine stap telt als doorgaan. Of sla **over** als je bewust niets doet. Beide zijn geen missen.' });
      await F.hold(2500);
      await F.tap('Meer acties voor Lezen');
      await F.hold(3500);
      await F.tap('Minimale versie: Eén pagina', { after: 1500 });
      await F.tap('Meer acties voor Dagboek');
      await F.hold(1500);
      await F.tap('Overslaan', { after: 1800 });
      await F.hold(2500);
      await F.scrollTop();
      await F.sayAndRead({
        title: 'Terugkijken en vooruit kijken',
        body: 'Met de pijlen of de weekstrook open je een andere dag. Tot 14 dagen terug vul je nog in of corrigeer je.',
      });
      await F.tap('Vorige dag', { after: 1800 });
      await F.hold(2400);
      await F.tap('Terug naar vandaag', { after: 1400 });
    },
  },

  // ------------------------------------------------------------------------------------------------------------------------
  {
    id: 'eigen',
    async run(F) {
      await F.chapter(3, { sub: 'Een habit die bij jou past', start: { kind: 'demo', variant: 'daily', hash: '#/habits', now: MORNING } });
      await F.sayAndRead({ title: 'Al je habits op een rij', body: 'Op Habits staat alles wat je bijhoudt, per soort ritme. Je ziet in één blik in welke fase een habit zit.' });
      await F.tap('Nieuwe habit');
      await F.say({ title: 'Een nieuwe habit', body: 'Start met een voorbeeld, of vul zelf in. Eerst een naam en een icoon.' });
      await F.hold(2800);
      await F.type({ css: '#name' }, 'Wandelen');
      await F.sayAndRead({ title: 'Hoe vaak? Vijf ritmes', body: 'Onder elk ritme staat een voorbeeld. Past het niet op een vaste dag, kies dan "X keer per week".' });
      await F.tap('Vaste dagen', { after: 1500 });
      await F.tap('X keer per maand', { after: 1500 });
      await F.tap('Dag van de maand', { after: 1500 });
      await F.tap('X keer per week', { after: 1500 });
      await F.say({ title: 'Hoeveel keer, en wanneer?', body: 'Stel het aantal in met min en plus, en kies het moment van de dag. Meerdere dagdelen kan ook.' });
      await F.hold(1500);
      await F.tap('Meer', { after: 700 });
      await F.tap('Avond');
      await F.hold(1800);
      await F.scrollBy(560, 1100);
      await F.say({
        title: 'Klein beginnen helpt',
        points: ['**Cue**: een vast moment waaraan je het ophangt', '**Waarom**: één zin om naar te kijken als de motivatie zakt', '**Minimale versie**: wat je doet op een slechte dag'],
      });
      await F.hold(1500);
      await F.type({ css: '#cue' }, 'Na het avondeten');
      await F.type({ css: '#why' }, 'Ik slaap beter na frisse lucht');
      await F.type({ css: '#minimalVersion' }, 'Even een rondje om het blok');
      await F.hold(1500);
      await F.scrollBy(900, 1000);
      await F.tap('Habit opslaan', { after: 2000 });
      await F.sayAndRead({ title: 'Opgeslagen', body: 'De habit staat in je lijst. Hij verschijnt op Vandaag of in de stapel, afhankelijk van het ritme. Bewerken, pauzeren en archiveren kan altijd.' });
    },
  },

  // ------------------------------------------------------------------------------------------------------------------------
  {
    id: 'flexibel',
    async run(F) {
      await F.chapter(4, { sub: 'Taken zonder vaste dag', start: { kind: 'demo', variant: 'full', now: MORNING } });
      await F.say({ title: 'X keer per week of maand', body: 'Hardlopen, 3 keer per week: welke dag het wordt bepaal je zelf. Die taken staan onder **Oningepland**.' });
      await F.hold(2500);
      await F.scrollBy(1500, 1500);
      await F.hold(2600);
      await F.sayAndRead({ title: 'Wat dreigt te mislukken, staat bovenaan', body: 'Zo zie je wat dringend is: hoeveel er nog moet en hoeveel dagen je nog hebt.' });
      await F.say({ title: 'Neem een taak mee in je dag', body: 'Met **Vandaag** zet je hem in het dagdeel dat bij hem hoort. Haal je hem niet, dan valt hij terug in de stapel.' });
      await F.hold(1500);
      await F.tap({ text: 'Vandaag', inside: 'Hardlopen', css: 'li.pool-card--compact button' });
      await F.hold(3200);
      await F.sayAndRead({ title: 'Of plan je hele week', body: 'Kies zelf de dagen, of laat de app de ontbrekende keren eerlijk verdelen.' });
      await F.tap('Plan je week');
      await F.hold(2500);
      await F.tap('Verdeel voor mij', { after: 2600 });
      await F.hold(2000);
      await F.tap('Klaar', { after: 1500 });
    },
  },

  // ------------------------------------------------------------------------------------------------------------------------
  {
    id: 'stokt',
    async run(F) {
      await F.chapter(5, { sub: 'Een gemiste dag is geen ramp', start: { kind: 'demo', variant: 'full', now: MORNING } });
      await F.sayAndRead({ title: 'Even kijken', body: 'Wat langer stilligt dan je had afgesproken, staat bovenaan. Dat is geen verwijt: met één tik zeg je wat je tegenhield.' });
      await F.tap({ text: 'Wat hield je tegen?', nth: 0 });
      await F.hold(2400);
      await F.tap('Vergeten', { after: 1200 });
      await F.tap('Reden opslaan', { after: 1800 });
      await F.sayAndRead({ title: 'Zo zie je later waar het misging', body: 'De redenen komen terug in je review. Niet om jezelf af te rekenen, maar om te leren.' });
      await F.scrollBy(1050, 1200);
      await F.sayAndRead({ title: 'Te laat', body: 'Stond een taak op een vaste dag in de maand, en is die dag voorbij? Dan kun je hem alsnog afvinken of de maand overslaan.' });
      await F.tap({ text: 'Wat hield je tegen?', nth: -1 });
      await F.hold(2400);
      await F.tap('Toch gedaan', { after: 1600 });
      await F.hold(1500);
      await F.go('#/habits');
      await F.sayAndRead({ title: 'Even rust nodig?', body: 'Vakantie of ziek? Pauzeer één habit, of alles tegelijk. Een pauze telt niet als missen en je reeks blijft staan.' });
      await F.tap('Pauzeer alles', { after: 1200 }).catch(() => {});
      await F.hold(2200);
    },
  },

  {
    id: 'review',
    async run(F) {
      await F.cut({ kind: 'demo', variant: 'full', now: FRIDAY });
      await F.sayAndRead({ title: 'Elke vrijdag: de weekreview', body: 'Vanaf vrijdag staat de review open, tot maandag 12:00. Je ziet alleen wat is blijven liggen. Is alles gelukt, dan staat dat er ook.' });
      await F.tap('Naar de weekreview', { after: 1600 });
      await F.hold(2000);
      await F.scrollBy(900, 1400);
      await F.hold(1800);
      await F.type({ css: 'textarea', nth: 0 }, 'Elke ochtend water gehaald');
      await F.type({ css: 'textarea', nth: 1 }, 'Twee avonden te laat naar bed');
      await F.tap('Opslaan', { after: 1600 });
      await F.sayAndRead({ title: 'En elke maand een afspraak met jezelf', body: 'De maandreview opent op de 25e. Wat je daar opschrijft staat op de eerste van de volgende maand als eenmalige taak op Vandaag.' });
    },
  },

  // ------------------------------------------------------------------------------------------------------------------------
  {
    id: 'groeien',
    async run(F) {
      await F.chapter(6, { sub: 'Van opstarten tot ingeburgerd', start: { kind: 'demo', variant: 'full', hash: '#/habits', now: MORNING } });
      await F.say({ title: 'Elke habit heeft een eigen pagina', body: 'Tik een habit aan voor de cijfers en de uitleg.' });
      await F.hold(1800);
      await F.tap('Water drinken', { after: 1200 });
      await F.sayAndRead({
        title: 'Sterkte in plaats van streaks',
        body: 'Eén gemiste dag zet niets op nul: de **sterkte** zakt een beetje en groeit weer. De balk laat zien in welke fase je zit.',
      });
      await F.scrollToText('Laatste 6 weken');
      await F.sayAndRead({ title: 'Je laatste zes weken', body: 'Elk vakje is een dag: gedaan, minimaal, overgeslagen, gepauzeerd of gemist. Zo zie je patronen, zoals het weekend.' });
      await F.scrollToText('Ingeburgerd?');
      await F.sayAndRead({
        title: 'Ingeburgerd? Jij bevestigt het',
        body: 'Na ongeveer 66 dagen stelt de app voor een habit ingeburgerd te verklaren, als de voorwaarden kloppen. Pas als jij bevestigt, verandert er iets.',
        points: ['Genoeg dagen en keren gedaan', 'Een hoge consistentie', 'Het voelt automatisch'],
      });
      await F.scrollToText('Hoe automatisch voelt dit?');
      await F.say({ title: 'Hoe automatisch voelt het?', body: 'Eén zin per week. Echte gewoontes herken je eraan dat je ze zonder nadenken doet. Er is geen goed of fout.' });
      await F.hold(3200);
      await F.tap('Ik wist wat ik moest doen en deed het gewoon', { after: 1800 });
      await F.hold(2500);
      await F.say({ title: 'En soms valt er iets te vieren', body: 'Prestaties zijn mijlpalen, zoals je eerste automatisme-cijfer.' });
      await F.hold(2800);
      await F.tap('Mooi!', { after: 1200 });
      await F.scrollToText('Goed om te weten');
      await F.sayAndRead({ title: 'Tips op het juiste moment', body: 'Per fase en per situatie staat er een korte tip, bijvoorbeeld na een gemiste dag of in de dip van week twee en drie.' });
      await F.go('#/habits');
      await F.tap('Tuin', { after: 1200 });
      await F.scrollToText('Lukt het ook zonder de app?');
      await F.sayAndRead({
        title: 'Lukt het ook zonder de app?',
        body: 'Bij een week- of maandtaak kun je een hele week of maand **zonder app** proberen: geen herinnering, geen kaartje. Aan het eind van de review zeg je of het lukte.',
      });
    },
  },

  // ------------------------------------------------------------------------------------------------------------------------
  {
    id: 'voortgang',
    async run(F) {
      await F.chapter(7, { sub: 'Hoe gaat het eigenlijk?', start: { kind: 'demo', variant: 'full', hash: '#/stats', now: MORNING } });
      await F.sayAndRead({ title: 'Je week in één blik', body: 'Op Voortgang zie je per dag hoeveel je deed, en hoe je week of maand eruitziet.' });
      await F.tap('Maand', { after: 1500 });
      await F.sayAndRead({ title: 'Of de hele maand', body: 'Wissel tussen week en maand. Daaronder staat per habit hoe sterk hij is.' });
      await F.scrollBy(620, 1200);
      await F.hold(1800);
      await F.scrollBy(620, 1200);
      await F.hold(1800);
      await F.go('#/achievements');
      await F.sayAndRead({ title: 'Prestaties vieren mijlpalen', body: 'Eerste stap, een reeks van zeven dagen, een perfecte week, weer begonnen na een pauze. Ze zijn nooit af te nemen.' });
      await F.tap('Reeks van 14 dagen', { after: 1600 }).catch(() => {});
      await F.sayAndRead({ title: 'Tik er een aan voor uitleg', body: 'Je ziet waarom je hem hebt, of wat er nog voor nodig is.' });
    },
  },

  // ------------------------------------------------------------------------------------------------------------------------
  {
    id: 'vrienden',
    async run(F) {
      await F.chapter(8, { sub: 'Samen is makkelijker', start: { kind: 'demo', variant: 'full', hash: '#/stats', now: MORNING, social: true } });
      await F.sayAndRead({ title: 'Vrienden en een ranglijst', body: 'Helemaal optioneel. Je vergelijkt je week met mensen die je kent. Zij zien alleen je naam en je cijfers, nooit wat je precies doet.' });
      await F.tap('Ranglijst bekijken', { after: 2200 });
      await F.hold(1500);
      await F.say({ title: 'Een prestatie voor je eerste vrienden', body: 'Meedoen levert meteen een mijlpaal op.' });
      await F.hold(2800);
      await F.tap('Mooi!', { after: 1200 });
      await F.sayAndRead({ title: 'Punten van de laatste zeven dagen', body: 'Elke week een nieuwe kans, ook voor wie net begint. Wie drie dagen niets afvinkt, staat er even niet bij.' });
      await F.scrollToText('Waar komen mijn punten vandaan?', { block: 'center' });
      await F.tap('Waar komen mijn punten vandaan?', { after: 1200 });
      await F.sayAndRead({
        title: 'Zo komen de punten tot stand',
        points: ['Elke afgeronde taak: **10 punten**', 'Extra punten in het begin van een habit', 'Twee keer achter elkaar missen kost punten; één misser is gratis'],
      });
      await F.scrollTop();
      await F.tap('Vrienden toevoegen', { after: 1500 });
      await F.sayAndRead({ title: 'Vrienden vinden', body: 'Zoek op de exacte gebruikersnaam, of deel een uitnodigingslink. Wie je link opent en meedoet, is meteen je vriend.' });
      await F.type({ css: 'input[type=text], input[type=search], input:not([type])' }, 'mila');
      await F.tap('Zoeken', { after: 1800 });
      await F.hold(2400);
      await F.say({ title: 'Jij bepaalt wat vrienden zien', body: 'Sociaal staat standaard uit en kun je altijd weer uitzetten. Dan verdwijn je uit de lijsten van anderen.' });
      await F.hold(4000);
    },
  },

  // ------------------------------------------------------------------------------------------------------------------------
  {
    id: 'gegevens',
    async run(F) {
      await F.chapter(9, { sub: 'Account, back-up en instellingen', start: { kind: 'demo', variant: 'full', hash: '#/settings', now: MORNING } });
      F.cleanVersionLine();
      await F.sayAndRead({ title: 'Alles staat op je toestel', body: 'Zonder account werkt de app gewoon, ook zonder internet. Je gegevens verlaten dan je telefoon niet.' });
      await F.tap('Inloggen of account maken', { after: 1600 });
      await F.sayAndRead({ title: 'Met een account op meer apparaten', body: 'Log in met Google of met een code per e-mail. Dan staat er een kopie op de server en loopt alles gelijk.' });
      await F.go('#/settings');
      F.cleanVersionLine();
      await F.scrollToText('Gegevens', { block: 'start' });
      await F.sayAndRead({ title: 'Een back-up maak je zelf', body: 'Download je gegevens als bestand en zet ze op een ander moment weer terug. Een nieuwe tijdzone of dagwissel stel je hier ook in.' });
      await F.say({
        title: 'Handig om te weten',
        points: ['Installeer de app op je beginscherm', 'Ochtendherinnering op Android en computer', 'Feedback geven kan altijd, ook zonder account'],
      });
      await F.hold(6000);
      await F.tap('Zo werkt het', { after: 1500 });
      await F.sayAndRead({ title: 'Zo werkt het', body: 'Alle uitleg uit dit filmpje staat ook in de app, onder Instellingen. Ook de introductie kun je opnieuw bekijken.' });
      await F.scrollBy(900, 1300);
      await F.hold(2200);
    },
  },

  // ------------------------------------------------------------------------------------------------------------------------
  {
    id: 'slot',
    async run(F) {
      await F.cut({ kind: 'demo', variant: 'daily', now: MORNING });
      F.renderProgress(-1);
      await F.sayAndRead({
        kicker: 'Tot slot',
        title: 'Vijf dingen om te onthouden',
        points: ['**Begin klein.** Een kleine versie die je altijd volhoudt wint van een groot plan', '**Missen mag.** Twee keer achter elkaar niet', '**Kies je ritme.** Vijf soorten, ook voor taken zonder vaste dag', '**Kijk naar je sterkte**, niet naar een perfecte reeks', '**Samen is makkelijker**, maar helemaal optioneel'],
      });
      await F.hush();
      await F.showCard({
        kicker: 'Meer weten?',
        title: 'Instellingen → Zo werkt het',
        sub: 'Alle uitleg staat ook in de app. Veel plezier met je eerste habit!',
        voice: 'Meer weten? Alle uitleg staat ook in de app, onder Instellingen, bij Zo werkt het. Veel plezier met je eerste habit!',
        icon: '/icons/icon-512.png',
        ms: 9000,
      });
    },
  },
];

export async function play(F, { only } = {}) {
  F.setChapters(CHAPTERS);
  const wanted = only ? only.split(',') : null;
  for (const scene of scenes) {
    if (wanted && !wanted.includes(scene.id)) continue;
    await scene.run(F);
  }
}
