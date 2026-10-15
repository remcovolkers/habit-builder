// De volgorde van habits (F7): sortOrder bepaalt de volgorde op Vandaag (binnen een dagdeel) en in de lijst. Puur.

export const byOrder = (a, b) =>
  (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name), 'nl') || String(a.id).localeCompare(String(b.id));

/**
 * Verplaatst één habit een plek omhoog (-1) of omlaag (+1) binnen wat de gebruiker ziet (`visibleIds`, in volgorde).
 * Geeft alleen de habits terug waarvan de sortOrder verandert: [{ id, sortOrder }]. Leeg = er valt niets te verplaatsen.
 * Alle habits (ook de niet getoonde) worden opnieuw doorgenummerd, zodat gelijke waarden nooit voor een gedeelde plek zorgen.
 */
export function moveHabit({ habits, visibleIds, id, direction }) {
  const position = visibleIds.indexOf(id);
  const neighbour = visibleIds[position + direction];
  if (position < 0 || neighbour === undefined) return [];

  const order = [...habits].sort(byOrder).map((habit) => habit.id).filter((habitId) => habitId !== id);
  const at = order.indexOf(neighbour);
  order.splice(direction < 0 ? at : at + 1, 0, id);

  const current = new Map(habits.map((habit) => [habit.id, habit.sortOrder ?? 0]));
  return order.map((habitId, index) => ({ id: habitId, sortOrder: index })).filter((item) => current.get(item.id) !== item.sortOrder);
}
