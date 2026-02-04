import React, { createContext, useState, useEffect } from 'react';
import { getAccessToken, getMyUser } from '../ApiRequest';
import { subscribe } from '../EventBus';

export const UserContext = createContext();

function mapBackendUser(u = {}) {
  return {
    username: u.username || u.name || '',
    firstName: u.firstName || '',
    lastName: u.lastName || '',
    customName: u.customName || '',
    bio: u.bio || '',
    photo: u.profileImageUrl || null,
    socialMedia: Array.isArray(u.socialNetworks)
      ? u.socialNetworks.map((s) => ({ platform: s.type, username: s.handle }))
      : [],
    isVisible: u.isVisible !== false,
    // Premium flag from backend; free if falsy
    isPremium: !!u.isPremium,
    // User role: 'user', 'moderator', or 'admin'
    role: u.role || 'user',
    // Include GDPR consent and privacy preferences if present
    consent: u.consent || { accepted: false, version: '', consentAt: null },
    privacyPreferences: u.privacyPreferences || { analytics: false, marketing: false },
    moderation: u.moderation || { warningsCount: 0, lastWarningAt: null, lastWarningReason: '', warningsHistory: [], bannedUntil: null, bannedPermanent: false },
  };
}

export const UserProvider = ({ children }) => {
  // Start with an empty user so hydration always fetches fresh data
  const [user, setUser] = useState({
    username: '',
    firstName: '',
    lastName: '',
    customName: '',
    bio: '',
    photo: null,
    socialMedia: [],
    isVisible: true,
    isPremium: false,
    role: 'user',
    consent: { accepted: false, version: '', consentAt: null },
    privacyPreferences: { analytics: false, marketing: false },
    moderation: { warningsCount: 0, lastWarningAt: null, lastWarningReason: '', warningsHistory: [], bannedUntil: null, bannedPermanent: false },
  });

  const updateUser = (updatedUser) => {
    setUser(updatedUser);
  };

  // Auto-hydrate user from backend if a token exists (e.g., after auto-login)
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const token = getAccessToken && getAccessToken();
        if (!token) return;
        // If already hydrated with socials and photo, skip initial fetch
        const looksHydrated = (user?.socialMedia?.length || 0) > 0 || !!user?.photo || (user?.bio && user.bio.length > 0);
        if (looksHydrated) return;
        const res = await getMyUser();
        const me = res?.user;
        if (!cancelled && me) {
          setUser(mapBackendUser(me));
        }
      } catch (e) {
        console.error('[UserContext] Auto-hydration failed', { code: e?.code, message: e?.message, status: e?.status });
      }
    };
    hydrate();
    return () => {
      cancelled = true;
    };
  // only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset user state on global auth logout and re-hydrate on login
  useEffect(() => {
    const offLogout = subscribe('auth:logout', () => {
      setUser({
        username: '',
        firstName: '',
        lastName: '',
        customName: '',
        bio: '',
        photo: null,
        socialMedia: [],
        isVisible: false,
        isPremium: false,
        role: 'user',
        consent: { accepted: false, version: '', consentAt: null },
        privacyPreferences: { analytics: false, marketing: false },
        moderation: { warningsCount: 0, lastWarningAt: null, lastWarningReason: '', warningsHistory: [], bannedUntil: null, bannedPermanent: false },
      });
    });
    const offLogin = subscribe('auth:login', async () => {
      try {
        const res = await getMyUser();
        const me = res?.user;
        if (me) setUser(mapBackendUser(me));
      } catch (e) {
        // silent
      }
    });
    // Lorsque le backend signale un reload UI (abonnement changé), recharger le profil
    const offUiReload = subscribe('ui:reload', async () => {
      try {
        const res = await getMyUser();
        const me = res?.user;
        if (me) setUser(mapBackendUser(me));
      } catch (_) {}
    });
    return () => { offLogout(); offLogin(); offUiReload(); };
  }, []);

  return (
    <UserContext.Provider value={{ user, updateUser }}>
      {children}
    </UserContext.Provider>
  );
};
