import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAccessToken, getMyUser } from '../ApiRequest';
import { registerCurrentDevicePushToken } from '../PushService';
import { subscribe } from '../EventBus';
import { mapBackendUser } from '../../utils/mappers';
import { incrementCheckinCount } from '../../utils/checkinCounter';

export const UserContext = createContext();

export const UserProvider = ({ children }) => {
  // Start with an empty user so hydration always fetches fresh data
  const [user, setUser] = useState({
    username: '',
    firstName: '',
    lastName: '',
    customName: '',
    bio: '',
    photo: null,
    birthdate: null,
    gender: '',
    socialMedia: [],
    isPremium: false,
    currentPoiId: null,
    currentLocationSince: null,
    checkInMode: 'auto',
    role: 'user',
    status: 'green',
    consent: { accepted: false, version: '', consentAt: null },
    privacyPreferences: { analytics: false, marketing: false, bluetoothProximity: false },
    invisibleMode: false,
    notificationPreferences: {},
    moderation: {
      warningsCount: 0,
      lastWarningAt: null,
      lastWarningReason: '',
      lastWarningType: '',
      warningsHistory: [],
      bannedUntil: null,
      bannedPermanent: false,
    },
    boostBalance: 0,
    boostUntil: null,
  });

  const updateUser = useCallback((updatedUser) => {
    setUser(updatedUser);
    if (updatedUser?.status) {
      AsyncStorage.setItem('user_status', updatedUser.status).catch(() => {});
    }
    if (updatedUser?.checkInMode) {
      // Lu par la tâche de fond (components/BackgroundLocation.js), qui tourne
      // hors arbre React (app en arrière-plan/tuée) et n'a donc pas accès à ce
      // contexte : sans cette persistance, elle ne peut pas savoir que
      // l'utilisateur a choisi le check-in manuel et continuerait de check-in
      // automatiquement via le heartbeat en arrière-plan.
      AsyncStorage.setItem('user_checkInMode', updatedUser.checkInMode).catch(() => {});
    }
  }, []);

  // Auto-hydrate user from backend if a token exists (e.g., after auto-login)
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const savedStatus = await AsyncStorage.getItem('user_status');
        if (savedStatus && !cancelled) {
          setUser((prev) => ({ ...prev, status: savedStatus }));
        }

        const token = getAccessToken && getAccessToken();
        if (!token) return;
        // If already hydrated with socials and photo, skip initial fetch
        const looksHydrated =
          (user?.socialMedia?.length || 0) > 0 || !!user?.photo || (user?.bio && user.bio.length > 0);
        if (looksHydrated) return;
        const res = await getMyUser();
        const me = res?.user;
        if (!cancelled && me) {
          setUser(mapBackendUser(me));
          try {
            await registerCurrentDevicePushToken();
          } catch (_) {}
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
        birthdate: null,
        gender: '',
        socialMedia: [],
        isPremium: false,
        currentPoiId: null,
        currentLocationSince: null,
        checkInMode: 'auto',
        role: 'user',
        status: 'green',
        consent: { accepted: false, version: '', consentAt: null },
        privacyPreferences: { analytics: false, marketing: false, bluetoothProximity: false },
        invisibleMode: false,
        notificationPreferences: {},
        moderation: {
          warningsCount: 0,
          lastWarningAt: null,
          lastWarningReason: '',
          lastWarningType: '',
          warningsHistory: [],
          bannedUntil: null,
          bannedPermanent: false,
        },
        boostBalance: 0,
        boostUntil: null,
      });
    });
    const offLogin = subscribe('auth:login', async () => {
      try {
        const res = await getMyUser();
        const me = res?.user;
        if (me) setUser(mapBackendUser(me));
        try {
          await registerCurrentDevicePushToken();
        } catch (_) {}
      } catch (e) {
        // silent
      }
    });
    // Retour visuel instantané du check-in (cf. LocationService.publishOptimisticCheckIn) :
    // affiche immédiatement "vous êtes ici" à partir d'une estimation locale,
    // avant même que le vrai check-in (throttlé côté serveur) ait résolu. La
    // valeur est ensuite écrasée par la vérité serveur au prochain heartbeat
    // (usePresence.js), qui appelle déjà `updateUser` avec la réponse réelle —
    // aucune reconciliation manuelle n'est donc nécessaire ici.
    const offOptimisticCheckIn = subscribe('presence:optimistic', ({ locationId } = {}) => {
      if (!locationId) return;
      setUser((prev) => (prev.currentPoiId === locationId ? prev : { ...prev, currentPoiId: locationId }));
    });

    // Lorsque le backend signale un reload UI (abonnement changé), recharger le profil
    const offUiReload = subscribe('ui:reload', async () => {
      try {
        const res = await getMyUser();
        const me = res?.user;
        if (me) setUser(mapBackendUser(me));
        try {
          await registerCurrentDevicePushToken();
        } catch (_) {}
      } catch (_) {}
    });

    // Source de vérité centrale pour l'état de présence : ApiRequest.js diffuse
    // le `user` de la réponse pour toute mutation sous /user(s)//profile//social
    // (cf. isSelfUserMutationPath), et on l'applique ici automatiquement, qu'un
    // call site ait ou non pensé à appeler updateUser lui-même. Élimine la
    // classe de bug "check-in enregistré côté serveur mais jamais reflété côté
    // UI" (check-in via QR code, correction de check-in, heartbeat en
    // arrière-plan — tous passent par ApiRequest.request() donc tous
    // déclenchent ce chemin, indépendamment de ce que fait l'appelant avec la
    // valeur de retour).
    const offMutationSync = subscribe('api:mutation', ({ user: backendUser } = {}) => {
      if (!backendUser) return;
      const next = mapBackendUser(backendUser);
      setUser((prev) => {
        // Détecte une transition "pas checké" -> "checké" (n'importe quel
        // flow : manuel, auto GPS, QR, BLE, heartbeat) pour piloter le
        // déblocage progressif depuis un seul endroit plutôt que dupliquer
        // l'appel à incrementCheckinCount() dans chaque call site.
        if (!prev.currentPoiId && next.currentPoiId) {
          incrementCheckinCount().catch(() => {});
        }
        return next;
      });
    });

    return () => {
      offLogout();
      offLogin();
      offOptimisticCheckIn();
      offUiReload();
      offMutationSync();
    };
  }, []);

  const value = useMemo(() => ({ user, updateUser }), [user, updateUser]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};
