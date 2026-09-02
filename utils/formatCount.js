// Affiche un compteur, ou « ∞ » quand la valeur n'est pas finie (ex:
// PremiumService.getSuperlikesRemaining() renvoie Infinity pour un compte
// Premium — superlikes illimités).
export const formatCount = (n) => (Number.isFinite(n) ? String(n) : '∞');
