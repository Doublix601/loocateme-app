// Icônes prédéfinies sélectionnables pour un PDF pro depuis le site web
// (MediaPdfUploader). La clé `icon` stockée sur `location.media[]` doit
// correspondre à une entrée de cette liste — cf. équivalent côté website
// `src/lib/pdfIcons.ts` et côté backend `Location.js` (media.icon enum).
export const PDF_ICONS = {
  document: { name: 'document-text-outline', label: 'Document' },
  menu: { name: 'restaurant-outline', label: 'Menu' },
  drinks: { name: 'wine-outline', label: 'Carte des boissons' },
  events: { name: 'calendar-outline', label: 'Événements' },
  pricing: { name: 'pricetag-outline', label: 'Tarifs' },
  info: { name: 'information-circle-outline', label: 'Infos pratiques' },
};

export const DEFAULT_PDF_ICON = 'document';

export const getPdfIconName = (key) => PDF_ICONS[key]?.name || PDF_ICONS[DEFAULT_PDF_ICON].name;
