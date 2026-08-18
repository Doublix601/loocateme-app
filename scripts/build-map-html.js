// Génère assets/map/map.html en assemblant MapLibre GL JS/CSS vendorés
// (assets/map/vendor/) et le pont RN<->WebView (assets/map/src/map-app.js)
// en un unique fichier HTML autonome, chargé via `require()` comme asset
// Expo par components/LocationMapView.js.
//
// À relancer (`npm run build:map-html`) après toute modification de
// assets/map/src/map-app.js ou des fichiers vendor.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VENDOR_DIR = path.join(ROOT, 'assets/map/vendor');
const SRC_DIR = path.join(ROOT, 'assets/map/src');
const OUT_PATH = path.join(ROOT, 'assets/map/map.html');

const jsLib = fs.readFileSync(path.join(VENDOR_DIR, 'maplibre-gl.js'), 'utf8');
const cssLib = fs.readFileSync(path.join(VENDOR_DIR, 'maplibre-gl.css'), 'utf8');
const appScript = fs.readFileSync(path.join(SRC_DIR, 'map-app.js'), 'utf8');

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; background: transparent; }
${cssLib}
.rn-marker { display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.2); box-sizing: border-box; }
.rn-marker-emoji { line-height: 1; }
.maplibregl-ctrl-attrib { font-size: 9px; }
/* Halo pulsant du pin sponsorisé (Pro Boost) : un seul lieu sponsorisé à la
   fois (cf. backend location.controller.js), donc pas de risque de saturer
   la carte de pulses simultanés. */
@keyframes rn-marker-sponsor-pulse {
  0% { transform: scale(0.92); opacity: 0.55; }
  70% { transform: scale(1.55); opacity: 0; }
  100% { transform: scale(1.55); opacity: 0; }
}
.rn-marker-sponsor-halo {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #FFD700;
  animation: rn-marker-sponsor-pulse 2.2s ease-out infinite;
  pointer-events: none;
}
</style>
</head>
<body>
<div id="map"></div>
<script>
${jsLib}
</script>
<script>
${appScript}
</script>
</body>
</html>
`;

fs.writeFileSync(OUT_PATH, html);
console.log(`Written ${OUT_PATH} (${html.length} bytes)`);
