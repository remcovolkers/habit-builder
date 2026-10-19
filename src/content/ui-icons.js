// De iconen buiten de habits om: prestaties, tips en een paar tekens in de app. Net als bij de habit-iconen (content/icons.js) is de
// sleutel het contract met de iconensets van de thema's (docs/MODA-ICONS.md); een thema levert ze in themes/<id>/icons.svg.
//
// Sleutels volgen uit de sleutel van het ding zelf: een prestatie `first_checkin` heeft het icoon `ach-first-checkin`, een tip
// `never_miss_twice` het icoon `tip-never-miss-twice`. De prestaties onder "gepland" hebben nog geen regel in domain/achievements.js
// (ze staan in docs/ITERATIE-1.2.md §5); hun icoon wordt alvast gemaakt zodat de set in één keer af is.
export const achievementIconKey = (achievementKey) => `ach-${String(achievementKey).replaceAll('_', '-')}`;
export const tipIconKey = (tipId) => `tip-${String(tipId).replaceAll('_', '-')}`;

const from = (prefix, ids) => ids.map((id) => `${prefix}-${id}`);

export const UI_ICON_GROUPS = Object.freeze([
  {
    id: 'achievements',
    label: 'Prestaties',
    keys: Object.freeze(from('ach', [
      'first-checkin', 'days-7', 'days-21', 'days-42', 'days-66', 'days-100', 'days-365', 'perfect-week', 'comeback', 'first-graduated',
      'three-active', 'review-streak-4',
    ])),
  },
  {
    id: 'achievements-planned',
    label: 'Prestaties (gepland)',
    keys: Object.freeze(from('ach', [
      'done-10', 'done-50', 'done-100', 'done-500', 'done-1000', 'streak-7', 'streak-14', 'streak-30', 'perfect-weeks-4', 'recover-5',
      'strong-return', 'minimal-5', 'minimal-first', 'counter-week', 'pause-resume', 'first-review', 'automaticity-4', 'why-3',
      'all-dayparts', 'five-active', 'all-done-10', 'first-friend', 'first-invite', 'friends-5', 'graduated-2', 'graduated-5',
    ])),
  },
  {
    id: 'tips',
    label: 'Tips',
    keys: Object.freeze(from('tip', ['planned', 'start-small', 'dip', 'cue', 'identity', 'automatic', 'never-miss-twice', 'maintain', 'paused'])),
  },
  { id: 'ui', label: 'In de app', keys: Object.freeze(['ui-streak', 'ui-celebrate', 'ui-all-planned']) },
]);

export const UI_ICON_KEYS = Object.freeze(UI_ICON_GROUPS.flatMap((group) => group.keys));
