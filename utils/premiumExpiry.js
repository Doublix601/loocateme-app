// Détection "abonnement Premium expiré" côté client, à partir de l objet user
// renvoyé par le backend (champs premiumTrialEnd / premiumExpiresAt / isPremium).
// La modale correspondante (PremiumExpiredModal) ne doit s afficher qu une fois
// par échéance : on mémorise la date d échéance déjà acquittée dans AsyncStorage.
import AsyncStorage from "@react-native-async-storage/async-storage";

const ACK_KEY = "@loocateme:premium_expired_ack";

export function getExpiredPremiumEndDate(user) {
  if (!user || user.isPremium) return null;
  const candidates = [user.premiumTrialEnd, user.premiumExpiresAt]
    .map((d) => (d ? new Date(d) : null))
    .filter((d) => d && !Number.isNaN(d.getTime()));
  if (!candidates.length) return null;
  const latest = new Date(Math.max(...candidates.map((d) => d.getTime())));
  return latest.getTime() < Date.now() ? latest : null;
}

export async function shouldShowPremiumExpired(user) {
  const end = getExpiredPremiumEndDate(user);
  if (!end) return false;
  try {
    const ack = await AsyncStorage.getItem(ACK_KEY);
    return ack !== end.toISOString();
  } catch (_) {
    return true;
  }
}

export async function acknowledgePremiumExpired(user) {
  const end = getExpiredPremiumEndDate(user);
  if (!end) return;
  try {
    await AsyncStorage.setItem(ACK_KEY, end.toISOString());
  } catch (_) {}
}
