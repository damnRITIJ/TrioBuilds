/**
 * StubbleWatch — app.js
 * Fetches snapshot.json from S3, renders Leaflet map with fire clusters,
 * wind arrows, risk banner, advisory, and language toggle.
 */

// ── Config ────────────────────────────────────────────────────────────────────
const CONFIG = {
  // Replace with your actual API Gateway URL after deployment
  apiUrl: "http://127.0.0.1:3000/score",

  //ONLY USE snapshot.json FOR DEMO/LOCALHOST, LEAVE EMPTY WHEN DEPLOYED
  //   replayUrl: "../snapshot.json",    
  replayUrl: "",

  defaultTarget: { lat: 28.6139, lon: 77.2090, name: "Delhi NCR" },
  mapCenter: [29.5, 75.5],
  mapZoom: 7,
};

// ── State ─────────────────────────────────────────────────────────────────────
let currentLang = "en";
let currentAdvisory = { en: "", hi: "" };

// ── Map Init ──────────────────────────────────────────────────────────────────
const map = L.map("map", {
  center: CONFIG.mapCenter,
  zoom: CONFIG.mapZoom,
  zoomControl: true,
});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
  maxZoom: 13,
}).addTo(map);

// Target marker (starts at Delhi)
let targetMarker = L.circleMarker([CONFIG.defaultTarget.lat, CONFIG.defaultTarget.lon], {
  radius: 10,
  color: "#58a6ff",
  fillColor: "#58a6ff",
  fillOpacity: 0.9,
  weight: 2,
})
  .addTo(map)
  .bindPopup(`<b>${CONFIG.defaultTarget.name}</b><br>Target location`);

let currentTarget = { ...CONFIG.defaultTarget };

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert Leaflet bearing (degrees) to an arrow character for wind display.
 * The bearing here is where the SMOKE is GOING (wind_direction + 180).
 */
function bearingToArrow(deg) {
  const dirs = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
  return dirs[Math.round(deg / 45) % 8];
}

/** Format a float to 1 decimal place with a unit string. */
function fmt(val, unit = "") {
  return val != null ? `${Number(val).toFixed(1)}${unit}` : "N/A";
}

/** Parse ISO timestamp and return a human-readable local string. */
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

// ── Map Layers ────────────────────────────────────────────────────────────────
const clusterLayerGroup = L.layerGroup().addTo(map);
const lineLayerGroup = L.layerGroup().addTo(map);

/**
 * Render all clusters onto the map.
 * Upwind clusters get a red pulsing marker; others get amber.
 * Upwind clusters also get a dashed line drawn to Delhi.
 */
function renderClusters(clusters) {
  clusterLayerGroup.clearLayers();
  lineLayerGroup.clearLayers();

  clusters.forEach((c) => {
    const isUpwind = c.is_upwind;
    const color = isUpwind ? "#f85149" : "#e3b341";
    const radius = Math.min(6 + Math.sqrt(c.total_frp) * 0.5, 22);

    // Smoke heading arrow (wind_direction + 180)
    const smokeHeading = (c.wind_direction_deg + 180) % 360;
    const arrow = bearingToArrow(smokeHeading);

    const marker = L.circleMarker([c.lat, c.lon], {
      radius,
      color,
      fillColor: color,
      fillOpacity: isUpwind ? 0.75 : 0.45,
      weight: isUpwind ? 2 : 1,
    });

    // Popup
    const popup = `
      <div class="popup-title">${isUpwind ? "🔴 Upwind Cluster" : "🟡 Fire Cluster"}</div>
      <div class="popup-row"><span>FRP (intensity)</span><span>${fmt(c.total_frp)} MW</span></div>
      <div class="popup-row"><span>Wind</span><span>${fmt(c.wind_speed_kmh)} km/h ${arrow}</span></div>
      <div class="popup-row"><span>Distance to Delhi</span><span>${fmt(c.distance_km)} km</span></div>
      ${isUpwind ? `<div class="popup-row"><span>Est. arrival</span><span>${fmt(c.arrival_hrs)} hrs</span></div>` : ""}
    `;
    marker.bindPopup(popup);
    clusterLayerGroup.addLayer(marker);

    // Dashed line to target for upwind clusters
    if (isUpwind) {
      const line = L.polyline(
        [[c.lat, c.lon], [currentTarget.lat, currentTarget.lon]],
        { color, weight: 1.5, dashArray: "6 6", opacity: 0.6 }
      );
      lineLayerGroup.addLayer(line);
    }
  });
}

// ── UI Updates ────────────────────────────────────────────────────────────────

/** Update the risk banner element based on risk level. */
function updateRiskBanner(risk, clusters) {
  const banner = document.getElementById("risk-banner");
  const icon = document.getElementById("risk-icon");
  const label = document.getElementById("risk-label");
  const detail = document.getElementById("risk-detail");

  const upwind = clusters.filter((c) => c.is_upwind);
  const nearest = upwind.length
    ? upwind.reduce((a, b) => (a.distance_km < b.distance_km ? a : b))
    : null;

  banner.className = `risk-${risk.toLowerCase()}`;

  const icons = { High: "🔴", Moderate: "🟡", Low: "🟢" };
  icon.textContent = icons[risk] || "⚪";
  label.textContent = `${risk} Risk — ${upwind.length} upwind fire cluster${upwind.length !== 1 ? "s" : ""} detected`;
  detail.textContent = nearest
    ? `Nearest: ${fmt(nearest.distance_km)} km away · Est. arrival: ${fmt(nearest.arrival_hrs)} hrs`
    : "No upwind clusters detected. Air quality risk from stubble burning is low.";
}

/** Set the advisory text in the currently selected language. */
function updateAdvisory() {
  document.getElementById("advisory-text").textContent =
    currentAdvisory[currentLang] || "No advisory available.";
}

/** Update the last-updated timestamp in the top bar. */
function updateTimestamp(iso) {
  document.getElementById("last-updated").textContent = `Updated: ${fmtTime(iso)}`;
}

// ── Language Toggle ───────────────────────────────────────────────────────────

window.setLang = function (lang) {
  currentLang = lang;
  document.getElementById("btn-en").classList.toggle("active", lang === "en");
  document.getElementById("btn-hi").classList.toggle("active", lang === "hi");
  updateAdvisory();
};

// ── Data Fetch ────────────────────────────────────────────────────────────────

async function loadRiskData(lat, lon, cityName) {
  // Update UI State
  currentTarget = { lat, lon, name: cityName };
  targetMarker.setLatLng([lat, lon]);
  targetMarker.bindPopup(`<b>${cityName}</b><br>Target location`).openPopup();
  document.getElementById("risk-label").textContent = "Loading data from NASA & AWS...";

  // Build API URL
  let url = CONFIG.replayUrl || `${CONFIG.apiUrl}?lat=${lat}&lon=${lon}&city=${encodeURIComponent(cityName)}`;
  const isReplay = !!CONFIG.replayUrl;

  try {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    renderClusters(data.all_clusters || []);
    updateRiskBanner(data.risk_level, data.all_clusters || []);
    currentAdvisory = data.advisory || { en: "", hi: "" };
    updateAdvisory();
    updateTimestamp(data.timestamp);

    if (isReplay) {
      document.getElementById("replay-banner").style.display = "block";
    }
  } catch (err) {
    console.error("Failed to load data:", err);
    document.getElementById("risk-label").textContent = "⚠ Could not load data";
    document.getElementById("risk-detail").textContent = err.message;
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
loadRiskData(CONFIG.defaultTarget.lat, CONFIG.defaultTarget.lon, CONFIG.defaultTarget.name);

// Handle Map Clicks
map.on("click", (e) => {
  loadRiskData(e.latlng.lat, e.latlng.lng, "Selected Location");
});

// Auto-refresh every 10 minutes (for the current target)
setInterval(() => {
  loadRiskData(currentTarget.lat, currentTarget.lon, currentTarget.name);
}, 10 * 60 * 1000);
