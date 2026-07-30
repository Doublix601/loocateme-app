// Dev only: permet à un check-in/check-out forcé (LocationScreen) de
// suspendre temporairement les heartbeats/mises à jour de position
// automatiques, qui sinon re-matchent l'utilisateur sur sa position GPS
// réelle et annulent le forçage en quelques secondes.
let suppressUntil = 0;

export function suppressLocationHeartbeat(ms = 2 * 60 * 1000) {
  if (!__DEV__) return;
  suppressUntil = Date.now() + ms;
}

export function isLocationHeartbeatSuppressed() {
  return __DEV__ && Date.now() < suppressUntil;
}
