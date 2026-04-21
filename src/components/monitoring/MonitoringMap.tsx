import React, { useMemo, useRef, useEffect } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

interface LatLng {
  lat: number;
  lng: number;
}

interface MonitoringMapProps {
  user: LatLng | null;
  destination?: LatLng | null;
  destinationName?: string | null;
  /** Optional pre-computed route polyline (array of {lat,lng}). */
  route?: LatLng[] | null;
  height?: number;
}

/**
 * Leaflet-in-WebView map. CartoDB dark tiles match the active-monitoring theme.
 *
 * Why WebView and not react-native-maps:
 *  - no extra native dependency (project already ships react-native-webview)
 *  - matches the pattern used by TrackingScreen
 *  - tile provider is configurable without rebuilding the app
 *
 * The HTML is built once with whatever the *initial* coords are; subsequent
 * updates flow through `postMessage` so we don't reload the WebView (and the
 * map view) on every GPS ping.
 */
const MonitoringMap: React.FC<MonitoringMapProps> = ({
  user,
  destination,
  destinationName,
  route,
  height = 180,
}) => {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef<boolean>(false);
  const queueRef = useRef<string[]>([]);
  const initialUser = useMemo(() => user ?? { lat: 20.5937, lng: 78.9629 }, []); // India centroid fallback

  // Send a message — or queue it if the WebView's JS hasn't booted yet.
  // The race that hides the blue dot: useEffect for `user` fires immediately
  // on first render, but Leaflet inside the WebView isn't loaded yet, so the
  // postMessage is dropped on the floor. Buffering until onLoadEnd fixes it.
  const send = (payload: object) => {
    const json = JSON.stringify(payload);
    if (!readyRef.current) {
      queueRef.current.push(json);
      return;
    }
    webRef.current?.postMessage(json);
  };

  const flushQueue = () => {
    if (!queueRef.current.length) return;
    for (const msg of queueRef.current) {
      webRef.current?.postMessage(msg);
    }
    queueRef.current = [];
  };

  const html = useMemo(
    () => `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { margin:0; padding:0; height:100%; width:100%; background:#0d1b2e; }
  .user-dot {
    width:18px; height:18px; border-radius:50%;
    background:#1d6fa4; border:3px solid #fff;
    box-shadow:0 0 0 4px rgba(29,111,164,0.35), 0 0 12px rgba(29,111,164,0.7);
  }
  .dest-dot {
    width:14px; height:14px; border-radius:50%;
    background:#ef4444; border:2px solid #fff;
  }
  .leaflet-control-attribution { display:none; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map = L.map('map', { zoomControl:false, attributionControl:false })
    .setView([${initialUser.lat}, ${initialUser.lng}], 15);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 19
  }).addTo(map);

  var userMarker = null;
  var destMarker = null;
  var routeLine = null;
  var firstFix = true;

  function setUser(lat, lng) {
    if (!userMarker) {
      userMarker = L.marker([lat, lng], {
        icon: L.divIcon({ className:'', html:'<div class="user-dot"></div>', iconSize:[18,18], iconAnchor:[9,9] })
      }).addTo(map);
    } else {
      userMarker.setLatLng([lat, lng]);
    }
    if (firstFix) {
      map.setView([lat, lng], 16, { animate:false });
      firstFix = false;
    }
  }

  function setDest(lat, lng, name) {
    if (!destMarker) {
      destMarker = L.marker([lat, lng], {
        icon: L.divIcon({ className:'', html:'<div class="dest-dot"></div>', iconSize:[14,14], iconAnchor:[7,7] })
      }).addTo(map);
    } else {
      destMarker.setLatLng([lat, lng]);
    }
    if (name) destMarker.bindTooltip(name, { permanent:false, direction:'top' });
  }

  function clearDest() {
    if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
  }

  function setRoute(coords) {
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    if (!coords || coords.length < 2) return;
    routeLine = L.polyline(coords, { color:'#22c55e', weight:4, opacity:0.85 }).addTo(map);
  }

  function fitAll() {
    var b = [];
    if (userMarker) b.push(userMarker.getLatLng());
    if (destMarker) b.push(destMarker.getLatLng());
    if (routeLine) b = b.concat(routeLine.getLatLngs());
    if (b.length >= 2) map.fitBounds(L.latLngBounds(b).pad(0.25));
  }

  document.addEventListener('message', handle);
  window.addEventListener('message', handle);
  function handle(e) {
    try {
      var msg = JSON.parse(e.data);
      if (msg.type === 'user') setUser(msg.lat, msg.lng);
      if (msg.type === 'dest') {
        if (msg.lat == null) clearDest();
        else setDest(msg.lat, msg.lng, msg.name);
      }
      if (msg.type === 'route') setRoute(msg.coords);
      if (msg.type === 'fit') fitAll();
    } catch (err) {}
  }
</script>
</body>
</html>
    `,
    [], // intentionally stable — updates flow via postMessage
  );

  // Push user position as it changes
  useEffect(() => {
    if (!user) return;
    send({ type: 'user', lat: user.lat, lng: user.lng });
  }, [user?.lat, user?.lng]);

  // Push destination changes (or clear)
  useEffect(() => {
    if (!destination) {
      send({ type: 'dest', lat: null, lng: null });
      return;
    }
    send({
      type: 'dest',
      lat: destination.lat,
      lng: destination.lng,
      name: destinationName ?? null,
    });
  }, [destination?.lat, destination?.lng, destinationName]);

  // Push route polyline
  useEffect(() => {
    if (!route || route.length < 2) return;
    send({ type: 'route', coords: route.map((p) => [p.lat, p.lng]) });
    send({ type: 'fit' });
  }, [route]);

  return (
    <View style={{ height, borderRadius: 16, overflow: 'hidden' }}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        style={{ backgroundColor: '#0d1b2e' }}
        onLoadEnd={() => {
          // Leaflet + script tags are parsed/executed by the time onLoadEnd
          // fires. Now any messages queued during early renders can be
          // delivered safely.
          readyRef.current = true;
          flushQueue();
        }}
      />
    </View>
  );
};

export default MonitoringMap;
