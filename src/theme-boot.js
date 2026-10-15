// Zet het thema vóór de eerste weergave, zodat je geen flits van het verkeerde thema ziet.
// Bewust een klassiek script (geen module) en zonder imports: het moet synchroon en direct draaien.
// De lijst met thema's moet gelijk zijn aan THEME_IDS in src/app/themes.js (een test bewaakt dat).
(function () {
  try {
    var ids = ['v0lky1', 'mel'];
    var fromLink = new URLSearchParams(location.search).get('theme'); // ?theme=mel in een gedeelde link
    var theme = ids.indexOf(fromLink) >= 0 ? fromLink : localStorage.getItem('hb-theme');
    if (ids.indexOf(theme) >= 0) document.documentElement.setAttribute('data-theme', theme);
  } catch (error) {
    /* opslag geblokkeerd: dan het standaardthema */
  }
})();
