import { useEffect, useMemo, useRef, useState } from "react";
import ellyAvatar from "./assets/elly-clutch.avif";

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : 'https://aria-assistant-production-6730.up.railway.app'
const AVATAR = ellyAvatar;
const DEFAULT_NAME = "Aria";
const INITIAL_ASSISTANT_GREETING = "Michael. 😏 You kept me waiting. What do you need?";

function createMessage(role, content) {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
  };
}

function normalizeMessages(messages = []) {
  return messages
    .filter((message) => message && typeof message.content === "string" && typeof message.role === "string")
    .map((message) => (message.id ? message : createMessage(message.role, message.content)));
}

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
        return [createMessage("assistant", INITIAL_ASSISTANT_GREETING)];
      }
      return normalizeMessages(parsed);
    }
  } catch (error) {
    console.warn("Failed to load messages from localStorage:", error);
  }
  return [createMessage("assistant", INITIAL_ASSISTANT_GREETING)];
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
    .replace(/\b(can you|could you|i need to|i want to)\b/gi, '')
    .replace(/\b(schedule|set up|create|add|book|make)\b/gi, '')
    .replace(/\b(on|for|at)\b.*$/gi, '')
    .replace(/^\s*[a-z]+\s+/g, '')
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

function parseListRequest(text) {
  const lower = text.toLowerCase();
  const listName = /shopping|grocery|groceries|\bbuy\b|\bget\b|pick up/.test(lower) ? 'shopping' : 'todo';

  if (/\b(clear|empty|wipe|reset)\b/.test(lower)) return { action: 'clear', listName };

  if (/\b(remove|delete|take off|cross off|get rid of)\b/.test(lower)) {
    const match = text.match(/(?:remove|delete|take off|cross off|get rid of)\s+(.+?)(?:\s+(?:from|off)\s+(?:my\s+)?(?:list|shopping list|todo list))?$/i);
    return { action: 'remove', listName, item: match?.[1]?.trim() || '' };
  }

  if (/\b(check off|mark .+ (?:as )?(?:done|complete)|finished? with)\b/.test(lower)) {
    const match = text.match(/(?:check off|mark)\s+(.+?)(?:\s+as\s+(?:done|complete))?$/i)
      || text.match(/finished?\s+(?:with\s+)?(.+)/i);
    return { action: 'complete', listName, item: match?.[1]?.trim() || '' };
  }

  if (/\b(show|what'?s on|read back|see my|read my)\b/.test(lower) && !/\b(add|put|remove|check off)\b/.test(lower)) {
    return { action: 'show', listName };
  }

  const addMatch = text.match(/(?:add|put)\s+(.+?)\s+(?:to|on)\s+(?:my\s+)?(?:list|shopping list|todo list|groceries|grocery list)/i)
    || text.match(/(?:pick up|buy|get)\s+(.+)/i)
    || text.match(/(?:remind me to (?:buy|get|pick up))\s+(.+)/i)
    || text.match(/(?:remind me to)\s+(.+)/i)
    || text.match(/(?:add|put)\s+(.+)/i);
  if (addMatch) return { action: 'add', listName, item: addMatch[1].trim() };

  return { action: 'show', listName };
}

function formatList(list) {
  if (!list?.length) return '(empty)';
  return list.map((it, i) => `${i + 1}. ${it.done ? '✓' : '•'} ${it.text}`).join('\n');
}

function parseReminderRequest(text) {
  const lower = text.toLowerCase();

  let recurring = 'none';
  if (/\b(every day|daily)\b/.test(lower)) recurring = 'daily';
  else if (/\b(every week|weekly)\b/.test(lower)) recurring = 'weekly';

  const time = normalizeTime(text);

  const dateKeywords = [
    'day after tomorrow', 'tomorrow', 'today',
    'next sunday', 'next monday', 'next tuesday', 'next wednesday', 'next thursday', 'next friday', 'next saturday',
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  ];
  let datePhrase = '';
  for (const kw of dateKeywords) {
    if (lower.includes(kw)) { datePhrase = kw; break; }
  }
  const parsedDate = parseRelativeDate(datePhrase || 'today');
  const dateStr = parsedDate ? formatIsoDate(parsedDate) : formatIsoDate(new Date());
  const resolvedTime = time || '09:00';
  const datetime = new Date(`${dateStr}T${resolvedTime}:00`);

  let cleaned = text
    .replace(/\b(remind me|set a reminder|don't let me forget|alert me|notify me|reminder for)\b\s*/gi, '')
    .replace(/\b(every day|daily|every week|weekly)\b\s*/gi, '')
    .replace(/\b(at|@)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b\s*/gi, '')
    .replace(/\b\d{1,2}:\d{2}\b\s*/g, '')
    .replace(/\b(at noon|noon|at midnight|midnight)\b\s*/gi, '')
    .replace(/\b(on|for)\s+(day after tomorrow|tomorrow|today|next\s+\w+|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b\s*/gi, '')
    .replace(/\b(day after tomorrow|tomorrow|today|next\s+\w+|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(to|about|that|for|at|on|and)\s+/i, '')
    .trim();

  return {
    text: cleaned || text.trim(),
    datetime: Number.isNaN(datetime.getTime()) ? null : datetime.toISOString(),
    hasTime: Boolean(time),
    recurring,
  };
}

function formatReminderAlert(text) {
  const h = new Date().getHours();
  const tod = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  const openers = [
    `Hey Michael — ${tod} check. Don't forget: ${text}. 😏`,
    `Michael. It's time. ${text.charAt(0).toUpperCase() + text.slice(1)}. You asked me to remind you. 😌`,
    `Heads up, Michael — ${text}. You set this reminder. Don't make me say it twice. 😘`,
  ];
  return openers[Math.floor(Math.random() * openers.length)];
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
      calendarQuery: /\b(my calendar|my schedule|what do i have|my appointments|my events)\b/.test(lower),
      gmail: /email|gmail|inbox|unread mail|unread email/.test(lower),
      list: /\b(shopping list|grocery list|groceries|to-do|todo list|my list|add to (?:my )?list|remind me to (?:buy|get|pick up)|pick up\b|what'?s on my|show my list|read (?:my |back )?(?:shopping|todo|grocery) list|check off|remove from (?:my )?list|clear (?:my )?(?:shopping|todo|grocery|) ?list|add .+ to (?:my )?(shopping|todo|grocery)|from my list)\b/.test(lower),
      reminder: /\b(remind me(?! to (?:buy|get|pick up))|set a reminder|reminder for|don't let me forget|alert me|notify me|remind me at|remind me on|remind me tomorrow|remind me every)\b/.test(lower),
      directions: /direction|navigate|take me|drive to|how do i get/.test(lower),
      search: false, // Default to false, will be set as fallback
    };

    if (intents.calendarCreate) {
      intents.calendarQuery = false;
    }
    if (intents.reminder) {
      intents.calendarCreate = false;
      intents.list = false;
    }
    if (intents.list) {
      // List intent is a specific action, we don't need search
    } else {
      // If no other specific action/query intent is matched, trigger search as fallback
      const hasOtherIntent = intents.weather || intents.sports || intents.sms || 
                              intents.calendarCreate || intents.calendarQuery || 
                              intents.gmail || intents.reminder || intents.directions;
      
      if (!hasOtherIntent || /search|look up|find|what is|when does|who is|latest/.test(lower)) {
        intents.search = true;
      }
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
  console.log(`Aria Frontend connecting to API at: ${API_BASE}`);
  const [assistantName, setAssistantName] = useState(() => getStoredAssistantName());
  const [draftName, setDraftName] = useState(() => getStoredAssistantName());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [renamePending, setRenamePending] = useState(false);
  const [messages, setMessages] = useState(() => getStoredMessages());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const recognitionRef = useRef(null);
  const activeAudioRef = useRef(null);
  const ttsCacheRef = useRef(new Map());
  const bottomRef = useRef(null);
  const memoryInitialized = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, settingsOpen]);

  useEffect(() => {
    saveMessagesToStorage(messages);
  }, [messages]);

  useEffect(() => {
    setMessages((current) => normalizeMessages(current));
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/memory`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.messages) && data.messages.length) {
          const normalized = normalizeMessages(data.messages);
          setMessages(normalized);
          saveMessagesToStorage(normalized);
        }
      })
      .catch(() => {})
      .finally(() => { memoryInitialized.current = true; });
  }, []);

  useEffect(() => {
    if (!memoryInitialized.current) return;
    fetch(`${API_BASE}/api/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    }).catch(() => {});
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

  }, []);

  useEffect(() => {
    async function checkDue() {
      try {
        const due = await fetchJson('/api/reminders/due');
        if (!due?.length) return;
        for (const reminder of due) {
          setMessages((prev) => [...prev, createMessage('assistant', formatReminderAlert(reminder.text))]);
          if (reminder.recurring !== 'none') {
            const next = new Date(reminder.datetime);
            if (reminder.recurring === 'daily') next.setDate(next.getDate() + 1);
            else if (reminder.recurring === 'weekly') next.setDate(next.getDate() + 7);
            await fetchJson(`/api/reminders/${reminder.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ datetime: next.toISOString() })
            });
          } else {
            await fetchJson(`/api/reminders/${reminder.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fired: true })
            });
          }
        }
      } catch {}
    }
    checkDue();
    const interval = setInterval(checkDue, 60000);
    return () => clearInterval(interval);
  }, []);

  const headerSubtitle = useMemo(
    () => "Weather · Sports · Directions · Chat ✦",
    []
  );

  const deviceAccessHint = useMemo(() => {
    return import.meta.env.DEV ? getDeviceAccessHint() : '';
  }, []);

  async function fetchJson(path, options) {
    console.log(`Fetching: ${API_BASE}${path}`);
    try {
      const res = await fetch(`${API_BASE}${path}`, options);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Request failed with status ${res.status}`);
      }
      return data;
    } catch (err) {
      console.error(`Fetch error for ${path}:`, err);
      throw err;
    }
  }

  function sanitizeSpeechText(text) {
    const cleaned = String(text || "")
      .replace(/https?:\/\/[^\s]+/g, "")
      .replace(/\*[^*]+\*/g, " ")
      .replace(/:[a-z0-9_+\-]+:/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned;
  }

  async function fetchTtsAudio(text) {
    const content = sanitizeSpeechText(text);
    console.log("[TTS] fetchTtsAudio start", { originalLength: String(text || "").length, cleanedText: content, cleanedLength: content.length });
    if (!content) {
      console.log("[TTS] fetchTtsAudio aborted: cleaned text is empty");
      return null;
    }

    try {
      console.log("[TTS] POST /api/tts");
      const result = await fetchJson("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content })
      });
      console.log("[TTS] /api/tts response received", {
        hasAudioContent: Boolean(result?.audioContent),
        audioLength: result?.audioContent?.length || 0
      });
      return result?.audioContent || null;
    } catch (error) {
      console.warn("[TTS] request failed:", error);
      return null;
    }
  }

  function playAudioContent(audioContent) {
    console.log("[TTS] playAudioContent start", {
      hasAudioContent: Boolean(audioContent),
      audioLength: audioContent?.length || 0
    });

    if (!audioContent) {
      console.log("[TTS] playAudioContent aborted", {
        reason: "missing audio"
      });
      return;
    }

    if (activeAudioRef.current) {
      console.log("[TTS] stopping previous audio");
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
    }

    const audioUrl = "data:audio/mp3;base64," + audioContent;
    console.log("[TTS] creating Audio object");
    const audio = new Audio(audioUrl);
    activeAudioRef.current = audio;
    audio.onended = () => {
      console.log("[TTS] audio ended");
      if (activeAudioRef.current === audio) {
        activeAudioRef.current = null;
      }
    };
    audio.onerror = () => {
      console.warn("[TTS] audio error");
      if (activeAudioRef.current === audio) {
        activeAudioRef.current = null;
      }
    };
    console.log("[TTS] calling audio.play()");
    audio.play()
      .then(() => {
        console.log("[TTS] audio.play() resolved");
      })
      .catch((error) => {
        console.warn("[TTS] audio.play() failed:", error);
      });
  }

  async function speakAssistantMessage(message, options = {}) {
    if (!message?.content) return;
    const { force = false } = options;
    const messageId = message.id || message.content;
    const audioKey = `${messageId}::${sanitizeSpeechText(message.content)}`;
    console.log("[TTS] speakAssistantMessage", { messageId, force, audioKey, voiceEnabled });

    if (!force) {
      if (!voiceEnabled) {
        console.log("[TTS] speakAssistantMessage skipped", {
          voiceEnabled,
          reason: "voice disabled"
        });
        return;
      }
    }

    if (ttsCacheRef.current.has(audioKey)) {
      console.log("[TTS] cache hit");
      playAudioContent(ttsCacheRef.current.get(audioKey));
      return;
    }

    console.log("[TTS] cache miss, fetching audio");
    const audioContent = await fetchTtsAudio(message.content);
    if (!audioContent) {
      console.log("[TTS] no audio returned from /api/tts");
      return;
    }

    ttsCacheRef.current.set(audioKey, audioContent);
    console.log("[TTS] audio cached, playing");
    playAudioContent(audioContent);
  }

  async function buildContext(text) {
    const intents = detectIntent(text);
    const blocks = [];

    if (intents.weather) {
      try {
        const weather = await fetchJson("/api/weather");
        blocks.push(formatContextBlock("Weather", `${weather.temperatureF}°F, ${weather.condition}, wind ${weather.windSpeedMph} mph in Roanoke TX.`));
      } catch (e) {
        console.error("Weather context failed:", e);
      }
    }

    if (intents.sports) {
      try {
        const sports = await fetchJson(`/api/sports?query=${encodeURIComponent(text)}`);
        blocks.push(formatContextBlock("Sports", (sports.games || []).join(" | ") || "No games found."));
      } catch (e) {
        console.error("Sports context failed:", e);
      }
    }

    if (intents.calendarQuery) {
      try {
        const calendar = await fetchJson("/api/calendar");
        const formatted = calendar.configured === false
          ? calendar.message
          : (calendar.events || []).map((event) => `${event.account ? `[${event.account}] ` : ''}${event.title} — ${event.when}`).join(" | ") || "No events in the next 7 days.";
        blocks.push(formatContextBlock("Calendar", formatted));
      } catch (e) {
        console.error("Calendar context failed:", e);
      }
    }

    if (intents.gmail) {
      try {
        const gmail = await fetchJson("/api/gmail");
        const formatted = gmail.configured === false
          ? gmail.message
          : (gmail.emails || []).map((email) => `${email.account ? `[${email.account}] ` : ''}${email.sender} — ${email.subject} — ${email.snippet}`).join(" | ") || "No unread emails.";
        blocks.push(formatContextBlock("Gmail", formatted));
      } catch (e) {
        console.error("Gmail context failed:", e);
      }
    }

    if (intents.search) {
      try {
        const search = await fetchJson(`/api/search?query=${encodeURIComponent(text)}`);
        if (search.configured === false || !search.results || search.results.length === 0) {
          blocks.push(formatContextBlock("Search", "Search failed or no results found. Start your response with 'I can't search right now, but here's what I know...' and answer from your own knowledge."));
        } else {
          const results = search.results;
          const formatted = results.map((item, i) => `${i + 1}. Title: ${item.title}\nSnippet: ${item.snippet}\nLink: ${item.link}`).join("\n\n");
          blocks.push(formatContextBlock("Search Results (summarize these conversationally in 1-2 sentences)", formatted));
        }
      } catch (error) {
        blocks.push(formatContextBlock("Search", "Search API call failed. Start your response with 'I can't search right now, but here's what I know...' and answer from your own knowledge."));
      }
    }

    if (intents.directions) {
      const match = text.match(/(?:directions?\s+to|navigate\s+to|take\s+me\s+to|drive\s+to|get\s+to)\s+(.+)/i);
      if (match) {
        blocks.push(formatContextBlock("Directions", `Google Maps link: ${getMapsLink(match[1].trim())}`));
      }
    }

    return blocks.filter(Boolean).join("\n");
  }

  function saveAssistantName() {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    localStorage.setItem("aria_name", trimmed);
    setAssistantName(trimmed);
    setRenamePending(true);
    setSettingsOpen(false);
  }

  function clearConversation() {
    const initialMessage = createMessage("assistant", "Michael. 😏 Fresh start. What do you need?");
    setMessages([initialMessage]);
    saveMessagesToStorage([initialMessage]);
    fetch(`${API_BASE}/api/memory`, { method: 'DELETE' }).catch(() => {});
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

    let assistantReplySent = false;
    const userText = text;
    const userMsg = createMessage("user", userText);
    const updated = [...messages, userMsg];
    const intents = detectIntent(userText);
    const appendAssistantReply = async (replyText) => {
      if (assistantReplySent) {
        console.warn("[sendMessage] appendAssistantReply skipped: reply already sent", { replyText });
        return;
      }
      assistantReplySent = true;
      console.log("[sendMessage] appendAssistantReply", { replyText });
      const assistantMessage = createMessage("assistant", replyText);
      setMessages([...updated, assistantMessage]);
      await speakAssistantMessage(assistantMessage);
    };

    setMessages(updated);
    if (!overrideText) setInput("");
    setLoading(true);

    try {
      if (intents.sms) {
        const smsBody = extractSmsMessage(userText);
        if (!smsBody) {
          console.log("[sendMessage] sms branch: missing sms body");
          await appendAssistantReply(`Michael, give me the exact text you want ${assistantName} to send.`);
          setLoading(false);
          return;
        }
        console.log("[sendMessage] sms branch: sending SMS");
        await fetchJson("/api/sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: smsBody })
        });
        await appendAssistantReply(`Done, Michael. I sent it: "${smsBody}"`);
        setLoading(false);
        return;
      }

      if (intents.calendarCreate) {
        const event = parseCalendarEventRequest(userText);
        if (!event.date) {
          console.log("[sendMessage] calendar branch: missing date");
          await appendAssistantReply(`Michael, I need a date to schedule that event. Try: "Schedule a call with Jake tomorrow at 2pm."`);
          setLoading(false);
          return;
        }

        console.log("[sendMessage] calendar branch: creating event");
        const calendar = await fetchJson("/api/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event)
        });

        if (!calendar?.success) {
          await appendAssistantReply(`Michael, something went wrong — the event was not created. Error: ${calendar?.error || 'Unknown error'}`);
          setLoading(false);
          return;
        }

        await appendAssistantReply(`Done, Michael. I created "${calendar.event.title}" on ${calendar.event.when}.`);
        setLoading(false);
        return;
      }

      if (intents.reminder) {
        const parsed = parseReminderRequest(userText);
        if (!parsed.hasTime) {
          console.log("[sendMessage] reminder branch: missing time");
          await appendAssistantReply(`Michael, I need a time for that. Try: "Remind me at 3pm to pick up the kids."`);
          setLoading(false);
          return;
        }
        if (!parsed.datetime) {
          console.log("[sendMessage] reminder branch: invalid date");
          await appendAssistantReply(`Something's off with that date, Michael. Try again with a clearer time.`);
          setLoading(false);
          return;
        }
        try {
          console.log("[sendMessage] reminder branch: creating reminder");
          const result = await fetchJson('/api/reminders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: parsed.text, datetime: parsed.datetime, recurring: parsed.recurring })
          });
          const when = new Date(parsed.datetime).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
          const recurringNote = parsed.recurring !== 'none' ? `, repeating ${parsed.recurring}` : '';
          const contextMsg = `[Action: Created reminder — "${result.reminder.text}" on ${when}${recurringNote}. Confirm casually in Aria's voice.]`;
          const messagesForApi = [...messages, createMessage('user', `${userText}\n\n${contextMsg}`)];
          const chat = await fetchJson('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'claude-sonnet-4-20250514', system: buildSystemPrompt(assistantName, renamePending), messages: messagesForApi })
          });
          await appendAssistantReply(chat.reply || 'Done.');
          if (renamePending) setRenamePending(false);
        } catch (e) {
          await appendAssistantReply(`Couldn't set that reminder, Michael. ${e.message}`);
        }
        setLoading(false);
        return;
      }

      if (intents.list) {
        const req = parseListRequest(userText);
        let contextMsg = '';
        try {
          console.log("[sendMessage] list branch", { action: req.action, listName: req.listName });
          if (req.action === 'add' && req.item) {
            const result = await fetchJson('/api/lists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ listName: req.listName, item: req.item })
            });
            contextMsg = `[Action: Added "${req.item}" to ${req.listName} list]\n[Current ${req.listName} list:\n${formatList(result.lists[req.listName])}]`;
          } else if (req.action === 'remove' && req.item) {
            const lists = await fetchJson('/api/lists');
            const list = lists[req.listName] || [];
            const idx = list.findIndex(it => it.text.toLowerCase().includes(req.item.toLowerCase()));
            if (idx === -1) {
              contextMsg = `[Could not find "${req.item}" on the ${req.listName} list]\n[Current ${req.listName} list:\n${formatList(list)}]`;
            } else {
              const result = await fetchJson(`/api/lists/${req.listName}/${idx}`, { method: 'DELETE' });
              contextMsg = `[Action: Removed "${list[idx].text}" from ${req.listName} list]\n[Current ${req.listName} list:\n${formatList(result.lists[req.listName])}]`;
            }
          } else if (req.action === 'complete' && req.item) {
            const lists = await fetchJson('/api/lists');
            const list = lists[req.listName] || [];
            const idx = list.findIndex(it => it.text.toLowerCase().includes(req.item.toLowerCase()));
            if (idx === -1) {
              contextMsg = `[Could not find "${req.item}" on the ${req.listName} list]\n[Current ${req.listName} list:\n${formatList(list)}]`;
            } else {
              const result = await fetchJson(`/api/lists/${req.listName}/${idx}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ done: true })
              });
              contextMsg = `[Action: Marked "${list[idx].text}" as done on ${req.listName} list]\n[Current ${req.listName} list:\n${formatList(result.lists[req.listName])}]`;
            }
          } else if (req.action === 'clear') {
            const lists = await fetchJson('/api/lists');
            const list = lists[req.listName] || [];
            for (let i = list.length - 1; i >= 0; i--) {
              await fetchJson(`/api/lists/${req.listName}/${i}`, { method: 'DELETE' });
            }
            contextMsg = `[Action: Cleared all items from ${req.listName} list]`;
          } else {
            const lists = await fetchJson('/api/lists');
            contextMsg = `[Current ${req.listName} list:\n${formatList(lists[req.listName])}]`;
          }
        } catch (e) {
          contextMsg = `[List error: ${e.message}]`;
        }

        const messagesForApi = [...messages, createMessage('user', `${userText}\n\n${contextMsg}`)];
        const chat = await fetchJson('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            system: buildSystemPrompt(assistantName, renamePending),
            messages: messagesForApi
          })
        });
        await appendAssistantReply(chat.reply || 'Something went wrong.');
        if (renamePending) setRenamePending(false);
        setLoading(false);
        return;
      }

      const context = await buildContext(userText);
      const enrichedUserText = context ? `${userText}\n\n${context}` : userText;
      const messagesForApi = [...messages, createMessage("user", enrichedUserText)];

      console.log("[sendMessage] default chat branch");
      const chat = await fetchJson("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          system: buildSystemPrompt(assistantName, renamePending),
          messages: messagesForApi
        })
      });

      await appendAssistantReply(chat.reply || "Something went wrong.");
      if (renamePending) setRenamePending(false);
    } catch (error) {
      console.error("Chat API Error:", error);
      await appendAssistantReply(`Lost connection. (Error: ${error.message})`);
    }

    setLoading(false);
  }

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
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", maxWidth:"480px", margin:"0 auto", fontFamily:"sans-serif", background:"#f4f4f8", color:"#1a1a1a", colorScheme:"only light" }}>
      <div style={{ background:"linear-gradient(135deg, #7F77DD 0%, #5DCAA5 100%)", display:"flex", flexDirection:"column" }}>
        <div style={{ display:"flex", alignItems:"stretch", height:"88px", overflow:"hidden" }}>
          <div style={{ position:"relative", width:"88px", flexShrink:0 }}>
            <img src={AVATAR} alt={assistantName} style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:"top center" }} />
            <div style={{ position:"absolute", bottom:"8px", right:"8px", width:"11px", height:"11px", background:"#5DCAA5", borderRadius:"50%", border:"2px solid white" }}></div>
          </div>
          <div style={{ display:"flex", alignItems:"center", flex:1, gap:"12px", padding:"0 16px 0 14px" }}>
            <div style={{ flex:1 }}>
              <div style={{ color:"white", fontWeight:"700", fontSize:"17px" }}>{assistantName}</div>
              <div style={{ color:"rgba(255,255,255,0.85)", fontSize:"11px" }}>{headerSubtitle}</div>
            </div>
            <button
              onClick={() => setVoiceEnabled((enabled) => !enabled)}
              style={{ background: voiceEnabled ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)", color:"white", border:"1px solid rgba(255,255,255,0.28)", borderRadius:"12px", width:"34px", height:"34px", fontSize:"16px", cursor:"pointer" }}
              aria-label={voiceEnabled ? "Mute voice output" : "Unmute voice output"}
            >
              {voiceEnabled ? "🔊" : "🔇"}
            </button>
            <button
              onClick={() => setSettingsOpen((open) => !open)}
              style={{ background:"rgba(255,255,255,0.16)", color:"white", border:"1px solid rgba(255,255,255,0.28)", borderRadius:"12px", width:"34px", height:"34px", fontSize:"16px", cursor:"pointer" }}
              aria-label="Assistant settings"
            >
              ⚙
            </button>
          </div>
        </div>

        <div style={{
          maxHeight: settingsOpen ? "200px" : "0px",
          opacity: settingsOpen ? 1 : 0,
          overflow:"hidden",
          transition:"all 0.22s ease",
          background:"rgba(255,255,255,0.12)",
          border: settingsOpen ? "1px solid rgba(255,255,255,0.22)" : "1px solid transparent",
          borderRadius:"16px",
          margin: settingsOpen ? "0 12px 12px" : "0 12px",
          padding: settingsOpen ? "12px" : "0 12px"
        }}>
          <div style={{ color:"white", fontSize:"12px", marginBottom:"8px", fontWeight:600 }}>Rename your assistant</div>
          <div style={{ display:"flex", gap:"8px", alignItems:"center", marginBottom:"12px" }}>
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Aria"
              style={{ flex:1, padding:"10px 12px", borderRadius:"12px", border:"1px solid rgba(255,255,255,0.35)", background:"rgba(255,255,255,0.92)", color:"#1a1a1a", fontSize:"14px", outline:"none" }}
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
            Clear Memory
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
          <div key={m.id || i} style={{ display:"flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", alignItems:"flex-end", gap:"8px" }}>
            {m.role === "assistant" && (
              <img src={AVATAR} alt={assistantName} style={{ width:"28px", height:"28px", borderRadius:"50%", objectFit:"cover", objectPosition:"top", flexShrink:0, transition:"transform 0.3s ease", transform: loading && i === messages.length - 1 ? "scale(1.3)" : "scale(1)" }} />
            )}
            {m.role === "assistant" ? (
              <div style={{ display:"flex", alignItems:"flex-end", gap:"6px", maxWidth:"78%" }}>
                <div style={{
                  padding:"10px 14px",
                  borderRadius:"18px 18px 18px 4px",
                  fontSize:"14px", lineHeight:"1.55",
                  background:"#ffffff",
                  color:"#222222",
                  WebkitTextFillColor:"#222222",
                  boxShadow:"0 1px 6px rgba(0,0,0,0.08)",
                  whiteSpace:"pre-wrap"
                }}>
                  {renderMessage(m.content)}
                </div>
                <button
                  onClick={() => speakAssistantMessage(m, { force: true })}
                  aria-label="Replay voice"
                  style={{
                    width:"28px",
                    height:"28px",
                    borderRadius:"50%",
                    border:"1px solid #ddd",
                    background:"#fff",
                    color:"#534AB7",
                    cursor:"pointer",
                    flexShrink:0,
                    fontSize:"14px",
                    opacity:1
                  }}
                >
                  🔊
                </button>
              </div>
            ) : (
              <div style={{
                maxWidth:"78%", padding:"10px 14px",
                borderRadius:"18px 18px 4px 18px",
                fontSize:"14px", lineHeight:"1.55",
                background:"linear-gradient(135deg, #7F77DD, #534AB7)",
                color:"#ffffff",
                WebkitTextFillColor:"#ffffff",
                boxShadow:"0 1px 6px rgba(0,0,0,0.08)",
                whiteSpace:"pre-wrap"
              }}>
                {renderMessage(m.content)}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ display:"flex", alignItems:"flex-end", gap:"8px" }}>
            <img src={AVATAR} alt={assistantName} style={{ width:"28px", height:"28px", borderRadius:"50%", objectFit:"cover", objectPosition:"top", flexShrink:0, transition:"transform 0.3s ease", transform:"scale(1.3)" }} />
            <div style={{ background:"#ffffff", padding:"10px 14px", borderRadius:"18px 18px 18px 4px", fontSize:"14px", color:"#999999", WebkitTextFillColor:"#999999" }}>✦ ...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding:"12px 16px 20px", background:"white", color:"#1a1a1a", borderTop:"1px solid #eee" }}>
        {speechSupported && (
          <div style={{ marginBottom:"8px", fontSize:"12px", color: listening ? "#c82333" : "#666" }}>
            {listening ? "Listening... speak now." : "Voice input ready. Just speak to start a conversation."}
          </div>
        )}
        <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMessage()}
            placeholder={`Talk to ${assistantName}…`}
            style={{ flex:1, padding:"11px 16px", borderRadius:"24px", border:"1.5px solid #ddd", fontSize:"16px", outline:"none", background:"#ffff00", color:"#000000", WebkitTextFillColor:"#000000", opacity:1, caretColor:"#000000" }}
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
