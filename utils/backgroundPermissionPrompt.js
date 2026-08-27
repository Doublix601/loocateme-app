import AsyncStorage from '@react-native-async-storage/async-storage';

// Gère la fréquence d'affichage du rappel "Position Toujours".
//
// Contexte : la permission "Toujours" ne sert QU'au mode de check-in
// automatique (entrées/sorties dans les lieux quand l'app est en arrière-plan).
// On ne doit donc jamais la redemander à froid à chaque lancement : le rappel
// n'a de sens que pour un utilisateur en mode auto, et même là il doit être
// plafonné pour ne pas harceler quelqu'un qui a délibérément refusé.
//
// Règles :
//  - au plus une fois tous les MIN_INTERVAL_MS,
//  - au maximum MAX_PROMPTS fois au total (après quoi seul un état passif /
//    une bannière contextuelle subsiste, plus jamais de modale).

const STORAGE_KEY = '@loocateme:bg_perm_prompt';
const MIN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
const MAX_PROMPTS = 2;

async function readState() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { count: 0, lastShownAt: 0 };
    const parsed = JSON.parse(raw);
    return {
      count: Number(parsed?.count) || 0,
      lastShownAt: Number(parsed?.lastShownAt) || 0,
    };
  } catch (_) {
    return { count: 0, lastShownAt: 0 };
  }
}

// Peut-on afficher la modale de rappel maintenant ?
export async function shouldPromptBackgroundPermission() {
  const { count, lastShownAt } = await readState();
  if (count >= MAX_PROMPTS) return false;
  if (Date.now() - lastShownAt < MIN_INTERVAL_MS) return false;
  return true;
}

// À appeler juste après avoir effectivement affiché la modale.
export async function markBackgroundPermissionPrompted() {
  try {
    const { count } = await readState();
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ count: count + 1, lastShownAt: Date.now() })
    );
  } catch (_) {}
}

// À appeler quand on vient de solliciter l'utilisateur pour la localisation
// ailleurs (ex : écran d'accroche pré-connexion) : on repousse le prochain
// rappel "Toujours" de MIN_INTERVAL_MS SANS consommer un des MAX_PROMPTS,
// pour ne pas enchaîner deux demandes de localisation au premier lancement.
export async function deferBackgroundPermissionPrompt() {
  try {
    const { count } = await readState();
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ count, lastShownAt: Date.now() })
    );
  } catch (_) {}
}

// À appeler quand la permission "Toujours" est finalement accordée : on remet
// le compteur à zéro pour que, si l'utilisateur la révoque plus tard, le
// rappel puisse à nouveau apparaître (une fois).
export async function resetBackgroundPermissionPrompt() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
}
