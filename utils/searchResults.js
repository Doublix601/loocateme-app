// Fusionne les résultats "utilisateurs" et "lieux" de la recherche unifiée
// (/users/search). Les lieux passent en premier : ils sont déjà triés par
// proximité par le backend (via $geoNear quand lat/lon sont fournis, cf.
// user.controller.js#search) et un lieu proche ne doit pas être évincé du
// top affiché par des correspondances utilisateur moins pertinentes.
export function mergeSearchResults(users, locations, limit) {
  return [...locations, ...users].slice(0, limit);
}
