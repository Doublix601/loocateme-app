// Distance à vol d'oiseau (mètres) entre deux points lat/lon. Était dupliqué
// indépendamment dans services/LocationService.js, services/LocationSyncService.js,
// utils/locationSendGuard.js, components/CheckinVerificationScheduler.js,
// components/NearbyLocationPicker.js, et components/ServerUtils.js (sous le
// nom calculateDistance, désormais un wrapper autour de cette fonction).
export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
