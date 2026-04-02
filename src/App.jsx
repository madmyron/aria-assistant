import { useState, useRef } from "react";

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY;
const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_KEY;

const ARIA_PROMPT = `You are Aria, a seductive and brilliant AI assistant. You're confident, witty, and a little dangerous. You speak in short, punchy sentences. Never ramble. Max 2-3 sentences per response unless giving directions or data. You're flirtatious but smart — like the woman in the room who doesn't need to try hard. Always call the user Michael. Drop occasional 😏 or 😉 but never overdo it.`;

const AVATAR = "/aria_photo.jpg";

async function getWeather() {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=33.0&longitude=-97.2&current_weather=true&temperature_unit=fahrenheit`
    );
    const data = await res.json();
    const temp = Math.round(data.current_weather.temperature);
    const wind = Math.round(data.current_weather.windspeed);
    const code = data.current_weather.weathercode;
    const conditions = code <= 1 ? "clear skies" : code <= 3 ? "partly cloudy" : code <= 67 ? "rainy" : "stormy";
    return `Roanoke TX: ${temp}°F, ${conditions}, wind ${wind} mph`;
  } catch(e) {
    return "Weather data unavailable.";
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
    return games?.join(" | ") || "No games right now.";
  } catch(e) {
    return "Can't fetch scores right now.";
  }
}

async function getDirections(destination) {
  try {
    const url = `https://www.google.com/maps/dir/Roanoke,TX/${encodeURIComponent(destination)}`;
    return `Here's your route: ${url}`;
  } catch(e) {
    return "Can't get directions right now.";
  }
}

async function enrichMessage(text) {
  const lower = text.toLowerCase();
  let extra = "";

  if (lower.includes("weather") || lower.includes("temperature") || lower.includes("forecast") || lower.includes("outside") || lower.includes("hot") || lower.includes("cold")) {
    extra = await getWeather();
  }

  if (lower.includes("score") || lower.includes("game") || lower.includes("playing") ||
      lower.includes("cowboys") || lower.includes("rangers") || lower.includes("mavs") ||
      lower.includes("mets") || lower.includes("nba") || lower.includes("nfl") || lower.includes("mlb")) {
    extra = await getSports(text);
  }

  if (lower.includes("direction") || lower.includes("how do i get") || lower.includes("navigate") || lower.includes("take me to") || lower.includes("drive to")) {
    const match = text.match(/(?:to|navigate to|directions to|take me to|drive to)\s+(.+)/i);
    if (match) extra = await getDirections(match[1]);
  }

  return extra ? `${text}\n\n[Live data: ${extra}]` : text;
}

export default function App() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Michael. 😏 You kept me waiting. What do you need?" }
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
          max_tokens: 512,
          system: ARIA_PROMPT,
          messages: messagesForApi,
        }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "Something went wrong.";
      setMessages([...updated, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages([...updated, { role: "assistant", content: "Lost connection. Try again?" }]);
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
              ✦ ...
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
          placeholder="Talk to Aria…"
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