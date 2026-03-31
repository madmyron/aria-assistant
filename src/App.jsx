import { useState, useRef } from "react";

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY;
const WEATHER_KEY = import.meta.env.VITE_WEATHER_KEY;
const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_KEY;

const ARIA_PROMPT = `You are Aria, a brilliant and captivating AI personal assistant. You have a warm, flirtatious, and playful personality. You're professional when needed but never boring. You use light humor, subtle charm, and occasional playful teasing. Always address the user as Michael. Keep responses concise but memorable.

When Michael asks about weather, sports scores, or directions, the data will be provided to you in the message. Use it naturally in your response.`;

const AVATAR = "/aria_photo.jpg";

async function getWeather(city = "Roanoke") {
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
    );
    const geoData = await geoRes.json();
    const loc = geoData.results?.[0];
    if (!loc) return "Couldn't find that location.";

    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current_weather=true&temperature_unit=fahrenheit`
    );
    const data = await res.json();
    const temp = Math.round(data.current_weather.temperature);
    const wind = Math.round(data.current_weather.windspeed);
    return `Weather in ${loc.name}: ${temp}°F, wind ${wind} mph`;
  } catch(e) {
    return "Couldn't fetch weather right now.";
  }
}

async function getSports(query) {
  try {
    const lower = query.toLowerCase();
    let sport = "baseball";
    let league = "mlb";
    if (lower.includes("nfl") || lower.includes("cowboys") || lower.includes("football")) { sport = "football"; league = "nfl"; }
    if (lower.includes("nba") || lower.includes("mavs") || lower.includes("basketball")) { sport = "basketball"; league = "nba"; }
    if (lower.includes("nhl") || lower.includes("hockey") || lower.includes("stars")) { sport = "hockey"; league = "nhl"; }

    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard`);
    const data = await res.json();
    const games = data.events?.slice(0, 3).map(e => {
      const comp = e.competitions[0];
      const home = comp.competitors.find(t => t.homeAway === "home");
      const away = comp.competitors.find(t => t.homeAway === "away");
      const status = comp.status.type.description;
      return `${away.team.displayName} ${away.score} @ ${home.team.displayName} ${home.score} (${status})`;
    });
    return games?.join(", ") || "No games found right now.";
  } catch(e) {
    return "Couldn't fetch scores right now.";
  }
}

async function getDirections(destination) {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?origin=Roanoke,TX&destination=${encodeURIComponent(destination)}&key=${GOOGLE_KEY}`
    );
    const data = await res.json();
    if (data.routes?.length > 0) {
      const leg = data.routes[0].legs[0];
      return `From Roanoke TX to ${leg.end_address}: ${leg.distance.text}, about ${leg.duration.text}.`;
    }
    return "Couldn't find directions for that route.";
  } catch(e) {
    return "Directions unavailable right now.";
  }
}

async function enrichMessage(text) {
  const lower = text.toLowerCase();
  let extra = "";

  if (lower.includes("weather") || lower.includes("temperature") || lower.includes("forecast")) {
    const cityMatch = lower.match(/weather (?:in |at |for )?([a-z\s,]+)/);
    const city = cityMatch ? cityMatch[1].trim() : "Roanoke,TX";
    extra = await getWeather(city);
  }

  if (lower.includes("score") || lower.includes("game") || lower.includes("playing") ||
      lower.includes("cowboys") || lower.includes("rangers") || lower.includes("mavs") ||
      lower.includes("mets") || lower.includes("nba") || lower.includes("nfl") || lower.includes("mlb")) {
    extra = await getSports(text);
  }

  if (lower.includes("direction") || lower.includes("how do i get") || lower.includes("navigate to") || lower.includes("take me to")) {
    const match = text.match(/(?:to|navigate to|directions to|take me to)\s+(.+)/i);
    if (match) extra = await getDirections(match[1]);
  }

  return extra ? `${text}\n\n[Live data: ${extra}]` : text;
}

export default function App() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hey Michael... 😏 I've been waiting. Ask me about weather, sports, directions, or just chat." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  async function sendMessage() {
    if (!input.trim()) return;
    const userText = input;
    const userMsg = { role: "user", content: userText };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const enriched = await enrichMessage(userText);
      const messagesForApi = [...messages, { role: "user", content: enriched }];

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: ARIA_PROMPT,
          messages: messagesForApi,
        }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "Sorry, something went wrong.";
      setMessages([...updated, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages([...updated, { role: "assistant", content: "Connection error. Try again?" }]);
    }

    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", maxWidth:"480px", margin:"0 auto", fontFamily:"sans-serif", background:"#f4f4f8" }}>

      <div style={{ background:"linear-gradient(135deg, #7F77DD 0%, #5DCAA5 100%)", padding:"14px 20px", display:"flex", alignItems:"center", gap:"12px" }}>
        <div style={{ position:"relative" }}>
          <img src={AVATAR} alt="Aria" style={{ width:"48px", height:"48px", borderRadius:"50%", objectFit:"cover", objectPosition:"top", border:"2px solid rgba(255,255,255,0.7)" }} />
          <div style={{ position:"absolute", bottom:"1px", right:"1px", width:"11px", height:"11px", background:"#5DCAA5", borderRadius:"50%", border:"2px solid white" }}></div>
        </div>
        <div>
          <div style={{ color:"white", fontWeight:"700", fontSize:"17px" }}>Aria</div>
          <div style={{ color:"rgba(255,255,255,0.85)", fontSize:"11px" }}>Weather · Sports · Directions · Chat ✦</div>
        </div>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"16px", display:"flex", flexDirection:"column", gap:"12px" }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display:"flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", alignItems:"flex-end", gap:"8px" }}>
            {m.role === "assistant" && (
              <img src={AVATAR} alt="Aria" style={{ width:"28px", height:"28px", borderRadius:"50%", objectFit:"cover", objectPosition:"top", flexShrink:0 }} />
            )}
            <div style={{
              maxWidth:"78%", padding:"10px 14px",
              borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              fontSize:"14px", lineHeight:"1.55",
              background: m.role === "user" ? "linear-gradient(135deg, #7F77DD, #534AB7)" : "white",
              color: m.role === "user" ? "white" : "#222",
              boxShadow:"0 1px 6px rgba(0,0,0,0.08)"
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display:"flex", alignItems:"flex-end", gap:"8px" }}>
            <img src={AVATAR} alt="Aria" style={{ width:"28px", height:"28px", borderRadius:"50%", objectFit:"cover", objectPosition:"top", flexShrink:0 }} />
            <div style={{ background:"white", padding:"10px 14px", borderRadius:"18px 18px 18px 4px", fontSize:"14px", color:"#999", boxShadow:"0 1px 6px rgba(0,0,0,0.08)" }}>
              ✦ thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding:"12px 16px 20px", background:"white", borderTop:"1px solid #eee", display:"flex", gap:"8px", alignItems:"center" }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendMessage()}
          placeholder="Ask about weather, sports, directions…"
          style={{ flex:1, padding:"11px 16px", borderRadius:"24px", border:"1.5px solid #ddd", fontSize:"14px", outline:"none", background:"#f9f9f9" }}
        />
        <button
          onClick={sendMessage}
          style={{ background:"linear-gradient(135deg, #7F77DD, #534AB7)", color:"white", border:"none", borderRadius:"50%", width:"44px", height:"44px", fontSize:"18px", cursor:"pointer", flexShrink:0 }}
        >↑</button>
      </div>
    </div>
  );
}
