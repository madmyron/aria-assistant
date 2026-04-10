# Aria — Vision & Feature Specification

## Vision

Aria is a personal AI assistant with a real personality. Not a generic chatbot, not a corporate helpdesk — a sharp, efficient, and charming companion built specifically for one person: you.

The goal is to replace the friction of juggling a dozen apps and browser tabs with a single conversational interface. Instead of opening a weather app, a maps app, a sports app, and a calendar app separately, you talk to Aria. She knows your context, your preferences, and your routines. She fetches, filters, and delivers exactly what you need — in her own voice.

As Aria grows, she becomes less like a tool and more like a capable human personal assistant: someone who can manage your schedule, handle your correspondence, book your travel, and keep your life organized without being asked twice.

---

## Current Features

### Conversational AI
- Powered by Claude (Anthropic) with a custom personality system prompt
- Persistent message history within a session
- Responses capped at 1–2 sentences for efficiency (unless data is being delivered)
- Always addresses the user by name
- Graceful error handling if API requests fail

### Weather Awareness
- Fetches live weather for Roanoke, TX via Open-Meteo
- Reports temperature (°F), sky conditions, and wind speed
- Triggered automatically by keywords like "weather," "forecast," "hot," "cold," "outside"
- Conditions mapped to natural language (clear, partly cloudy, rainy, stormy)

### Sports Scores
- Pulls live scoreboards from ESPN for MLB, NFL, NBA, and NHL
- Detects sport and team from conversational input (e.g., "how are the Cowboys doing?")
- Returns top game scores and current game status
- Triggered by team names, league abbreviations, or sport keywords

### Directions
- Generates Google Maps navigation links from a fixed home origin (Roanoke, TX)
- Extracts destination from natural language (e.g., "take me to Costco in Southlake")
- Renders map links inline as tappable "Open in Google Maps" buttons
- Triggered by keywords like "directions," "navigate," "drive to," "how do I get to"

### UI / UX
- Mobile-first design (max-width 480px)
- Aria's avatar and online status indicator in the header
- Chat bubble layout with distinct styling for user vs. assistant messages
- Auto-scroll to latest message
- Enter-to-send keyboard shortcut
- Loading indicator while waiting for responses
- Inline URL rendering as styled action links

---

## Roadmap — Human Assistant Skills

The following capabilities represent what a skilled human personal assistant would handle. Each is a candidate for future integration.

### Calendar & Scheduling
- View, create, and edit Google Calendar events
- Set reminders and time blocks
- "What do I have tomorrow?" or "Schedule a call with Jake on Friday at 2pm"
- Conflict detection and rescheduling suggestions

### Email Management
- Read and summarize unread emails from Gmail
- Draft and send replies on your behalf
- Flag urgent messages
- "Any emails from Sarah today?" or "Reply to that and say I'll be there at 3"

### Reminders & Tasks
- Create one-time and recurring reminders
- Maintain a running task list
- Mark items complete through conversation
- Morning briefing: "Here's what you have today and what's still open"

### Research & Summarization
- Web search with summarized results
- "What's the latest on the Cowboys trade rumors?" or "Summarize the news about Apple today"
- Article reading and distillation ("Give me the key points from this link")

### Travel & Navigation
- Flight status lookups by flight number or route
- Hotel and restaurant suggestions near a location
- Driving time estimates with traffic awareness
- Itinerary management ("I'm flying to Austin next Thursday")

### Smart Home Control
- Integration with Home Assistant or similar platforms
- Control lights, locks, thermostat through conversation
- "Turn off the living room lights" or "What's the front door camera showing?"

### Music & Media
- Spotify playback control (play, pause, skip, queue)
- "Play something chill" or "Queue up that Kendrick album"
- Mood-based playlist suggestions

### Finance & Spending
- Daily or weekly spending summaries (read-only bank/card data)
- Bill due-date reminders
- "How much did I spend on food this week?"

### Contact & Communication
- Send iMessage or SMS on your behalf
- Look up contact information
- Draft messages for your review before sending

### Health & Fitness
- Daily step count and activity summaries from Apple Health or Google Fit
- Workout logging through conversation
- Water and nutrition reminders

### Location-Aware Context
- Detect or accept current location to personalize weather, directions, and suggestions
- "Find a gas station near me" or "What's open for lunch around here?"

### Memory & Personalization
- Persistent user preferences across sessions (stored locally or in a backend)
- Learns frequently visited places, favorite teams, preferred restaurants
- "Remember that I like window seats" — and actually does

### Voice Input
- Push-to-talk voice input via Web Speech API
- Text-to-speech response playback option
- Hands-free operation while driving or cooking

---

## Design Principles

1. **Personality first.** Aria should feel like a person, not a product. Every response reflects her voice.
2. **Minimum viable words.** Brief and direct. Data when asked; silence otherwise.
3. **Context is everything.** Aria knows where you are, what day it is, and what matters to you.
4. **One interface.** Everything should be accessible through conversation — no app-switching.
5. **Trust, not noise.** Aria speaks up when it's useful. She doesn't spam confirmations or filler.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite |
| Styling | Inline CSS (mobile-first) |
| AI Backend | Anthropic Claude (claude-sonnet-4) |
| Weather | Open-Meteo API |
| Sports | ESPN Scoreboard API |
| Maps | Google Maps (link generation) |
| Auth / Secrets | `.env` via Vite environment variables |
