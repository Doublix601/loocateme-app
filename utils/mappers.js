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
    privacyPreferences: u.privacyPreferences || { analytics: false, marketing: false },
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
