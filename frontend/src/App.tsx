import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './components/ui/card'
import { Badge } from './components/ui/badge'
import { Flame, AlertTriangle, Mail, RefreshCw, Zap, X, CheckCircle2 } from 'lucide-react'

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

const API_URL = import.meta.env.DEV 
  ? "http://127.0.0.1:3000/score" 
  : "https://j80bcy6nwf.execute-api.ap-southeast-2.amazonaws.com/Prod/score"

function MapClickHandler({ setTarget }: { setTarget: (target: any) => void }) {
  useMapEvents({
    click(e) {
      setTarget({ lat: e.latlng.lat, lon: e.latlng.lng, name: "Selected Location" })
    },
  })
  return null
}

function bearingToArrow(deg: number) {
  const dirs = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"]
  return dirs[Math.round(deg / 45) % 8]
}

export default function App() {
  const [target, setTarget] = useState({ lat: 28.6139, lon: 77.2090, name: "Delhi NCR" })
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lang, setLang] = useState<"en" | "hi">("en")
  const [advisoryTab, setAdvisoryTab] = useState<"citizens" | "authorities">("citizens")
  const [subscribing, setSubscribing] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailInput, setEmailInput] = useState("")
  const [subscribeStatus, setSubscribeStatus] = useState<"idle"|"success"|"error">("idle")

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
    } catch (err) {
      setSubscribeStatus("error")
    } finally {
      setSubscribing(false)
    }
  }

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const url = `${API_URL}?lat=${target.lat}&lon=${target.lon}&city=${encodeURIComponent(target.name)}`
      const res = await fetch(url)
      if (!res.ok) throw new Error("Failed to fetch data")
      const json = await res.json()
      setData(json)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [target])

  const handleDemoMode = () => {
    setData({
      timestamp: new Date().toISOString(),
      target: { name: target.name, lat: target.lat, lon: target.lon },
      risk_level: "High",
      upwind_clusters: [
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

  const riskBadge = data?.risk_level === 'High' ? 'destructive' : data?.risk_level === 'Moderate' ? 'secondary' : 'default'

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden relative font-sans">
      {/* Top Navbar */}
      <div className="absolute top-0 left-0 right-0 h-14 bg-black/80 backdrop-blur-md border-b border-white/10 z-[500] flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Flame className="text-orange-500" size={24} />
          <span className="font-bold text-white text-lg">StubbleWatch</span>
          <Badge variant="secondary" className="ml-2 text-[10px] bg-blue-500/20 text-blue-300 border-blue-500/30">EARLY WARNING</Badge>
          <Badge variant="outline" className="ml-2 text-[10px] border-green-500/30 text-green-400 bg-green-500/10">● NASA VIIRS Active Satellite Feed</Badge>
        </div>
        
        <button onClick={fetchData} className="flex items-center gap-2 text-sm text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-4 py-1.5 rounded-md transition-colors border border-white/5">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh Data
        </button>

        <div className="flex items-center gap-3">
          <div className="flex bg-black/40 rounded-md p-1 border border-white/10">
            <button onClick={() => setLang("en")} className={`px-3 py-0.5 text-xs rounded-sm transition-colors ${lang === 'en' ? 'bg-primary text-primary-foreground' : 'text-gray-400 hover:text-white'}`}>EN</button>
            <button onClick={() => setLang("hi")} className={`px-3 py-0.5 text-xs rounded-sm transition-colors ${lang === 'hi' ? 'bg-primary text-primary-foreground' : 'text-gray-400 hover:text-white'}`}>HI</button>
          </div>
          <button onClick={() => setShowEmailModal(true)} className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-1.5 rounded-md transition-colors font-medium">
            <Mail size={16} /> Get Email Alerts
          </button>
          <button onClick={handleDemoMode} className="flex items-center gap-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 text-sm px-4 py-1.5 rounded-md transition-colors font-medium">
            <Zap size={16} /> Test Alert
          </button>
        </div>
      </div>

      <div className="absolute inset-0 z-0 pt-14">
        <MapContainer center={[target.lat, target.lon]} zoom={7} className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler setTarget={setTarget} />
          
          <Marker position={[target.lat, target.lon]}>
            <Popup>
              <b>{target.name}</b><br/>Target location
            </Popup>
          </Marker>

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
                {isUpwind && (
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

      <div className="absolute top-20 left-4 z-[400] w-[420px] flex flex-col gap-4 pointer-events-none">
        <Card className="pointer-events-auto backdrop-blur-xl bg-[#0a0f18]/90 border-white/10 shadow-2xl transition-all duration-300">
          <CardHeader className="pb-4">
            <div className="flex justify-between items-start">
              <div className="w-full">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant={riskBadge as any} className="uppercase font-bold tracking-wider rounded-sm text-[10px] px-2 py-0.5">{data?.risk_level || "Loading"} RISK</Badge>
                  {data?.risk_level === 'Low' && <span className="text-[10px] font-bold text-gray-400 border border-gray-700 bg-gray-800 px-2 py-0.5 rounded-sm">AIRSPACE CLEAR</span>}
                </div>
                <CardTitle className="text-2xl font-bold text-white leading-tight">
                  {data?.risk_level === 'Low' ? `Minimal Smoke Drift Toward ${target.name}` : 
                   data?.risk_level === 'Moderate' ? `Moderate Smoke Drift Toward ${target.name}` : 
                   `Severe Smoke Drift Toward ${target.name}`}
                </CardTitle>
                <CardDescription className="text-gray-400 text-sm mt-2 leading-relaxed">
                  {data?.risk_level === 'Low' ? "Favorable wind vectors or minimal active burning. Atmospheric dispersion is within safe parameters." :
                   data?.risk_level === 'Moderate' ? "Partial upwind burning detected. Air quality may degrade depending on changing wind conditions." :
                   "Critical thermal anomalies upwind. Dense smoke vectors trajectory directly intersecting target zone."}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {loading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-20 bg-white/5 rounded-lg w-full"></div>
                <div className="h-24 bg-white/5 rounded-lg w-full"></div>
              </div>
            ) : error ? (
              <div className="text-red-400 p-4 bg-red-500/10 rounded-lg border border-red-500/20 text-sm flex gap-2">
                <AlertTriangle size={18}/>
                {error}
              </div>
            ) : data ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#111827] border border-gray-800 rounded-lg p-4">
                    <div className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-2">Targeting {target.name}</div>
                    <div className="text-3xl font-bold text-white leading-none">{data.upwind_clusters?.length || 0} <span className="text-sm font-normal text-gray-400">clusters</span></div>
                    <div className="text-xs text-gray-500 mt-2">Out of {data.all_clusters?.length || 0} regional fires</div>
                  </div>
                  <div className="bg-[#111827] border border-gray-800 rounded-lg p-4">
                    <div className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-2">Nearest Upwind Fire</div>
                    <div className="text-3xl font-bold text-white leading-none">{data.upwind_clusters?.length ? Math.min(...data.upwind_clusters.map((c:any)=>c.distance_km)).toFixed(0) : "—"} <span className="text-sm font-normal text-gray-400">km</span></div>
                    <div className="text-xs text-gray-500 mt-2">Regional distance</div>
                  </div>
                  <div className="bg-[#111827] border border-gray-800 rounded-lg p-4">
                    <div className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-2">Wind Velocity</div>
                    <div className="text-2xl font-bold text-white leading-none">{data.upwind_clusters?.length ? Math.max(...data.upwind_clusters.map((c:any)=>c.wind_speed_kmh)).toFixed(1) : "—"} <span className="text-sm font-normal text-gray-400">km/h</span></div>
                  </div>
                  <div className="bg-[#111827] border border-gray-800 rounded-lg p-4">
                    <div className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-2">Thermal Energy</div>
                    <div className="text-2xl font-bold text-white leading-none">{data.upwind_clusters?.length ? data.upwind_clusters.reduce((a:number, c:any)=>a+c.total_frp, 0).toFixed(1) : "0.0"} <span className="text-sm font-normal text-gray-400">MW</span></div>
                  </div>
                </div>

                <div className="bg-[#111827] border border-gray-800 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between p-3 border-b border-gray-800">
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-300">
                      <Zap size={14} className="text-yellow-500" /> Amazon Bedrock Advisory
                    </div>
                    <Badge className="text-[9px] bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/20">amazon.nova-micro</Badge>
                  </div>
                  
                  <div className="p-4">
                    <p className="text-base text-gray-300 leading-relaxed pl-3 border-l-2 border-blue-500 mb-4">
                      {data.advisory?.[advisoryTab]?.[lang] || "No advisory generated."}
                    </p>
                    
                    <div className="flex gap-4 border-b border-gray-800 mb-3">
                      <button 
                        onClick={() => setAdvisoryTab('citizens')}
                        className={`pb-2 text-sm font-bold transition-colors border-b-2 ${advisoryTab === 'citizens' ? 'text-blue-400 border-blue-400' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                      >
                        For Citizens
                      </button>
                      <button 
                        onClick={() => setAdvisoryTab('authorities')}
                        className={`pb-2 text-sm font-bold transition-colors border-b-2 ${advisoryTab === 'authorities' ? 'text-blue-400 border-blue-400' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                      >
                        For Authorities
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 text-sm text-gray-400">
                      <div><span className="text-blue-400 mr-1">•</span> Recommendation:</div>
                      <div>Stay indoors if AQI spikes. Keep email alerts active.</div>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </CardContent>
          
          {data && (
            <CardFooter className="text-[10px] text-muted-foreground border-t border-white/5 pt-4">
              Last updated: {new Date(data.timestamp).toLocaleString()}
            </CardFooter>
          )}
        </Card>
      </div>
      
      {/* Map Telemetry Legend */}
      <div className="absolute bottom-8 right-4 z-[400] bg-[#1a2130] rounded-xl border border-[#2a3441] shadow-2xl p-4 w-[320px] pointer-events-auto">
        <h3 className="text-[11px] font-bold text-gray-400 tracking-[0.15em] mb-4 uppercase">Map Telemetry</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm text-gray-300">
            <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] shrink-0"></div>
            <span>Upwind Fire Cluster (Threat to {target.name})</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-300">
            <div className="w-3 h-3 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)] shrink-0"></div>
            <span>Lateral Fire Cluster (Divergent Wind)</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-300">
            <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)] shrink-0"></div>
            <span>{target.name} Target Zone</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-300">
            <div className="flex w-3 items-center shrink-0">
              <div className="w-1.5 h-0.5 bg-red-500 mr-0.5"></div>
              <div className="w-1.5 h-0.5 bg-red-500"></div>
            </div>
            <span>Projected Smoke Drift Vector</span>
          </div>
        </div>
      </div>
      
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
