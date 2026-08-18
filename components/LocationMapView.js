import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import { Ionicons } from '@expo/vector-icons';
import { getMapStyleUrl } from '../constants/mapStyles';
import { useMainSwiper } from './contexts/MainSwiperContext';
import { useVibeTheme } from '../hooks/useVibeTheme';
import { getLocationTypeEmoji } from './LocationUtils';
import { getLocationById } from './ApiRequest';

const DEFAULT_ZOOM = 14;
const RECENTER_ZOOM = 16;
// Garde-fou réseau/perf du pont RN<->WebView : le clustering visuel se fait
// côté carte (assets/map/src/map-app.js), mais on évite quand même de
// sérialiser/poster un payload démesuré si l'accumulateur de lieux explorés
// grossit (cf. MAP_EXPLORED_CAP dans LocationListScreen.js).
const MAX_MARKERS = 200;

// Vue carte (Phase 1) : reçoit les lieux déjà chargés/filtrés par
// LocationListScreen (locationsWithDistance/visibleItems) — aucun fetch ici,
// cf. plan "vue carte" (pas de nouvel appel réseau en Phase 1-2).
//
// Implémentation WebView + MapLibre GL JS (embarqué en asset local, pas de
// CDN) plutôt que @maplibre/maplibre-react-native : cette dernière requiert
// du code natif compilé, incompatible avec Expo Go. La WebView utilise
// WKWebView/andr. WebView natif du système, ce qui reste une intégration
// standard (pas un simple wrapper de site web) et n'est pas un souci pour la
// review App Store/Play Store.
export default function LocationMapView({
  locations,
  currentLocation,
  currentPoiId,
  isMoon,
  onSelectLocation,
  onViewportChange,
  onClusterOpen,
}) {
  const { lockSwiper, unlockSwiper } = useMainSwiper();
  const { palette } = useVibeTheme();
  const webviewRef = useRef(null);
  const bridgeReadyRef = useRef(false);
  const [loadError, setLoadError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [htmlUri, setHtmlUri] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const asset = Asset.fromModule(require('../assets/map/map.html'));
    asset
      .downloadAsync()
      .then(() => {
        if (!cancelled) setHtmlUri(asset.localUri || asset.uri);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Impossible de charger la carte');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mapStyle = useMemo(() => getMapStyleUrl(isMoon), [isMoon]);
  const centerCoordinate = useMemo(() => {
    if (currentLocation) return [currentLocation.longitude, currentLocation.latitude];
    const first = locations.find((loc) => Array.isArray(loc?.location?.coordinates));
    return first ? first.location.coordinates : [2.3522, 48.8566]; // fallback Paris
  }, [currentLocation, locations]);

  const markerPayload = useMemo(
    () =>
      locations
        .filter((loc) => Array.isArray(loc?.location?.coordinates))
        .slice(0, MAX_MARKERS)
        .map((loc) => ({
          id: String(loc._id || loc.osmId),
          coords: loc.location.coordinates,
          name: loc.name || '',
          stars: loc.stars || 0,
          userCount: loc.userCount || 0,
          activeUsers: loc.activeUsers || [],
          isSponsored: !!loc.isSponsored,
          isPro: !!loc.isPro,
          emoji: getLocationTypeEmoji(loc.type),
          logoUrl: loc.logoThumbUrl || loc.logoUrl || null,
        })),
    [locations]
  );

  const palettePayload = useMemo(
    () => ({
      accent: palette.accent,
      accentAlt: palette.accentAlt,
      surface: palette.surface,
      accentSoft: palette.accentSoft,
      gradient: palette.gradient,
    }),
    [palette.accent, palette.accentAlt, palette.surface, palette.accentSoft, palette.gradient]
  );

  const sendRender = useCallback(() => {
    if (!bridgeReadyRef.current || !webviewRef.current) return;
    webviewRef.current.postMessage(
      JSON.stringify({
        type: 'render',
        payload: {
          styleUrl: mapStyle,
          center: centerCoordinate,
          zoom: DEFAULT_ZOOM,
          locations: markerPayload,
          palette: palettePayload,
        },
      })
    );
  }, [mapStyle, centerCoordinate, markerPayload, palettePayload]);

  useEffect(() => {
    sendRender();
  }, [sendRender]);

  // Coordonnées du lieu où l'utilisateur est check-in. On les cherche
  // d'abord dans les lieux déjà chargés (rapide, pas de requête) ; s'il n'y
  // est pas (hors de la zone explorée sur la carte, filtré par vibe, etc.),
  // on va les chercher explicitement par id — le recentrage doit toujours
  // pointer sur le lieu du check-in, pas sur le GPS, tant qu'on est check-in.
  const [checkedInCoords, setCheckedInCoords] = useState(null);

  useEffect(() => {
    if (!currentPoiId) {
      setCheckedInCoords(null);
      return;
    }
    const fromLoaded = locations.find(
      (loc) => String(loc._id) === String(currentPoiId) && Array.isArray(loc?.location?.coordinates)
    );
    if (fromLoaded) {
      setCheckedInCoords(fromLoaded.location.coordinates);
      return;
    }
    let cancelled = false;
    getLocationById(currentPoiId)
      .then((res) => {
        if (cancelled) return;
        const coords = res?.location?.location?.coordinates;
        if (Array.isArray(coords)) setCheckedInCoords(coords);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // On ne relance la requête réseau que si le lieu check-in change, pas à
    // chaque mise à jour de `locations` (déjà géré par le fast-path ci-dessus).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPoiId]);

  // Cible du bouton de recentrage : le lieu du check-in en priorité (plus
  // pertinent qu'un point GPS parfois imprécis en intérieur), sinon la
  // position GPS courante.
  const recenterTarget = useMemo(() => {
    if (currentPoiId && checkedInCoords) return checkedInCoords;
    if (currentLocation) return [currentLocation.longitude, currentLocation.latitude];
    return null;
  }, [currentPoiId, checkedInCoords, currentLocation]);

  const handleRecenter = useCallback(() => {
    if (!recenterTarget || !webviewRef.current) return;
    webviewRef.current.postMessage(
      JSON.stringify({
        type: 'recenter',
        payload: { center: recenterTarget, zoom: RECENTER_ZOOM },
      })
    );
  }, [recenterTarget]);

  const locationsRef = useRef(locations);
  locationsRef.current = locations;
  const onSelectLocationRef = useRef(onSelectLocation);
  onSelectLocationRef.current = onSelectLocation;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  const onClusterOpenRef = useRef(onClusterOpen);
  onClusterOpenRef.current = onClusterOpen;

  const handleWebViewMessage = useCallback((event) => {
    let data;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch (err) {
      return;
    }
    if (data.type === 'bridgeReady') {
      bridgeReadyRef.current = true;
      setLoadError(null);
      sendRender();
    } else if (data.type === 'ready') {
      setIsLoading(false);
    } else if (data.type === 'mapError') {
      setLoadError(data.message || 'Erreur de chargement de la carte');
    } else if (data.type === 'markerPress') {
      const found = locationsRef.current.find(
        (loc) => String(loc._id || loc.osmId) === data.id
      );
      if (found) onSelectLocationRef.current?.(found);
    } else if (data.type === 'viewportChanged') {
      onViewportChangeRef.current?.({ center: data.center, zoom: data.zoom });
    } else if (data.type === 'clusterOpen') {
      // Zoom déjà au maximum et le groupe ne s'est pas séparé (lieux à des
      // coordonnées très proches, voire identiques) : on résout les lieux
      // concernés depuis les données déjà en mémoire côté RN plutôt que de
      // laisser l'utilisateur bloqué sur une bulle qui ne disparaît jamais.
      const ids = Array.isArray(data.ids) ? data.ids : [];
      const found = ids
        .map((id) => locationsRef.current.find((loc) => String(loc._id || loc.osmId) === String(id)))
        .filter(Boolean);
      if (found.length > 0) onClusterOpenRef.current?.(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendRender]);

  // Le lock/unlock du MainSwiper évite que le pan/pinch de la carte entre en
  // conflit avec le PanResponder horizontal du swiper (cf. MainSwiperContext).
  const touchActiveRef = useRef(false);
  const handleTouchStart = () => {
    if (touchActiveRef.current) return;
    touchActiveRef.current = true;
    lockSwiper();
  };
  const handleTouchEnd = () => {
    touchActiveRef.current = false;
    unlockSwiper();
  };

  return (
    <View style={styles.container} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}>
      {htmlUri ? (
        <WebView
          ref={webviewRef}
          source={{ uri: htmlUri }}
          style={styles.map}
          originWhitelist={['*']}
          onMessage={handleWebViewMessage}
          onError={() => setLoadError('Impossible de charger la carte')}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowUniversalAccessFromFileURLs
          androidLayerType="hardware"
          startInLoadingState={false}
        />
      ) : null}
      {isLoading && !loadError ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color={palette.accent} />
        </View>
      ) : null}
      {loadError ? (
        <View style={styles.overlay}>
          <Text style={[styles.errorText, { color: palette.text }]}>{loadError}</Text>
        </View>
      ) : null}
      {recenterTarget && !isLoading && !loadError ? (
        <TouchableOpacity
          onPress={handleRecenter}
          activeOpacity={0.8}
          style={[styles.recenterBtn, { backgroundColor: palette.surface, shadowColor: '#000' }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={currentPoiId ? 'navigate' : 'locate'} size={20} color={palette.accent} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1, backgroundColor: 'transparent' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  recenterBtn: {
    position: 'absolute',
    right: 16,
    bottom: 44,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
});
