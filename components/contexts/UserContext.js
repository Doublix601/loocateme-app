import React, { createContext, useState, useEffect } from 'react';
import { getAccessToken, getMyUser } from '../ApiRequest';
import { subscribe } from '../EventBus';

export const UserContext = createContext();

function mapBackendUser(u = {}) {
  return {
    username: u.name || '',
    bio: u.bio || '',
    photo: u.profileImageUrl || null,
    socialMedia: Array.isArray(u.socialNetworks)
      ? u.socialNetworks.map((s) => ({ platform: s.type, username: s.handle }))
      : [],
    isVisible: u.isVisible !== false,
    // Include GDPR consent and privacy preferences if present
    consent: u.consent || { accepted: false, version: '', consentAt: null },
    privacyPreferences: u.privacyPreferences || { analytics: false, marketing: false },
  };
}

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState({
    username: 'Arnaud',
    bio: 'Bio de mon compte',
    photo: null,
    socialMedia: [],
    isVisible: true,
    consent: { accepted: false, version: '', consentAt: null },
    privacyPreferences: { analytics: false, marketing: false },
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
        // If already hydrated with socials and photo, skip
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

  // Reset user state on global auth logout
  useEffect(() => {
    const unsub = subscribe('auth:logout', () => {
      setUser({
        username: '',
        bio: '',
        photo: null,
        socialMedia: [],
        isVisible: false,
      });
    });
    return () => unsub();
  }, []);

  return (
    <UserContext.Provider value={{ user, updateUser }}>
      {children}
    </UserContext.Provider>
  );
};
