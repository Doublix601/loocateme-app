// Pont carte MapLibre GL JS <-> React Native (via WebView postMessage).
// Ce script tourne DANS la webview, isolé du bundle RN.
(function () {
  var map = null;
  var markers = [];
  var currentStyleUrl = null;
  var ready = false;
  var pendingRender = null;
  var viewportDebounceTimer = null;
  var VIEWPORT_DEBOUNCE_MS = 400;
  var ZOOM_DEBOUNCE_MS = 200;
  var zoomDebounceTimer = null;

  // Dernières données reçues de RN, gardées pour pouvoir recalculer le
  // clustering (dépendant du zoom courant) sans repasser par RN, ex. au
  // pincement zoom/dézoom.
  var lastLocations = [];
  var lastPalette = null;

  function post(msg) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    }
  }

  function clearMarkers() {
    markers.forEach(function (m) { m.remove(); });
    markers = [];
  }

  var AVATAR_SIZE = 40;

  // Pin = avatar (photo d'un utilisateur présent, ou pastille de secours) +
  // badge "+N" (nombre total de personnes au lieu) + nom du lieu en dessous.
  // Pas de priorisation "utilisateur suivi" (aucun endpoint bulk pour ça côté
  // backend) : on prend simplement le premier utilisateur actif renvoyé.
  function buildMarkerEl(location, palette) {
    var activeUsers = location.activeUsers || [];
    var hasActiveUsers = activeUsers.length > 0;
    var isFeatured = !!(location.isSponsored || location.isPro);
    var userCount = location.userCount || 0;
    var firstUser = activeUsers[0];
    var borderColor = isFeatured ? '#FFD700' : palette.accentSoft;
    var borderWidth = isFeatured ? 2.5 : 1.5;

    var el = document.createElement('div');
    el.className = 'rn-marker-card';
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.alignItems = 'center';
    el.style.cursor = 'pointer';

    var avatarWrap = document.createElement('div');
    avatarWrap.style.position = 'relative';
    avatarWrap.style.width = AVATAR_SIZE + 'px';
    avatarWrap.style.height = AVATAR_SIZE + 'px';

    // Pastille de secours (couleur + emoji) : visible par défaut, masquée si
    // une photo se charge avec succès.
    var fallback = document.createElement('div');
    fallback.style.width = AVATAR_SIZE + 'px';
    fallback.style.height = AVATAR_SIZE + 'px';
    fallback.style.borderRadius = '50%';
    fallback.style.display = 'flex';
    fallback.style.alignItems = 'center';
    fallback.style.justifyContent = 'center';
    fallback.style.backgroundColor = hasActiveUsers ? palette.accent : palette.surface;
    fallback.style.border = borderWidth + 'px solid ' + borderColor;
    fallback.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    fallback.style.fontSize = (AVATAR_SIZE * 0.45) + 'px';
    fallback.style.boxSizing = 'border-box';
    fallback.textContent = location.emoji || '📍';
    avatarWrap.appendChild(fallback);

    if (firstUser && firstUser.profileImageUrl) {
      var img = document.createElement('img');
      img.src = firstUser.profileImageUrl;
      img.style.position = 'absolute';
      img.style.top = '0';
      img.style.left = '0';
      img.style.width = AVATAR_SIZE + 'px';
      img.style.height = AVATAR_SIZE + 'px';
      img.style.borderRadius = '50%';
      img.style.objectFit = 'cover';
      img.style.border = borderWidth + 'px solid ' + borderColor;
      img.style.boxShadow = '0 2px 4px rgba(0,0,0,0.25)';
      img.style.boxSizing = 'border-box';
      img.onerror = function () {
        img.style.display = 'none';
      };
      avatarWrap.appendChild(img);
    }

    if (userCount > 0) {
      var badge = document.createElement('div');
      badge.textContent = '+' + userCount;
      badge.style.position = 'absolute';
      badge.style.bottom = '-4px';
      badge.style.right = '-6px';
      badge.style.backgroundColor = palette.accent;
      badge.style.color = '#fff';
      badge.style.fontSize = '10px';
      badge.style.fontWeight = '700';
      badge.style.lineHeight = '1.4';
      badge.style.borderRadius = '999px';
      badge.style.padding = '1px 5px';
      badge.style.border = '1.5px solid #fff';
      badge.style.boxShadow = '0 1px 2px rgba(0,0,0,0.25)';
      avatarWrap.appendChild(badge);
    }

    el.appendChild(avatarWrap);

    if (location.name) {
      var label = document.createElement('div');
      label.textContent = location.name;
      label.style.marginTop = '3px';
      label.style.maxWidth = '96px';
      label.style.overflow = 'hidden';
      label.style.textOverflow = 'ellipsis';
      label.style.whiteSpace = 'nowrap';
      label.style.fontSize = '11px';
      label.style.fontWeight = '600';
      label.style.color = '#fff';
      label.style.textShadow = '0 1px 2px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6)';
      label.style.textAlign = 'center';
      el.appendChild(label);
    }

    el.addEventListener('click', function (e) {
      e.stopPropagation();
      post({ type: 'markerPress', id: location.id });
    });

    return el;
  }

  var CLUSTER_MIN_SIZE = 38;
  var CLUSTER_MAX_SIZE = 64;
  var CLUSTER_HALO_PAD = 10;

  // Pastille de regroupement : halo doux (couleur accent en transparence) +
  // disque en dégradé (mêmes couleurs que les CTA de l'app, cf.
  // palette.gradient) avec le nombre de lieux regroupés. Taille
  // proportionnelle (log) au nombre pour rester lisible même sur un cluster
  // de 100+ lieux, cohérent avec le style "premium" du reste de l'app
  // (anneaux dégradés des stories, boutons primaires en gradient).
  function buildClusterEl(cluster, palette) {
    var size = Math.round(
      Math.min(CLUSTER_MAX_SIZE, CLUSTER_MIN_SIZE + Math.log2(cluster.count) * 7)
    );
    var haloSize = size + CLUSTER_HALO_PAD * 2;
    var gradient = (palette.gradient && palette.gradient.length > 0) ? palette.gradient : [palette.accent, palette.accent];
    var gradientCss = gradient.length > 1
      ? 'linear-gradient(135deg, ' + gradient.join(', ') + ')'
      : gradient[0];

    var wrap = document.createElement('div');
    wrap.className = 'rn-marker-cluster';
    wrap.style.width = haloSize + 'px';
    wrap.style.height = haloSize + 'px';
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';
    wrap.style.cursor = 'pointer';
    // Pas de transition sur `wrap` : c'est l'élément passé comme `element` au
    // maplibregl.Marker, que MapLibre repositionne à chaque frame de caméra
    // via `style.transform`. Une transition ici anime aussi ces mises à jour
    // de position (censées être instantanées), d'où l'effet de "traîne"
    // pendant un pan puis un rattrapage brusque à l'arrêt. L'animation de tap
    // ("squish") est donc portée par bubbleWrap (noeud interne, jamais touché
    // par MapLibre) plutôt que par wrap lui-même.

    // Halo : disque flou en teinte accent transparente, façon "aura", pour
    // donner de la profondeur sans surcharger visuellement la carte.
    var halo = document.createElement('div');
    halo.style.position = 'absolute';
    halo.style.top = '0';
    halo.style.left = '0';
    halo.style.width = haloSize + 'px';
    halo.style.height = haloSize + 'px';
    halo.style.borderRadius = '50%';
    halo.style.backgroundColor = palette.accentSoft || 'rgba(0,0,0,0.08)';

    var bubbleWrap = document.createElement('div');
    bubbleWrap.style.position = 'relative';
    bubbleWrap.style.width = haloSize + 'px';
    bubbleWrap.style.height = haloSize + 'px';
    bubbleWrap.style.display = 'flex';
    bubbleWrap.style.alignItems = 'center';
    bubbleWrap.style.justifyContent = 'center';
    bubbleWrap.style.transition = 'transform 0.15s ease-out';
    bubbleWrap.appendChild(halo);

    var bubble = document.createElement('div');
    bubble.style.position = 'relative';
    bubble.style.width = size + 'px';
    bubble.style.height = size + 'px';
    bubble.style.borderRadius = '50%';
    bubble.style.display = 'flex';
    bubble.style.alignItems = 'center';
    bubble.style.justifyContent = 'center';
    bubble.style.background = gradientCss;
    bubble.style.border = '2.5px solid #fff';
    bubble.style.boxShadow = '0 3px 10px rgba(0,0,0,0.25)';
    bubble.style.color = '#fff';
    bubble.style.fontWeight = '800';
    bubble.style.fontSize = Math.max(13, Math.round(size * 0.34)) + 'px';
    bubble.style.letterSpacing = '-0.2px';
    bubble.style.textShadow = '0 1px 2px rgba(0,0,0,0.2)';
    bubble.style.boxSizing = 'border-box';
    bubble.textContent = String(cluster.count);
    bubbleWrap.appendChild(bubble);

    wrap.appendChild(bubbleWrap);

    wrap.addEventListener('click', function (e) {
      e.stopPropagation();
      bubbleWrap.style.transform = 'scale(0.88)';
      setTimeout(function () { bubbleWrap.style.transform = 'scale(1)'; }, 150);

      // Si les lieux du groupe sont à des coordonnées très proches (voire
      // identiques, ex. plusieurs lieux enregistrés au même point), le
      // clustering par proximité écran (cf. clusterLocations) ne les sépare
      // jamais, même au zoom max du style — la bulle restait donc bloquée
      // indéfiniment. On utilise le vrai zoom max de la carte, et si on y est
      // déjà, on bascule sur un choix direct (liste des lieux du groupe côté
      // RN) plutôt que de zoomer dans le vide.
      var maxZoom = map.getMaxZoom();
      var currentZoom = map.getZoom();
      if (currentZoom >= maxZoom - 0.01) {
        post({ type: 'clusterOpen', ids: cluster.ids });
        return;
      }

      // Zoom vers la bounding box réelle des lieux du groupe plutôt qu'un pas
      // fixe (+2) : un cluster serré se sépare avec un léger zoom, un cluster
      // très étalé en a besoin de bien plus — un pas fixe ratait l'un des
      // deux cas et forçait parfois plusieurs taps successifs.
      var bounds = cluster.memberCoords.reduce(function (b, c) {
        return b.extend(c);
      }, new maplibregl.LngLatBounds(cluster.memberCoords[0], cluster.memberCoords[0]));
      map.fitBounds(bounds, { padding: 64, maxZoom: maxZoom, duration: 400 });
    });

    return wrap;
  }

  // Distance écran (px) en dessous de laquelle un lieu rejoint le cluster
  // existant le plus proche. Pas de seuil minimal sur le nombre total de
  // lieux : à très faible zoom, même 2-3 lieux réels très éloignés peuvent se
  // projeter à quelques pixels l'un de l'autre et doivent être regroupés pour
  // éviter la superposition — c'est la densité écran, pas le compte absolu,
  // qui détermine le clustering.
  var CLUSTER_RADIUS_PX = 56;

  // Regroupe les lieux dont la projection écran est à moins de
  // CLUSTER_RADIUS_PX du centre (écran) d'un cluster existant, par un
  // algorithme glouton (chaque point rejoint le cluster le plus proche parmi
  // ceux déjà formés, sinon en crée un nouveau). Contrairement à une grille à
  // cellules fixes, deux points proches en pixels sont toujours regroupés
  // ensemble, peu importe où seraient tombées les frontières d'une grille —
  // évite l'effet "seam" où deux lieux à 2px l'un de l'autre mais de part et
  // d'autre d'une frontière de cellule ne se regroupaient pas, tandis que
  // deux lieux plus éloignés dans la même cellule si. Le centre d'un cluster
  // est la moyenne des positions écran de ses membres (pas une moyenne
  // géographique) : la bulle reste ainsi toujours visuellement au centre de
  // ses pins, y compris pour un cluster à large étalement géographique à
  // faible zoom. Approche volontairement simple (pas de supercluster/
  // quadtree) : les volumes gérés (quelques centaines de lieux max, cf.
  // MAP_EXPLORED_CAP côté RN) restent largement dans le budget d'un
  // algorithme O(n²).
  function clusterLocations(locations) {
    var valid = (locations || []).filter(function (loc) {
      return Array.isArray(loc.coords) && loc.coords.length >= 2;
    });

    var clusters = []; // { sumX, sumY, cx, cy, members: [{ loc, point }] }

    valid.forEach(function (loc) {
      var point = map.project(loc.coords);
      var best = null;
      var bestDist = Infinity;
      clusters.forEach(function (c) {
        var dx = point.x - c.cx;
        var dy = point.y - c.cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CLUSTER_RADIUS_PX && dist < bestDist) {
          best = c;
          bestDist = dist;
        }
      });
      if (!best) {
        best = { sumX: 0, sumY: 0, cx: point.x, cy: point.y, members: [] };
        clusters.push(best);
      }
      best.members.push({ loc: loc, point: point });
      best.sumX += point.x;
      best.sumY += point.y;
      best.cx = best.sumX / best.members.length;
      best.cy = best.sumY / best.members.length;
    });

    var result = [];
    clusters.forEach(function (c) {
      if (c.members.length === 1) {
        result.push({ type: 'single', location: c.members[0].loc });
        return;
      }
      var center = map.unproject([c.cx, c.cy]);
      result.push({
        type: 'cluster',
        count: c.members.length,
        coords: [center.lng, center.lat],
        ids: c.members.map(function (m) { return m.loc.id; }),
        memberCoords: c.members.map(function (m) { return m.loc.coords; }),
      });
    });
    return result;
  }

  // Signature stable d'un jeu de marqueurs (type/id/count/position arrondie)
  // pour éviter de détruire/recréer tous les DOM markers quand le résultat
  // du clustering est identique au rendu précédent (ex: un zoomend débouncé
  // qui se déclenche juste après qu'un nouveau payload RN ait déjà provoqué
  // le même regroupement) — c'est cette reconstruction redondante qui cause
  // le "flash" regroupement/dégroupement visible à l'utilisateur.
  function itemsSignature(items, palette) {
    // Le discriminant de palette est inclus pour qu'un changement de thème
    // (jour/nuit) force toujours un redessin des marqueurs, même quand le
    // clustering géométrique (ids/positions/comptes) n'a pas changé entre-temps.
    var paletteKey = palette ? (palette.accent + ':' + palette.accentAlt) : '';
    return paletteKey + '|' + items
      .map(function (item) {
        if (item.type === 'cluster') {
          return 'c:' + item.count + ':' + item.coords[0].toFixed(4) + ':' + item.coords[1].toFixed(4) + ':' + item.ids.slice().sort().join(',');
        }
        return 's:' + item.location.id;
      })
      .sort()
      .join('|');
  }

  var lastSignature = null;

  function renderMarkers(locations, palette) {
    var items = clusterLocations(locations);
    var signature = itemsSignature(items, palette);
    if (signature === lastSignature && markers.length > 0) return;
    lastSignature = signature;

    clearMarkers();
    items.forEach(function (item) {
      var el, coords;
      if (item.type === 'cluster') {
        el = buildClusterEl(item, palette);
        coords = item.coords;
      } else {
        if (!Array.isArray(item.location.coords) || item.location.coords.length < 2) return;
        el = buildMarkerEl(item.location, palette);
        coords = item.location.coords;
      }
      // offset vertical : recentre l'avatar (pas le label sous lui) sur la
      // coordonnée, vu que le bloc a grandi avec le nom du lieu en dessous.
      var marker = new maplibregl.Marker({ element: el, anchor: 'center', offset: [0, -8] })
        .setLngLat(coords)
        .addTo(map);
      markers.push(marker);
    });
  }

  function rerenderFromCache() {
    if (!ready || !lastPalette) return;
    renderMarkers(lastLocations, lastPalette);
  }

  function applyRender(payload) {
    var styleUrl = payload.styleUrl;
    var center = payload.center;
    var zoom = payload.zoom;
    var locations = payload.locations;
    var palette = payload.palette;

    lastLocations = locations;
    lastPalette = palette;

    // Un nouveau payload RN prime sur un recalcul de clustering local en
    // attente (déclenché par zoomend) : sans ça, les deux rendus peuvent se
    // chevaucher à quelques centaines de ms d'écart et produire un flash
    // visible (regroupement puis dégroupement) sur les mêmes marqueurs.
    if (zoomDebounceTimer) {
      clearTimeout(zoomDebounceTimer);
      zoomDebounceTimer = null;
    }

    if (!map) {
      map = new maplibregl.Map({
        container: 'map',
        style: styleUrl,
        center: center,
        zoom: zoom,
        attributionControl: true,
      });
      currentStyleUrl = styleUrl;

      map.on('load', function () {
        ready = true;
        renderMarkers(locations, palette);
        post({ type: 'ready' });
      });

      map.on('error', function (e) {
        post({ type: 'mapError', message: (e && e.error && e.error.message) || 'map error' });
      });

      // Débounce unique côté WebView : évite de spammer RN pendant un pan
      // continu, un seul message part une fois le mouvement stabilisé.
      map.on('moveend', function () {
        if (viewportDebounceTimer) clearTimeout(viewportDebounceTimer);
        viewportDebounceTimer = setTimeout(function () {
          var c = map.getCenter();
          post({ type: 'viewportChanged', center: [c.lng, c.lat], zoom: map.getZoom() });
        }, VIEWPORT_DEBOUNCE_MS);
      });

      // Recalcule uniquement le clustering (pas de round-trip RN) quand le
      // zoom change : un pincement sans déplacement du centre ne redemande
      // pas de nouvelles données, mais doit quand même regrouper/dégrouper
      // les marqueurs déjà en mémoire.
      map.on('zoomend', function () {
        if (zoomDebounceTimer) clearTimeout(zoomDebounceTimer);
        zoomDebounceTimer = setTimeout(rerenderFromCache, ZOOM_DEBOUNCE_MS);
      });

      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      return;
    }

    if (styleUrl !== currentStyleUrl) {
      currentStyleUrl = styleUrl;
      ready = false;
      map.setStyle(styleUrl);
      map.once('style.load', function () {
        ready = true;
        // On utilise lastLocations/lastPalette (mis à jour à chaque message
        // reçu, cf. plus haut) plutôt que les `locations`/`palette` figés de
        // CET appel : un message plus récent (nouveaux lieux de la vibe
        // active, arrivé pendant le chargement du style) aurait sinon été
        // ignoré silencieusement (cf. branche `else if (ready)` ci-dessous),
        // laissant la carte affichée avec des données obsolètes.
        renderMarkers(lastLocations, lastPalette);
      });
    } else if (ready) {
      renderMarkers(locations, palette);
    }
  }

  function handleMessage(rawData) {
    var data;
    try {
      data = JSON.parse(rawData);
    } catch (err) {
      return;
    }
    if (data.type === 'render') {
      applyRender(data.payload);
    } else if (data.type === 'recenter') {
      if (map) {
        map.flyTo({ center: data.payload.center, zoom: data.payload.zoom, essential: true, speed: 1.4 });
      }
    }
  }

  document.addEventListener('message', function (e) { handleMessage(e.data); });
  window.addEventListener('message', function (e) { handleMessage(e.data); });

  window.addEventListener('error', function (e) {
    post({ type: 'mapError', message: e.message || 'js error' });
  });

  post({ type: 'bridgeReady' });
})();
