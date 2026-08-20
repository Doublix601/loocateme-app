import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import fr from './locales/fr/common.json';
import en from './locales/en/common.json';
import de from './locales/de/common.json';
import es from './locales/es/common.json';
import it from './locales/it/common.json';
import pt from './locales/pt/common.json';
import nl from './locales/nl/common.json';
import pl from './locales/pl/common.json';
import ro from './locales/ro/common.json';
import el from './locales/el/common.json';
import sv from './locales/sv/common.json';
import da from './locales/da/common.json';
import fi from './locales/fi/common.json';
import cs from './locales/cs/common.json';
import sk from './locales/sk/common.json';
import hu from './locales/hu/common.json';
import bg from './locales/bg/common.json';
import hr from './locales/hr/common.json';
import sl from './locales/sl/common.json';
import sr from './locales/sr/common.json';
import bs from './locales/bs/common.json';
import mk from './locales/mk/common.json';
import sq from './locales/sq/common.json';
import uk from './locales/uk/common.json';
import et from './locales/et/common.json';
import lv from './locales/lv/common.json';
import lt from './locales/lt/common.json';
import mt from './locales/mt/common.json';
import is from './locales/is/common.json';

// Langues officielles des pays où l'app est distribuée (voir liste marketing).
// `en` sert de repli pour toute langue système non couverte ci-dessous.
// `fr` reste la langue de référence pour les textes légaux (politique de
// confidentialité, CGU) — les autres traductions de ces textes sont fournies
// à titre informatif uniquement.
export const SUPPORTED_LANGUAGES = [
  'fr', 'en', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ro', 'el',
  'sv', 'da', 'fi', 'cs', 'sk', 'hu', 'bg', 'hr', 'sl', 'sr',
  'bs', 'mk', 'sq', 'uk', 'et', 'lv', 'lt', 'mt', 'is',
];

const resources = {
  fr: { common: fr },
  en: { common: en },
  de: { common: de },
  es: { common: es },
  it: { common: it },
  pt: { common: pt },
  nl: { common: nl },
  pl: { common: pl },
  ro: { common: ro },
  el: { common: el },
  sv: { common: sv },
  da: { common: da },
  fi: { common: fi },
  cs: { common: cs },
  sk: { common: sk },
  hu: { common: hu },
  bg: { common: bg },
  hr: { common: hr },
  sl: { common: sl },
  sr: { common: sr },
  bs: { common: bs },
  mk: { common: mk },
  sq: { common: sq },
  uk: { common: uk },
  et: { common: et },
  lv: { common: lv },
  lt: { common: lt },
  mt: { common: mt },
  is: { common: is },
};

const LANGUAGE_STORAGE_KEY = '@loocateme/language';
const DEFAULT_FALLBACK_LANGUAGE = 'en';

// Résout la langue du téléphone vers l'une de nos langues supportées.
// Ex: "en-US" -> "en", "pt-BR" -> "pt". Repli sur l'anglais si la langue
// du système n'est pas (encore) traduite.
function resolveDeviceLanguage() {
  const deviceLocales = Localization.getLocales?.() || [];
  for (const locale of deviceLocales) {
    const code = (locale.languageCode || '').toLowerCase();
    if (SUPPORTED_LANGUAGES.includes(code)) return code;
  }
  return DEFAULT_FALLBACK_LANGUAGE;
}

export async function initI18n() {
  let initialLanguage;
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    initialLanguage = stored && SUPPORTED_LANGUAGES.includes(stored) ? stored : resolveDeviceLanguage();
  } catch (_e) {
    initialLanguage = resolveDeviceLanguage();
  }

  await i18n.use(initReactI18next).init({
    resources,
    lng: initialLanguage,
    fallbackLng: DEFAULT_FALLBACK_LANGUAGE,
    defaultNS: 'common',
    ns: ['common'],
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v4',
  });

  return i18n;
}

// Permet à l'utilisateur de choisir manuellement sa langue (indépendamment
// de la langue système), depuis les Réglages.
export async function setAppLanguage(code) {
  if (!SUPPORTED_LANGUAGES.includes(code)) return;
  await i18n.changeLanguage(code);
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch (_e) {
    /* ignore persistence failure */
  }
}

export async function resetAppLanguageToSystem() {
  const deviceLanguage = resolveDeviceLanguage();
  await i18n.changeLanguage(deviceLanguage);
  try {
    await AsyncStorage.removeItem(LANGUAGE_STORAGE_KEY);
  } catch (_e) {
    /* ignore */
  }
}

export default i18n;
