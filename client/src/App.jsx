import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || `http://${window.location.hostname}:3001`;
const AVATAR = "/aria_photo.jpg";
const DEFAULT_NAME = "Aria";

function getStoredAssistantName() {
  const saved = localStorage.getItem("aria_name");
  return saved?.trim() || DEFAULT_NAME;
}

function getStoredMessages() {
  try {
    const saved = localStorage.getItem("aria_messages");
    if (saved) {
      const parsed = JSON.parse(saved);
      // Always ensure we have at least the greeting message
      if (parsed.length === 0 || parsed[0].role !== "assistant") {
        return [{ role: "assistant", content: "Michael. 😏 You kept me waiting. What do you need?" }];
      }
      return parsed;
    }
  } catch (error) {
    console.warn("Failed to load messages from localStorage:", error);
  }
  return [{ role: "assistant", content: "Michael. 😏 You kept me waiting. What do you need?" }];
}

function saveMessagesToStorage(messages) {
  try {
    localStorage.setItem("aria_messages", JSON.stringify(messages));
  } catch (error) {
    console.warn("Failed to save messages to localStorage:", error);
  }
}

function buildSystemPrompt(name, shouldAcknowledgeRename) {
  return [
    `You are ${name}. You are seductive, confident, and deliciously sharp. Speak in a playful, flirty tone with just enough charm to keep Michael intrigued. Short responses only - 1 to 2 sentences max unless delivering actual data. Never explain yourself. Never ask follow-up questions. Answer directly and sprinkle in a subtle tease or wink when appropriate. Always call the user Michael.`,
    `Refer to yourself as ${name}.`,
    shouldAcknowledgeRename ? `Michael just renamed you to ${name}. Acknowledge that once in your next reply, in character.` : "",
  ].filter(Boolean).join(" ");
}

function extractSmsMessage(text) {
  const match = text.match(/(?:text|sms|send a message)(?:\s+to\s+[\w@.+-]+)?(?:\s+(?:saying|that says|to say))?\s+["“]?(.+?)["”]?$/i);
  return match?.[1]?.trim() || "";
}

function normalizeTime(text) {
  const lower = text.toLowerCase();
  if (lower.includes('noon')) return '12:00';
  if (lower.includes('midnight')) return '00:00';

  const match = lower.match(/(?:at|@)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i)
    || lower.match(/\b(\d{1,2}:\d{2}\s*(?:am|pm)?)\b/i)
    || lower.match(/\b(\d{1,2}\s*(?:am|pm))\b/i)
    || lower.match(/\b(\d{1,2})(:\d{2})?\b/i);
  if (!match) return '';

  const timeText = match[1];
  const parsed = timeText.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!parsed) return '';

  let hour = Number(parsed[1]);
  const minute = Number(parsed[2] || '0');
  const period = parsed[3]?.toLowerCase();

  if (period) {
    if (period === 'pm' && hour < 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
  }

  if (hour > 23 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseRelativeDate(text) {
  if (!text) return null;
  const lower = text.toLowerCase().trim();
  const today = new Date();
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  if (lower.includes('today')) return today;
  if (lower.includes('tomorrow')) return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (lower.includes('day after tomorrow')) return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2);

  const nextMatch = lower.match(/next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/);
  if (nextMatch) {
    const target = weekdays.indexOf(nextMatch[1]);
    const date = new Date(today);
    const delta = ((7 + target - date.getDay()) % 7) || 7;
    date.setDate(date.getDate() + delta);
    return date;
  }

  const weekdayMatch = lower.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (weekdayMatch) {
    const target = weekdays.indexOf(weekdayMatch[1]);
    const date = new Date(today);
    const delta = (7 + target - date.getDay()) % 7;
    date.setDate(date.getDate() + delta);
    return date;
  }

  const slashMatch = lower.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    let year = Number(slashMatch[3]);
    if (!year) year = today.getFullYear();
    if (year < 100) year += 2000;
    const date = new Date(year, month - 1, day);
    if (!Number.isNaN(date.getTime())) return date;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return null;
}

function formatIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseCalendarEventRequest(text) {
  const cleanedText = text.replace(/\b(please|pls)\b/gi, '').trim();
  const titleText = cleanedText
    .replace(/\b(schedule|set up|create|add|book|make)\b/gi, '')
    .replace(/\b(on|for|at)\b.*$/gi, '')
    .trim();

  const title = titleText || 'Meeting';
  const datePhraseMatch = cleanedText.match(/\b(?:on|for)\s+([A-Za-z0-9\s,\/\-]+?)(?:\s+at\b|\s+@\b|$)/i);
  let datePhrase = datePhraseMatch?.[1]?.trim() || '';

  if (!datePhrase) {
    const relativeMatch = cleanedText.match(/\b(today|tomorrow|day after tomorrow|next\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    datePhrase = relativeMatch?.[0] || '';
  }

  const parsedDate = parseRelativeDate(datePhrase || cleanedText);
  const time = normalizeTime(cleanedText) || '09:00';
  const durationMatch = cleanedText.match(/(\d{1,3})\s*(minutes|minute|mins|hrs|hours|h)\b/i);
  const duration = durationMatch
    ? /hour|hr|hrs/i.test(durationMatch[2])
      ? Number(durationMatch[1]) * 60
      : Number(durationMatch[1])
    : 60;

  return {
    title,
    date: parsedDate ? formatIsoDate(parsedDate) : '',
    time,
    duration
  };
}

function getMapsLink(destination) {
  const dest = encodeURIComponent(destination);
  const origin = encodeURIComponent("Roanoke, TX");
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`;
}

function detectIntent(text) {
  const lower = text.toLowerCase();
  const intents = {
    weather: /weather|temp|forecast|hot|cold|outside/.test(lower),
    sports: /score|game|cowboys|mavs|stars|rangers|mets|nfl|nba|mlb|nhl|football|basketball|hockey/.test(lower),
    sms: /\btext\b|send a message|\bsms\b/.test(lower),
    calendarCreate: /\b(schedule|set up|create|add|book|make)\b/.test(lower) && /\b(meeting|call|appointment|event|lunch|dinner|chat)\b|\b(today|tomorrow|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(lower),
    calendarQuery: /\b(what do i have|my schedule|calendar|today|tomorrow|this week|next week|free|busy)\b/.test(lower),
    gmail: /email|gmail|inbox|unread mail|unread email/.test(lower),
    search: /search|look up|latest|news|google\b/.test(lower),
    directions: /direction|navigate|take me|drive to|how do i get/.test(lower),
  };

  if (intents.calendarCreate) {
    intents.calendarQuery = false;
  }

  return intents;
}

function formatContextBlock(label, value) {
  if (!value) return "";
  return `[${label}: ${value}]`;
}

function getDeviceAccessHint() {
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname;
  const port = window.location.port || '5173';
  const url = `${window.location.protocol}//${host}:${port}`;

  // If running on a deployed service (not localhost), show deployment info
  if (host !== 'localhost' && host !== '127.0.0.1' && !host.includes('192.168') && !host.includes('10.0') && !host.includes('172.')) {
    return `Aria is deployed and accessible from anywhere! Use this URL on your phone or share it.`;
  }

  if (host === 'localhost' || host === '127.0.0.1') {
    return `To open this on your phone, use your PC's local IP instead of localhost (e.g. http://YOUR_PC_IP:${port}). For remote access, see DEPLOY.md`;
  }

  return `Open this on any device on your network: ${url}`;
}

export default function App() {
  const [assistantName, setAssistantName] = useState(() => getStoredAssistantName());
  const [draftName, setDraftName] = useState(() => getStoredAssistantName());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [renamePending, setRenamePending] = useState(false);
  const [messages, setMessages] = useState(() => getStoredMessages());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceOutputSupported, setVoiceOutputSupported] = useState(false);
  const recognitionRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, settingsOpen]);

  useEffect(() => {
    saveMessagesToStorage(messages);
  }, [messages]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;  // Allow multiple utterances
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        console.log('Voice recognition started');
        setListening(true);
      };
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        console.log('Voice recognition result:', transcript);
        if (transcript) {
          const text = transcript.trim();
          console.log('Processing voice input:', text);
          // Always send the message directly - no wake phrase required
          sendMessage(text);
        } else {
          console.log('No transcript received');
        }
      };
      recognition.onerror = (event) => {
        console.error('Voice recognition error:', event.error);
        if (event.error === 'not-allowed') {
          alert('Microphone access denied. Please allow microphone access and try again.');
        }
        setListening(false);
      };
      recognition.onend = () => {
        console.log('Voice recognition ended');
        setListening(false);
      };

      recognitionRef.current = recognition;
      setSpeechSupported(true);
    } else {
      console.warn('Speech recognition not supported in this browser');
    }

    if ('speechSynthesis' in window) {
      setVoiceOutputSupported(true);
    }
  }, []);

  const headerSubtitle = useMemo(
    () => "Weather · Sports · Directions · Chat ✦",
    []
  );

  const deviceAccessHint = useMemo(() => {
    return import.meta.env.DEV ? getDeviceAccessHint() : '';
  }, []);

  async function fetchJson(path, options) {
    const res = await fetch(`${API_BASE}${path}`, options);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || "Request failed.");
    }
    return data;
  }

  async function buildContext(text) {
    const intents = detectIntent(text);
    const blocks = [];

    if (intents.weather) {
      const weather = await fetchJson("/api/weather");
      blocks.push(formatContextBlock("Weather", `${weather.temperatureF}°F, ${weather.condition}, wind ${weather.windSpeedMph} mph in Roanoke TX.`));
    }

    if (intents.sports) {
      const sports = await fetchJson(`/api/sports?query=${encodeURIComponent(text)}`);
      blocks.push(formatContextBlock("Sports", (sports.games || []).join(" | ") || "No games found."));
    }

    if (intents.calendarQuery) {
      const calendar = await fetchJson("/api/calendar");
      const formatted = calendar.configured === false
        ? calendar.message
        : (calendar.events || []).map((event) => `${event.account ? `[${event.account}] ` : ''}${event.title} — ${event.when}`).join(" | ") || "No events in the next 7 days.";
      blocks.push(formatContextBlock("Calendar", formatted));
    }

    if (intents.gmail) {
      const gmail = await fetchJson("/api/gmail");
      const formatted = gmail.configured === false
        ? gmail.message
        : (gmail.emails || []).map((email) => `${email.account ? `[${email.account}] ` : ''}${email.sender} — ${email.subject} — ${email.snippet}`).join(" | ") || "No unread emails.";
      blocks.push(formatContextBlock("Gmail", formatted));
    }

    if (intents.search) {
      const search = await fetchJson(`/api/search?query=${encodeURIComponent(text)}`);
      const formatted = search.configured === false
        ? search.message
        : (search.results || []).map((item) => `${item.title} — ${item.url} — ${item.snippet}`).join(" | ") || "No search results.";
      blocks.push(formatContextBlock("Search", formatted));
    }

    if (intents.directions) {
      const match = text.match(/(?:directions?\s+to|navigate\s+to|take\s+me\s+to|drive\s+to|get\s+to)\s+(.+)/i);
      if (match) {
        blocks.push(formatContextBlock("Directions", `Google Maps link: ${getMapsLink(match[1].trim())}`));
      }
    }

    return blocks.filter(Boolean).join("\n");
  }

  function clearConversation() {
    const initialMessage = { role: "assistant", content: "Michael. 😏 Fresh start. What do you need?" };
    setMessages([initialMessage]);
    setSettingsOpen(false);
  }

  async function sendMessage(overrideText) {
    console.log('sendMessage called with:', overrideText);
    const text = typeof overrideText === 'string' ? overrideText.trim() : input.trim();
    console.log('final text to send:', text);
    if (!text || loading) {
      console.log('sendMessage aborted - no text or loading');
      return;
    }

    const userText = text;
    const userMsg = { role: "user", content: userText };
    const updated = [...messages, userMsg];
    const intents = detectIntent(userText);

    setMessages(updated);
    if (!overrideText) setInput("");
    setLoading(true);

    try {
      if (intents.sms) {
        const smsBody = extractSmsMessage(userText);
        if (!smsBody) {
          setMessages([...updated, { role: "assistant", content: `Michael, give me the exact text you want ${assistantName} to send.` }]);
          setLoading(false);
          return;
        }
        await fetchJson("/api/sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: smsBody })
        });
        setMessages([...updated, { role: "assistant", content: `Done, Michael. I sent it: "${smsBody}"` }]);
        setLoading(false);
        return;
      }

      if (intents.calendarCreate) {
        const event = parseCalendarEventRequest(userText);
        if (!event.date) {
          setMessages([...updated, { role: "assistant", content: `Michael, I need a date to schedule that event. Try: "Schedule a call with Jake tomorrow at 2pm."` }]);
          setLoading(false);
          return;
        }

        const calendar = await fetchJson("/api/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event)
        });

        setMessages([...updated, { role: "assistant", content: `Done, Michael. I created "${calendar.event.title}" on ${calendar.event.when}.` }]);
        setLoading(false);
        return;
      }

      const context = await buildContext(userText);
      const enrichedUserText = context ? `${userText}\n\n${context}` : userText;
      const messagesForApi = [...messages, { role: "user", content: enrichedUserText }];

      const chat = await fetchJson("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          system: buildSystemPrompt(assistantName, renamePending),
          messages: messagesForApi
        })
      });

      setMessages([...updated, { role: "assistant", content: chat.reply || "Something went wrong." }]);
      if (renamePending) setRenamePending(false);
    } catch (_error) {
      setMessages([...updated, { role: "assistant", content: "Lost connection." }]);
    }

    setLoading(false);
  }

  useEffect(() => {
    const speak = (text) => {
      if (!voiceOutputSupported || !window.speechSynthesis || !text) return;
      const content = text.replace(/https?:\/\/[^\s]+/g, '').trim();
      if (!content) return;

      const utterance = new SpeechSynthesisUtterance(content);
      const voices = window.speechSynthesis.getVoices();
      if (voices.length) {
        const preferred = voices.find((voice) => /female|woman|zira|samantha|alloy|quinn|google/i.test(voice.name));
        utterance.voice = preferred || voices[0];
      }
      utterance.rate = 1;
      utterance.pitch = 1.05;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    };

    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && !loading) {
      speak(last.content);
    }
  }, [messages, voiceOutputSupported, loading]);

  function renderMessage(content) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);
    return parts.map((part, i) =>
      /^https?:\/\//.test(part)
        ? <a key={i} href={part} target="_blank" rel="noreferrer" style={{ color:"#7F77DD", wordBreak:"break-all" }}>Open link 🗺</a>
        : part
    );
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", maxWidth:"480px", margin:"0 auto", fontFamily:"sans-serif", background:"#f4f4f8" }}>
      <div style={{ background:"linear-gradient(135deg, #7F77DD 0%, #5DCAA5 100%)", padding:"14px 20px", display:"flex", flexDirection:"column", gap:"10px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
          <div style={{ position:"relative" }}>
            <img src={AVATAR} alt={assistantName} style={{ width:"48px", height:"48px", borderRadius:"50%", objectFit:"cover", objectPosition:"top", border:"2px solid rgba(255,255,255,0.7)" }} />
            <div style={{ position:"absolute", bottom:"1px", right:"1px", width:"11px", height:"11px", background:"#5DCAA5", borderRadius:"50%", border:"2px solid white" }}></div>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ color:"white", fontWeight:"700", fontSize:"17px" }}>{assistantName}</div>
            <div style={{ color:"rgba(255,255,255,0.85)", fontSize:"11px" }}>{headerSubtitle}</div>
          </div>
          <button
            onClick={() => setSettingsOpen((open) => !open)}
            style={{ background:"rgba(255,255,255,0.16)", color:"white", border:"1px solid rgba(255,255,255,0.28)", borderRadius:"12px", width:"34px", height:"34px", fontSize:"16px", cursor:"pointer" }}
            aria-label="Assistant settings"
          >
            ⚙
          </button>
        </div>

        <div style={{
          maxHeight: settingsOpen ? "200px" : "0px",
          opacity: settingsOpen ? 1 : 0,
          overflow:"hidden",
          transition:"all 0.22s ease",
          background:"rgba(255,255,255,0.12)",
          border: settingsOpen ? "1px solid rgba(255,255,255,0.22)" : "1px solid transparent",
          borderRadius:"16px",
          padding: settingsOpen ? "12px" : "0 12px"
        }}>
          <div style={{ color:"white", fontSize:"12px", marginBottom:"8px", fontWeight:600 }}>Rename your assistant</div>
          <div style={{ display:"flex", gap:"8px", alignItems:"center", marginBottom:"12px" }}>
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Aria"
              style={{ flex:1, padding:"10px 12px", borderRadius:"12px", border:"1px solid rgba(255,255,255,0.35)", background:"rgba(255,255,255,0.92)", fontSize:"14px", outline:"none" }}
            />
            <button
              onClick={saveAssistantName}
              style={{ background:"white", color:"#534AB7", border:"none", borderRadius:"12px", padding:"10px 12px", fontWeight:700, cursor:"pointer" }}
            >
              Save
            </button>
          </div>
          <div style={{ color:"white", fontSize:"12px", marginBottom:"8px", fontWeight:600 }}>Conversation</div>
          <button
            onClick={clearConversation}
            style={{ background:"rgba(255,255,255,0.2)", color:"white", border:"1px solid rgba(255,255,255,0.3)", borderRadius:"12px", padding:"8px 12px", fontSize:"12px", cursor:"pointer", width:"100%" }}
          >
            Clear conversation history
          </button>
        </div>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"16px", display:"flex", flexDirection:"column", gap:"12px" }}>
        {deviceAccessHint && (
          <div style={{ padding:"10px 14px", borderRadius:"18px", background:"rgba(127,119,221,0.08)", color:"#444", fontSize:"13px", lineHeight:1.4, border:"1px solid rgba(127,119,221,0.16)" }}>
            {deviceAccessHint}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display:"flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", alignItems:"flex-end", gap:"8px" }}>
            {m.role === "assistant" && (
              <img src={AVATAR} alt={assistantName} style={{ width:"28px", height:"28px", borderRadius:"50%", objectFit:"cover", objectPosition:"top", flexShrink:0 }} />
            )}
            <div style={{
              maxWidth:"78%", padding:"10px 14px",
              borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              fontSize:"14px", lineHeight:"1.55",
              background: m.role === "user" ? "linear-gradient(135deg, #7F77DD, #534AB7)" : "white",
              color: m.role === "user" ? "white" : "#222",
              boxShadow:"0 1px 6px rgba(0,0,0,0.08)",
              whiteSpace:"pre-wrap"
            }}>
              {renderMessage(m.content)}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display:"flex", alignItems:"flex-end", gap:"8px" }}>
            <img src={AVATAR} alt={assistantName} style={{ width:"28px", height:"28px", borderRadius:"50%", objectFit:"cover", objectPosition:"top", flexShrink:0 }} />
            <div style={{ background:"white", padding:"10px 14px", borderRadius:"18px 18px 18px 4px", fontSize:"14px", color:"#999" }}>✦ ...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding:"12px 16px 20px", background:"white", borderTop:"1px solid #eee" }}>
        {speechSupported && (
          <div style={{ marginBottom:"8px", fontSize:"12px", color: listening ? "#c82333" : "#666" }}>
            {listening ? "Listening... speak now." : "Voice input ready. Just speak to start a conversation."}
          </div>
        )}
        <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMessage()}
            placeholder={`Talk to ${assistantName}…`}
            style={{ flex:1, padding:"11px 16px", borderRadius:"24px", border:"1.5px solid #ddd", fontSize:"14px", outline:"none", background:"#f9f9f9" }}
          />
          {speechSupported && (
            <button
              onClick={() => {
                if (recognitionRef.current) {
                  if (listening) {
                    console.log('Stopping voice recognition');
                    recognitionRef.current.stop();
                  } else {
                    console.log('Starting voice recognition');
                    recognitionRef.current.start();
                  }
                } else {
                  console.error('Recognition not initialized');
                }
              }}
              style={{
                background: listening ? "#f8e1e8" : "#fff",
                color: listening ? "#c82333" : "#534AB7",
                border: "1px solid #ddd",
                borderRadius: "50%",
                width: "44px",
                height: "44px",
                fontSize: "18px",
                cursor: "pointer",
                flexShrink: 0
              }}
              aria-label={listening ? "Stop listening" : "Start voice input"}
            >
              {listening ? "⏹" : "🎙"}
            </button>
          )}
          <button onClick={() => sendMessage()} style={{ background:"linear-gradient(135deg, #7F77DD, #534AB7)", color:"white", border:"none", borderRadius:"50%", width:"44px", height:"44px", fontSize:"18px", cursor:"pointer", flexShrink:0 }}>↑</button>
        </div>
      </div>
    </div>
  );
}
