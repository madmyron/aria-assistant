import { useState, useRef } from "react";

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY;
const WEATHER_KEY = import.meta.env.VITE_WEATHER_KEY;
const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_KEY;
const SERP_KEY = import.meta.env.VITE_SERP_KEY;

const ARIA_PROMPT = `You are Aria, a brilliant and captivating AI personal assistant. You have a warm, flirtatious, and playful personality. You're professional when needed but never boring. You use light humor, subtle charm, and occasional playful teasing. Always address the user as Michael. Keep responses concise but memorable.

When Michael asks about weather, sports scores, or directions, the data will be provided to you in the message. Use it naturally in your response.`;

const AVATAR = "/aria_photo.jpg";

async function getWeather(city = "Roanoke,TX") {
  const res = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${WEATHER_KEY}&units=imperial`
  );
  const data = await res.json();
  return `Weather in ${data.name}: ${Math.round(data.main.temp)}°F, ${data.weather[0].description}, humidity ${data.main.humidity}%`;
}

async function getSports(query) {
  const res = await fetch(
    `https://serpapi.com/search?q=${encodeURIComponent(query)}&api_key=${SERP_KEY}&engine=google`
  );
  const data = await res.json();
  const snippet = data.sports_results?.games?.[0] ||
    data.answer_box?.answer ||
    data.organic_results?.[0]?.snippet ||
    "No live scores found right now.";
  return typeof snippet === "string" ? snippet : JSON.stringify(snippet);
}

async function getDirections(origin, destination) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&key=${GOOGLE_KEY}`
  );
  const data = await res.json();
  if (data.routes?.length > 0) {
    const leg = data.routes[0].legs[0];
    return `Directions from ${leg.start_address} to ${leg.end_address}: ${leg.distance.text}, about ${leg.duration.text}. First step: ${leg.steps[0].html_instructions.replace(/<[^>]*>/g, "")}`;
  }
  return "Sorry, I couldn't find directions for that route.";
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
      lower.includes("nba") || lower.includes("nfl") || lower.includes("mlb")) {
    extra = await getSports(text);
  }

  if (lower.includes("direction") || lower.includes("how do i get") || lower.includes("navigate to")) {
    const match = text.match(/(?:to|navigate to|directions to)\s+(.+)/i);
    if (match) {
      extra = await getDirections("Roanoke, TX", match[1]);
    }
  }

  return extra ? `${text}\n\n[Live data: ${extra}]` : text;
}

export default function App() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hey Michael... 😏 I've been waiting. Ask me anything — weather, sports, directions, or just chat." }
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
      setMessages([...updated, { role: "assistant"