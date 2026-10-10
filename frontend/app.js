/**
 * StubbleWatch — app.js
 * Environmental intelligence platform controller with live OpenStreetMap street view,
 * thermal heat signatures, flowing vector streams, and Amazon SNS integration.
 */

// ── Global Configuration & State ─────────────────────────────────────────────
const CONFIG = {
  snapshotUrl: "./snapshot.json",
  delhi: { lat: 28.6139, lon: 77.2090 },
  mapCenter: [29.65, 75.60],
  mapZoom: 7,
};

// Regional sectors for Punjab / Haryana agricultural fire corridors
const SECTOR_NAMES = [
  { lat: 30.2, lon: 74.5, name: "Bathinda Sector, Punjab" },
  { lat: 30.1, lon: 74.6, name: "Mansa Sector, Punjab" },
  { lat: 29.8, lon: 75.0, name: "Sirsa Sector, Haryana" },
  { lat: 29.5, lon: 75.4, name: "Fatehabad Sector, Haryana" },
  { lat: 29.3, lon: 76.1, name: "Jind Sector, Haryana" },
  { lat: 29.0, lon: 76.5, name: "Rohtak Sector, Haryana" },
  { lat: 28.9, lon: 76.8, name: "Sonipat Sector, Haryana" },
  { lat: 28.8, lon: 77.0, name: "Bawana / Delhi Border" },
  { lat: 30.5, lon: 74.8, name: "Ludhiana Sector, Punjab" },
  { lat: 30.3, lon: 75.8, name: "Sangrur Sector, Punjab" },
];

let currentLang = "en";
let currentGuidanceTab = "citizens";
let currentSnapshotData = null;
let selectedCluster = null;
let hudCollapsed = false;

// ── Map Initialization (100% Reliable Live OpenStreetMap Street View) ────────
const map = L.map("map", {
  center: CONFIG.mapCenter,
  zoom: CONFIG.mapZoom,
  zoomControl: false,
});

// Position zoom controls in bottom-left
L.control.zoom({ position: "bottomleft" }).addTo(map);

// OpenStreetMap Live Street View (Standard Tile Service — No {r} bugs)
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 18,
}).addTo(map);

// Dynamic layer groups
const clusterLayerGroup = L.layerGroup().addTo(map);
const trajectoryLayerGroup = L.layerGroup().addTo(map);
const highlightLayerGroup = L.layerGroup().addTo(map);

// ── Render Delhi NCR Target Receptor Beacon ───────────────────────────────────
function renderDelhiMarker() {
  const delhiIcon = L.divIcon({
    className: "delhi-reticle-wrap",
    html: `
      <div class="delhi-radar-sweep"></div>
      <div class="delhi-bullseye"></div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });

  L.marker([CONFIG.delhi.lat, CONFIG.delhi.lon], { icon: delhiIcon })
    .addTo(map)
    .bindPopup(`
      <div class="p-1">
        <div class="font-bold text-sm text-sky-400 mb-1 flex items-center gap-1.5">
          <span>🏛️</span>
          <span>Delhi NCR Airspace</span>
        </div>
        <div class="text-xs text-slate-300 leading-relaxed">
          <strong>Primary Target Receptor</strong><br>
          Coordinates: 28.61° N · 77.21° E<br>
          <span class="text-red-400 font-semibold">⚠️ Real-Time Threat Watch Active</span>
        </div>
      </div>
    `);
}

renderDelhiMarker();

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(val, unit = "") {
  return val != null ? `${Number(val).toFixed(1)}${unit}` : "N/A";
}

function bearingToArrow(deg) {
  const dirs = ["↑ N", "↗ NE", "→ E", "↘ SE", "↓ S", "↙ SW", "← W", "↖ NW"];
  return dirs[Math.round(deg / 45) % 8];
}

function fmtTimestamp(iso) {
  if (!iso) return "Just now";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function getSectorName(lat, lon, idx) {
  let closest = SECTOR_NAMES[idx % SECTOR_NAMES.length];
  let minD = 999;
  for (const s of SECTOR_NAMES) {
    const d = Math.hypot(s.lat - lat, s.lon - lon);
    if (d < minD) {
      minD = d;
      closest = s;
    }
  }
  return closest.name;
}

// ── Render Thermal Fire Signatures on Map ─────────────────────────────────────
function renderClusters(clusters) {
  clusterLayerGroup.clearLayers();
  trajectoryLayerGroup.clearLayers();

  clusters.forEach((c, idx) => {
    const isUpwind = c.is_upwind;
    const sectorName = getSectorName(c.lat, c.lon, idx);
    c.sectorName = sectorName;

    const frpInt = Math.round(c.total_frp || 45);
    const smokeHeading = (c.wind_direction_deg + 180) % 360;
    const arrow = bearingToArrow(smokeHeading);

    // Custom HTML Thermal Marker
    const markerHtml = `
      <div class="thermal-marker-wrap">
        ${isUpwind ? '<div class="thermal-heat-halo"></div>' : ""}
        <div class="thermal-core-badge ${isUpwind ? "" : "lateral-badge"}">
          <span>${isUpwind ? "🔥" : "🌾"}</span>
          <span>${frpInt}MW</span>
        </div>
      </div>
    `;

    const customIcon = L.divIcon({
      className: "",
      html: markerHtml,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    });

    const marker = L.marker([c.lat, c.lon], { icon: customIcon });

    // Click handler for inspector
    marker.on("click", () => inspectCluster(c, idx));

    // Rich popup
    const popupHtml = `
      <div class="p-1 space-y-1.5 min-w-[210px]">
        <div class="font-bold text-xs ${isUpwind ? "text-red-400" : "text-amber-400"} flex items-center gap-1">
          <span>${isUpwind ? "🔴 Direct Upwind Threat" : "🟡 Lateral Burning Front"}</span>
        </div>
        <div class="text-xs font-semibold text-white">
          📍 ${sectorName}
        </div>
        <div class="flex justify-between text-[11px] text-slate-300 pt-1 border-t border-slate-800">
          <span>Thermal Energy (FRP):</span>
          <strong class="text-white">${fmt(c.total_frp)} MW</strong>
        </div>
        <div class="flex justify-between text-[11px] text-slate-300">
          <span>Distance to Delhi:</span>
          <strong class="text-white">${fmt(c.distance_km)} km</strong>
        </div>
        <div class="flex justify-between text-[11px] text-slate-300">
          <span>Wind Vector:</span>
          <strong class="text-white">${fmt(c.wind_speed_kmh)} km/h · ${arrow}</strong>
        </div>
        ${isUpwind ? `
          <div class="flex justify-between text-xs text-sky-400 font-bold bg-sky-950/40 p-1.5 rounded border border-sky-800/40 mt-1">
            <span>Est. Arrival:</span>
            <span>~${fmt(c.arrival_hrs)} hours</span>
          </div>
        ` : ""}
        <div class="text-[10px] text-slate-400 text-center pt-1">
          Click marker to open side telemetry
        </div>
      </div>
    `;
    marker.bindPopup(popupHtml);
    clusterLayerGroup.addLayer(marker);

    // Flowing animated trajectory stream toward Delhi for upwind fires
    if (isUpwind) {
      const line = L.polyline(
        [[c.lat, c.lon], [CONFIG.delhi.lat, CONFIG.delhi.lon]],
        {
          color: "#ef4444",
          weight: 2.5,
          dashArray: "8, 12",
          className: "flowing-smoke-vector",
          opacity: 0.8,
        }
      );
      trajectoryLayerGroup.addLayer(line);
    }
  });

  renderSectorsList(clusters);
}

// ── Render Active Sectors List (Flightradar Style) ────────────────────────────
function renderSectorsList(clusters) {
  const container = document.getElementById("sectors-list");
  container.innerHTML = "";

  const upwindClusters = clusters.filter((c) => c.is_upwind);
  document.getElementById("sectors-count").textContent = `${upwindClusters.length} UPWIND`;

  clusters.forEach((c, idx) => {
    const isUpwind = c.is_upwind;
    const row = document.createElement("div");
    row.className = "flex items-center justify-between p-2 rounded-lg bg-slate-900/60 hover:bg-slate-800/90 border border-border/40 cursor-pointer transition-all";
    row.innerHTML = `
      <div class="flex flex-col">
        <span class="text-xs font-semibold text-white leading-tight">${c.sectorName || `Sector #${idx + 1}`}</span>
        <span class="text-[10px] text-muted-foreground">${fmt(c.distance_km)} km · ${fmt(c.wind_speed_kmh)} km/h NW</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-xs font-bold ${isUpwind ? "text-red-400" : "text-amber-400"}">${Math.round(c.total_frp)} MW</span>
        <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded ${isUpwind ? "bg-red-500/20 text-red-300" : "bg-slate-800 text-muted-foreground"}">
          ${isUpwind ? `ETA ${fmt(c.arrival_hrs)}h` : "Lateral"}
        </span>
      </div>
    `;

    // Click row to fly smoothly to that cluster
    row.onclick = () => {
      map.flyTo([c.lat, c.lon], 9, { duration: 1.2 });
      inspectCluster(c, idx);
    };

    container.appendChild(row);
  });
}

// ── Cluster Inspector Drawer Logic ────────────────────────────────────────────
function inspectCluster(c, idx) {
  selectedCluster = c;
  const inspector = document.getElementById("cluster-inspector");
  inspector.classList.remove("translate-x-[400px]");

  const isUpwind = c.is_upwind;
  const statusBadge = document.getElementById("inspector-upwind-status");
  statusBadge.textContent = isUpwind ? "DIRECT UPWIND THREAT" : "LATERAL (DIVERGENT WIND)";
  statusBadge.className = isUpwind
    ? "inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-red-500/20 text-red-400 border border-red-500/30"
    : "inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30";

  document.getElementById("insp-sector-name").textContent = c.sectorName || "Northern Belt Sector";
  document.getElementById("insp-coords").textContent = `${c.lat.toFixed(2)}° N, ${c.lon.toFixed(2)}° E`;
  document.getElementById("insp-frp").textContent = `${fmt(c.total_frp)} MW`;
  document.getElementById("insp-distance").textContent = `${fmt(c.distance_km)} km`;

  const smokeHeading = (c.wind_direction_deg + 180) % 360;
  document.getElementById("insp-wind").textContent = `${fmt(c.wind_speed_kmh)} km/h · ${bearingToArrow(smokeHeading)}`;
  document.getElementById("insp-arrival").textContent = isUpwind ? `~${fmt(c.arrival_hrs)} hours` : "Divergent from Delhi";

  // Highlight selected cluster
  highlightLayerGroup.clearLayers();
  const highlight = L.circleMarker([c.lat, c.lon], {
    radius: 28,
    color: "#38bdf8",
    fillColor: "#38bdf8",
    fillOpacity: 0.15,
    weight: 2,
    dashArray: "4, 4",
  });
  highlightLayerGroup.addLayer(highlight);
}

window.closeInspector = function () {
  document.getElementById("cluster-inspector").classList.add("translate-x-[400px]");
  highlightLayerGroup.clearLayers();
  selectedCluster = null;
};

window.focusClusterPath = function () {
  if (!selectedCluster) return;
  const bounds = L.latLngBounds(
    [selectedCluster.lat, selectedCluster.lon],
    [CONFIG.delhi.lat, CONFIG.delhi.lon]
  );
  map.fitBounds(bounds, { padding: [80, 80], maxZoom: 9 });
};

// ── Quick Map Controls (Bottom-Left) ──────────────────────────────────────────
window.resetToDelhiView = function () {
  map.flyTo([CONFIG.delhi.lat, CONFIG.delhi.lon], 9, { duration: 1.2 });
};

window.fitAllClustersView = function () {
  if (!currentSnapshotData || !currentSnapshotData.all_clusters) return;
  const points = currentSnapshotData.all_clusters.map((c) => [c.lat, c.lon]);
  points.push([CONFIG.delhi.lat, CONFIG.delhi.lon]);
  map.fitBounds(L.latLngBounds(points), { padding: [70, 70] });
};

// ── HUD Minimize / Expand ─────────────────────────────────────────────────────
window.toggleHUD = function () {
  hudCollapsed = !hudCollapsed;
  const hud = document.getElementById("mission-hud");
  const btn = document.getElementById("hud-toggle-btn");
  if (hudCollapsed) {
    hud.classList.add("-translate-x-[420px]");
    btn.innerHTML = '<i data-lucide="chevron-right" class="w-3.5 h-3.5"></i><span>Show HUD</span>';
  } else {
    hud.classList.remove("-translate-x-[420px]");
    btn.innerHTML = '<i data-lucide="chevron-left" class="w-3.5 h-3.5"></i><span>Minimize HUD</span>';
  }
  if (window.lucide) lucide.createIcons();
};

// ── Update Telemetry & Mission Control HUD ────────────────────────────────────
function updateMissionHUD(data) {
  const risk = data.risk_level || "Low";
  const clusters = data.all_clusters || [];
  const upwind = clusters.filter((c) => c.is_upwind);
  const nearest = upwind.length
    ? upwind.reduce((a, b) => (a.distance_km < b.distance_km ? a : b))
    : null;

  // 1. Update Threat Hero Card & Topbar Ticker
  const threatCard = document.getElementById("threat-card");
  const badgeText = document.getElementById("threat-badge-text");
  const etaText = document.getElementById("threat-eta-text");
  const headline = document.getElementById("threat-headline");
  const subtext = document.getElementById("threat-subtext");

  const tickerBadge = document.getElementById("ticker-badge");
  const tickerText = document.getElementById("ticker-text");

  if (risk === "High") {
    threatCard.className = "rounded-xl border border-red-500/40 bg-slate-950/90 backdrop-blur-md p-4 shadow-xl text-card-foreground";
    badgeText.textContent = "CRITICAL THREAT";
    badgeText.className = "px-2.5 py-0.5 rounded text-[11px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 uppercase tracking-wider";
    etaText.textContent = nearest ? `ETA: ~${fmt(nearest.arrival_hrs)} HRS` : "IMMINENT ARRIVAL";
    headline.textContent = "Severe Smoke Drift Toward Delhi NCR";
    subtext.textContent = `Prevailing northwest wind corridor (315° NW) is actively channeling smoke from ${upwind.length} upwind fire clusters into Delhi NCR.`;

    tickerBadge.textContent = "CRITICAL";
    tickerBadge.className = "px-2 py-0.5 rounded text-[11px] font-bold bg-red-600 text-white uppercase tracking-wider";
    tickerText.textContent = `${upwind.length} Upwind Clusters Detected · Smoke ETA: ~${nearest ? fmt(nearest.arrival_hrs) : 1.3} hrs to Delhi NCR`;
  } else if (risk === "Moderate") {
    threatCard.className = "rounded-xl border border-amber-500/40 bg-slate-950/90 backdrop-blur-md p-4 shadow-xl text-card-foreground";
    badgeText.textContent = "MODERATE WATCH";
    badgeText.className = "px-2.5 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-wider";
    etaText.textContent = nearest ? `ETA: ~${fmt(nearest.arrival_hrs)} HRS` : "WATCH ADVISORY";
    headline.textContent = "Elevated Smoke Trajectory Detected";
    subtext.textContent = "Moderate fire activity detected upwind. Continuous atmospheric vector monitoring in effect.";

    tickerBadge.textContent = "ELEVATED";
    tickerBadge.className = "px-2 py-0.5 rounded text-[11px] font-bold bg-amber-600 text-white uppercase tracking-wider";
    tickerText.textContent = `${upwind.length} Upwind Clusters · Elevated Risk Protocol Active`;
  } else {
    threatCard.className = "rounded-xl border border-emerald-500/40 bg-slate-950/90 backdrop-blur-md p-4 shadow-xl text-card-foreground";
    badgeText.textContent = "NORMAL PARAMETERS";
    badgeText.className = "px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider";
    etaText.textContent = "AIRSPACE CLEAR";
    headline.textContent = "Minimal Smoke Drift Toward Delhi";
    subtext.textContent = "Favorable wind directions or calm fire activity. Atmospheric dispersion parameters stable.";

    tickerBadge.textContent = "CLEAR";
    tickerBadge.className = "px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-600 text-white uppercase tracking-wider";
    tickerText.textContent = "Delhi Airspace Clear · 0 Upwind Fire Threats";
  }

  // 2. Telemetry Chips
  document.getElementById("val-upwind-count").innerHTML = `${upwind.length} <span class="text-xs font-normal text-muted-foreground">clusters</span>`;
  document.getElementById("val-upwind-sub").textContent = `Out of ${clusters.length} regional`;

  document.getElementById("val-nearest-dist").innerHTML = `${nearest ? fmt(nearest.distance_km) : "—"} <span class="text-xs font-normal text-muted-foreground">km</span>`;

  const avgSpeed = clusters.length
    ? clusters.reduce((acc, c) => acc + (c.wind_speed_kmh || 0), 0) / clusters.length
    : 22;
  document.getElementById("val-wind-speed").innerHTML = `${fmt(avgSpeed)} <span class="text-xs font-normal text-muted-foreground">km/h</span>`;

  const totalFrp = clusters.reduce((acc, c) => acc + (c.total_frp || 0), 0);
  document.getElementById("val-total-frp").innerHTML = `${fmt(totalFrp)} <span class="text-xs font-normal text-muted-foreground">MW</span>`;

  // 3. Advisory & Guidance Display
  updateAdvisoryDisplay();
  updateGuidanceDisplay(risk);
}

// ── Advisory & Guidance Checklist Display ─────────────────────────────────────
function updateAdvisoryDisplay() {
  if (!currentSnapshotData || !currentSnapshotData.advisory) return;
  const adv = currentSnapshotData.advisory;
  const content = adv[currentLang] || adv.en || "Advisory updating…";
  document.getElementById("advisory-content").textContent = content;
}

window.switchGuidance = function (tab) {
  currentGuidanceTab = tab;
  const btnCitizens = document.getElementById("tab-citizens");
  const btnAuth = document.getElementById("tab-authorities");

  if (tab === "citizens") {
    btnCitizens.className = "text-xs font-semibold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded";
    btnAuth.className = "text-xs font-semibold text-muted-foreground hover:text-white px-2 py-0.5 rounded";
  } else {
    btnAuth.className = "text-xs font-semibold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded";
    btnCitizens.className = "text-xs font-semibold text-muted-foreground hover:text-white px-2 py-0.5 rounded";
  }

  const risk = currentSnapshotData ? currentSnapshotData.risk_level : "High";
  updateGuidanceDisplay(risk);
};

function updateGuidanceDisplay(risk) {
  const container = document.getElementById("guidance-body");
  if (currentGuidanceTab === "citizens") {
    if (risk === "High") {
      container.innerHTML = `
        <div class="flex items-start gap-1.5"><span class="text-sky-400">•</span><span><strong>Wear N95/FFP2 Respirators:</strong> Essential for outdoor commutes in NCR.</span></div>
        <div class="flex items-start gap-1.5"><span class="text-sky-400">•</span><span><strong>Indoor Air Filtration:</strong> Run HEPA purifiers continuously and keep windows sealed.</span></div>
        <div class="flex items-start gap-1.5"><span class="text-sky-400">•</span><span><strong>Children & Elderly:</strong> Suspend morning outdoor exercises.</span></div>
      `;
    } else {
      container.innerHTML = `
        <div class="flex items-start gap-1.5"><span class="text-sky-400">•</span><span><strong>Normal Daily Activity:</strong> Ambient smoke levels from stubble burning remain low.</span></div>
        <div class="flex items-start gap-1.5"><span class="text-sky-400">•</span><span><strong>Early Warning Alerts:</strong> Keep email alerts active for pre-emptive wind shift warnings.</span></div>
      `;
    }
  } else {
    if (risk === "High") {
      container.innerHTML = `
        <div class="flex items-start gap-1.5"><span class="text-sky-400">•</span><span><strong>GRAP Stage III/IV Deployment:</strong> Mobilize high-capacity mist sprayers and water cannons.</span></div>
        <div class="flex items-start gap-1.5"><span class="text-sky-400">•</span><span><strong>Construction Stoppage:</strong> Enforce dust curbs at active sites across NCR.</span></div>
        <div class="flex items-start gap-1.5"><span class="text-sky-400">•</span><span><strong>Hospital Preparedness:</strong> Alert pulmonary emergency teams across Delhi hospitals.</span></div>
      `;
    } else {
      container.innerHTML = `
        <div class="flex items-start gap-1.5"><span class="text-sky-400">•</span><span><strong>Automated Sweeps:</strong> Continue automated 2-hour satellite passes and wind vector calculations.</span></div>
        <div class="flex items-start gap-1.5"><span class="text-sky-400">•</span><span><strong>Interstate Coordination:</strong> Maintain real-time coordination with Punjab and Haryana taskforces.</span></div>
      `;
    }
  }
}

// ── Language Toggle (EN / हिन्दी) ─────────────────────────────────────────────
window.setLang = function (lang) {
  currentLang = lang;
  const btnEn = document.getElementById("btn-en");
  const btnHi = document.getElementById("btn-hi");

  if (lang === "en") {
    btnEn.className = "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-2.5 py-1 text-xs font-semibold ring-offset-background transition-all bg-sky-500 text-slate-950 shadow-sm";
    btnHi.className = "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-2.5 py-1 text-xs font-semibold ring-offset-background transition-all text-muted-foreground hover:text-white";
  } else {
    btnHi.className = "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-2.5 py-1 text-xs font-semibold ring-offset-background transition-all bg-sky-500 text-slate-950 shadow-sm";
    btnEn.className = "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-2.5 py-1 text-xs font-semibold ring-offset-background transition-all text-muted-foreground hover:text-white";
  }

  updateAdvisoryDisplay();
};

// ── Refresh Pipeline Data ─────────────────────────────────────────────────────
window.refreshPipelineData = async function () {
  const btn = document.getElementById("btn-refresh");
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Syncing…</span>';
  if (window.lucide) lucide.createIcons();

  try {
    const resp = await fetch("/api/refresh", { method: "POST" });
    if (resp.ok) {
      await loadSnapshot();
    }
  } catch (err) {
    console.warn("API refresh fallback to direct fetch:", err);
    await loadSnapshot();
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i><span>Sync</span>';
    if (window.lucide) lucide.createIcons();
  }
};

// ── Email Subscription Modal & AWS SNS Integration ────────────────────────────
window.openSubscribeModal = function () {
  const modal = document.getElementById("subscribe-modal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.getElementById("subscribe-result").classList.add("hidden");
  if (window.lucide) lucide.createIcons();
};

window.closeSubscribeModal = function () {
  const modal = document.getElementById("subscribe-modal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
};

window.handleSubscribeSubmit = async function (e) {
  e.preventDefault();
  const emailInput = document.getElementById("sub-email");
  const roleSelect = document.getElementById("sub-role");
  const thresholdSelect = document.getElementById("sub-threshold");
  const submitBtn = document.getElementById("btn-submit-sub");
  const resultDiv = document.getElementById("subscribe-result");

  const email = emailInput.value.trim();
  const role = roleSelect.value;
  const threshold = thresholdSelect.value;

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Registering with AWS SNS…</span>';
  if (window.lucide) lucide.createIcons();

  try {
    const resp = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role, threshold }),
    });
    const res = await resp.json();

    resultDiv.classList.remove("hidden");
    if (res.success) {
      resultDiv.className = "p-3 rounded-lg text-xs leading-relaxed bg-emerald-950/40 border border-emerald-800/60 text-emerald-300";
      resultDiv.innerHTML = `
        <strong>✅ Verification Link Dispatched!</strong><br>
        ${res.message}<br>
        <span class="text-[11px] text-emerald-400 mt-1 block">Topic: ${res.topic || "Amazon SNS TrioBuild"}</span>
      `;
      emailInput.value = "";
    } else {
      resultDiv.className = "p-3 rounded-lg text-xs leading-relaxed bg-red-950/40 border border-red-800/60 text-red-300";
      resultDiv.textContent = `⚠ Subscription Notice: ${res.error || "Please verify AWS credentials."}`;
    }
  } catch (err) {
    resultDiv.classList.remove("hidden");
    resultDiv.className = "p-3 rounded-lg text-xs leading-relaxed bg-red-950/40 border border-red-800/60 text-red-300";
    resultDiv.textContent = `⚠ Network Error: ${err.message}`;
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = "Activate Warnings";
  }
};

// ── Instant Test Alert Trigger via SNS ─────────────────────────────────────────
window.triggerTestAlert = async function () {
  const btn = document.getElementById("btn-test-alert");
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Dispatched…</span>';
  if (window.lucide) lucide.createIcons();

  try {
    const resp = await fetch("/api/test-alert", { method: "POST" });
    const res = await resp.json();
    if (res.success) {
      alert("🚨 Amazon SNS Early Warning Broadcast Dispatched!\n\n" + res.message);
    } else {
      alert("⚠ Test Alert Notice:\n" + (res.error || "Check AWS credentials"));
    }
  } catch (err) {
    alert("⚠ Request error: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="zap" class="w-3.5 h-3.5 text-amber-400"></i><span>Test Alert</span>';
    if (window.lucide) lucide.createIcons();
  }
};

// ── Load & Synchronize Snapshot Data ──────────────────────────────────────────
async function loadSnapshot() {
  const sources = [
    { url: "./snapshot.json" },
    { url: CONFIG.snapshotUrl },
  ];

  let data = null;
  for (const src of sources) {
    try {
      const resp = await fetch(src.url, { cache: "no-store" });
      if (resp.ok) {
        data = await resp.json();
        break;
      }
    } catch (e) {
      // try next source
    }
  }

  if (data) {
    currentSnapshotData = data;
    renderClusters(data.all_clusters || []);
    updateMissionHUD(data);
    document.getElementById("last-updated").textContent = `Synced: ${fmtTimestamp(data.timestamp)}`;

    // Automatically inspect closest upwind cluster if none is selected
    const upwind = (data.all_clusters || []).filter((c) => c.is_upwind);
    if (upwind.length && !selectedCluster) {
      const nearest = upwind.reduce((a, b) => (a.distance_km < b.distance_km ? a : b));
      inspectCluster(nearest, 0);
    }
  }

  if (window.lucide) lucide.createIcons();
}

// ── Bootstrapping ─────────────────────────────────────────────────────────────
loadSnapshot();

// Auto-refresh snapshot every 2 minutes
setInterval(loadSnapshot, 2 * 60 * 1000);
