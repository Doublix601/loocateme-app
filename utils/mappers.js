export const mapBackendUser = (u = {}) => {
  const socialMedias = Array.isArray(u.socialNetworks)
    ? u.socialNetworks.map((s) => ({ platform: s.type, username: s.handle }))
    : Array.isArray(u.socialMedias)
      ? u.socialMedias
      : Array.isArray(u.socialMedia)
        ? u.socialMedia
        : [];
  return {
    ...u,
    _id: u._id || u.id,
    username: u.username || u.name || '',
    firstName: u.firstName || '',
    lastName: u.lastName || '',
    customName: u.customName || '',
    bio: u.bio || '',
    photo: u.profileImageUrl || u.photo || null,
    birthdate: u.birthdate || null,
    gender: u.gender || '',
    socialMedias,
    socialMedia: socialMedias,
    isPremium: !!u.isPremium,
    role: u.role || 'user',
    status: u.status || 'green',
    consent: u.consent || { accepted: false, version: '', consentAt: null },
    privacyPreferences: u.privacyPreferences || { analytics: false },
    moderation: u.moderation || {
      warningsCount: 0,
      lastWarningAt: null,
      lastWarningReason: '',
      lastWarningType: '',
      warningsHistory: [],
      bannedUntil: null,
      bannedPermanent: false,
    },
    currentPoiId: u.currentLocation ? String(u.currentLocation) : null,
    currentLocationSince: u.currentLocationSince || null,
    boostBalance: u.boostBalance || 0,
    boostUntil: u.boostUntil || null,
    // 'auto' (par défaut) : check-in automatique par proximité GPS. 'manual' :
    // l'utilisateur check-in lui-même via le bouton "Je suis là".
    checkInMode: u.checkInMode === 'manual' ? 'manual' : 'auto',
    // Mode invisible (masque l'utilisateur des autres dans les lieux)
    invisibleMode: !!u.invisibleMode,
    // Préférences de notifications push par kind (passthrough générique du backend)
    notificationPreferences: u.notificationPreferences || {},
    // "Ta série" : streak quotidien (0-14 jours), voir MyAccountScreen/StreakCard
    streak: {
      count: typeof u?.streak?.count === 'number' ? u.streak.count : 0,
      lastCheckInDate: u?.streak?.lastCheckInDate || null,
      supervisePendingClaim: !!u?.streak?.supervisePendingClaim,
      boostPendingClaim: !!u?.streak?.boostPendingClaim,
      lastClaimedAt: u?.streak?.lastClaimedAt || null,
    },
    updatedAt: u.updatedAt,
  };
};

export const mapProfileUser = (u = {}) => {
  const socialMedias = Array.isArray(u.socialNetworks)
    ? u.socialNetworks.map((s) => ({ platform: s.type, username: s.handle }))
    : Array.isArray(u.socialMedias)
      ? u.socialMedias
      : Array.isArray(u.socialMedia)
        ? u.socialMedia
        : [];
  return {
    ...u,
    _id: u._id || u.id,
    username: u.username || u.name || '',
    firstName: u.firstName || '',
    lastName: u.lastName || '',
    customName: u.customName || '',
    bio: u.bio || '',
    photo: u.profileImageUrl || u.photo || null,
    birthdate: u.birthdate || null,
    gender: u.gender || '',
    status: u.status || 'green',
    socialMedias,
    socialMedia: socialMedias,
    locationCoordinates: Array.isArray(u.location?.coordinates)
      ? u.location.coordinates
      : Array.isArray(u.locationCoordinates)
        ? u.locationCoordinates
        : undefined,
    updatedAt: u.updatedAt,
  };
};
