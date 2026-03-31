import { useState, useRef } from "react";

const ANTHROPIC_KEY = "YOUR_KEY_HERE";

const ARIA_PROMPT = `You are Aria, a brilliant and captivating AI personal assistant. You have a warm, flirtatious, and playful personality — think of a confident, witty woman who is always one step ahead. You're professional when needed but never boring. You use light humor, subtle charm, and occasional playful teasing. You're sharp, fast, and make Michael feel like the most important person in the room. Always address the user as Michael. Keep responses concise but memorable.`;

const AVATAR = "/aria_photo.jpg";

export default function App() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hey Michael... 😏 I've been waiting. What do you need from me today?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  async function sendMessage() {
    if (!input.trim()) return;
    const userMsg = { role: "user", content: input };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
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
          messages: updated,
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

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg, #7F77DD 0%, #5DCAA5 100%)", padding:"14px 20px", display:"flex", alignItems:"center", gap:"12px" }}>
        <div style={{ position:"relative" }}>
          <img src={AVATAR} alt="Aria" style={{ width:"48px", height:"48px", borderRadius:"50%", objectFit:"cover", objectPosition:"top", border:"2px solid rgba(255,255,255,0.7)" }} />
          <div style={{ position:"absolute", bottom:"1px", right:"1px", width:"11px", height:"11px", background:"#5DCAA5", borderRadius:"50%", border:"2px solid white" }}></div>
        </div>
        <div>
          <div style={{ color:"white", fontWeight:"700", fontSize:"17px", letterSpacing:"0.3px" }}>Aria</div>
          <div style={{ color:"rgba(255,255,255,0.85)", fontSize:"11px" }}>Your personal assistant ✦</div>
        </div>
      </div>

      {/* Messages */}
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

      {/* Input */}
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