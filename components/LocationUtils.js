export const LOCATION_TYPES = {
  bar: 'Bar 🍺',
  restaurant: 'Restaurant 🍴',
  gym: 'Salle de sport 💪',
  nightclub: 'Boîte de nuit 🕺',
  parc: 'Parc 🌳',
  beach: 'Plage 🏖️',
  amusementPark: "Parc d'attraction 🎢",
  coffee: 'Café ☕',
  library: 'Bibliothèque 📚',
};

export function formatLocationType(type) {
  return LOCATION_TYPES[type] || type?.toUpperCase() || 'LIEU';
}
