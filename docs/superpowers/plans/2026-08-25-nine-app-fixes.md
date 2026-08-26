# Neuf corrections/fonctionnalités LoocateMe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger neuf bugs/fonctionnalités indépendants remontés par l'utilisateur sur `loocateme-app` (et, pour deux d'entre eux, sur `loocateme_backend`) : demande de permission localisation, overflow de l'onboarding profil, notification de perte de série, ville dans les cartes de lieu, rafraîchissement du paywall consommables, bouton "Booster mon profil" conditionné à la présence, priorisation/limite de la recherche, couleur du badge de type de lieu en mode jour, couleur du bouton "Je suis ici".

**Architecture:** Neuf tâches indépendantes, une par item signalé. La grande majorité des changements touchent `loocateme-app` (React Native / Expo) ; deux tâches (streak perdu, recherche pondérée) touchent aussi `loocateme_backend` (Express/Mongo). Chaque tâche est revuable et committable séparément — aucune dépendance entre tâches.

**Tech Stack:** React Native (Expo, react-navigation, expo-location, react-i18next), Jest (`jest-expo` preset, pas de bibliothèque de rendu de composants — pas de React Native Testing Library installée) côté app ; Express/Mongoose, `node --test` (node:test + node:assert/strict, stubs manuels sur les modèles Mongoose plutôt qu'une vraie DB de test) côté backend.

**Spec:** Cette conversation (liste de 9 demandes utilisateur, 2026-08-25). Pas de document de spec séparé — le contexte exact de chaque bug (repro, cause racine identifiée par investigation du code) est documenté dans chaque tâche ci-dessous.

## Global Constraints

- Workflow projet (cf. skill `loocateme`) : commit + push directement sur la branche principale de chaque dépôt touché (pas de PR). `loocateme-app` : branche `main`. `loocateme_backend` : vérifier `git branch --show-current` avant de committer (skill le rappelle).
- `loocateme-app` n'a pas de conteneur/serveur à rebuild : un `git push` suffit après chaque tâche qui la touche.
- `loocateme_backend` : après tout commit touchant ce dépôt, vérifier s'il y a un `docker-compose.yml`/process manager et rebuild/redémarrer en conséquence (cf. skill `loocateme`) — à faire une fois à la fin des tâches 3 et 7 (les deux seules qui touchent le backend), pas après chaque fichier individuel.
- Pas de React Native Testing Library dans `loocateme-app` : le TDD strict (test unitaire → échec → implémentation → succès) n'est appliqué qu'aux tâches où une logique pure est extractible (calculs, tri, formatage). Les tâches purement visuelles/de configuration (couleurs, JSX déclaratif, entrées i18n) utilisent une étape de vérification manuelle explicite à la place — indiqué dans la tâche concernée.
- Traductions : l'app supporte 30 locales (`i18n/locales/<code>/common.json` : bg, bs, cs, da, de, el, en, es, et, fi, fr, hr, hu, is, it, lt, lv, mk, mt, nl, pl, pt, ro, sk, sl, sq, sr, sv, uk). Toute nouvelle clé de texte visible doit être ajoutée dans les 30 fichiers.
- Ne pas committer `.superpowers/` (dossier de session laissé par un brainstorm précédent, non versionné, déjà listé comme untracked par `git status`).

---

## File Structure

### `loocateme-app`

| Fichier | Rôle dans ce plan |
|---|---|
| `utils/onboarding.js` | Modifié (Tâche 1) : ajoute `ensureLocationPermissionRequested()` et l'appelle dans `navigateAfterAuth()`. |
| `views/OnboardingScreen.js` | Modifié (Tâche 1) : appelle `ensureLocationPermissionRequested()` à la fin des slides / au skip. |
| `utils/__tests__/onboarding.test.js` | Créé (Tâche 1) : teste `navigateAfterAuth`. |
| `utils/spotlightPlacement.js` | Créé (Tâche 2) : calcul pur de la position du tooltip d'onboarding profil. |
| `utils/__tests__/spotlightPlacement.test.js` | Créé (Tâche 2). |
| `components/SpotlightOverlay.js` | Modifié (Tâche 2) : utilise `spotlightPlacement.js` au lieu du calcul buggé inline. |
| `App.js` | Modifié (Tâche 3) : route le tap sur la notif `streak_lost` vers `MainTabs`. |
| `views/SettingsScreen.js` | Modifié (Tâche 3) : ajoute le kind `streak_lost` à la liste des préférences de notifications. |
| `views/LocationList/LocationCard.js` | Modifié (Tâches 4, 8) : affichage de la ville + couleur du badge de type en mode jour. |
| `views/LocationScreen.js` | Modifié (Tâches 4, 6, 8, 9) : affichage de la ville, bouton "Booster mon profil" grisé hors présence, couleur du badge de type en mode jour, couleur du bouton "Je suis ici". |
| `components/ConsumablesShopSheet.js` | Modifié (Tâche 5) : rafraîchit depuis le backend à l'ouverture. |
| `components/ApiRequest.js` | Modifié (Tâche 7) : limite par défaut de `searchUsers` à 5. |
| `views/SearchView.js` | Modifié (Tâche 7) : limite à 5, priorité aux lieux proches. |
| `utils/searchResults.js` | Créé (Tâche 7) : fusion pure users/locations avec priorité lieux. |
| `utils/__tests__/searchResults.test.js` | Créé (Tâche 7). |
| `i18n/locales/<30 codes>/common.json` | Modifiés (Tâches 3, 6) : nouvelles clés `settingsScreen.notifKinds.streakLost` et `locationScreen.boostRequiresPresence`. |

### `loocateme_backend`

| Fichier | Rôle dans ce plan |
|---|---|
| `src/services/streak.service.js` | Modifié (Tâche 3) : `decayInactiveUsers()` envoie une notif push `streak_lost`. |
| `tests/streak.service.test.js` | Modifié (Tâche 3) : nouveau test pour `decayInactiveUsers`. |
| `src/middlewares/validators.js` | Modifié (Tâche 7) : plafond `limit` de `/users/search` ramené à 5. |
| `src/controllers/user.controller.js` | Modifié (Tâche 7) : `safeLimit` ramené à 5. |

---

## Task 1: La demande de permission localisation ne se fait plus pendant le chargement de LocationListScreen

**Contexte / cause racine identifiée :** Au tout premier lancement (après login), `LocationListScreen` monte deux `useEffect` qui appellent chacun, en parallèle, `Location.requestForegroundPermissionsAsync()` — l'un dans l'effet "Watch for location updates" ([views/LocationListScreen.js:702](views/LocationListScreen.js:702)), l'autre dans `fetchNearbyLocations()` ([views/LocationListScreen.js:1180](views/LocationListScreen.js:1180)), déclenché par l'effet de mount ([views/LocationListScreen.js:1081](views/LocationListScreen.js:1081)). Deux appels natifs concurrents à la demande de permission avant que l'utilisateur n'ait répondu au dialogue OS provoquent une résolution incohérente d'un des deux appels sur iOS ; `fetchNearbyLocations` retombe alors sur la branche `status !== 'granted'` → `setLocationError(true)` et n'affiche jamais les lieux, même si la permission vient d'être réellement accordée. Un kill+relance de l'app repart avec la permission déjà tranchée par l'OS (plus de dialogue, plus de concurrence), d'où la disparition du bug.

**Fix :** ne plus laisser la toute première demande de permission se produire pendant le chargement de `LocationListScreen`. On la déclenche une seule fois, en amont, juste avant que `MainTabs` (qui monte `LocationListScreen`) n'apparaisse à l'écran — au point de sortie unique `navigateAfterAuth()` (utilisateur déjà onboardé) et à la fin de `OnboardingScreen` (nouvel utilisateur). Quand `LocationListScreen` monte, la permission est donc déjà tranchée (accordée ou refusée) : ses deux appels internes à `requestForegroundPermissionsAsync()` restent inchangés mais se résolvent instantanément sans dialogue ni concurrence.

**Files:**
- Modify: [utils/onboarding.js](utils/onboarding.js)
- Modify: [views/OnboardingScreen.js](views/OnboardingScreen.js)
- Test: `utils/__tests__/onboarding.test.js`

**Interfaces:**
- Produces: `ensureLocationPermissionRequested(): Promise<void>` exporté par `utils/onboarding.js`, appelé sans argument, ne lève jamais (best-effort).
- Modifie le comportement (pas la signature) de `navigateAfterAuth(navigation): Promise<void>`, déjà utilisé par [views/LoginScreen.js:64](views/LoginScreen.js:64).

- [ ] **Step 1: Write the failing test**

Créer `utils/__tests__/onboarding.test.js` :

```js
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockRequestForegroundPermissionsAsync = jest.fn().mockResolvedValue({ status: 'granted' });
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: (...args) => mockRequestForegroundPermissionsAsync(...args),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigateAfterAuth } from '../onboarding';

describe('navigateAfterAuth', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockRequestForegroundPermissionsAsync.mockClear();
  });

  it('requests location permission once before sending a returning user straight to MainTabs', async () => {
    await AsyncStorage.setItem('loocateme_onboarding_done', 'true');
    const navigation = { reset: jest.fn() };

    await navigateAfterAuth(navigation);

    expect(mockRequestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'MainTabs' }] });
  });

  it('does not request location permission for a first-time user routed to Onboarding (it is requested at the end of the slides instead)', async () => {
    const navigation = { reset: jest.fn() };

    await navigateAfterAuth(navigation);

    expect(mockRequestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Onboarding' }] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest utils/__tests__/onboarding.test.js`
Expected: FAIL — `mockRequestForegroundPermissionsAsync` n'est jamais appelé dans le premier test (`ensureLocationPermissionRequested` n'existe pas encore / n'est pas appelée par `navigateAfterAuth`).

- [ ] **Step 3: Write minimal implementation**

Modifier `utils/onboarding.js` :

```js
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

const KEY = 'loocateme_onboarding_done';
```

(ajouter l'import `expo-location` en haut du fichier, juste après l'import `AsyncStorage` existant)

Puis, à la fin du fichier, avant `navigateAfterAuth` :

```js
// Demande la permission de localisation une seule fois, au point de sortie du
// flux d'auth/onboarding — jamais depuis LocationListScreen (cf. plan "demande
// de localisation pendant le chargement de LocationListScreen"). Idempotente :
// requestForegroundPermissionsAsync() ne réaffiche pas le dialogue OS si le
// statut est déjà tranché (granted/denied), donc un appel répété à chaque
// login d'un utilisateur qui a déjà répondu est un simple no-op silencieux.
export async function ensureLocationPermissionRequested() {
  try {
    await Location.requestForegroundPermissionsAsync();
  } catch (_) {
    // Best-effort : une erreur de l'API de permission ne doit jamais bloquer la navigation.
  }
}

// Navigue vers Onboarding si pas encore vu, sinon MainTabs.
export async function navigateAfterAuth(navigation) {
  const seen = await hasSeenOnboarding();
  if (seen) {
    // Utilisateur déjà onboardé : MainTabs (donc LocationListScreen) va monter
    // directement, la permission doit donc déjà être tranchée avant.
    await ensureLocationPermissionRequested();
  }
  navigation.reset({
    index: 0,
    routes: [{ name: seen ? 'MainTabs' : 'Onboarding' }],
  });
}
```

Modifier `views/OnboardingScreen.js` — import (ligne 7) :

```js
import { markOnboardingDone, ensureLocationPermissionRequested } from '../utils/onboarding';
```

Puis `goNext` :

```js
  const goNext = async () => {
    if (isLast) {
      const code = referralCode.trim();
      if (code) {
        // Facultatif et non bloquant : une erreur (code invalide, déjà utilisé...)
        // ne doit jamais empêcher de terminer l'onboarding.
        try {
          await redeemReferralCode(code);
        } catch (_) {}
        try {
          await AsyncStorage.removeItem(PENDING_REFERRAL_CODE_KEY);
        } catch (_) {}
      }
      await markOnboardingDone();
      await ensureLocationPermissionRequested();
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } else {
      flatRef.current?.scrollToIndex({ index: index + 1, animated: true });
    }
  };
```

Et `skip` :

```js
  const skip = async () => {
    await markOnboardingDone();
    await ensureLocationPermissionRequested();
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest utils/__tests__/onboarding.test.js`
Expected: PASS

- [ ] **Step 5: Manual verification**

Sur un device/simulateur avec la permission de localisation encore non tranchée pour l'app (désinstaller/réinstaller ou reset les permissions dans les réglages OS) : se connecter → observer que le dialogue de permission apparaît pendant les slides d'onboarding ou juste après (avant que la liste de lieux n'apparaisse), jamais pendant qu'un spinner de chargement de `LocationListScreen` est déjà visible. Accorder la permission → vérifier que la liste de lieux se charge immédiatement, sans qu'il soit nécessaire de kill+relancer l'app.

- [ ] **Step 6: Commit**

```bash
git add utils/onboarding.js views/OnboardingScreen.js utils/__tests__/onboarding.test.js
git commit -m "fix: request location permission before MainTabs mounts, not during LocationListScreen load"
git push
```

---

## Task 2: L'onboarding (spotlight) de MyAccountScreen a des éléments qui sortent de l'écran

**Contexte / cause racine identifiée :** Le tooltip du composant `SpotlightOverlay` ([components/SpotlightOverlay.js](components/SpotlightOverlay.js)) décide de s'afficher au-dessus ou en dessous de l'élément surligné via `showBelow = sy + sh < H * 0.58` (`sy`/`sh` = position/hauteur de l'élément mesuré à l'écran, `H` = hauteur d'écran). Pour un élément **haut sur l'écran mais grand** — typiquement l'étape 1 de l'onboarding profil, la carte photo (`ProfileHero`, ratio 4:5, quasi toute la largeur de l'écran) — `sy` est petit (peu d'espace au-dessus) mais `sy + sh` dépasse quand même 58 % de la hauteur d'écran, donc `showBelow` est `false` : le tooltip se place **au-dessus** de l'élément via `bottom: H - sy + 16`, alors qu'il n'y a presque pas de place au-dessus. Comme la hauteur du tooltip n'est pas plafonnée dans cette branche, il est rendu avec un `top` implicite négatif — il sort de l'écran par le haut. C'est exactement l'étape "photo" de l'onboarding décrite dans le code ([views/MyAccountScreen.js:141](views/MyAccountScreen.js:141), commentaire de `ProfileHero.js:16-18`).

**Fix :** remplacer l'heuristique `showBelow`/`top`/`bottom` par un calcul qui compare l'espace réellement disponible **au-dessus** vs **en dessous** de l'élément, et qui plafonne toujours la position finale entre une marge de sécurité en haut et `H - hauteurEstiméeDuTooltip` en bas — donc jamais de rendu hors écran, quelle que soit la position/taille de l'élément surligné. Extrait en fonction pure testable (`utils/spotlightPlacement.js`) plutôt que laissé inline, pour pouvoir écrire un vrai test de régression.

**Files:**
- Create: `utils/spotlightPlacement.js`
- Test: `utils/__tests__/spotlightPlacement.test.js`
- Modify: [components/SpotlightOverlay.js](components/SpotlightOverlay.js)

**Interfaces:**
- Produces: `computeSpotlightTooltipTop({ sy: number, sh: number, screenHeight: number, estimatedHeight?: number, safeTop?: number }): number` et les constantes `SPOTLIGHT_ESTIMATED_HEIGHT`, `SPOTLIGHT_SAFE_TOP`, exportées par `utils/spotlightPlacement.js`.
- Consumes (dans `SpotlightOverlay.js`) : `sx`, `sy`, `sw`, `sh` déjà calculés localement dans le composant (inchangés), `H` = `Dimensions.get('window').height` déjà importé.

- [ ] **Step 1: Write the failing test**

Créer `utils/__tests__/spotlightPlacement.test.js` :

```js
import { computeSpotlightTooltipTop, SPOTLIGHT_ESTIMATED_HEIGHT, SPOTLIGHT_SAFE_TOP } from '../spotlightPlacement';

describe('computeSpotlightTooltipTop', () => {
  const H = 800;

  it('places the tooltip below a small element near the top of the screen', () => {
    const top = computeSpotlightTooltipTop({ sy: 100, sh: 80, screenHeight: H });
    expect(top).toBe(100 + 80 + 16);
  });

  it('places the tooltip above a small element near the bottom of the screen', () => {
    const top = computeSpotlightTooltipTop({ sy: 700, sh: 60, screenHeight: H });
    expect(top).toBe(700 - 16 - SPOTLIGHT_ESTIMATED_HEIGHT);
  });

  it('regression: a tall element starting near the top (ex: la carte photo de profil) no longer renders the tooltip off-screen above', () => {
    // sy petit (peu d'espace au-dessus) mais sy+sh dépasse 58% de l'écran :
    // l'ancienne heuristique plaçait le tooltip au-dessus avec un top négatif.
    const top = computeSpotlightTooltipTop({ sy: 50, sh: 450, screenHeight: H });
    expect(top).toBe(50 + 450 + 16); // assez de place en dessous -> tooltip en dessous
    expect(top).toBeGreaterThanOrEqual(SPOTLIGHT_SAFE_TOP);
    expect(top + SPOTLIGHT_ESTIMATED_HEIGHT).toBeLessThanOrEqual(H);
  });

  it('clamps the tooltip so it never overflows the bottom of a short screen', () => {
    const top = computeSpotlightTooltipTop({ sy: 100, sh: 200, screenHeight: 400 });
    expect(top).toBe(400 - SPOTLIGHT_ESTIMATED_HEIGHT);
    expect(top + SPOTLIGHT_ESTIMATED_HEIGHT).toBeLessThanOrEqual(400);
  });

  it('never renders above the safe top margin', () => {
    const top = computeSpotlightTooltipTop({ sy: 300, sh: 50, screenHeight: 400 });
    expect(top).toBeGreaterThanOrEqual(SPOTLIGHT_SAFE_TOP);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest utils/__tests__/spotlightPlacement.test.js`
Expected: FAIL avec `Cannot find module '../spotlightPlacement'`

- [ ] **Step 3: Write minimal implementation**

Créer `utils/spotlightPlacement.js` :

```js
// Hauteur estimée du tooltip (titre + description + barre de progression +
// boutons) : sert de budget d'espace pour garantir qu'il tient à l'écran,
// dans les deux directions (au-dessus ou en dessous de l'élément surligné).
export const SPOTLIGHT_ESTIMATED_HEIGHT = 260;
// Marge minimale sous la status bar / l'encoche, en dessous de laquelle le
// tooltip ne doit jamais remonter.
export const SPOTLIGHT_SAFE_TOP = 50;

// Position verticale (style `top`, en px) du tooltip d'onboarding, calculée
// pour qu'il reste toujours entièrement visible à l'écran.
//
// `sy`/`sh` : position/hauteur (en coordonnées écran) de l'élément surligné.
// `screenHeight` : hauteur de l'écran.
//
// Contrairement à l'ancienne heuristique (`sy + sh < H * 0.58`), qui ne
// regardait que le bas de l'élément, celle-ci compare l'espace réellement
// disponible au-dessus (`sy`) et en dessous (`screenHeight - (sy + sh)`) —
// un grand élément qui commence près du haut de l'écran (ex: la carte photo
// de profil) a peu de place au-dessus malgré un bas qui dépasse 58% de
// l'écran ; l'ancien calcul le plaçait quand même au-dessus, hors écran.
export function computeSpotlightTooltipTop({
  sy,
  sh,
  screenHeight,
  estimatedHeight = SPOTLIGHT_ESTIMATED_HEIGHT,
  safeTop = SPOTLIGHT_SAFE_TOP,
}) {
  const spaceBelow = screenHeight - (sy + sh);
  const showBelow = spaceBelow >= estimatedHeight || spaceBelow >= sy;
  const desiredTop = showBelow ? sy + sh + 16 : sy - 16 - estimatedHeight;
  return Math.min(Math.max(desiredTop, safeTop), screenHeight - estimatedHeight);
}
```

Modifier `components/SpotlightOverlay.js` :

Ajouter l'import (après la ligne 2) :

```js
import { computeSpotlightTooltipTop } from '../utils/spotlightPlacement';
```

Remplacer (lignes actuelles) :

```js
  const showBelow = sy + sh < H * 0.58;
  const tooltipTop = showBelow ? Math.min(sy + sh + 16, H - 220) : undefined;
  const tooltipBottom = !showBelow ? Math.max(H - sy + 16, 16) : undefined;
```

par :

```js
  const tooltipTop = computeSpotlightTooltipTop({ sy, sh, screenHeight: H });
```

Et dans le style du tooltip, retirer la ligne `bottom: tooltipBottom,` (le positionnement se fait désormais uniquement via `top`) :

```js
        <Animated.View
          style={[
            s.tooltip,
            {
              opacity: tooltipOpacity,
              transform: [{ translateY: tooltipTranslateY }],
              top: tooltipTop,
              left: 20,
              right: 20,
            },
          ]}
        >
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest utils/__tests__/spotlightPlacement.test.js`
Expected: PASS

- [ ] **Step 5: Manual verification**

Réinitialiser l'onboarding profil (`resetProfileOnboarding()` — cf. `DebugScreen.js` s'il expose une action, sinon `AsyncStorage.removeItem('loocateme_profile_onboarding_done')` via le debugger). Rouvrir l'onglet Profil : parcourir les 4 étapes (photo, bio, réseaux sociaux, statut) sur un petit écran (ex: iPhone SE / 375×667) et vérifier qu'aucun tooltip n'est coupé en haut ni en bas, en particulier l'étape 1 (photo).

- [ ] **Step 6: Commit**

```bash
git add utils/spotlightPlacement.js utils/__tests__/spotlightPlacement.test.js components/SpotlightOverlay.js
git commit -m "fix: keep profile onboarding spotlight tooltip on-screen for tall elements near the top"
git push
```

---

## Task 3: Notification push quand la série (streak) est perdue

**Contexte :** Le cron `decayInactiveUsers()` ([loocateme_backend/src/services/streak.service.js:131-149](../loocateme_backend/src/services/streak.service.js)), planifié tous les jours à 00:10 UTC ([loocateme_backend/src/services/cron.service.js:190-197](../loocateme_backend/src/services/cron.service.js)), remet `streak.count` à 0 pour tout utilisateur inactif depuis au moins 2 jours civils, mais n'envoie aucune notification. Un push d'alerte AVANT expiration existe déjà (`sendStreakExpiryWarnings`, kind `streak_expiring`), mais rien n'est envoyé une fois la série effectivement perdue — c'est ce que demande l'utilisateur.

**Fix :** `decayInactiveUsers()` envoie un push (kind `streak_lost`) à chaque utilisateur dont la série vient d'être remise à 0, avec le nombre de jours perdus, puis navigue vers `MainTabs` au tap (comme `streak_expiring`). Ajout du kind aux préférences de notifications (Settings) et aux 30 locales, en suivant exactement le pattern déjà en place pour `streak_expiring`.

**Files:**
- Modify: [loocateme_backend/src/services/streak.service.js](../loocateme_backend/src/services/streak.service.js)
- Test: `loocateme_backend/tests/streak.service.test.js`
- Modify: [App.js](App.js)
- Modify: [views/SettingsScreen.js](views/SettingsScreen.js)
- Modify: `i18n/locales/<30 codes>/common.json`

**Interfaces:**
- Modifie la signature de `decayInactiveUsers(now = new Date()): Promise<number>` (ajout d'un paramètre optionnel `now`, rétrocompatible avec l'appel existant sans argument dans `cron.service.js:192`) — même pattern que `sendStreakExpiryWarnings(now)` juste en dessous dans le même fichier.
- Consumes : `sendPushUnified({ userIds, title, body, data })` déjà importé dans `streak.service.js`.

- [ ] **Step 1: Write the failing test**

Ajouter à la fin de `loocateme_backend/tests/streak.service.test.js` (après l'import existant, ajouter `decayInactiveUsers` à la liste importée en ligne 5) :

```js
import { recordDailyActivity, claimSupervise, claimBoost, sendStreakExpiryWarnings, decayInactiveUsers } from '../src/services/streak.service.js';
```

Puis, à la fin du fichier :

```js
test('decayInactiveUsers: resets only the stale users and returns the modified count', async () => {
  const now = new Date('2026-01-10T00:10:00.000Z');
  const restoreFind = stubUserFind([
    // Inactif depuis 3 jours civils : doit être réinitialisé.
    { _id: 'user1', lastLoginAt: new Date('2026-01-07T00:01:00.000Z'), streak: { count: 5 } },
    // Actif hier seulement (1 jour civil d'écart) : ne doit PAS être réinitialisé.
    { _id: 'user2', lastLoginAt: new Date('2026-01-09T20:00:00.000Z'), streak: { count: 2 } },
  ]);
  const originalUpdateMany = User.updateMany;
  const updateManyCalls = [];
  User.updateMany = async (filter, update) => {
    updateManyCalls.push({ filter, update });
    return { modifiedCount: 1 };
  };
  const restorePush = stubNoPushTokens();

  try {
    const count = await decayInactiveUsers(now);
    assert.equal(count, 1);
    assert.equal(updateManyCalls.length, 1);
    assert.deepEqual(updateManyCalls[0].filter._id.$in, ['user1']);
    assert.equal(updateManyCalls[0].update.$set['streak.count'], 0);
  } finally {
    restoreFind();
    User.updateMany = originalUpdateMany;
    restorePush();
  }
});

test('decayInactiveUsers: no stale user means no DB write and a return value of 0', async () => {
  const now = new Date('2026-01-10T00:10:00.000Z');
  const restoreFind = stubUserFind([
    { _id: 'user1', lastLoginAt: new Date('2026-01-09T20:00:00.000Z'), streak: { count: 2 } },
  ]);
  const originalUpdateMany = User.updateMany;
  const updateManyCalls = [];
  User.updateMany = async (filter, update) => {
    updateManyCalls.push({ filter, update });
    return { modifiedCount: 0 };
  };

  try {
    const count = await decayInactiveUsers(now);
    assert.equal(count, 0);
    assert.equal(updateManyCalls.length, 0);
  } finally {
    restoreFind();
    User.updateMany = originalUpdateMany;
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd loocateme_backend && node --test tests/streak.service.test.js`
Expected: FAIL — le premier nouveau test échoue sur `assert.equal(count, 1)` (`decayInactiveUsers` ne prend pas encore de paramètre `now`, donc `calendarDayGap` est calculé contre la vraie date courante et ne matche pas les dates fixes du test).

- [ ] **Step 3: Write minimal implementation**

Modifier `loocateme_backend/src/services/streak.service.js` — remplacer la fonction `decayInactiveUsers` (lignes 126-149) par :

```js
/**
 * Décroissance quotidienne : remet à 0 le streak de tout utilisateur n'ayant
 * pas ouvert l'app depuis au moins un jour civil complet (cron nocturne), et
 * efface les récompenses en attente non réclamées. Envoie un push
 * "streak_lost" à chaque utilisateur réinitialisé, avec le nombre de jours
 * perdus.
 */
export async function decayInactiveUsers(now = new Date()) {
  const users = await User.find({ 'streak.count': { $gt: 0 } }).select('_id lastLoginAt streak').lean();
  const staleUsers = users.filter((u) => calendarDayGap(new Date(u.lastLoginAt || 0), now) >= 2);
  if (!staleUsers.length) return 0;

  const staleIds = staleUsers.map((u) => u._id);
  const res = await User.updateMany(
    { _id: { $in: staleIds } },
    {
      $set: {
        'streak.count': 0,
        'streak.supervisePendingClaim': false,
        'streak.boostPendingClaim': false,
      },
    }
  );

  for (const user of staleUsers) {
    try {
      const count = user.streak?.count || 0;
      const title = 'Ta série est retombée à 0';
      const body = `Tu as perdu ta série de ${count} jour${count > 1 ? 's' : ''}. Reviens sur l'app pour en démarrer une nouvelle.`;
      await sendPushUnified({
        userIds: [user._id],
        title,
        body,
        data: { kind: 'streak_lost' },
      });
    } catch (err) {
      console.error(`[streak] Failed to send streak_lost push to user ${user._id}:`, err);
    }
  }

  return res.modifiedCount || 0;
}
```

Modifier `App.js` — ajouter juste après le bloc `streak_expiring` (ligne 566-567) :

```js
          } else if (data.kind === 'streak_expiring') {
            navigationRef.navigate('MainTabs');
          } else if (data.kind === 'streak_lost') {
            navigationRef.navigate('MainTabs');
          } else if (data.kind === 'referral_validated' || data.kind === 'referral_reward_granted') {
```

Modifier `views/SettingsScreen.js` — ajouter le kind à `NOTIFICATION_KINDS` (après `streakExpiring`, ligne 87) :

```js
    { kind: 'streak_expiring', label: t('settingsScreen.notifKinds.streakExpiring') },
    { kind: 'streak_lost', label: t('settingsScreen.notifKinds.streakLost') },
```

Et à la catégorie `rewards` (ligne 103) :

```js
      kinds: ['event_boost', 'streak_expiring', 'streak_lost', 'referral_validated', 'referral_reward_granted'],
```

Créer un script temporaire `scripts/_i18n_patch_streak_lost.js` pour patcher les 30 locales (clé `settingsScreen.notifKinds.streakLost`, insérée juste après `streakExpiring`) :

```js
const fs = require('fs');
const path = require('path');

const TRANSLATIONS = {
  fr: 'Perte de série', en: 'Streak lost', es: 'Racha perdida', de: 'Serie verloren',
  it: 'Serie persa', pt: 'Sequência perdida', nl: 'Reeks verloren', pl: 'Utrata serii',
  ro: 'Serie pierdută', bg: 'Изгубена серия', bs: 'Izgubljen niz', cs: 'Ztráta série',
  da: 'Mistet stribe', el: 'Χαμένο σερί', et: 'Seeria kadumine', fi: 'Putken menetys',
  hr: 'Izgubljen niz', hu: 'Elveszett sorozat', is: 'Töpuð runa', lt: 'Prarasta serija',
  lv: 'Zaudēta sērija', mk: 'Изгубена серија', mt: 'Serje mitlufa', sk: 'Strata série',
  sl: 'Izgubljen niz', sq: 'Seri e humbur', sr: 'Izgubljen niz', sv: 'Förlorad streak',
  uk: 'Втрачена серія',
};

const localesDir = path.join(__dirname, '..', 'i18n', 'locales');
let patched = 0;
for (const [locale, translation] of Object.entries(TRANSLATIONS)) {
  const file = path.join(localesDir, locale, 'common.json');
  const original = fs.readFileSync(file, 'utf8');
  const regex = /("streakExpiring":\s*"(?:[^"\\]|\\.)*",\n)/;
  if (!regex.test(original)) {
    throw new Error(`Anchor "streakExpiring" not found in ${file}`);
  }
  const patchedContent = original.replace(regex, `$1      "streakLost": "${translation}",\n`);
  fs.writeFileSync(file, patchedContent);
  patched += 1;
}
console.log(`Patched ${patched} locale files with streakLost.`);
```

Run: `node scripts/_i18n_patch_streak_lost.js`, vérifier `git diff i18n/locales | head -100` (30 fichiers, une ligne ajoutée chacun, JSON toujours valide), puis supprimer le script :

```bash
rm scripts/_i18n_patch_streak_lost.js
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd loocateme_backend && node --test tests/streak.service.test.js`
Expected: PASS (tous les tests du fichier, y compris les 2 nouveaux)

Run aussi (validité JSON des 30 locales) :

```bash
for f in i18n/locales/*/common.json; do node -e "require('./$f')" || echo "INVALID: $f"; done
```

Expected: aucune ligne "INVALID".

- [ ] **Step 5: Manual verification**

Vérifier dans Settings → Notifications que "Perte de série" apparaît dans la catégorie récompenses et peut être désactivé. Optionnel (nécessite d'attendre le cron ou de l'appeler manuellement en local) : vérifier qu'un utilisateur de test dont `lastLoginAt` est artificiellement vieux de 2+ jours reçoit bien un push au prochain passage du cron, et que taper dessus ouvre `MainTabs`.

- [ ] **Step 6: Commit**

```bash
git add App.js views/SettingsScreen.js i18n/locales
git commit -m "feat: add streak_lost notification kind to settings and push tap routing"
git push

cd ../loocateme_backend
git add src/services/streak.service.js tests/streak.service.test.js
git commit -m "feat: send a push notification when a user's streak decays to 0"
git push
```

Puis, selon la méthode de déploiement du backend (cf. skill `loocateme` — inspecter `docker-compose.yml`/process manager avant d'agir) : rebuild/redémarrer le service backend pour que le cron modifié soit actif.

---

## Task 4: Afficher la ville dans les lieux (LocationListScreen et LocationScreen)

**Contexte :** Le modèle `Location` backend a déjà un champ `city` ([loocateme_backend/src/models/Location.js:7](../loocateme_backend/src/models/Location.js)), rempli à la synchronisation OSM, et il est déjà renvoyé tel quel par `sanitizePublicLocation()` (aucun champ n'est retiré à part `subscription`/`documents`) — donc déjà présent sur `item.city` / `location.city` côté app, sans aucun changement backend nécessaire. C'est une tâche purement d'affichage front.

**Design (via skill `ui-ux-pro-max`) :**
- **LocationCard.js** (carte liste) : la ville est ajoutée à la Text qui affiche déjà la distance ("450 m"), sous la forme `"450 m · Compiègne"` — un seul élément de texte, pas de nouvelle ligne, pas de duplication d'info. Quand l'utilisateur est actuellement sur ce lieu (pas de distance affichée), la ville seule apparaît si connue. Tronqué sur une ligne (`numberOfLines={1}`, `maxWidth: '45%'`) pour ne jamais pousser le nom du lieu hors de son espace.
- **LocationScreen.js** (fiche détail) : la ville apparaît sous le nom du lieu (h1), avant la ligne meta "X sur place / X ce mois" existante — icône `location-outline` (13px, `palette.textMuted`) + texte `typography.caption` (12px, couleur déjà mutée par le design system), sur une ligne dédiée tronquée à 1 ligne. Ne duplique pas la distance (qui n'est de toute façon pas affichée sur cet écran).

**Files:**
- Modify: [views/LocationList/LocationCard.js](views/LocationList/LocationCard.js)
- Modify: [views/LocationScreen.js](views/LocationScreen.js)

**Interfaces:**
- Consumes : `item.city` (LocationCard) et `location.city` (LocationScreen), déjà présents sur les objets renvoyés par `getLocations`/`getLocationById` — `string | undefined`.

- [ ] **Step 1: Implement — LocationCard.js**

Remplacer (lignes 91-106 actuelles) :

```jsx
        <View style={styles.locationHeaderRow}>
          <Text
            style={[styles.locationName, { color: isDark ? '#FFFFFF' : colors.textPrimary }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.name}
          </Text>
          {isUserHere ? null : (
            item.distance !== undefined && (
              <Text style={[styles.distanceText, { color: colors.textSecondary }]}>
                {formatDistance(item.distance)}
              </Text>
            )
          )}
        </View>
```

par :

```jsx
        <View style={styles.locationHeaderRow}>
          <Text
            style={[styles.locationName, { color: isDark ? '#FFFFFF' : colors.textPrimary }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.name}
          </Text>
          {(() => {
            const metaParts = [];
            if (!isUserHere && item.distance !== undefined) metaParts.push(formatDistance(item.distance));
            if (item.city) metaParts.push(item.city);
            if (!metaParts.length) return null;
            return (
              <Text
                style={[styles.distanceText, { color: colors.textSecondary }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {metaParts.join(' · ')}
              </Text>
            );
          })()}
        </View>
```

Et dans `styles`, modifier `distanceText` (ligne 274) :

```js
  distanceText: { fontSize: 13, fontWeight: '600', maxWidth: '45%' },
```

- [ ] **Step 2: Implement — LocationScreen.js**

Insérer, juste après le bloc du nom du lieu et avant `metaRow` (entre les lignes 600 et 602 actuelles) :

```jsx
        <Text style={[typography.h1, { flex: 1 }]} numberOfLines={2}>
          {location.name}
        </Text>
      </View>

      {location.city && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs }}>
          <Ionicons name="location-outline" size={13} color={palette.textMuted} />
          <Text style={[typography.caption, { marginLeft: 4 }]} numberOfLines={1}>
            {location.city}
          </Text>
        </View>
      )}

      <View style={[styles.metaRow, { marginTop: spacing.sm }]}>
```

- [ ] **Step 3: Manual verification**

Ouvrir `LocationListScreen` : vérifier que les cartes de lieux dont le champ `city` est renseigné en base affichent bien `"distance · ville"` (ou juste la ville pour le lieu où l'utilisateur est actuellement checké), sur une seule ligne, sans déborder ni pousser le nom du lieu. Ouvrir la fiche détail (`LocationScreen`) d'un de ces lieux : vérifier que la ville apparaît sous le nom, avant "X sur place". Vérifier qu'un lieu sans `city` (POI OSM non synchronisé) n'affiche rien à la place — pas de "·" ou de texte vide résiduel.

- [ ] **Step 4: Commit**

```bash
git add views/LocationList/LocationCard.js views/LocationScreen.js
git commit -m "feat: display the location's city on LocationListScreen cards and LocationScreen"
git push
```

---

## Task 5: Le paywall de boosts/superlikes doit afficher le bon nombre sans actualisation manuelle

**Contexte / cause racine identifiée :** `ConsumablesShopSheet.js` (le sheet d'achat de boosts/superlikes) a déjà un bouton de rafraîchissement manuel (🔄, `handleRefresh`, [components/ConsumablesShopSheet.js:151-156](components/ConsumablesShopSheet.js)) qui appelle correctement `PremiumService.refreshFromBackend()` puis relit les compteurs. Mais à l'**ouverture** du sheet ([components/ConsumablesShopSheet.js:113-121](components/ConsumablesShopSheet.js)), seul `refresh()` local est appelé — qui relit `PremiumService.getBoostsRemaining()`/`getSuperlikesRemaining()`, c'est-à-dire le cache en mémoire (`AsyncStorage`), potentiellement périmé (ex: achat effectué sur un autre device, ou récompense de série serveur non encore répercutée localement). D'où le besoin actuel de taper manuellement sur 🔄 pour voir le bon nombre.

**Fix :** à l'ouverture (`visible` devient `true`), appeler `PremiumService.refreshFromBackend()` en plus du `refresh()` local — affichage immédiat de la valeur en cache (pas d'écran vide le temps du réseau), puis mise à jour dès que la réponse backend arrive.

**Files:**
- Modify: [components/ConsumablesShopSheet.js](components/ConsumablesShopSheet.js)

**Interfaces:**
- Consumes : `PremiumService.refreshFromBackend(): Promise<void>` (déjà utilisé par `handleRefresh` dans ce même fichier, ligne 153) et `PremiumService.getBoostsRemaining()`/`getSuperlikesRemaining()` (déjà utilisés).

- [ ] **Step 1: Implement**

Remplacer (lignes 113-121 actuelles) :

```jsx
  useEffect(() => {
    if (!visible) return;
    refresh();
    IAPStore.getOfferings()
      .then(setOfferings)
      .catch(() => {});
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
    return () => {};
  }, [visible]);
```

par :

```jsx
  useEffect(() => {
    if (!visible) return;
    // Affichage immédiat depuis le cache local (pas d'écran vide le temps du
    // réseau), puis resynchronisation depuis le backend : sans ça, le sheet
    // pouvait afficher un solde périmé jusqu'à ce que l'utilisateur tape
    // manuellement sur le bouton 🔄 (cf. handleRefresh ci-dessous).
    refresh();
    PremiumService.refreshFromBackend()
      .then(refresh)
      .catch(() => {});
    IAPStore.getOfferings()
      .then(setOfferings)
      .catch(() => {});
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
    return () => {};
  }, [visible]);
```

- [ ] **Step 2: Manual verification**

Sur deux devices (ou un device + un appel API direct/DebugScreen) connectés au même compte : modifier le solde de boosts/superlikes côté backend (ex: via un achat sur l'autre device, ou `DebugScreen` si une action de test existe). Ouvrir le sheet consommables sur le premier device sans taper sur 🔄 : vérifier que le nombre affiché est déjà à jour dès l'ouverture (pas besoin de rafraîchir manuellement). Vérifier aussi que le sheet ne reste pas visuellement "vide" pendant le court instant du fetch (affichage immédiat du cache, mise à jour discrète ensuite).

- [ ] **Step 3: Commit**

```bash
git add components/ConsumablesShopSheet.js
git commit -m "fix: refresh boost/superlike balances from backend when opening the consumables shop"
git push
```

---

## Task 6: Griser "Booster mon profil" hors présence, avec texte explicatif (toutes langues)

**Contexte / cause racine identifiée :** Le bouton "Booster mon profil" est le CTA fixe en bas de `LocationScreen.js` (`renderFixedAction`, [views/LocationScreen.js:967-1026](views/LocationScreen.js)). Son `onPress` (`handleBoost`, ligne 350) vérifie déjà `isBoosted`/`boostLoading` mais **jamais** si l'utilisateur est physiquement dans le lieu (`isUserHere`, déjà calculé ligne 669) : le bouton reste toujours actif visuellement et cliquable même hors présence, ce qui n'est explicité nulle part avant que l'action échoue côté serveur.

**Fix :** le bouton est grisé (`disabled` + opacité réduite) quand `!isUserHere`, et un texte explicatif apparaît juste en dessous dans ce cas — traduit dans les 30 langues de l'app.

**Files:**
- Modify: [views/LocationScreen.js](views/LocationScreen.js)
- Modify: `i18n/locales/<30 codes>/common.json`

**Interfaces:**
- Consumes : `isUserHere` (déjà calculé, ligne 669), `isBoosted`/`boostLoading` (déjà déstructurés de `useBoost()`, ligne 140).

- [ ] **Step 1: Implement**

Remplacer le bloc du bouton boost (lignes 977-999 actuelles) :

```jsx
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleBoost}
            style={[
              styles.primaryButton,
              {
                borderRadius: radius.pill,
                paddingVertical: spacing.md,
                shadowColor: palette.accent,
              },
            ]}
          >
            <LinearGradient
              colors={palette.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]}
            />
            <Ionicons name="flash" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>
              {isBoosted ? t('locationScreen.boosted') : boostUnlocked ? t('locationScreen.boostProfileHere') : t('locationScreen.boostLockedAfterCheckins')}
            </Text>
          </TouchableOpacity>
```

par :

```jsx
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleBoost}
            disabled={!isUserHere && !isBoosted}
            style={[
              styles.primaryButton,
              {
                borderRadius: radius.pill,
                paddingVertical: spacing.md,
                shadowColor: palette.accent,
                opacity: !isUserHere && !isBoosted ? 0.45 : 1,
              },
            ]}
          >
            <LinearGradient
              colors={palette.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]}
            />
            <Ionicons name="flash" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>
              {isBoosted ? t('locationScreen.boosted') : boostUnlocked ? t('locationScreen.boostProfileHere') : t('locationScreen.boostLockedAfterCheckins')}
            </Text>
          </TouchableOpacity>
          {!isUserHere && !isBoosted && (
            <Text
              style={[
                typography.caption,
                { textAlign: 'center', marginTop: spacing.xs },
              ]}
            >
              {t('locationScreen.boostRequiresPresence')}
            </Text>
          )}
```

Créer un script temporaire `scripts/_i18n_patch_boost_presence.js` pour patcher les 30 locales (clé `locationScreen.boostRequiresPresence`, insérée après `boostLockedAfterCheckins`, dernière clé de l'objet `locationScreen`) :

```js
const fs = require('fs');
const path = require('path');

const TRANSLATIONS = {
  fr: "Tu dois être sur place pour booster ton profil.",
  en: "You need to be at this place to boost your profile.",
  es: "Tienes que estar en este lugar para impulsar tu perfil.",
  de: "Du musst vor Ort sein, um dein Profil zu boosten.",
  it: "Devi essere sul posto per potenziare il tuo profilo.",
  pt: "Tem de estar neste local para impulsionar o seu perfil.",
  nl: "Je moet op deze plek zijn om je profiel te boosten.",
  pl: "Musisz być w tym miejscu, aby wzmocnić swój profil.",
  ro: "Trebuie să fii în acest loc pentru a-ți impulsiona profilul.",
  bg: "Трябва да си на това място, за да усилиш профила си.",
  bs: "Morate biti na ovom mjestu da biste pojačali svoj profil.",
  cs: "Musíš být na tomto místě, chceš-li posílit svůj profil.",
  da: "Du skal være på dette sted for at booste din profil.",
  el: "Πρέπει να βρίσκεσαι σε αυτό το μέρος για να ενισχύσεις το προφίλ σου.",
  et: "Profiili kiirendamiseks pead olema selles kohas.",
  fi: "Sinun täytyy olla tässä paikassa tehostaaksesi profiiliasi.",
  hr: "Morate biti na ovom mjestu da biste pojačali svoj profil.",
  hu: "A profilod megerősítéséhez itt kell lenned.",
  is: "Þú þarft að vera á þessum stað til að örva prófílinn þinn.",
  lt: "Turi būti šioje vietoje, kad galėtum pagreitinti savo profilį.",
  lv: "Tev jābūt šajā vietā, lai paātrinātu savu profilu.",
  mk: "Мора да си на ова место за да го засилиш профилот.",
  mt: "Trid tkun f'dan il-post biex issaħħaħ il-profil tiegħek.",
  sk: "Musíš byť na tomto mieste, ak chceš posilniť svoj profil.",
  sl: "Morate biti na tem kraju, da okrepite svoj profil.",
  sq: "Duhet të jesh në këtë vend për të përforcuar profilin tënd.",
  sr: "Morate biti na ovom mestu da biste pojačali svoj profil.",
  sv: "Du måste vara på denna plats för att boosta din profil.",
  uk: "Ти маєш бути в цьому місці, щоб підсилити свій профіль.",
};

const localesDir = path.join(__dirname, '..', 'i18n', 'locales');
let patched = 0;
for (const [locale, translation] of Object.entries(TRANSLATIONS)) {
  const file = path.join(localesDir, locale, 'common.json');
  const original = fs.readFileSync(file, 'utf8');
  const regex = /("boostLockedAfterCheckins":\s*"(?:[^"\\]|\\.)*")\n(\s*)\}/;
  if (!regex.test(original)) {
    throw new Error(`Anchor "boostLockedAfterCheckins" not found in ${file}`);
  }
  const escaped = translation.replace(/"/g, '\\"');
  const patchedContent = original.replace(regex, `$1,\n    "boostRequiresPresence": "${escaped}"\n$2}`);
  fs.writeFileSync(file, patchedContent);
  patched += 1;
}
console.log(`Patched ${patched} locale files with boostRequiresPresence.`);
```

Run: `node scripts/_i18n_patch_boost_presence.js`, vérifier `git diff i18n/locales | head -100`, puis supprimer le script :

```bash
rm scripts/_i18n_patch_boost_presence.js
```

- [ ] **Step 2: Run test to verify JSON validity**

Run:

```bash
for f in i18n/locales/*/common.json; do node -e "require('./$f')" || echo "INVALID: $f"; done
```

Expected: aucune ligne "INVALID".

- [ ] **Step 3: Manual verification**

Sur `LocationScreen`, ouvrir la fiche d'un lieu où l'utilisateur n'est PAS actuellement checké : vérifier que le bouton "Booster mon profil" est grisé (opacité réduite), non cliquable, et qu'un texte explicatif apparaît en dessous. Se rendre physiquement (ou via override dev de position) dans le lieu et check-in : vérifier que le bouton redevient actif et que le texte disparaît. Basculer la langue de l'app (Settings) sur au moins 2-3 langues différentes et vérifier que le texte explicatif est bien traduit (pas de clé brute `locationScreen.boostRequiresPresence` affichée).

- [ ] **Step 4: Commit**

```bash
git add views/LocationScreen.js i18n/locales
git commit -m "feat: grey out the boost button and explain why when the user isn't at the location"
git push
```

---

## Task 7: Recherche — prioriser les lieux proches, limiter à 5 résultats

**Contexte / cause racine identifiée :**
- `SearchView.js` envoie déjà `lat`/`lon` à `/users/search` ([views/SearchView.js:93-100](views/SearchView.js)), et le backend trie déjà les lieux par proximité via `$geoNear` quand `lat`/`lon` sont fournis ([loocateme_backend/src/controllers/user.controller.js:195-208](../loocateme_backend/src/controllers/user.controller.js)) — la pondération par distance existe donc déjà **à l'intérieur** du sous-ensemble "lieux". Le problème est que le résultat final combine `[...users, ...locations]` ([views/SearchView.js:133](views/SearchView.js)) : les utilisateurs passent systématiquement avant les lieux, donc un lieu très proche peut être évincé du top affiché par des correspondances "utilisateur" moins pertinentes. Inverser l'ordre de fusion (`[...locations, ...users]`) fait remonter les lieux déjà triés par proximité en tête du résultat combiné.
- La limite est actuellement 10 des deux côtés (frontend `limit: 10` + `.slice(0, 10)`, backend `safeLimit` plafonné à 10 dans `validators.js` et `user.controller.js`). La ramener à 5 partout réduit la charge DB/API comme demandé.

**Fix :** limite ramenée à 5 côté app (`ApiRequest.js`, `SearchView.js`) et côté backend (`validators.js`, `user.controller.js` — défense en profondeur, ne pas se fier uniquement au client). Fusion des résultats extraite en fonction pure testable qui priorise les lieux.

**Files:**
- Modify: [components/ApiRequest.js](components/ApiRequest.js)
- Modify: [views/SearchView.js](views/SearchView.js)
- Create: `utils/searchResults.js`
- Test: `utils/__tests__/searchResults.test.js`
- Modify: [loocateme_backend/src/middlewares/validators.js](../loocateme_backend/src/middlewares/validators.js)
- Modify: [loocateme_backend/src/controllers/user.controller.js](../loocateme_backend/src/controllers/user.controller.js)

**Interfaces:**
- Produces: `mergeSearchResults(users: object[], locations: object[], limit: number): object[]`, exportée par `utils/searchResults.js`.
- Consumes (dans `SearchView.js`) : les tableaux `users`/`locations` déjà construits localement (lignes 102-131, inchangés).

- [ ] **Step 1: Write the failing test**

Créer `utils/__tests__/searchResults.test.js` :

```js
import { mergeSearchResults } from '../searchResults';

describe('mergeSearchResults', () => {
  it('prioritizes locations (already distance-sorted by the backend) ahead of users', () => {
    const users = [{ _type: 'user', _id: 'u1' }, { _type: 'user', _id: 'u2' }];
    const locations = [{ _type: 'location', _id: 'l1' }, { _type: 'location', _id: 'l2' }];

    const merged = mergeSearchResults(users, locations, 10);

    expect(merged.map((r) => r._id)).toEqual(['l1', 'l2', 'u1', 'u2']);
  });

  it('caps the combined result at the given limit', () => {
    const users = [{ _id: 'u1' }, { _id: 'u2' }, { _id: 'u3' }];
    const locations = [{ _id: 'l1' }, { _id: 'l2' }, { _id: 'l3' }];

    const merged = mergeSearchResults(users, locations, 5);

    expect(merged).toHaveLength(5);
    expect(merged.map((r) => r._id)).toEqual(['l1', 'l2', 'l3', 'u1', 'u2']);
  });

  it('handles an empty locations list', () => {
    const users = [{ _id: 'u1' }];
    expect(mergeSearchResults(users, [], 5).map((r) => r._id)).toEqual(['u1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest utils/__tests__/searchResults.test.js`
Expected: FAIL avec `Cannot find module '../searchResults'`

- [ ] **Step 3: Write minimal implementation**

Créer `utils/searchResults.js` :

```js
// Fusionne les résultats "utilisateurs" et "lieux" de la recherche unifiée
// (/users/search). Les lieux passent en premier : ils sont déjà triés par
// proximité par le backend (via $geoNear quand lat/lon sont fournis, cf.
// user.controller.js#search) et un lieu proche ne doit pas être évincé du
// top affiché par des correspondances utilisateur moins pertinentes.
export function mergeSearchResults(users, locations, limit) {
  return [...locations, ...users].slice(0, limit);
}
```

Modifier `components/ApiRequest.js` (ligne 704) :

```js
export async function searchUsers({ q, limit = 5, lat, lon, includeUsers = true, includeLocations = true }) {
```

Modifier `views/SearchView.js` — import (ajouter en haut, avec les autres imports de `utils/`) :

```js
import { mergeSearchResults } from '../utils/searchResults';
```

Puis remplacer (lignes 93-133 actuelles) :

```jsx
        const res = await searchUsers({
          q,
          limit: 10,
          lat: userLocation?.latitude,
          lon: userLocation?.longitude,
          includeUsers,
          includeLocations,
        });
```

par :

```jsx
        const res = await searchUsers({
          q,
          limit: 5,
          lat: userLocation?.latitude,
          lon: userLocation?.longitude,
          includeUsers,
          includeLocations,
        });
```

et (fin du même bloc) :

```jsx
        setResults([...users, ...locations].slice(0, 10));
```

par :

```jsx
        setResults(mergeSearchResults(users, locations, 5));
```

Modifier `loocateme_backend/src/middlewares/validators.js` (ligne 121) :

```js
    query('limit').optional().isInt({ min: 1, max: 5 }),
```

Modifier `loocateme_backend/src/controllers/user.controller.js` (ligne 177) :

```js
      const safeLimit = Math.max(1, Math.min(5, parseInt(limit, 10) || 5));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest utils/__tests__/searchResults.test.js`
Expected: PASS

- [ ] **Step 5: Manual verification**

Sur l'onglet Recherche, taper une requête qui matche à la fois des lieux proches ET des utilisateurs (ex: un prénom courant qui est aussi le début du nom d'un bar proche) : vérifier que les lieux apparaissent en tête de liste quand ils correspondent, et que jamais plus de 5 résultats au total ne s'affichent. Vérifier côté backend (logs ou `curl` direct sur `/users/search?q=...&limit=20`) que la réponse est bien plafonnée à 5 résultats par catégorie même en forçant un `limit` plus élevé dans la requête.

- [ ] **Step 6: Commit**

```bash
git add components/ApiRequest.js views/SearchView.js utils/searchResults.js utils/__tests__/searchResults.test.js
git commit -m "feat: prioritize nearby locations in search results and cap results at 5"
git push

cd ../loocateme_backend
git add src/middlewares/validators.js src/controllers/user.controller.js
git commit -m "fix: cap /users/search limit at 5 server-side (defense in depth)"
git push
```

Puis, selon la méthode de déploiement du backend (cf. skill `loocateme`) : rebuild/redémarrer le service backend.

---

## Task 8: Badge de type de lieu — fond gris en mode jour (au lieu de bleu)

**Contexte / clarification :** "Mode jour"/"mode nuit" est ici le concept **Vibe** central de l'app (soleil/lune, `useVibe()`/`isMoon`, `DaySkyBackground`/`NightSkyBackground`) — pas le thème clair/sombre de l'appareil. C'est confirmé par le code de `LocationScreen.js` lui-même : son design system (`useVibeTheme()`) est explicitement construit pour éviter toute branche sur le thème de l'appareil et ne raisonne qu'en `isMoon` (cf. commentaire en tête de [hooks/useVibeTheme.js:5-11](hooks/useVibeTheme.js) : "Toutes les valeurs visuelles ... doivent passer par ce hook, afin d'éviter les `if (isMoon) ... else ...` éparpillés"). Le badge de type y est déjà entièrement piloté par la vibe (`palette.accentSoft`/`palette.accent`, bleu en mode soleil, rose en mode lune) — donc "mode jour" ne peut désigner que la vibe soleil dans ce fichier. La demande utilisateur porte explicitement sur le mode jour uniquement ("En mode jour... mettre le type de lieu sous fond gris au lieu de bleu") ; `LocationCard.js` (qui pilotait ce même badge via le thème de l'appareil, `isDark`, jamais utilisé pour la vibe jusqu'ici) bascule sur le même critère `isMoon` pour que le mode jour soit cohérent entre les deux écrans — le mode nuit, jamais demandé, n'est pas touché.

**Fix :** en mode soleil (jour), le badge de type passe de bleu/bleu à un gris neutre foncé (`#5A5A63`, contraste ≥ 4.5:1 avec du texte blanc) avec texte blanc, dans les deux écrans. En mode lune (nuit), hors scope de la demande : chaque écran garde son apparence actuelle inchangée par cette tâche — rose sur `LocationScreen` (`palette.accentSoft`/`palette.accent`, non modifié), bleu sur `LocationCard` (base `styles.typeBadge`/`typeText`, non modifié). Les deux écrans restent donc volontairement différents la nuit ; seule la cohérence en mode jour était demandée.

**Files:**
- Modify: [views/LocationList/LocationCard.js](views/LocationList/LocationCard.js)
- Modify: [views/LocationScreen.js](views/LocationScreen.js)

**Interfaces:**
- Consumes : `isMoon` — déjà reçu en prop par `LocationCard` ([views/LocationListScreen.js:1031](views/LocationListScreen.js), passé via `cardProps`/`renderLocation`) ; déjà disponible dans `LocationScreen.js` via `useVibeTheme()` (`const theme = useVibeTheme();` ligne 135, `theme.isMoon`).

- [ ] **Step 1: Implement — LocationCard.js**

Remplacer (ligne 108-110 actuelles) :

```jsx
          <View style={[styles.typeBadge, isDark && styles.typeBadgeDark]}>
            <Text style={[styles.typeText, isDark && styles.typeTextDark]}>{formatLocationType(item.type)}</Text>
          </View>
```

par :

```jsx
          <View style={[styles.typeBadge, !isMoon && styles.typeBadgeDay]}>
            <Text style={[styles.typeText, !isMoon && styles.typeTextDay]}>{formatLocationType(item.type)}</Text>
          </View>
```

Et dans `styles`, remplacer `typeBadgeDark`/`typeTextDark` (lignes 283-287 actuelles) :

```js
  typeBadgeDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  typeText: { color: '#00c2cb', fontWeight: '700', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  typeTextDark: { color: '#fff' },
```

par :

```js
  // Mode jour (vibe soleil) : fond gris neutre + texte blanc, pour trancher
  // avec le reste de l'interface au lieu du bleu par défaut (cf. plan
  // "badge type de lieu en mode jour"). Le style de base ci-dessus
  // (typeBadge/typeText, bleu) reste utilisé tel quel en mode nuit.
  typeBadgeDay: {
    backgroundColor: '#5A5A63',
  },
  typeText: { color: '#00c2cb', fontWeight: '700', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  typeTextDay: { color: '#FFFFFF' },
```

- [ ] **Step 2: Implement — LocationScreen.js**

Remplacer (lignes 544-545 actuelles) :

```jsx
          <View style={[styles.typePill, { backgroundColor: palette.accentSoft }]}>
            <Text style={[styles.typePillText, { color: palette.accent }]}>{formatLocationType(location.type)}</Text>
          </View>
```

par :

```jsx
          <View style={[styles.typePill, { backgroundColor: isMoon ? palette.accentSoft : '#5A5A63' }]}>
            <Text style={[styles.typePillText, { color: isMoon ? palette.accent : '#FFFFFF' }]}>{formatLocationType(location.type)}</Text>
          </View>
```

(`isMoon` est déjà disponible dans ce fichier via `const { isMoon } = useVibe();`, ligne 133 — utilisé plus loin dans le même composant, ex. ligne 479 — aucun import ni déstructuration supplémentaire n'est nécessaire.)

- [ ] **Step 3: Manual verification**

Sur `LocationListScreen`, basculer entre mode soleil et mode lune (VibeFAB) : vérifier que le badge de type de chaque carte est gris avec texte blanc en mode soleil, et retrouve son apparence habituelle (rose, cohérente avec `LocationScreen`) en mode lune. Vérifier la même chose sur la fiche détail d'un lieu (`LocationScreen`). Vérifier le contraste visuel (texte blanc bien lisible sur le gris) à l'œil sur un vrai device.

- [ ] **Step 4: Commit**

```bash
git add views/LocationList/LocationCard.js views/LocationScreen.js
git commit -m "fix: use a grey type badge in sun (day) vibe instead of blue, consistent across both screens"
git push
```

---

## Task 9: Bouton "Je suis ici" — bleu azur au lieu de rose

**Contexte / cause racine identifiée :** Le bouton "Je suis ici" (`renderManualCheckinSection`, [views/LocationScreen.js:634-659](views/LocationScreen.js)) utilise `backgroundColor: manualCheckinSuccess ? '#4CAF50' : palette.accent`. `palette.accent` vaut `#00C2CB` (bleu azur) en mode soleil mais `#FF3DAD` (rose) en mode lune ([hooks/useVibeTheme.js:30](hooks/useVibeTheme.js)) — d'où le rose vu par l'utilisateur en mode nuit. Ce bouton est une action de check-in fonctionnelle (pas un élément décoratif de la vibe), il doit donc garder la couleur de marque bleu azur quel que soit le mode.

**Fix :** remplacer `palette.accent` par la couleur bleu azur fixe de l'app (`#00C2CB`) pour ce bouton précis, dans les deux modes.

**Files:**
- Modify: [views/LocationScreen.js](views/LocationScreen.js)

**Interfaces:** Aucune — changement de valeur de style local, pas de nouvelle interface.

- [ ] **Step 1: Implement**

Remplacer (ligne 640 actuelle) :

```js
              backgroundColor: manualCheckinSuccess ? '#4CAF50' : palette.accent,
```

par :

```js
              // Couleur de marque fixe (bleu azur), volontairement indépendante de
              // palette.accent : ce CTA de check-in est une action fonctionnelle,
              // pas un élément décoratif de la vibe jour/nuit (qui rendrait ce
              // bouton rose en mode lune, cf. plan "bouton Je suis ici").
              backgroundColor: manualCheckinSuccess ? '#4CAF50' : '#00C2CB',
```

- [ ] **Step 2: Manual verification**

Sur `LocationScreen`, basculer en mode lune (vibe nuit) et vérifier que le bouton "Je suis ici" reste bleu azur (`#00C2CB`), pas rose. Vérifier en mode soleil qu'il n'a pas changé (déjà bleu azur avant ce fix). Vérifier que l'état "confirmé" (vert `#4CAF50`) après un check-in réussi n'est pas affecté.

- [ ] **Step 3: Commit**

```bash
git add views/LocationScreen.js
git commit -m "fix: use the fixed azure brand color for the 'I'm here' button instead of the vibe-dependent accent"
git push
```

---

## Fin de plan — récapitulatif des dépôts touchés

- `loocateme-app` : Tâches 1, 2, 3 (partie app), 4, 5, 6, 7 (partie app), 8, 9 — push sur `main` après chaque tâche, aucun rebuild nécessaire (app mobile, pas de conteneur serveur).
- `loocateme_backend` : Tâches 3 (partie backend) et 7 (partie backend) — push sur la branche principale après chaque tâche, puis rebuild/redémarrage du service selon sa méthode de déploiement réelle (à inspecter avant d'agir, cf. skill `loocateme`) une fois les deux tâches committées.
