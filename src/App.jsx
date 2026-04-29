import { useState, useRef, useCallback } from "react";
import { detectIntent } from "./voiceInput";
import { speakResponse } from "./voiceOutput";
import { fetchSportsData } from "./sportsApi";

export default function App() {
  const [chatHistory, setChatHistory] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const contextRef = useRef({ last_sport: null, last_team: null });
  const recognitionRef = useRef(null);

  const appendMessage = useCallback((role, text) => {
    setChatHistory((prev) => [...prev, { role, text, id: Date.now() + Math.random() }]);
  }, []);

  const handleUserInput = useCallback(
    async (transcript) => {
      if (!transcript.trim()) return;

      appendMessage("user", transcript);

      const context = contextRef.current;
      const intent = detectIntent(transcript, context);

      if (intent.sport) context.last_sport = intent.sport;
      if (intent.team) context.last_team = intent.team;
      contextRef.current = context;

      let responseText = "";

      try {
        const data = await fetchSportsData(intent);
        responseText = data?.message || "I couldn't find information for that.";
      } catch {
        responseText = "There was an error fetching sports data.";
      }

      appendMessage("assistant", responseText);
      setIsSpeaking(true);
      await speakResponse(responseText);
      setIsSpeaking(false);
    },
    [appendMessage]
  );

  const startListening = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      appendMessage("assistant", "Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      handleUserInput(transcript);
    };

    recognition.onerror = (event) => {
      appendMessage("assistant", `Speech error: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    recognition.start();
  }, [appendMessage, handleUserInput]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: 20, fontFamily: "sans-serif" }}>
      <h1 style={{ textAlign: "center" }}>Sports Voice Assistant</h1>

      <div
        style={{
          border: "1px solid #ccc",
          borderRadius: 8,
          height: 400,
          overflowY: "auto",
          padding: 12,
          marginBottom: 16,
          backgroundColor: "#f9f9f9",
        }}
      >
        {chatHistory.length === 0 && (
          <p style={{ color: "#aaa", textAlign: "center", marginTop: 160 }}>
            Ask about sports scores, schedules, or standings.
          </p>
        )}
        {chatHistory.map((msg) => (
          <div
            key={msg.id}
            style={{
              marginBottom: 10,
              textAlign: msg.role === "user" ? "right" : "left",
            }}
          >
            <span
              style={{
                display: "inline-block",
                padding: "8px 12px",
                borderRadius: 12,
                backgroundColor: msg.role === "user" ? "#0070f3" : "#e0e0e0",
                color: msg.role === "user" ? "#fff" : "#000",
                maxWidth: "80%",
                wordBreak: "break-word",
              }}
            >
              {msg.text}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={isSpeaking}
          style={{
            flex: 1,
            padding: "12px 0",
            borderRadius: 8,
            border: "none",
            backgroundColor: isListening ? "#e53e3e" : "#0070f3",
            color: "#fff",
            fontSize: 16,
            cursor: isSpeaking ? "not-allowed" : "pointer",
            opacity: isSpeaking ? 0.6 : 1,
          }}
        >
          {isListening ? "Stop Listening" : isSpeaking ? "Speaking..." : "Start Listening"}
        </button>

        <button
          onClick={() => setChatHistory([])}
          style={{
            padding: "12px 16px",
            borderRadius: 8,
            border: "1px solid #ccc",
            backgroundColor: "#fff",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Clear
        </button>
      </div>

      {contextRef.current.last_team && (
        <p style={{ fontSize: 12, color: "#888", marginTop: 8, textAlign: "center" }}>
          Context: {contextRef.current.last_team}
          {contextRef.current.last_sport ? ` (${contextRef.current.last_sport})` : ""}
        </p>
      )}
    </div>
  );
}