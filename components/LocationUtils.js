// Normalisation des types de lieu pour l'affichage.
//
// Règle produit : tous les types affichés à l'utilisateur doivent suivre le
// format « MAJUSCULES AVEC ESPACES + EMOJI » (ex: "BAR 🍺", "FAST FOOD 🍔",
// "COWORKING SPACE 🧑‍💻"). Les sources de données sont hétérogènes :
//   - Backend (enum `Location.type`) : libellés français avec emoji déjà
//     présent, ex: "Bar 🍺", "Café ☕", "Salle de sport 🏋️"…
//   - Overpass / OSM brut : clés snake_case sans emoji, ex: "cafe",
//     "fast_food", "coworking_space"…
// On centralise ici la conversion vers la forme normée.

// Table de correspondance explicite. Les clés couvrent à la fois les libellés
// backend et les clés OSM brutes pour garantir un rendu cohérent quelle que
// soit la provenance de l'item.
const TYPE_LABELS = {
  // ── Backend (libellés FR avec emoji) ───────────────────────────────────
  'Bar 🍺': 'BAR 🍺',
  'Boîte de nuit 💃': 'BOÎTE DE NUIT 💃',
  'Restaurant 🍴': 'RESTAURANT 🍴',
  'Café ☕': 'CAFÉ ☕',
  'Cinéma 🎬': 'CINÉMA 🎬',
  'Fast food 🍔': 'FAST FOOD 🍔',
  'Bowling 🎳': 'BOWLING 🎳',
  'Salle de sport 🏋️': 'SALLE DE SPORT 🏋️',
  'Parc 🌳': 'PARC 🌳',
  'Plage 🏖️': 'PLAGE 🏖️',
  "Parc d'attractions 🎢": "PARC D'ATTRACTIONS 🎢",
  'Bibliothèque 📚': 'BIBLIOTHÈQUE 📚',
  'Centre sportif 🏟️': 'CENTRE SPORTIF 🏟️',
  'Éducation 🎓': 'ÉDUCATION 🎓',
  'Coworking 🧑‍💻': 'COWORKING 🧑‍💻',
  'Glacier 🍦': 'GLACIER 🍦',
  'Marché 🛒': 'MARCHÉ 🛒',
  'Musée 🏛️': 'MUSÉE 🏛️',
  'Brunch 🥞': 'BRUNCH 🥞',
  'Rooftop 🌆': 'ROOFTOP 🌆',
  'Karaoké 🎤': 'KARAOKÉ 🎤',
  'Club de jeux 🎮': 'CLUB DE JEUX 🎮',
  'TEST 🤖': 'TEST 🤖',
  'Lieu 📍': 'LIEU 📍',

  // ── OSM bruts (snake_case sans emoji) ──────────────────────────────────
  bar: 'BAR 🍺',
  pub: 'BAR 🍺',
  biergarten: 'BAR 🍺',
  nightclub: 'BOÎTE DE NUIT 💃',
  restaurant: 'RESTAURANT 🍴',
  cafe: 'CAFÉ ☕',
  fast_food: 'FAST FOOD 🍔',
  food_court: 'FAST FOOD 🍔',
  cinema: 'CINÉMA 🎬',
  bowling_alley: 'BOWLING 🎳',
  gym: 'SALLE DE SPORT 🏋️',
  fitness_centre: 'SALLE DE SPORT 🏋️',
  park: 'PARC 🌳',
  beach: 'PLAGE 🏖️',
  beach_resort: 'PLAGE 🏖️',
  theme_park: "PARC D'ATTRACTIONS 🎢",
  library: 'BIBLIOTHÈQUE 📚',
  sports_centre: 'CENTRE SPORTIF 🏟️',
  stadium: 'CENTRE SPORTIF 🏟️',
  pitch: 'CENTRE SPORTIF 🏟️',
  university: 'ÉDUCATION 🎓',
  college: 'ÉDUCATION 🎓',
  school: 'ÉDUCATION 🎓',
  ice_cream: 'GLACIER 🍦',
  marketplace: 'MARCHÉ 🛒',
  market: 'MARCHÉ 🛒',
  museum: 'MUSÉE 🏛️',
  gallery: 'MUSÉE 🏛️',
  brunch: 'BRUNCH 🥞',
  rooftop: 'ROOFTOP 🌆',
  karaoke: 'KARAOKÉ 🎤',
  escape_game: 'CLUB DE JEUX 🎮',
  arcade: 'CLUB DE JEUX 🎮',
  laser_game: 'CLUB DE JEUX 🎮',
  coworking_space: 'COWORKING 🧑‍💻',
  coworking: 'COWORKING 🧑‍💻',
};

// Conservé pour rétro-compatibilité éventuelle (ancien export).
export const LOCATION_TYPES = TYPE_LABELS;

// Regex large couvrant la majorité des emojis (pictogrammes, symboles, drapeaux,
// modificateurs ZWJ). Utilisée par le fallback pour séparer emoji et texte.
const EMOJI_REGEX = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]+/gu;

function extractEmoji(str) {
  const matches = String(str).match(EMOJI_REGEX);
  if (!matches || matches.length === 0) return '';
  // On garde le dernier groupe d'emojis (typiquement en fin de libellé).
  return matches.join('').trim();
}

function stripEmoji(str) {
  return String(str).replace(EMOJI_REGEX, '').trim();
}

export function formatLocationType(type) {
  if (!type) return 'LIEU 📍';
  const key = String(type).trim();
  if (TYPE_LABELS[key]) return TYPE_LABELS[key];

  // Fallback générique : on extrait l'emoji existant (s'il y en a un), on
  // remplace les séparateurs `_` / `-` par des espaces, on met en majuscules,
  // puis on rajoute l'emoji à la fin (ou 📍 par défaut).
  const emoji = extractEmoji(key) || '📍';
  const text = stripEmoji(key)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('fr-FR');
  return text ? `${text} ${emoji}` : `LIEU ${emoji}`;
}
