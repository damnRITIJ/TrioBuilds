import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './components/ui/card'
import { Badge } from './components/ui/badge'
import { Flame, MapPin, AlertTriangle, ShieldCheck, Mail, RefreshCw, Zap, X, CheckCircle2 } from 'lucide-react'

// Fix leaflet marker icon issue in React
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})

// Dynamically use current hostname so mobile devices accessing via LAN can connect to the backend API port 3000
const API_HOST = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : '127.0.0.1'
const API_URL = `http://${API_HOST}:3000/score`

function MapClickHandler({ setTarget, onSelect }: { setTarget: (target: any) => void, onSelect?: () => void }) {
  useMapEvents({
    click(e) {
      setTarget({ lat: e.latlng.lat, lon: e.latlng.lng, name: "Selected Location" })
      if (onSelect) onSelect()
    },
  })
  return null
}

function bearingToArrow(deg: number) {
  const dirs = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"]
  return dirs[Math.round(deg / 45) % 8]
}

export default function App() {
  const [target, setTarget] = useState<{ lat: number; lon: number; name: string } | null>(null)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lang, setLang] = useState<"en" | "hi">("en")
  const [advisoryTab, setAdvisoryTab] = useState<"citizens" | "authorities">("citizens")
  const [subscribing, setSubscribing] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailInput, setEmailInput] = useState("")
  const [subscribeStatus, setSubscribeStatus] = useState<"idle"|"success"|"error">("idle")
  const [mobileCardOpen, setMobileCardOpen] = useState(false)
  const [showLocationModal, setShowLocationModal] = useState(true)

  const PRESET_LOCATIONS = [
    { name: "Delhi NCR", lat: 28.6139, lon: 77.2090, desc: "Capital Region (High Impact Zone)" },
    { name: "Amritsar", lat: 31.6340, lon: 74.8723, desc: "Majha Region, Punjab" },
    { name: "Ludhiana", lat: 30.9010, lon: 75.8573, desc: "Industrial Hub, Punjab" },
    { name: "Karnal", lat: 29.6857, lon: 76.9905, desc: "GT Road Belt, Haryana" },
    { name: "Chandigarh", lat: 30.7333, lon: 76.7794, desc: "Capital Belt" },
    { name: "Bathinda", lat: 30.2110, lon: 74.9455, desc: "Malwa Region, Punjab" },
  ]

  const selectTargetLocation = (loc: { lat: number; lon: number; name: string }) => {
    setTarget(loc)
    setShowLocationModal(false)
    setMobileCardOpen(true)
  }

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!emailInput) return
    setSubscribing(true)
    setSubscribeStatus("idle")
    try {
      const res = await fetch(`${API_URL}?action=subscribe&email=${encodeURIComponent(emailInput)}`)
      if (res.ok) {
        setSubscribeStatus("success")
        setTimeout(() => {
          setShowEmailModal(false)
          setEmailInput("")
          setSubscribeStatus("idle")
        }, 3000)
      } else {
        setSubscribeStatus("error")
      }
    } catch {
      setSubscribeStatus("error")
    } finally {
      setSubscribing(false)
    }
  }

  const fetchData = async (overrideTarget?: { lat: number; lon: number; name: string }) => {
    const activeTarget = overrideTarget || target
    if (!activeTarget) return
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const url = `${API_URL}?lat=${activeTarget.lat}&lon=${activeTarget.lon}&city=${encodeURIComponent(activeTarget.name)}`
      const res = await fetch(url)
      if (!res.ok) throw new Error("Failed to fetch data")
      const json = await res.json()
      setData(json)
    } catch (err: any) {
      setError(err.message || "Failed to fetch data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (target) {
      fetchData()
    }
  }, [target])

  const handleDemoMode = () => {
    const activeLoc = target || { name: "Delhi NCR", lat: 28.6139, lon: 77.2090 }
    if (!target) {
      setTarget(activeLoc)
      setShowLocationModal(false)
    }
    setMobileCardOpen(true)
    setData({
      timestamp: new Date().toISOString(),
      target: { name: activeLoc.name, lat: activeLoc.lat, lon: activeLoc.lon },
      risk_level: "High",
      upwind_clusters: [
        {
          lat: activeLoc.lat + 0.6,
          lon: activeLoc.lon - 0.8,
          total_frp: 420.5,
          wind_speed_kmh: 18.5,
          wind_direction_deg: 135,
          distance_km: 85,
          arrival_hrs: 4.6,
          is_upwind: true
        },
        {
          lat: target.lat + 1.2,
          lon: target.lon - 0.4,
          total_frp: 275.0,
          wind_speed_kmh: 14.0,
          wind_direction_deg: 160,
          distance_km: 120,
          arrival_hrs: 8.5,
          is_upwind: true
        }
      ],
      all_clusters: [
        {
          lat: target.lat + 0.6,
          lon: target.lon - 0.8,
          total_frp: 420.5,
          wind_speed_kmh: 18.5,
          wind_direction_deg: 135,
          distance_km: 85,
          arrival_hrs: 4.6,
          is_upwind: true
        },
        {
          lat: target.lat + 1.2,
          lon: target.lon - 0.4,
          total_frp: 275.0,
          wind_speed_kmh: 14.0,
          wind_direction_deg: 160,
          distance_km: 120,
          arrival_hrs: 8.5,
          is_upwind: true
        },
        {
          lat: target.lat - 0.5,
          lon: target.lon + 0.6,
          total_frp: 110.0,
          wind_speed_kmh: 10.0,
          wind_direction_deg: 45,
          distance_km: 70,
          arrival_hrs: 7.0,
          is_upwind: false
        }
      ],
      advisory: {
        citizens: {
          en: `High risk of stubble smoke drifting towards ${target.name}. Keep windows closed and avoid outdoor activities.`,
          hi: `धुआं ${target.name} की ओर बढ़ने का उच्च जोखिम है। खिड़कियां बंद रखें और बाहरी गतिविधियों से बचें।`
        },
        authorities: {
          en: "Critical multi-cluster thermal anomalies detected upwind. Prepare for severe PM2.5 AQI degradation within 4-8 hours.",
          hi: "अपविंड में कई उच्च-तीव्रता वाली तापीय विसंगतियाँ पाई गई हैं। अगले 4-8 घंटों में वायु गुणवत्ता (PM2.5) में भारी गिरावट के लिए तैयार रहें।"
        }
      }
    })
  }

  // Risk-based color coding (Low: Green/Emerald, Moderate: Yellow/Amber, High: Red/Rose)
  const isHighRisk = data?.risk_level === 'High'
  const isModRisk = data?.risk_level === 'Moderate'

  const riskCardStyle = isHighRisk
    ? 'border-red-500/40 shadow-[0_0_25px_rgba(239,68,68,0.22)]'
    : isModRisk
    ? 'border-yellow-500/40 shadow-[0_0_25px_rgba(234,179,8,0.22)]'
    : 'border-emerald-500/40 shadow-[0_0_25px_rgba(16,185,129,0.18)]'

  const riskBadgeStyle = isHighRisk
    ? 'bg-red-500/20 text-red-400 border-red-500/40'
    : isModRisk
    ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'

  const riskHeaderBg = isHighRisk
    ? 'from-red-950/25 to-transparent'
    : isModRisk
    ? 'from-yellow-950/25 to-transparent'
    : 'from-emerald-950/20 to-transparent'

  return (
    <div className={`flex h-screen w-full bg-background overflow-hidden relative font-sans ${target ? "has-advisory" : ""}`}>
      {/* Top Navbar: 
          - On mobile: Row 1 = Logo/Name + Location selector; Row 2 = Refresh, Language toggle, Alerts, Test buttons.
          - On desktop (md+): Unified single-line navbar.
      */}
      <header className="absolute top-0 left-0 right-0 bg-black/85 backdrop-blur-md border-b border-white/10 z-[500] px-3 md:px-4 py-2">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          {/* Line 1 (Mobile) / Left side (Desktop): Branding & Target Location */}
          <div className="flex items-center justify-between md:justify-start gap-2 w-full md:w-auto">
            <div className="flex items-center gap-2 shrink-0">
              <Flame className="text-orange-500" size={20} />
              <span className="font-bold text-white text-base md:text-lg tracking-tight">StubbleWatch</span>
              <Badge variant="secondary" className="hidden sm:inline-flex ml-1 text-[9px] bg-blue-500/20 text-blue-300 border-blue-500/30">EARLY WARNING</Badge>
              <Badge variant="outline" className="hidden lg:inline-flex ml-1.5 text-[10px] border-green-500/30 text-green-400 bg-green-500/10">● NASA VIIRS Active Satellite Feed</Badge>
            </div>

            {target && (
              <button 
                onClick={() => setShowLocationModal(true)} 
                className="flex items-center gap-1.5 text-xs text-blue-300 hover:text-white bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1 rounded-md transition-colors border border-blue-500/30 max-w-[150px] sm:max-w-none truncate shrink-0"
                title="Change Target Location"
              >
                <MapPin size={13} className="text-blue-400 shrink-0" />
                <span className="font-medium truncate">{target.name}</span>
              </button>
            )}
          </div>

          {/* Line 2 (Mobile) / Right side (Desktop): Action controls */}
          <div className="flex items-center justify-between md:justify-end gap-1.5 sm:gap-2.5 w-full md:w-auto border-t border-white/5 pt-1.5 md:border-t-0 md:pt-0">
            <button 
              onClick={() => fetchData()} 
              className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 md:px-3 py-1 rounded-md transition-colors border border-white/5"
              title="Refresh Live Telemetry"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              <span className="text-xs">Refresh</span>
            </button>

            <div className="flex bg-black/40 rounded-md p-0.5 border border-white/10 shrink-0">
              <button onClick={() => setLang("en")} className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${lang === 'en' ? 'bg-primary text-primary-foreground font-semibold' : 'text-gray-400 hover:text-white'}`}>EN</button>
              <button onClick={() => setLang("hi")} className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${lang === 'hi' ? 'bg-primary text-primary-foreground font-semibold' : 'text-gray-400 hover:text-white'}`}>HI</button>
            </div>

            <button 
              onClick={() => setShowEmailModal(true)} 
              className="flex items-center gap-1.5 bg-yellow-500 hover:bg-yellow-600 text-white text-xs px-2.5 md:px-3 py-1 rounded-md transition-colors font-medium shadow-sm"
              title="Get Email Alerts"
            >
              <Mail size={13} />
              <span>Alerts</span>
            </button>

            <button 
              onClick={handleDemoMode} 
              className="flex items-center gap-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 text-xs px-2.5 md:px-3 py-1 rounded-md transition-colors font-medium"
              title="Test High Risk Alert Simulation"
            >
              <Zap size={13} />
              <span>Test</span>
            </button>
          </div>
        </div>
      </header>

      {/* Map view fills screen */}
      <div className="absolute inset-0 z-0">
        <MapContainer center={[target?.lat || 29.5, target?.lon || 76.5]} zoom={7} className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler setTarget={(loc) => { setTarget(loc); setMobileCardOpen(true); setShowLocationModal(false); }} />
          
          {target && (
            <Marker position={[target.lat, target.lon]}>
              <Popup>
                <b>{target.name}</b><br/>Target location
              </Popup>
            </Marker>
          )}

          {data?.all_clusters?.map((c: any, i: number) => {
            const isUpwind = c.is_upwind
            const color = isUpwind ? "#f85149" : "#e3b341"
            const radius = Math.min(6 + Math.sqrt(c.total_frp) * 0.5, 22)
            const smokeHeading = (c.wind_direction_deg + 180) % 360
            
            return (
              <div key={i}>
                <CircleMarker
                  center={[c.lat, c.lon]}
                  radius={radius}
                  pathOptions={{ color, fillColor: color, fillOpacity: isUpwind ? 0.75 : 0.45, weight: isUpwind ? 2 : 1 }}
                >
                  <Popup>
                    <div className="space-y-1">
                      <h4 className="font-bold flex items-center gap-2">
                        <Flame size={16} className={isUpwind ? "text-red-500" : "text-yellow-500"}/> 
                        {isUpwind ? "Upwind Cluster" : "Fire Cluster"}
                      </h4>
                      <div className="text-sm">FRP: {c.total_frp.toFixed(1)} MW</div>
                      <div className="text-sm">Wind: {c.wind_speed_kmh.toFixed(1)} km/h {bearingToArrow(smokeHeading)}</div>
                      <div className="text-sm">Distance: {c.distance_km.toFixed(1)} km</div>
                      {isUpwind && <div className="text-sm font-semibold">Est. Arrival: {c.arrival_hrs.toFixed(1)} hrs</div>}
                    </div>
                  </Popup>
                </CircleMarker>
                {isUpwind && target && (
                  <Polyline
                    positions={[[c.lat, c.lon], [target.lat, target.lon]]}
                    pathOptions={{ color, weight: 1.5, dashArray: "6, 6", opacity: 0.6 }}
                  />
                )}
              </div>
            )
          })}
        </MapContainer>
      </div>

      {/* Advisory Button on Mobile when modal is closed */}
      {target && !mobileCardOpen && (
        <button
          onClick={() => setMobileCardOpen(true)}
          className="md:hidden absolute bottom-5 left-4 z-[450] flex items-center gap-2 bg-black/85 hover:bg-black text-white px-3.5 py-2 rounded-full border border-white/20 shadow-xl backdrop-blur-md text-xs font-semibold"
        >
          <Zap size={14} className="text-yellow-400" />
          <span>View Risk Advisory</span>
          {data?.risk_level && (
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
              data.risk_level === 'High' ? 'bg-red-500/20 text-red-400 border border-red-500/40' :
              data.risk_level === 'Moderate' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40' :
              'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
            }`}>
              {data.risk_level}
            </span>
          )}
        </button>
      )}

      {/* Advisory Card: Scaled on PC, modal popup on Mobile */}
      {target && (
        <div className={`transition-all duration-300 ${
          mobileCardOpen
            ? "fixed inset-0 z-[600] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 md:bg-transparent md:backdrop-blur-none md:p-0 md:fixed-none md:absolute md:top-20 md:left-4 md:bottom-auto md:right-auto md:w-[350px] md:pointer-events-none md:block"
            : "hidden md:block md:absolute md:top-20 md:left-4 md:bottom-auto md:right-auto md:w-[350px] md:pointer-events-none"
        }`}>
          <div className="w-full max-w-[360px] md:max-w-none md:w-[350px] max-h-[85vh] md:max-h-[calc(100vh-6rem)] overflow-y-auto">
            <Card className={`pointer-events-auto backdrop-blur-xl bg-[#0a0f18]/95 border transition-all duration-300 relative ${riskCardStyle}`}>
              {/* Mobile Close (X) Button */}
              <button
                onClick={() => setMobileCardOpen(false)}
                className="md:hidden absolute top-3 right-3 p-1.5 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors border border-white/10 z-10"
                aria-label="Close Advisory Popup"
              >
                <X size={16} />
              </button>

              <CardHeader className={`p-3.5 pb-2.5 md:p-4 md:pb-3 pr-10 md:pr-4 bg-gradient-to-b ${riskHeaderBg} rounded-t-xl`}>
                <div className="flex justify-between items-start">
                  <div className="w-full">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge variant="outline" className={`uppercase font-bold tracking-wider rounded-sm text-[9px] px-1.5 py-0.5 border ${riskBadgeStyle}`}>
                        {loading ? "CALCULATING..." : `${data?.risk_level || "UNKNOWN"} RISK`}
                      </Badge>
                      {!loading && data?.risk_level === 'Low' && (
                        <span className="text-[9px] font-bold text-emerald-400 border border-emerald-500/30 bg-emerald-950/30 px-1.5 py-0.5 rounded-sm">AIRSPACE CLEAR</span>
                      )}
                    </div>
                    <CardTitle className="text-lg md:text-xl font-bold text-white leading-tight">
                      {loading ? (
                        `Analyzing Stubble Risk for ${target.name}...`
                      ) : error ? (
                        `Analysis Failed for ${target.name}`
                      ) : data?.risk_level === 'Low' ? (
                        `Minimal Stubble Smoke Drift Toward ${target.name}`
                      ) : data?.risk_level === 'Moderate' ? (
                        `Moderate Smoke Threat Approaching ${target.name}`
                      ) : (
                        `High Stubble Smoke Drift Toward ${target.name}`
                      )}
                    </CardTitle>
                    <CardDescription className="text-gray-400 text-xs mt-1.5 leading-relaxed">
                      {loading ? (
                        "Synthesizing live thermal satellite data and wind dispersion models..."
                      ) : error ? (
                        "Could not retrieve telemetry from server. Check connection and retry."
                      ) : data?.risk_level === 'Low' ? (
                        "Favorable wind vectors or minimal active burning. Atmospheric dispersion is within safe parameters."
                      ) : data?.risk_level === 'Moderate' ? (
                        "Noticeable smoke drift vector detected. Sensitive individuals should monitor air quality."
                      ) : (
                        "Critical smoke plume trajectory detected. Heavy particulate matter expected to impact target zone."
                      )}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-3.5 pt-0 md:p-4 md:pt-0 space-y-2.5 md:space-y-3">
                {loading ? (
                  <div className="space-y-3 py-2">
                    <div className="flex items-center justify-center gap-2 py-4 text-xs font-medium text-blue-400 bg-blue-500/10 rounded-lg border border-blue-500/20 animate-pulse">
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Loading telemetry & generating Amazon Bedrock advisory...</span>
                    </div>
                    <div className="h-16 bg-white/5 rounded-lg w-full animate-pulse"></div>
                    <div className="h-20 bg-white/5 rounded-lg w-full animate-pulse"></div>
                  </div>
                ) : error ? (
                  <div className="text-red-400 p-3 bg-red-500/10 rounded-lg border border-red-500/20 text-xs flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={16} className="shrink-0"/>
                      <span>{error}</span>
                    </div>
                    <button 
                      onClick={() => fetchData()}
                      className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 rounded border border-red-500/30 text-[11px] font-semibold text-white transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                ) : data ? (
                  <>
                    {/* Telemetry Stat Cards */}
                    <div className="grid grid-cols-2 gap-2 md:gap-2.5">
                      <div className="bg-[#111827] border border-gray-800 rounded-lg p-2.5 md:p-3">
                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Targeting {target.name}</div>
                        <div className="text-2xl font-bold text-white leading-none">{data.upwind_clusters?.length || 0} <span className="text-xs font-normal text-gray-400">clusters</span></div>
                        <div className="text-[10px] text-gray-500 mt-1.5">Out of {data.all_clusters?.length || 0} regional fires</div>
                      </div>
                      <div className="bg-[#111827] border border-gray-800 rounded-lg p-2.5 md:p-3">
                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Nearest Upwind Fire</div>
                        <div className="text-2xl font-bold text-white leading-none">{data.upwind_clusters?.length ? Math.min(...data.upwind_clusters.map((c:any)=>c.distance_km)).toFixed(0) : "—"} <span className="text-xs font-normal text-gray-400">km</span></div>
                        <div className="text-[10px] text-gray-500 mt-1.5">Regional distance</div>
                      </div>
                      <div className="bg-[#111827] border border-gray-800 rounded-lg p-2.5 md:p-3">
                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Wind Velocity</div>
                        <div className="text-xl font-bold text-white leading-none">{data.upwind_clusters?.length ? Math.max(...data.upwind_clusters.map((c:any)=>c.wind_speed_kmh)).toFixed(1) : "—"} <span className="text-xs font-normal text-gray-400">km/h</span></div>
                      </div>
                      <div className="bg-[#111827] border border-gray-800 rounded-lg p-2.5 md:p-3">
                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Thermal Energy</div>
                        <div className="text-xl font-bold text-white leading-none">{data.upwind_clusters?.length ? data.upwind_clusters.reduce((a:number, c:any)=>a+c.total_frp, 0).toFixed(1) : "0.0"} <span className="text-xs font-normal text-gray-400">MW</span></div>
                      </div>
                    </div>

                    {/* Bedrock Advisory Card with tailored typography */}
                    <div className="bg-[#111827] border border-gray-800 rounded-lg overflow-hidden flex flex-col">
                      <div className="flex items-center justify-between p-2.5 border-b border-gray-800 bg-white/[0.02]">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-300">
                          <Zap size={13} className="text-yellow-500" /> Amazon Bedrock Advisory
                        </div>
                        <Badge className="text-[8px] px-1.5 py-0 bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/20">amazon.nova-micro</Badge>
                      </div>
                      
                      <div className="p-3 flex flex-col gap-2">
                        <div className="flex gap-2.5 border-b border-gray-800 pb-1.5">
                          <button 
                            onClick={() => setAdvisoryTab('citizens')}
                            className={`pb-1 text-xs font-bold transition-colors border-b-2 ${advisoryTab === 'citizens' ? 'text-blue-400 border-blue-400' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                          >
                            For Citizens
                          </button>
                          <button 
                            onClick={() => setAdvisoryTab('authorities')}
                            className={`pb-1 text-xs font-bold transition-colors border-b-2 ${advisoryTab === 'authorities' ? 'text-blue-400 border-blue-400' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                          >
                            For Authorities
                          </button>
                        </div>

                        {/* Advisory Text: text-[13px] leading-relaxed */}
                        <p className="text-[13px] text-gray-300 leading-relaxed pl-2.5 border-l-2 border-blue-500 py-0.5">
                          {data.advisory?.[advisoryTab]?.[lang] || "No advisory generated."}
                        </p>
                        
                        <div className="flex flex-col gap-1 pt-1.5 border-t border-gray-800/80 text-xs text-gray-400">
                          <div className="font-semibold text-gray-300 flex items-center gap-1 text-[11px]">
                            <span className="text-blue-400">•</span> Recommendation
                          </div>
                          <div className="text-[11px] leading-relaxed pl-2 text-gray-400">
                            {isHighRisk 
                              ? "Stay indoors with windows sealed. Run HEPA air filters continuously."
                              : isModRisk 
                              ? "Sensitive groups should limit prolonged outdoor exertion."
                              : "Air quality favorable. Standard outdoor activities permitted."}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
              </CardContent>
              
              {data && (
                <CardFooter className="text-[9px] text-muted-foreground border-t border-white/5 p-2.5 px-3.5 flex justify-between items-center">
                  <span>Last updated: {new Date(data.timestamp).toLocaleTimeString()}</span>
                  <button 
                    onClick={() => setMobileCardOpen(false)}
                    className="md:hidden text-blue-400 hover:text-blue-300 text-xs font-semibold px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20"
                  >
                    Close & View Map
                  </button>
                </CardFooter>
              )}
            </Card>
          </div>
        </div>
      )}
      
      {/* Map Telemetry Legend: Constant top alignment matching zoom control at top-[104px] on mobile and top-20 on desktop */}
      <div className={`transition-all duration-300 z-[400] pointer-events-auto ${
        mobileCardOpen ? "hidden md:block" : "block"
      } absolute top-[104px] right-3 sm:right-4 w-[240px] sm:w-[260px] md:top-20 md:right-4 md:w-[275px] bg-[#1a2130]/95 backdrop-blur-md rounded-xl border border-[#2a3441] shadow-2xl p-2.5 sm:p-3 md:p-3.5`}>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-[10px] font-bold text-gray-400 tracking-[0.12em] uppercase">Map Telemetry</h3>
          <span className="md:hidden text-[9px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20">Live</span>
        </div>
        <div className="space-y-1.5 sm:space-y-2">
          <div className="flex items-center gap-2 sm:gap-2.5 text-[11px] sm:text-xs text-gray-300">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] shrink-0"></div>
            <span>Upwind Threat {target ? `(${target.name})` : ""}</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-2.5 text-[11px] sm:text-xs text-gray-300">
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)] shrink-0"></div>
            <span>Lateral Fire Cluster</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-2.5 text-[11px] sm:text-xs text-gray-300">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)] shrink-0"></div>
            <span>Target Zone</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-2.5 text-[11px] sm:text-xs text-gray-300">
            <div className="flex w-2.5 items-center shrink-0">
              <div className="w-1 h-0.5 bg-red-500 mr-0.5"></div>
              <div className="w-1 h-0.5 bg-red-500"></div>
            </div>
            <span>Projected Smoke Drift</span>
          </div>
        </div>
      </div>

      {/* Initial Location Selector Modal (Shown on first open or when changing location) */}
      {showLocationModal && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="bg-[#0f172a] border border-gray-700/80 rounded-2xl w-full max-w-lg shadow-[0_0_40px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-800 bg-gradient-to-r from-blue-950/40 via-purple-950/20 to-transparent">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white leading-tight">Select Monitoring Location</h2>
                    <p className="text-xs text-gray-400">Choose a high-priority city or click anywhere on the map</p>
                  </div>
                </div>
                {target && (
                  <button 
                    onClick={() => setShowLocationModal(false)}
                    className="p-1.5 text-gray-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="p-5 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Choose Location
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 1. Custom Coordinates Button: First button on both PC and mobile */}
                <button
                  onClick={() => setShowLocationModal(false)}
                  className="flex flex-col text-left p-3 rounded-xl bg-blue-950/20 hover:bg-blue-900/30 border border-blue-500/40 hover:border-blue-400 transition-all group"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-semibold text-sm text-blue-300 group-hover:text-blue-200 transition-colors flex items-center gap-1.5">
                      <MapPin size={14} className="text-blue-400" />
                      Custom Coordinates
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-400 mt-1">
                    Tap or click anywhere on the live satellite map
                  </span>
                </button>

                {/* 2. Presets: 4 on mobile (5 total including Custom), 5 on desktop (6 total including Custom) */}
                {PRESET_LOCATIONS.slice(0, 5).map((loc, idx) => (
                  <button
                    key={loc.name}
                    onClick={() => selectTargetLocation(loc)}
                    className={`${idx >= 4 ? "hidden sm:flex" : "flex"} flex-col text-left p-3 rounded-xl bg-gray-900/80 hover:bg-blue-950/40 border border-gray-800 hover:border-blue-500/50 transition-all group`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-semibold text-sm text-gray-100 group-hover:text-blue-400 transition-colors">
                        {loc.name}
                      </span>
                      <span className="text-[10px] text-gray-500 group-hover:text-blue-400/80 font-mono">
                        {loc.lat.toFixed(2)}°, {loc.lon.toFixed(2)}°
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-400 mt-1">{loc.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Email Subscription Modal */}
      {showEmailModal && (
        <div className="absolute inset-0 z-[600] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0a0f18] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 relative">
              <button 
                onClick={() => setShowEmailModal(false)} 
                className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
              
              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-500">
                  <Mail size={24} />
                </div>
              </div>
              
              <h2 className="text-xl font-bold text-white text-center mb-2">Subscribe to Alerts</h2>
              <p className="text-gray-400 text-sm text-center mb-6 leading-relaxed">
                Receive instant Amazon SNS email notifications when stubble fires pose a severe threat to your monitored area.
              </p>
              
              {subscribeStatus === "success" ? (
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 flex flex-col items-center gap-2 text-green-400">
                  <CheckCircle2 size={32} />
                  <p className="font-medium text-center">Subscription successful!</p>
                  <p className="text-xs text-green-500/80 text-center">Please check your inbox to confirm the AWS SNS subscription.</p>
                </div>
              ) : (
                <form onSubmit={submitEmail} className="flex flex-col gap-3">
                  <div>
                    <input 
                      type="email" 
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="Enter your email address" 
                      required
                      className="w-full bg-black/50 border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-gray-600"
                    />
                  </div>
                  {subscribeStatus === "error" && (
                    <p className="text-red-400 text-xs flex items-center gap-1"><AlertTriangle size={12}/> Failed to subscribe. Please try again.</p>
                  )}
                  <button 
                    type="submit" 
                    disabled={subscribing}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-bold py-3 rounded-lg transition-colors flex justify-center items-center gap-2 mt-2 shadow-[0_0_15px_rgba(37,99,235,0.3)]"
                  >
                    {subscribing ? <RefreshCw size={18} className="animate-spin" /> : "Subscribe to Alerts"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
