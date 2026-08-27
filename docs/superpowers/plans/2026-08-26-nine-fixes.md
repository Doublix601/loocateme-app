# Nine App Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship nine independent, user-reported fixes/features across the LoocateMe React Native/Expo app: a first-launch location permission bug, an onboarding overflow bug, a new streak-lost push notification, city display on two screens, a stale paywall counter, a presence-gated boost button, nearby-first/limited search, a light-mode badge color tweak, and a button recolor.

**Architecture:** Each task is a self-contained change to existing screens/components/services. No new architecture is introduced except a small streak-notification trigger point (client deep-link handling only — the actual push-sending job is backend work outside this repo and is called out explicitly). Tasks are independent and can be done in any order.

**Tech Stack:** React Native, Expo (expo-location, expo-notifications), i18n (react-i18next style JSON locale files, 30 languages), existing `useVibeTheme` design-token hook.

---

## Task 1: Fix location permission race on first launch (LocationListScreen)

**Problem:** On first launch, `LocationListScreen` requests foreground location permission itself (`Location.requestForegroundPermissionsAsync()` inside `fetchNearbyLocations`, [views/LocationListScreen.js:1180](views/LocationListScreen.js:1180), and again in the `startWatching` effect at [views/LocationListScreen.js:702](views/LocationListScreen.js:702)). If the OS prompt is still in flight (or the user just granted it) when `fetchNearbyLocations` runs, the promise resolves but the function has already been called once too early relative to app state, or the fetch that follows uses stale info — locations never load until the app is killed and restarted. There is no re-trigger of the fetch once permission flips from undetermined/denied to granted.

**Files:**
- Modify: `views/LocationListScreen.js:1150-1220` (`fetchNearbyLocations`)
- Modify: `views/LocationListScreen.js:1396-1400` (`useFocusEffect` that calls `fetchNearbyLocations`)

- [ ] **Step 1: Add a permission-change watcher that re-triggers the fetch**

In `views/LocationListScreen.js`, locate the `fetchNearbyLocations` function (starts ~line 1150) and the permission check block at line 1180:

```js
} else {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    console.warn('Permission to access location was denied');
    setLocationError(true);
    if (!silent) setLoading(false);
    return;
  }
```

Add a new effect right after the existing `startWatching` effect (after line 723, i.e. right after the closing `}, []);` of that `useEffect`) that polls permission status while the screen is mounted and the last fetch attempt failed on a permission error, then retries once permission becomes granted:

```js
// Si la permission de localisation était en cours de résolution (ou refusée)
// lors du premier appel de fetchNearbyLocations, on ne relance jamais le fetch
// automatiquement -> l'écran reste bloqué en erreur tant que l'app n'est pas
// relancée. On réagit ici aux changements d'état d'app pour retenter le fetch
// dès que la permission passe à "granted".
useEffect(() => {
  const sub = AppState.addEventListener('change', async (nextState) => {
    if (nextState !== 'active') return;
    if (!locationError) return;
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === 'granted') {
      fetchNearbyLocations();
    }
  });
  return () => sub.remove();
}, [locationError]);
```

Add `AppState` to the `react-native` import at the top of the file if not already imported (check the existing import line, e.g. `import { ... } from 'react-native';`) and add `AppState` to that list.

- [ ] **Step 2: Request (not just read) permission before the first fetch attempt, proactively**

Still in `fetchNearbyLocations`, the flow already calls `requestForegroundPermissionsAsync()` (line 1180) which does show the OS prompt on first call — so the actual bug is the missing retry above. Verify by reading the surrounding `useFocusEffect` at line 1396 to confirm `fetchNearbyLocations` is called on mount/focus; no change needed there.

- [ ] **Step 3: Manual test**

Uninstall the app from a simulator/device (or reset location permission for the app in OS settings), reinstall, log in, and confirm the location prompt appears and — after tapping "Allow" — locations load on `LocationListScreen` without needing to kill and restart the app.

- [ ] **Step 4: Commit**

```bash
git add views/LocationListScreen.js
git commit -m "fix: retry location fetch once permission is granted on first launch"
```

---

## Task 2: Fix MyAccountScreen onboarding spotlight overflowing the screen

**Problem:** `SpotlightOverlay` ([components/SpotlightOverlay.js](components/SpotlightOverlay.js)) positions its tooltip using a hardcoded height guess of `220` ([components/SpotlightOverlay.js:86](components/SpotlightOverlay.js:86)) and has no `maxHeight`/scroll fallback on the tooltip content ([components/SpotlightOverlay.js:181-193](components/SpotlightOverlay.js:181)), so on short devices or longer translated strings the tooltip content overflows off-screen.

**Files:**
- Modify: `components/SpotlightOverlay.js`

- [ ] **Step 1: Clamp tooltip position and cap its height**

Replace the positioning block at lines 85-87:

```js
  const showBelow = sy + sh < H * 0.58;
  const tooltipTop = showBelow ? Math.min(sy + sh + 16, H - 220) : undefined;
  const tooltipBottom = !showBelow ? Math.max(H - sy + 16, 16) : undefined;
```

with:

```js
  const TOOLTIP_MAX_HEIGHT = Math.min(320, H * 0.42);
  const SAFE_TOP = 48; // évite la status bar / notch
  const SAFE_BOTTOM = 24;

  const showBelow = sy + sh < H * 0.58;
  const tooltipTop = showBelow
    ? Math.min(Math.max(sy + sh + 16, SAFE_TOP), H - TOOLTIP_MAX_HEIGHT - SAFE_BOTTOM)
    : undefined;
  const tooltipBottom = !showBelow
    ? Math.min(Math.max(H - sy + 16, SAFE_BOTTOM), H - TOOLTIP_MAX_HEIGHT - SAFE_TOP)
    : undefined;
```

- [ ] **Step 2: Add maxHeight and internal scroll to the tooltip**

Change the `tooltip` style at lines 181-193 to include a max height:

```js
  tooltip: {
    position: 'absolute',
    backgroundColor: '#0A0F14',
    borderRadius: 20,
    padding: 22,
    maxHeight: 320,
    borderWidth: 1,
    borderColor: 'rgba(0,194,203,0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 14,
  },
```

Wrap the title/description block (lines 145-149) in a `ScrollView` so overly long translated copy scrolls instead of overflowing. Update the import at the top of the file:

```js
import { View, Text, TouchableOpacity, StyleSheet, Modal, Dimensions, Animated, ScrollView } from 'react-native';
```

Replace lines 145-149:

```js
          <Text style={s.stepLabel}>
            {stepIndex + 1} / {totalSteps}
          </Text>
          <Text style={s.title}>{title}</Text>
          <Text style={s.desc}>{description}</Text>
```

with:

```js
          <Text style={s.stepLabel}>
            {stepIndex + 1} / {totalSteps}
          </Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
            <Text style={s.title}>{title}</Text>
            <Text style={s.desc}>{description}</Text>
          </ScrollView>
```

- [ ] **Step 3: Manual test**

Run the app (`npx expo start`), open `MyAccountScreen` on a small-screen simulator (e.g. iPhone SE) and step through the onboarding spotlight (`SPOT_STEPS` in `views/MyAccountScreen.js:129-164`) for all 4 steps, confirming the tooltip never clips off the top/bottom of the screen and long text scrolls inside the tooltip instead of overflowing.

- [ ] **Step 4: Commit**

```bash
git add components/SpotlightOverlay.js
git commit -m "fix: clamp onboarding spotlight tooltip to screen bounds"
```

---

## Task 3: Streak-lost push notification (client-side deep link only)

**Problem:** When a user loses their streak, a push notification should invite them back to the app. Streak computation and scheduled push-sending are **backend responsibilities that live outside this repo** (this repo, `loocateme-app`, is client-only — confirmed: no `/server` or edge-function directory exists). This task only covers the client-side piece: handling a tap on a "streak lost" push notification by deep-linking the user to the right screen, following the existing pattern used for other push types.

**Files:**
- Modify: `components/notifications.js`
- Modify: `App.js` (notification response handler, near the existing `auth:login` / deep-link handling block, lines 177-245)

- [ ] **Step 1: Inspect the existing notification response handler**

Read `components/notifications.js` and the notification-tap handling in `App.js` to find where `Notifications.addNotificationResponseReceivedListener` (or equivalent) is registered, and what `data` shape existing notification types use (e.g. the Ultra Boost push referenced in `views/LocationScreen.js:665`).

- [ ] **Step 2: Add a `streak_lost` notification type handler**

In the notification response listener, add a branch for a new `type: 'streak_lost'` payload (the backend will need to send this `data.type` value) that navigates to the app's home/rewards screen, e.g.:

```js
if (data?.type === 'streak_lost') {
  navigationRef.current?.navigate('MyAccount', { screen: 'RewardsCard' });
}
```

Adjust the exact navigation target/route name to match whatever existing pattern is used for other notification types in the same handler (follow the established route names rather than inventing new ones).

- [ ] **Step 3: Document the backend requirement**

Since the actual "detect streak lost -> send push" job must run server-side (comparable to the existing `ultraBoost.service.js` backend pattern referenced in `views/LocationScreen.js:665`), leave a short note in the commit message that a backend job must: (1) detect when a user's streak resets (their `lastCheckInDate` streak lapses), and (2) send an Expo push via the token stored by `registerCurrentDevicePushToken()` (`components/PushService.js:32-46`) with `data: { type: 'streak_lost' }`.

- [ ] **Step 4: Manual test**

Use the Expo push notification tool (or a manual `Notifications.scheduleNotificationAsync` test in dev) to send a notification with `data: { type: 'streak_lost' }` and confirm tapping it navigates to the expected screen.

- [ ] **Step 5: Commit**

```bash
git add components/notifications.js App.js
git commit -m "feat: handle streak-lost push notification tap (backend send job required separately)"
```

---

## Task 4: Show city on LocationListScreen and LocationScreen

**Problem:** `item.city` is already populated by the sync service ([services/LocationSyncService.js:173](services/LocationSyncService.js:173)) and already used in `SearchView.js` ("city • distance" pattern), but not shown on the location list cards or the location detail screen.

**Files:**
- Modify: `views/LocationList/LocationCard.js:91-106` (header row) and `views/LocationList/LocationCard.js:270-290` (styles)
- Modify: `views/LocationScreen.js:525-546` (floating info card)

- [ ] **Step 1: Add city under the name in LocationCard**

In `views/LocationList/LocationCard.js`, replace lines 91-106:

```js
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

with:

```js
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
        {!!item.city && (
          <Text
            style={[styles.cityText, { color: colors.textSecondary }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.city}
          </Text>
        )}
```

Add a `cityText` style near `distanceText` (line 274) in the `StyleSheet.create` block:

```js
  distanceText: { fontSize: 13, fontWeight: '600' },
  cityText: { fontSize: 13, fontWeight: '500', marginTop: -4, marginBottom: 8 },
```

- [ ] **Step 2: Add city to the LocationScreen floating card**

In `views/LocationScreen.js`, replace lines 542-546:

```js
      <View style={styles.rowBetween}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
          <View style={[styles.typePill, { backgroundColor: palette.accentSoft }]}>
            <Text style={[styles.typePillText, { color: palette.accent }]}>{formatLocationType(location.type)}</Text>
          </View>
          {isUserHere && (
```

with:

```js
      <View style={{ marginBottom: spacing.xs }}>
        {!!location.city && (
          <Text style={[typography.caption, { color: palette.textMuted, marginBottom: 4 }]} numberOfLines={1}>
            {location.city}
          </Text>
        )}
      </View>
      <View style={styles.rowBetween}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
          <View style={[styles.typePill, { backgroundColor: palette.accentSoft }]}>
            <Text style={[styles.typePillText, { color: palette.accent }]}>{formatLocationType(location.type)}</Text>
          </View>
          {isUserHere && (
```

- [ ] **Step 3: Manual test**

Run the app, open `LocationListScreen` and confirm each card with a known `city` value shows the city under its name; open `LocationScreen` for the same location and confirm the city appears above the type pill. Confirm locations with empty `city` render nothing extra (no blank line).

- [ ] **Step 4: Commit**

```bash
git add views/LocationList/LocationCard.js views/LocationScreen.js
git commit -m "feat: display city on location list cards and location detail screen"
```

---

## Task 5: Fix stale boost/superlike count in the paywall (ConsumablesShopSheet)

**Problem:** `ConsumablesShopSheet` refreshes its displayed counts from an in-memory cache only when opened ([components/ConsumablesShopSheet.js:107-121](components/ConsumablesShopSheet.js:107)), never hitting the backend. Only the manual refresh button (`handleRefresh`, lines 151-156) calls `PremiumService.refreshFromBackend()`. So the sheet can show a stale count on open.

**Files:**
- Modify: `components/ConsumablesShopSheet.js:113-121`

- [ ] **Step 1: Refresh from backend when the sheet opens**

Replace the `useEffect` at lines 113-121:

```js
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

with:

```js
  useEffect(() => {
    if (!visible) return;
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

This keeps the immediate cached `refresh()` call so the sheet isn't blank while the network call is in flight, then overwrites with the fresh server counts once `refreshFromBackend()` resolves (it already falls back to cache silently on network error per `services/PremiumService.js:137`, so no extra error handling is needed here).

- [ ] **Step 2: Manual test**

With a test account, purchase or consume a boost/superlike via another surface (or via backend/admin tooling) without reopening the app, then open the `ConsumablesShopSheet` paywall and confirm the counter reflects the up-to-date value without needing to tap the manual refresh button.

- [ ] **Step 3: Commit**

```bash
git add components/ConsumablesShopSheet.js
git commit -m "fix: refresh boost/superlike counts from backend when paywall opens"
```

---

## Task 6: Disable "Booster mon profil" when user is not at the location, with explanatory text (all languages)

**Problem:** The boost button in `views/LocationScreen.js` (`renderFixedAction`, lines 968-999) can be pressed even when the user isn't physically checked in at the location (`isUserHere`, line 669); `handleBoost` (lines 350-353) doesn't check `isUserHere` either.

**Files:**
- Modify: `views/LocationScreen.js:350-353` (`handleBoost`)
- Modify: `views/LocationScreen.js:976-999` (button render)
- Modify: `i18n/locales/*/common.json` (30 locale files, add one key each to the `locationScreen` object)

- [ ] **Step 1: Guard `handleBoost` on presence**

Replace lines 350-353:

```js
  const handleBoost = () => {
    if (isBoosted || boostLoading) return;
    if (checkAccess('boost')) activateBoost(locationId);
  };
```

with:

```js
  const handleBoost = () => {
    if (isBoosted || boostLoading || !isUserHere) return;
    if (checkAccess('boost')) activateBoost(locationId);
  };
```

Note: `isUserHere` is declared at line 669, further down in the file than `handleBoost` at line 350 — since both are inside the same function component and `isUserHere` is a `const` computed on every render (not inside a callback), move the `isUserHere` declaration (line 669: `const isUserHere = !!(user?.currentPoiId && location?._id && String(user.currentPoiId) === String(location._id));`) up to just before `handleBoost` (before line 350), and delete it from its original location at line 669.

- [ ] **Step 2: Disable the button visually and add explanatory text**

Replace lines 976-999:

```js
        <View style={[styles.fixedActionInner, { paddingHorizontal: spacing.lg }]}>
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

with:

```js
        <View style={[styles.fixedActionInner, { paddingHorizontal: spacing.lg }]}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleBoost}
            disabled={!isUserHere || isBoosted || boostLoading}
            style={[
              styles.primaryButton,
              {
                borderRadius: radius.pill,
                paddingVertical: spacing.md,
                shadowColor: palette.accent,
                opacity: !isUserHere ? 0.5 : 1,
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
              style={[typography.caption, { color: palette.textMuted, textAlign: 'center', marginTop: spacing.xs }]}
            >
              {t('locationScreen.boostRequiresPresence')}
            </Text>
          )}
```

- [ ] **Step 3: Add the translation key to all 30 locale files**

In each `i18n/locales/<lang>/common.json`, add `"boostRequiresPresence": "<translation>"` to the `locationScreen` object, right after the existing `"boostLockedAfterCheckins"` key (see `i18n/locales/en/common.json:244`). Use these translations:

| lang | value |
|---|---|
| en | `Be at this location to boost your profile` |
| fr | `Sois sur place pour booster ton profil` |
| de | `Sei an diesem Ort, um dein Profil zu boosten` |
| es | `Debes estar en este lugar para impulsar tu perfil` |
| it | `Devi essere in questo luogo per potenziare il tuo profilo` |
| pt | `Você precisa estar neste local para impulsionar seu perfil` |
| nl | `Je moet op deze locatie zijn om je profiel te boosten` |
| pl | `Musisz być w tym miejscu, aby wypromować swój profil` |
| sv | `Du måste vara på denna plats för att boosta din profil` |
| da | `Du skal være på dette sted for at boste din profil` |
| fi | `Sinun täytyy olla tässä paikassa tehostaaksesi profiiliasi` |
| cs | `Musíte být na tomto místě, abyste mohli vylepšit svůj profil` |
| sk | `Musíte byť na tomto mieste, aby ste mohli vylepšiť svoj profil` |
| hu | `Ezen a helyen kell lenned a profilod feltöltéséhez` |
| ro | `Trebuie să fii la această locație pentru a-ți promova profilul` |
| bg | `Трябва да сте на това място, за да усилите профила си` |
| el | `Πρέπει να βρίσκεστε σε αυτή την τοποθεσία για να ενισχύσετε το προφίλ σας` |
| hr | `Morate biti na ovoj lokaciji da biste pojačali svoj profil` |
| sr | `Морате бити на овој локацији да бисте појачали свој профил` |
| bs | `Morate biti na ovoj lokaciji da biste pojačali svoj profil` |
| sl | `Na tej lokaciji morate biti, da okrepite svoj profil` |
| sq | `Duhet të jeni në këtë vendndodhje për të promovuar profilin tuaj` |
| mk | `Мора да сте на оваа локација за да го засилите профилот` |
| lt | `Turite būti šioje vietoje, kad padidintumėte profilį` |
| lv | `Jums jābūt šajā vietā, lai palielinātu profilu` |
| et | `Profiili võimendamiseks pead olema sellel asukohal` |
| is | `Þú verður að vera á þessum stað til að efla prófílinn þinn` |
| mt | `Trid tkun f'dan il-post biex issaħħaħ il-profil tiegħek` |
| uk | `Ви маєте бути в цьому місці, щоб підвищити свій профіль` |

For each file, add the line (adjust comma placement to keep valid JSON):

```json
    "boostLockedAfterCheckins": "<existing value, unchanged>",
    "boostRequiresPresence": "<value from table above>"
```

- [ ] **Step 4: Validate all JSON files still parse**

```bash
for f in i18n/locales/*/common.json; do node -e "JSON.parse(require('fs').readFileSync('$f'))" || echo "INVALID: $f"; done
```

Expected: no `INVALID` lines printed.

- [ ] **Step 5: Manual test**

Open `LocationScreen` for a location you are not checked into; confirm the boost button is dimmed/disabled and the explanatory caption appears below it. Check in (or simulate `isUserHere`), confirm the button re-enables and the caption disappears.

- [ ] **Step 6: Commit**

```bash
git add views/LocationScreen.js i18n/locales/*/common.json
git commit -m "feat: disable boost button and explain when user is not at the location"
```

---

## Task 7: Prioritize nearby results and limit search to 5 (SearchView)

**Problem:** `SearchView.js` requests up to 10 results (`limit: 10`, [views/SearchView.js:95](views/SearchView.js:95)) and truncates client-side to 10 (`.slice(0, 10)`, [views/SearchView.js:133](views/SearchView.js:133)), with users and locations simply concatenated (no distance-based ordering).

**Files:**
- Modify: `views/SearchView.js:93-133`

- [ ] **Step 1: Lower the requested and displayed limit to 5**

Replace line 95 `limit: 10,` with `limit: 5,`.

Replace line 133:

```js
        setResults([...users, ...locations].slice(0, 10));
```

with a distance-sorted merge, limited to 5:

```js
        const merged = [...users, ...locations];
        merged.sort((a, b) => {
          const da = typeof a.distance === 'number' ? a.distance : Infinity;
          const db = typeof b.distance === 'number' ? b.distance : Infinity;
          return da - db;
        });
        setResults(merged.slice(0, 5));
```

This is a defensive client-side sort so results are ordered nearest-first even if the backend doesn't already rank by proximity when `lat`/`lon` are provided (entries without a `distance` value sort last, not first, so they don't crowd out nearby results).

- [ ] **Step 2: Manual test**

Search for a common term that returns both nearby and far-away users/locations; confirm at most 5 results are shown and the nearest ones appear first.

- [ ] **Step 3: Commit**

```bash
git add views/SearchView.js
git commit -m "fix: limit search to 5 results and sort by proximity"
```

---

## Task 8: Light-mode location type badge — grey background, white text

**Problem:** In light mode, the location type badge is a translucent cyan (`rgba(0,194,203,0.15)`) background with cyan text — the request is to switch it to a grey background with white text for better contrast, in both `LocationCard.js` and `LocationScreen.js`. Dark mode / moon vibe must be untouched.

**Files:**
- Modify: `views/LocationList/LocationCard.js:276,286` (styles)
- Modify: `views/LocationScreen.js:544-545` (inline palette-based colors)

- [ ] **Step 1: Update LocationCard's light-mode badge styles**

In `views/LocationList/LocationCard.js`, replace lines 276-287:

```js
  typeBadge: {
    backgroundColor: 'rgba(0, 194, 203, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  typeBadgeDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  typeText: { color: '#00c2cb', fontWeight: '700', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  typeTextDark: { color: '#fff' },
```

with:

```js
  typeBadge: {
    backgroundColor: '#8A93A3',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  typeBadgeDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  typeText: { color: '#FFFFFF', fontWeight: '700', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  typeTextDark: { color: '#fff' },
```

(`isDark` is still applied via `typeBadgeDark`/`typeTextDark` as a style override for dark mode, so dark mode remains unchanged — only the light-mode default values change.)

- [ ] **Step 2: Update LocationScreen's light-mode badge (moon mode untouched)**

In `views/LocationScreen.js`, replace lines 544-545:

```js
          <View style={[styles.typePill, { backgroundColor: palette.accentSoft }]}>
            <Text style={[styles.typePillText, { color: palette.accent }]}>{formatLocationType(location.type)}</Text>
          </View>
```

with:

```js
          <View style={[styles.typePill, { backgroundColor: isMoon ? palette.accentSoft : '#8A93A3' }]}>
            <Text style={[styles.typePillText, { color: isMoon ? palette.accent : '#FFFFFF' }]}>
              {formatLocationType(location.type)}
            </Text>
          </View>
```

(`isMoon` is already destructured from `useVibeTheme()` earlier in this component — confirm it's in scope at this point in the file; it is used elsewhere in the same render function, e.g. `styles.floatingCard` borderWidth logic at line 532.)

- [ ] **Step 3: Manual test**

Switch the app to day/sun vibe, open `LocationListScreen` and `LocationScreen`, confirm the type badge is grey with white text. Switch to night/moon vibe and confirm the badge is unchanged (still the cyan-tinted style).

- [ ] **Step 4: Commit**

```bash
git add views/LocationList/LocationCard.js views/LocationScreen.js
git commit -m "style: grey background for location type badge in light mode"
```

---

## Task 9: Recolor "Je suis ici" button to azure blue

**Problem:** The manual check-in button's background comes from `palette.accent` ([views/LocationScreen.js:640](views/LocationScreen.js:640)), which is `#FF3DAD` (pink) in moon/night mode ([hooks/useVibeTheme.js:30](hooks/useVibeTheme.js:30)) and `#00C2CB` (already blue/cyan) in sun/day mode ([hooks/useVibeTheme.js:54](hooks/useVibeTheme.js:54)). The app's designated alternate "azure blue" token is `palette.accentAlt` (`#3DA9FF` in moon mode, `#0091A0` in sun mode — [hooks/useVibeTheme.js:31,55](hooks/useVibeTheme.js:31)). The button should always render blue, never pink.

**Files:**
- Modify: `views/LocationScreen.js:629-644`

- [ ] **Step 1: Swap the button color to `accentAlt`**

Replace line 640:

```js
              backgroundColor: manualCheckinSuccess ? '#4CAF50' : palette.accent,
```

with:

```js
              backgroundColor: manualCheckinSuccess ? '#4CAF50' : palette.accentAlt,
```

- [ ] **Step 2: Manual test**

Switch to night/moon vibe, open `LocationScreen`, and confirm the "Je suis ici" button is blue (`#3DA9FF`), not pink. Switch to day/sun vibe and confirm it remains blue (`#0091A0`, close to the existing cyan look — visually consistent with before).

- [ ] **Step 3: Commit**

```bash
git add views/LocationScreen.js
git commit -m "fix: use azure blue instead of pink for the 'Je suis ici' button"
```

---

## Self-Review Notes

- **Spec coverage:** All 9 user-reported items map to a task above (Task 3 covers only the client-visible half of the streak notification; the server-side detection/send job is explicitly out of scope for this repo and called out in that task).
- **Placeholder scan:** No TBD/placeholder steps; every code step includes the actual diff content.
- **Type/name consistency:** `isUserHere` is reused (not renamed) between `handleBoost` and the render function in Task 6; `palette.accentAlt` / `palette.accent` naming matches `hooks/useVibeTheme.js` exactly across Tasks 8 and 9.
