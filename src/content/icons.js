// De iconen die je voor een habit kunt kiezen. De sleutel (`key`) is het contract met de iconensets van de thema's (docs/MODA-ICONS.md):
// een thema kan voor elke sleutel een eigen tekening leveren (themes/<id>/icons.svg), en valt anders terug op de emoji.
// In een habit staat alleen de emoji (`habit.icon`): oudere appversies, export en sync blijven werken, de sleutel volgt uit de emoji.
//
// Regels: elke sleutel en elke emoji komt hooguit één keer voor, en een bestaande emoji of sleutel verandert niet meer (dan raken
// opgeslagen habits het verband kwijt). Nieuwe iconen kunnen er altijd bij. Een test bewaakt dit en de gelijkheid met docs/MODA-ICONS.md.
//
// Per icoon: [sleutel, emoji, naam, zoekwoorden]. De naam is ook wat een schermlezer voorleest.
const g = (id, label, icons) => ({ id, label, icons: icons.map(([key, emoji, name, words = '']) => ({ key, emoji, name, words })) });

export const ICON_GROUPS = Object.freeze([
  g('move', 'Beweging', [
    ['run', '🏃', 'Hardlopen', 'rennen joggen sport conditie'],
    ['walk', '🚶', 'Wandelen', 'lopen stappen wandeling'],
    ['bike', '🚴', 'Fietsen', 'fiets wielrennen'],
    ['swim', '🏊', 'Zwemmen', 'baantjes zwembad'],
    ['strength', '💪', 'Krachttraining', 'sporten gewichten sportschool fitness spieren'],
    ['yoga', '🧘‍♀️', 'Yoga', 'oefening houding'],
    ['stretch', '🤸', 'Rekken', 'stretchen uitrekken mobiliteit'],
    ['posture', '🪑', 'Houding', 'rug rechtop zitten ergonomie'],
  ]),
  g('food', 'Eten en drinken', [
    ['water', '💧', 'Water drinken', 'drinken glas hydratatie'],
    ['salad', '🥗', 'Gezond eten', 'groente sla voeding'],
    ['fruit', '🍎', 'Fruit eten', 'appel vitamines snack'],
    ['no-sugar', '🍬', 'Geen suiker', 'snoep zoet minder snoepen'],
    ['tea', '🍵', 'Thee drinken', 'koffie kopje warm'],
    ['cook', '🍳', 'Koken', 'eten maken pan avondeten'],
    ['meal-prep', '🥡', 'Maaltijden voorbereiden', 'lunch lunchtrommel mealprep'],
  ]),
  g('rest', 'Slaap en rust', [
    ['sleep', '😴', 'Goed slapen', 'slaap uitslapen nachtrust'],
    ['bed', '🛌', 'Op tijd naar bed', 'bedtijd vroeg slapen'],
    ['moon', '🌙', 'Avondritueel', 'avond ontspannen routine'],
    ['sunrise', '🌅', 'Vroeg opstaan', 'ochtend wekker ochtendritueel'],
    ['sun', '☀️', 'Buiten in het licht', 'zon daglicht vitamine d'],
    ['breathe', '🌬️', 'Ademhalen', 'ademhaling oefening rust'],
    ['meditate', '🧘', 'Mediteren', 'meditatie mindfulness stilte'],
    ['cold-shower', '🚿', 'Koud douchen', 'douche koud ijsbad'],
  ]),
  g('health', 'Gezondheid', [
    ['tooth', '🦷', 'Tanden poetsen', 'gebit mondverzorging'],
    ['floss', '🧵', 'Flossen', 'tanden interdentaal'],
    ['pill', '💊', 'Medicijnen', 'pil innemen medicatie'],
    ['vitamins', '🍊', 'Vitamines', 'supplementen innemen'],
    ['no-smoking', '🚭', 'Niet roken', 'stoppen sigaret'],
  ]),
  g('mind', 'Geest en leren', [
    ['book', '📖', 'Lezen', 'boek bladzijde'],
    ['brain', '🧠', 'Leren', 'denken geheugen puzzel'],
    ['study', '🎓', 'Studeren', 'cursus huiswerk school'],
    ['language', '💬', 'Taal oefenen', 'talen woordjes praten'],
    ['journal', '📓', 'Dagboek', 'schrijven reflectie terugblik'],
    ['gratitude', '🙏', 'Dankbaarheid', 'dankbaar positief'],
    ['note', '📝', 'Aantekening maken', 'notitie lijstje opschrijven'],
    ['focus', '🎯', 'Focus', 'doel concentratie diepe'],
    ['screen-off', '📵', 'Scherm uit', 'telefoon weg schermtijd minder'],
    ['plan', '📅', 'Plannen', 'agenda kalender planning'],
  ]),
  g('home', 'Huis', [
    ['clean', '🧹', 'Schoonmaken', 'poetsen stofzuigen vegen'],
    ['laundry', '🧺', 'Wassen', 'was wasmand kleding'],
    ['dishes', '🍽️', 'Afwassen', 'vaatwasser vaat'],
    ['tidy', '📦', 'Opruimen', 'ordenen spullen kast'],
    ['plants', '🪴', 'Planten verzorgen', 'water geven kamerplant'],
    ['inbox', '📥', 'Inbox leegmaken', 'mail e-mail post'],
  ]),
  g('work', 'Werk en geld', [
    ['laptop', '💻', 'Werken', 'computer project'],
    ['budget', '📊', 'Budget bijhouden', 'uitgaven geld cijfers'],
    ['save-money', '🐷', 'Sparen', 'geld potje spaarpot'],
    ['phone', '📞', 'Bellen', 'telefoneren opa oma familie bellen'],
  ]),
  g('create', 'Creatief', [
    ['guitar', '🎸', 'Gitaar spelen', 'muziek instrument oefenen'],
    ['piano', '🎹', 'Piano spelen', 'muziek instrument toetsen oefenen'],
    ['music', '🎵', 'Muziek', 'luisteren zingen noten'],
    ['paint', '🎨', 'Schilderen', 'verf kunst'],
    ['draw', '✏️', 'Tekenen', 'potlood schetsen'],
    ['photo', '📷', 'Fotograferen', 'foto camera'],
    ['write', '✍️', 'Schrijven', 'pen verhaal blog'],
  ]),
  g('social', 'Sociaal en natuur', [
    ['family', '👨‍👩‍👧', 'Gezin en familie', 'kinderen samen thuis'],
    ['friends', '🧑‍🤝‍🧑', 'Vrienden zien', 'afspreken sociaal'],
    ['dog', '🐕', 'Hond uitlaten', 'wandelen huisdier'],
    ['outdoors', '🌲', 'Naar buiten', 'natuur bos buiten lucht'],
    ['sprout', '🌱', 'Nieuw begin', 'groeien zaadje plant'],
  ]),
]);

/** Alle iconen in de volgorde van de groepen. */
export const ICONS = Object.freeze(ICON_GROUPS.flatMap((group) => group.icons.map((icon) => Object.freeze({ ...icon, group: group.id }))));
