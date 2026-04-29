import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import twilio from 'twilio';
import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const MEMORY_DIR = path.resolve(__dirname, 'memory');
const MEMORY_FILE = path.join(MEMORY_DIR, 'conversations.json');
try { mkdirSync(MEMORY_DIR, { recursive: true }); } catch {}

const DATA_DIR = path.resolve(__dirname, 'data');
const LISTS_FILE = path.join(DATA_DIR, 'lists.json');
const REMINDERS_FILE = path.join(DATA_DIR, 'reminders.json');
try { mkdirSync(DATA_DIR, { recursive: true }); } catch {}

function readLists() {
  try { return JSON.parse(readFileSync(LISTS_FILE, 'utf8')); } catch { return {}; }
}
function writeLists(lists) { writeFileSync(LISTS_FILE, JSON.stringify(lists, null, 2)); }
function readReminders() {
  try { return JSON.parse(readFileSync(REMINDERS_FILE, 'utf8')); } catch { return []; }
}
function writeReminders(reminders) { writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2)); }
function readMemory() {
  try { return JSON.parse(readFileSync(MEMORY_FILE, 'utf8')); } catch { return []; }
}
function writeMemory(messages) { writeFileSync(MEMORY_FILE, JSON.stringify(messages, null, 2)); }

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '2mb' }));

const PORT = 3001;

function getAnthropicKey() { return process.env.VITE_ANTHROPIC_KEY || ''; }

function parseGoogleAccounts() {
  const accounts = new Map();
  const raw = process.env.GOOGLE_ACCOUNTS;
  if (raw) {
    raw.split(',').forEach((entry) => {
      const trimmed = entry.trim();
      if (!trimmed) return;
      const sep = trimmed.includes(':') ? ':' : trimmed.includes('=') ? '=' : null;
      if (!sep) return;
      const [email, token] = trimmed.split(sep);
      if (email && token) accounts.set(email.trim(), token.trim());
    });
  }
  if (!accounts.size && process.env.GOOGLE_REFRESH_TOKEN) {
    const email = process.env.GOOGLE_ACCOUNT_EMAIL?.trim() || 'default';
    accounts.set(email, process.env.GOOGLE_REFRESH_TOKEN.trim());
  }
  return accounts;
}

const GOOGLE_ACCOUNTS = parseGoogleAccounts();
function getGoogleAccountEmails() { return Array.from(GOOGLE_ACCOUNTS.keys()); }
function resolveGoogleAccount(account) {
  if (account && GOOGLE_ACCOUNTS.has(account)) return account;
  if (GOOGLE_ACCOUNTS.size >= 1) return getGoogleAccountEmails()[0];
  return undefined;
}
function getGoogleAuth(account) {
  const email = resolveGoogleAccount(account);
  if (!email) return null;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = GOOGLE_ACCOUNTS.get(email);
  if (!clientId || !clientSecret || !refreshToken || refreshToken === 'your_google_refresh_token_here') return null;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

function weatherCodeToText(code) {
  if ([0].includes(code)) return 'clear skies';
  if ([1, 2].includes(code)) return 'partly cloudy skies';
  if ([3].includes(code)) return 'overcast skies';
  if ([45, 48].includes(code)) return 'foggy skies';
  if ([51, 53, 55, 56, 57].includes(code)) return 'light drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rainy skies';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snowy conditions';
  if ([95, 96, 99].includes(code)) return 'stormy weather';
  return 'mixed conditions';
}

function detectSport(query = '') {
  const lower = query.toLowerCase();
  if (lower.includes('cowboys') || lower.includes('nfl') || lower.includes('football')) return { sport: 'football', league: 'nfl' };
  if (lower.includes('mavs') || lower.includes('nba') || lower.includes('basketball')) return { sport: 'basketball', league: 'nba' };
  if (lower.includes('stars') || lower.includes('nhl') || lower.includes('hockey')) return { sport: 'hockey', league: 'nhl' };
  return { sport: 'baseball', league: 'mlb' };
}

function formatCalendarEvent(event) {
  const start = event.start?.dateTime || event.start?.date;
  const when = start ? new Date(start).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  }) : 'No date';
  return { id: event.id, title: event.summary || 'Untitled event', when, rawStart: start };
}

function getHeader(headers = [], name) {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

function sanitizeClaudeMessages(messages = []) {
  const sanitized = [];
  let lastKey = '';
  for (const message of messages) {
    if (!message || typeof message.role !== 'string' || typeof message.content !== 'string') continue;
    const key = `${message.role}\u0000${message.content}`;
    if (key === lastKey) continue;
    sanitized.push({ role: message.role, content: message.content });
    lastKey = key;
  }
  return sanitized;
}

function sanitizeTextForTts(text = '') {
  let s = String(text);
  s = s.replace(/(\d+(?:\.\d+)?)\s*\u00B0\s*([FC])\b/gi, '$1 degrees');
  s = s.replace(/(\d+(?:\.\d+)?)\s*\u00B0/g, '$1 degrees');
  s = s.replace(/(\d+(?:\.\d+)?)[^\x00-\x7F]+\s*(?:[FC]\b)?/gi, '$1 degrees');
  s = s.replace(/(\d+(?:\.\d+)?)\s*mph\b/gi, '$1 miles per hour');
  s = s.replace(/(\d+(?:\.\d+)?)\s*(?:km\/h|kmh)\b/gi, '$1 kilometers per hour');
  s = s.replace(/:[a-z0-9_+\-]+:/gi, ' ');
  s = s.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]/gu, '');
  s = s.replace(/[^\x00-\x7F]/g, '');
  s = s.replace(/[^\w\s.,!?"'()\-:;@\/#&%$+]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

const ESPN_CACHE = new Map();
const ESPN_CACHE_TTL = 60 * 60 * 1000;

const ESPN_LEAGUES = [
  { sport: 'NFL', espnSport: 'football', espnLeague: 'nfl' },
  { sport: 'NBA', espnSport: 'basketball', espnLeague: 'nba' },
  { sport: 'NHL', espnSport: 'hockey', espnLeague: 'nhl' },
  { sport: 'MLB', espnSport: 'baseball', espnLeague: 'mlb' },
  { sport: 'MLS', espnSport: 'soccer', espnLeague: 'usa.1' },
];

async function fetchESPNGames(espnSport, espnLeague) {
  const cacheKey = `${espnSport}/${espnLeague}`;
  const cached = ESPN_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < ESPN_CACHE_TTL) return cached.data;

  const url = `https://site.api.espn.com/apis/site/v2/sports/${espnSport}/${espnLeague}/scoreboard`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const games = [];

  for (const event of (data?.events || [])) {
    const comp = event?.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors?.find((t) => t.homeAway === 'home');
    const away = comp.competitors?.find((t) => t.homeAway === 'away');
    const statusState = comp.status?.type?.state || '';
    const statusDesc = comp.status?.type?.description || '';
    const startTime = event.date || comp.date || null;

    games.push({
      homeTeam: home?.team?.displayName || home?.team?.name || '',
      homeAbbr: home?.team?.abbreviation || '',
      awayTeam: away?.team?.displayName || away?.team?.name || '',
      awayAbbr: away?.team?.abbreviation || '',
      homeScore: home?.score || null,
      awayScore: away?.score || null,
      datetime: startTime,
      status: statusState === 'pre' ? 'upcoming' : statusState === 'in' ? 'live' : 'final',
      statusDesc,
    });
  }

  ESPN_CACHE.set(cacheKey, { ts: Date.now(), data: games });
  return games;
}

function matchesTeam(game, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    game.homeTeam.toLowerCase().includes(q) ||
    game.awayTeam.toLowerCase().includes(q) ||
    game.homeAbbr.toLowerCase() === q ||
    game.awayAbbr.toLowerCase() === q
  );
}

let nflCache = null;
let nflCacheTs = 0;
const NFL_CACHE_TTL = 3600 * 1000;

app.get('/api/sports/nfl', async (_req, res) => {
  try {
    if (nflCache && Date.now() - nflCacheTs < NFL_CACHE_TTL) {
      return res.json(nflCache);
    }
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
    if (!r.ok) throw new Error(`ESPN NFL scoreboard returned ${r.status}`);
    const data = await r.json();
    const games = (data?.events || []).map((event) => {
      const comp = event?.competitions?.[0];
      const home = comp?.competitors?.find((c) => c.homeAway === 'home');
      const away = comp?.competitors?.find((c) => c.homeAway === 'away');
      const state = comp?.status?.type?.state || '';
      return {
        away: away?.team?.displayName || away?.team?.name || '',
        home: home?.team?.displayName || home?.team?.name || '',
        time: event.date || comp?.date || null,
        status: state === 'pre' ? 'scheduled' : state === 'in' ? 'live' : 'final',
      };
    });
    const result = { sport: 'NFL', games };
    nflCache = result;
    nflCacheTs = Date.now();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch NFL games', fallback: [] });
  }
});

app.get('/api/upcoming-games', async (req, res) => {
  try {
    const teamQuery = String(req.query?.team || '').trim();
    const leagueFilter = String(req.query?.league || '').trim().toUpperCase();
    const results = [];

    const leagues = leagueFilter
      ? ESPN_LEAGUES.filter((l) => l.sport === leagueFilter)
      : ESPN_LEAGUES;

    for (const { sport, espnSport, espnLeague } of leagues) {
      let games = [];
      try { games = await fetchESPNGames(espnSport, espnLeague); } catch { continue; }

      for (const g of games) {
        if (!matchesTeam(g, teamQuery)) continue;
        const isHome = teamQuery && g.homeTeam.toLowerCase().includes(teamQuery.toLowerCase()) || g.homeAbbr.toLowerCase() === teamQuery.toLowerCase();
        const team = teamQuery
          ? (isHome ? g.homeTeam : g.awayTeam)
          : g.homeTeam;
        const opponent = teamQuery
          ? (isHome ? g.awayTeam : g.homeTeam)
          : g.awayTeam;
        results.push({
          sport,
          team,
          opponent,
          datetime: g.datetime,
          status: g.status,
          statusDesc: g.statusDesc,
          homeScore: g.homeScore,
          awayScore: g.awayScore,
        });
      }
    }

    res.json(results);
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/lists', (_req, res) => res.json(readLists()));

app.post('/api/lists', (req, res) => {
  const listName = String(req.body?.listName || 'todo').toLowerCase().trim();
  const item = String(req.body?.item || '').trim();
  if (!item) return res.status(400).json({ error: 'item is required' });
  const lists = readLists();
  if (!lists[listName]) lists[listName] = [];
  lists[listName].push({ text: item, done: false, addedAt: new Date().toISOString() });
  writeLists(lists);
  res.json({ success: true, listName, lists });
});

app.delete('/api/lists/:listName/:index', (req, res) => {
  const { listName } = req.params;
  const idx = Number(req.params.index);
  const lists = readLists();
  if (!lists[listName] || idx < 0 || idx >= lists[listName].length) return res.status(404).json({ error: 'Item not found' });
  lists[listName].splice(idx, 1);
  writeLists(lists);
  res.json({ success: true, listName, lists });
});

app.patch('/api/lists/:listName/:index', (req, res) => {
  const { listName } = req.params;
  const idx = Number(req.params.index);
  const lists = readLists();
  if (!lists[listName] || idx < 0 || idx >= lists[listName].length) return res.status(404).json({ error: 'Item not found' });
  const current = lists[listName][idx].done;
  lists[listName][idx].done = req.body?.done !== undefined ? Boolean(req.body.done) : !current;
  writeLists(lists);
  res.json({ success: true, listName, lists });
});

app.get('/api/reminders', (_req, res) => res.json(readReminders()));

app.get('/api/reminders/due', (_req, res) => {
  const now = new Date();
  res.json(readReminders().filter(r => !r.fired && new Date(r.datetime) <= now));
});

app.post('/api/reminders', (req, res) => {
  const text = String(req.body?.text || '').trim();
  const datetime = String(req.body?.datetime || '').trim();
  const recurring = ['daily', 'weekly'].includes(req.body?.recurring) ? req.body.recurring : 'none';
  if (!text || !datetime) return res.status(400).json({ error: 'text and datetime are required' });
  const reminder = { id: randomUUID(), text, datetime, recurring, fired: false, createdAt: new Date().toISOString() };
  const reminders = readReminders();
  reminders.push(reminder);
  writeReminders(reminders);
  res.json({ success: true, reminder });
});

app.patch('/api/reminders/:id', (req, res) => {
  const { id } = req.params;
  const reminders = readReminders();
  const idx = reminders.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Reminder not found' });
  if (req.body?.fired !== undefined) reminders[idx].fired = Boolean(req.body.fired);
  if (req.body?.datetime) reminders[idx].datetime = req.body.datetime;
  writeReminders(reminders);
  res.json({ success: true, reminder: reminders[idx] });
});

app.delete('/api/reminders/:id', (req, res) => {
  const { id } = req.params;
  const reminders = readReminders();
  const filtered = reminders.filter(r => r.id !== id);
  if (filtered.length === reminders.length) return res.status(404).json({ error: 'Reminder not found' });
  writeReminders(filtered);
  res.json({ success: true });
});

app.post('/api/sms', async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'message is required' });
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const sms = await client.messages.create({
      body: message,
      from: process.env.TWILIO_FROM_NUMBER,
      to: process.env.TWILIO_TO_NUMBER
    });
    res.json({ success: true, sid: sms.sid, message: `SMS sent: ${message}` });
  } catch (error) {
    res.status(500).json({ error: error.message || 'SMS failed' });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY || '';
    if (!apiKey) return res.status(500).json({ error: 'OpenAI API key is missing' });
    const text = String(req.body?.text || '').trim();
    const cleanText = sanitizeTextForTts(text);
    if (!cleanText) return res.status(400).json({ error: 'text is required' });
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1', voice: 'nova', input: cleanText })
    });
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText || 'OpenAI request failed' });
    }
    res.status(200);
    res.setHeader('Content-Type', 'audio/mpeg');
    if (response.body) {
      response.body.on('error', (streamError) => {
        if (!res.headersSent) res.status(500).json({ error: 'Failed to stream TTS audio' });
        else res.destroy(streamError);
      });
      response.body.pipe(res);
      return;
    }
    return res.status(500).json({ error: 'OpenAI returned no audio stream' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'OpenAI request failed' });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const apiKey = getAnthropicKey();
    if (!apiKey) return res.status(500).json({ error: 'Anthropic API key is missing' });
    const payload = {
      model: req.body?.model || 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: req.body?.system || '',
      messages: Array.isArray(req.body?.messages) ? sanitizeClaudeMessages(req.body.messages) : []
    };
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || 'Claude request failed' });
    res.json({ reply: data?.content?.[0]?.text || '', raw: data });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Claude request failed' });
  }
});

app.get('/api/weather', async (_req, res) => {
  try {
    const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=33.0&longitude=-97.2&current_weather=true&temperature_unit=fahrenheit&windspeed_unit=mph');
    const data = await response.json();
    const current = data?.current_weather || {};
    res.json({
      temperatureF: Math.round(current.temperature),
      windSpeedMph: Math.round(current.windspeed),
      condition: weatherCodeToText(current.weathercode)
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Weather request failed' });
  }
});

app.get('/api/fetch-url', cors(), async (req, res) => {
  try {
    const url = String(req.query?.url || '').trim();
    if (!url) return res.status(400).json({ error: 'url is required' });
    let parsedUrl;
    try { parsedUrl = new URL(url); } catch { return res.status(400).json({ error: 'Invalid url' }); }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return res.status(400).json({ error: 'Only http and https URLs are supported' });
    const response = await fetch(parsedUrl.toString(), { headers: { 'User-Agent': 'AriaAssistant/1.0' } });
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText || 'Failed to fetch URL' });
    }
    const html = await response.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>').replace(/&#39;/gi, "'").replace(/&quot;/gi, '"')
      .replace(/\s+/g, ' ').trim();
    res.type('text/plain').send(text);
  } catch (error) {
    res.status(500).json({ error: error.message || 'URL fetch failed' });
  }
});

app.get('/api/sports', async (req, res) => {
  try {
    const { sport, league } = detectSport(req.query?.query || '');
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard`);
    const data = await response.json();
    const games = (data?.events || []).slice(0, 3).map((event) => {
      const comp = event?.competitions?.[0];
      const home = comp?.competitors?.find((team) => team.homeAway === 'home');
      const away = comp?.competitors?.find((team) => team.homeAway === 'away');
      const detail = comp?.status?.type?.shortDetail || 'Scheduled';
      return `${away?.team?.abbreviation || 'AWAY'} ${away?.score || ''} @ ${home?.team?.abbreviation || 'HOME'} ${home?.score || ''} (${detail})`.replace(/\s+/g, ' ').trim();
    });
    res.json({ games });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Sports request failed' });
  }
});

app.get('/api/calendar', async (req, res) => {
  try {
    const account = req.query?.account;
    const accounts = account ? [account] : getGoogleAccountEmails();
    if (!accounts.length) return res.json({ configured: false, events: [], message: 'Google Calendar is not configured.' });
    const allEvents = [];
    const now = new Date();
    const max = new Date(now);
    max.setDate(now.getDate() + 7);
    for (const acct of accounts) {
      const auth = getGoogleAuth(acct);
      if (!auth) continue;
      const calendar = google.calendar({ version: 'v3', auth });
      const response = await calendar.events.list({
        calendarId: 'primary', timeMin: now.toISOString(), timeMax: max.toISOString(),
        singleEvents: true, orderBy: 'startTime', maxResults: 20
      });
      allEvents.push(...(response.data.items || []).map((event) => ({ ...formatCalendarEvent(event), account: acct })));
    }
    if (!allEvents.length) return res.json({ configured: false, events: [], message: 'Google Calendar is not configured.' });
    res.json({ configured: true, accounts, events: allEvents });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Calendar fetch failed' });
  }
});

app.post('/api/calendar', async (req, res) => {
  try {
    const account = req.body?.account || req.query?.account;
    const auth = getGoogleAuth(account);
    if (!auth) return res.status(400).json({ error: 'Google Calendar is not configured.' });
    const title = String(req.body?.title || '').trim();
    const date = String(req.body?.date || '').trim();
    const time = String(req.body?.time || '09:00').trim();
    const duration = Number(req.body?.duration || 60);
    if (!title || !date) return res.status(400).json({ error: 'title and date are required' });
    const start = new Date(`${date}T${time}:00-05:00`);
    if (Number.isNaN(start.getTime())) return res.status(400).json({ error: 'Invalid date or time.' });
    const end = new Date(start.getTime() + duration * 60000);
    const calendar = google.calendar({ version: 'v3', auth });
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: title,
        start: { dateTime: start.toISOString(), timeZone: 'America/Chicago' },
        end: { dateTime: end.toISOString(), timeZone: 'America/Chicago' }
      }
    });
    res.json({ success: true, event: { ...formatCalendarEvent(response.data), account: resolveGoogleAccount(account) } });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Calendar create failed' });
  }
});

app.get('/api/gmail', async (req, res) => {
  try {
    const account = req.query?.account;
    const accounts = account ? [account] : getGoogleAccountEmails();
    if (!accounts.length) return res.json({ configured: false, emails: [], message: 'Gmail is not configured.' });
    const allEmails = [];
    for (const acct of accounts) {
      const auth = getGoogleAuth(acct);
      if (!auth) continue;
      const gmail = google.gmail({ version: 'v1', auth });
      const list = await gmail.users.messages.list({ userId: 'me', q: 'is:unread', maxResults: 5 });
      const ids = list.data.messages || [];
      for (const item of ids) {
        const message = await gmail.users.messages.get({ userId: 'me', id: item.id, format: 'full' });
        const headers = message.data.payload?.headers || [];
        allEmails.push({
          account: acct,
          sender: getHeader(headers, 'From'),
          subject: getHeader(headers, 'Subject') || '(No subject)',
          snippet: message.data.snippet || ''
        });
      }
    }
    if (!allEmails.length) return res.json({ configured: false, emails: [], message: 'Gmail is not configured.' });
    res.json({ configured: true, accounts, emails: allEmails });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Gmail fetch failed' });
  }
});

app.post('/api/gmail/draft', async (req, res) => {
  try {
    const account = req.body?.account || req.query?.account;
    const auth = getGoogleAuth(account);
    if (!auth) return res.status(400).json({ error: 'Gmail is not configured.' });
    const to = String(req.body?.to || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const body = String(req.body?.body || '').trim();
    if (!to || !subject || !body) return res.status(400).json({ error: 'to, subject, and body are required' });
    const gmail = google.gmail({ version: 'v1', auth });
    const rawMessage = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset="UTF-8"', '', body].join('\n');
    const encoded = Buffer.from(rawMessage).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const response = await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw: encoded } } });
    res.json({ success: true, id: response.data.id });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Gmail draft failed' });
  }
});

app.get('/api/google/accounts', (_req, res) => {
  const accounts = getGoogleAccountEmails();
  if (!accounts.length) return res.json({ configured: false, accounts: [], message: 'No Google accounts are configured.' });
  res.json({ configured: true, accounts });
});

app.get('/api/search', async (req, res) => {
  try {
    const query = String(req.query?.query || '').trim();
    if (!query) return res.status(400).json({ error: 'query is required' });
    const braveKey = process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY;
    const serpKey = process.env.SERPAPI_API_KEY;
    if (braveKey) {
      const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=3`, {
        headers: { 'X-Subscription-Token': braveKey }
      });
      const data = await response.json();
      const results = (data?.web?.results || []).slice(0, 3).map((item) => ({ title: item.title, url: item.url, snippet: item.description }));
      return res.json({ configured: true, provider: 'brave', results });
    }
    if (serpKey) {
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=5&api_key=${encodeURIComponent(serpKey)}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data?.error) return res.status(400).json({ error: data.error });
      const results = (data?.organic_results || []).slice(0, 5).map((item) => ({ title: item.title, link: item.link, snippet: item.snippet || '' }));
      return res.json({ configured: true, provider: 'serpapi', results });
    }
    res.json({ configured: false, results: [], message: 'Search is not configured.' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Search failed' });
  }
});

app.get('/api/memory', (_req, res) => {
  const messages = readMemory();
  res.json({ messages: messages.slice(-20) });
});

app.post('/api/memory', (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  writeMemory(messages);
  res.json({ success: true });
});

app.delete('/api/memory', (_req, res) => {
  writeMemory([]);
  res.json({ success: true });
});

const NHL_NEXT_GAME_TEAMS = {
  'anaheim ducks': 'ANA', 'ducks': 'ANA',
  'boston bruins': 'BOS', 'bruins': 'BOS',
  'buffalo sabres': 'BUF', 'sabres': 'BUF',
  'calgary flames': 'CGY', 'flames': 'CGY',
  'carolina hurricanes': 'CAR', 'hurricanes': 'CAR', 'canes': 'CAR',
  'chicago blackhawks': 'CHI', 'blackhawks': 'CHI', 'hawks': 'CHI',
  'colorado avalanche': 'COL', 'avalanche': 'COL', 'avs': 'COL',
  'columbus blue jackets': 'CBJ', 'blue jackets': 'CBJ',
  'dallas stars': 'DAL', 'stars': 'DAL',
  'detroit red wings': 'DET', 'red wings': 'DET',
  'edmonton oilers': 'EDM', 'oilers': 'EDM',
  'florida panthers': 'FLA', 'panthers': 'FLA',
  'los angeles kings': 'LAK', 'la kings': 'LAK', 'kings': 'LAK',
  'minnesota wild': 'MIN', 'wild': 'MIN',
  'montreal canadiens': 'MTL', 'canadiens': 'MTL', 'habs': 'MTL',
  'nashville predators': 'NSH', 'predators': 'NSH', 'preds': 'NSH',
  'new jersey devils': 'NJD', 'devils': 'NJD',
  'new york islanders': 'NYI', 'islanders': 'NYI',
  'new york rangers': 'NYR', 'rangers': 'NYR',
  'ottawa senators': 'OTT', 'senators': 'OTT', 'sens': 'OTT',
  'philadelphia flyers': 'PHI', 'flyers': 'PHI',
  'pittsburgh penguins': 'PIT', 'penguins': 'PIT', 'pens': 'PIT',
  'san jose sharks': 'SJS', 'sharks': 'SJS',
  'seattle kraken': 'SEA', 'kraken': 'SEA',
  'st. louis blues': 'STL', 'st louis blues': 'STL', 'blues': 'STL',
  'tampa bay lightning': 'TBL', 'lightning': 'TBL', 'bolts': 'TBL',
  'toronto maple leafs': 'TOR', 'maple leafs': 'TOR', 'leafs': 'TOR',
  'utah mammoth': 'UTA', 'mammoth': 'UTA', 'utah hockey club': 'UTA',
  'vancouver canucks': 'VAN', 'canucks': 'VAN',
  'vegas golden knights': 'VGK', 'golden knights': 'VGK', 'knights': 'VGK',
  'washington capitals': 'WSH', 'capitals': 'WSH', 'caps': 'WSH',
  'winnipeg jets': 'WPG', 'jets': 'WPG',
};

const NBA_TEAMS = {
  'atlanta hawks': 'ATL', 'hawks': 'ATL',
  'boston celtics': 'BOS', 'celtics': 'BOS',
  'brooklyn nets': 'BKN', 'nets': 'BKN',
  'charlotte hornets': 'CHA', 'hornets': 'CHA',
  'chicago bulls': 'CHI', 'bulls': 'CHI',
  'cleveland cavaliers': 'CLE', 'cavaliers': 'CLE', 'cavs': 'CLE',
  'dallas mavericks': 'DAL', 'mavericks': 'DAL', 'mavs': 'DAL',
  'denver nuggets': 'DEN', 'nuggets': 'DEN',
  'detroit pistons': 'DET', 'pistons': 'DET',
  'golden state warriors': 'GSW', 'warriors': 'GSW',
  'houston rockets': 'HOU', 'rockets': 'HOU',
  'indiana pacers': 'IND', 'pacers': 'IND',
  'la clippers': 'LAC', 'clippers': 'LAC',
  'los angeles lakers': 'LAL', 'lakers': 'LAL',
  'memphis grizzlies': 'MEM', 'grizzlies': 'MEM', 'grizz': 'MEM',
  'miami heat': 'MIA', 'heat': 'MIA',
  'milwaukee bucks': 'MIL', 'bucks': 'MIL',
  'minnesota timberwolves': 'MIN', 'timberwolves': 'MIN', 'wolves': 'MIN',
  'new orleans pelicans': 'NOP', 'pelicans': 'NOP',
  'new york knicks': 'NYK', 'knicks': 'NYK',
  'oklahoma city thunder': 'OKC', 'thunder': 'OKC',
  'orlando magic': 'ORL', 'magic': 'ORL',
  'philadelphia 76ers': 'PHI', '76ers': 'PHI', 'sixers': 'PHI',
  'phoenix suns': 'PHX', 'suns': 'PHX',
  'portland trail blazers': 'POR', 'trail blazers': 'POR', 'blazers': 'POR',
  'sacramento kings': 'SAC', 'kings': 'SAC',
  'san antonio spurs': 'SAS', 'spurs': 'SAS',
  'toronto raptors': 'TOR', 'raptors': 'TOR',
  'utah jazz': 'UTA', 'jazz': 'UTA',
  'washington wizards': 'WAS', 'wizards': 'WAS',
};

app.get('/api/sports/nba/next-game', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = NBA_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `NBA team not found: ${req.query.team}` });
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${abbr}/schedule`);
    if (!r.ok) throw new Error('ESPN NBA schedule error');
    const data = await r.json();
    const now = new Date();
    const next = (data.events || []).find(e => new Date(e.date) > now && e.competitions?.[0]?.status?.type?.state === 'pre');
    if (!next) return res.status(404).json({ error: `No upcoming NBA games for ${teamQuery}` });
    const comp = next.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway === 'home');
    const away = comp?.competitors?.find(c => c.homeAway === 'away');
    const isHome = home?.team?.abbreviation === abbr;
    const opponent = isHome ? away?.team?.displayName : home?.team?.displayName;
    const venue = comp?.venue?.fullName || 'TBD';
    const dateStr = new Date(next.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return res.json({ sport: 'NBA', team: isHome ? home?.team?.displayName : away?.team?.displayName, opponent, date: dateStr, venue, home: isHome });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/sports/nba/score', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = NBA_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `NBA team not found: ${req.query.team}` });
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
    if (!r.ok) throw new Error('ESPN NBA scoreboard error');
    const data = await r.json();
    const game = (data.events || []).find(e =>
      e.competitions?.[0]?.status?.type?.state === 'in' &&
      e.competitions?.[0]?.competitors?.some(c => c.team?.abbreviation === abbr)
    );
    if (!game) return res.status(404).json({ error: 'No NBA game in progress', live: false });
    const comp = game.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway === 'home');
    const away = comp?.competitors?.find(c => c.homeAway === 'away');
    const period = comp?.status?.period || '?';
    const clock = comp?.status?.displayClock || '';
    const summary = `${away?.team?.displayName} ${away?.score}, ${home?.team?.displayName} ${home?.score} — Q${period} ${clock}`;
    return res.json({ live: true, homeName: home?.team?.displayName, awayName: away?.team?.displayName, homeScore: home?.score, awayScore: away?.score, period, clock, summary });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/sports/nba/standings', async (req, res) => {
  try {
    const r = await fetch('https://site.api.espn.com/apis/v2/sports/basketball/nba/standings');
    if (!r.ok) throw new Error('ESPN NBA standings error');
    const data = await r.json();
    const teams = [];
    for (const conf of (data.children || [])) {
      for (const div of (conf.children || [])) {
        for (const entry of (div.standings?.entries || [])) {
          const stats = {};
          (entry.stats || []).forEach(s => { stats[s.name] = s.value; });
          teams.push({ team: entry.team?.displayName, wins: stats.wins || 0, losses: stats.losses || 0, pct: stats.winPercent || 0, conference: conf.name });
        }
      }
    }
    return res.json({ standings: teams.sort((a, b) => b.pct - a.pct) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/sports/nba/last-games', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = NBA_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `NBA team not found: ${req.query.team}` });
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${abbr}/schedule`);
    if (!r.ok) throw new Error('ESPN NBA schedule error');
    const data = await r.json();
    const now = new Date();
    const finished = (data.events || [])
      .filter(e => new Date(e.date) < now && e.competitions?.[0]?.status?.type?.state === 'post')
      .slice(-5);
    const games = finished.map(e => {
      const comp = e.competitions?.[0];
      const us = comp?.competitors?.find(c => c.team?.abbreviation === abbr);
      const them = comp?.competitors?.find(c => c.team?.abbreviation !== abbr);
      return `${us?.winner ? 'W' : 'L'} ${us?.score}-${them?.score} vs ${them?.team?.displayName} (${new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
    });
    return res.json({ team: abbr, lastGames: games });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/sports/nba/team-record', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = NBA_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `NBA team not found: ${req.query.team}` });
    const r = await fetch('https://site.api.espn.com/apis/v2/sports/basketball/nba/standings');
    if (!r.ok) throw new Error('ESPN NBA standings error');
    const data = await r.json();
    for (const conf of (data.children || [])) {
      for (const div of (conf.children || [])) {
        for (const entry of (div.standings?.entries || [])) {
          if (entry.team?.abbreviation === abbr) {
            const stats = {};
            (entry.stats || []).forEach(s => { stats[s.name] = s.value; });
            return res.json({ team: entry.team?.displayName, wins: stats.wins, losses: stats.losses, pct: stats.winPercent, conference: conf.name });
          }
        }
      }
    }
    return res.status(404).json({ error: `Team ${abbr} not found in NBA standings` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/sports/next-game', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = NHL_NEXT_GAME_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `NHL team not found: ${req.query.team}` });
    const schedRes = await fetch(`https://api-web.nhle.com/v1/club-schedule-season/${abbr}/now`);
    if (!schedRes.ok) throw new Error(`NHL API error for ${abbr}`);
    const sched = await schedRes.json();
    const now = new Date();
    const liveStates = ['LIVE', 'PRG', 'CRIT'];
    const next = (sched.games || []).find((g) => new Date(g.gameDate) >= now && g.gameState !== 'OFF' && g.gameState !== 'FINAL' && !liveStates.includes(g.gameState));
    if (!next) return res.status(404).json({ error: `No upcoming games found for ${teamQuery}` });
    const isHome = next.homeTeam?.abbrev === abbr;
    const opponent = isHome ? next.awayTeam?.commonName?.default || next.awayTeam?.abbrev : next.homeTeam?.commonName?.default || next.homeTeam?.abbrev;
    const venue = next.venue?.default || 'TBD';
    const gameDate = new Date(next.gameDate);
    const dateStr = gameDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return res.json({
      sport: 'NHL',
      team: next.homeTeam?.abbrev === abbr ? next.homeTeam?.commonName?.default : next.awayTeam?.commonName?.default,
      opponent, date: dateStr, venue, home: isHome,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to fetch next game' });
  }
});

app.get('/api/sports/score', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = NHL_NEXT_GAME_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `NHL team not found: ${req.query.team}` });
    const schedRes = await fetch(`https://api-web.nhle.com/v1/club-schedule-season/${abbr}/now`);
    if (!schedRes.ok) throw new Error(`NHL API error for ${abbr}`);
    const sched = await schedRes.json();
    const liveStates = ['LIVE', 'PRG', 'CRIT'];
    const live = (sched.games || []).find((g) => liveStates.includes(g.gameState));
    if (!live) return res.status(404).json({ error: 'No game in progress', live: false });
    const homeScore = live.homeTeam?.score ?? 0;
    const awayScore = live.awayTeam?.score ?? 0;
    const homeName = live.homeTeam?.commonName?.default || live.homeTeam?.abbrev;
    const awayName = live.awayTeam?.commonName?.default || live.awayTeam?.abbrev;
    const period = live.periodDescriptor?.number || '?';
    const periodType = live.periodDescriptor?.periodType || '';
    const periodLabel = periodType === 'OT' ? 'OT' : `P${period}`;
    const summary = `${awayName} ${awayScore}, ${homeName} ${homeScore} — ${periodLabel} in progress`;
    return res.json({ live: true, homeName, awayName, homeScore, awayScore, period, periodLabel, summary });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/sports/standings', async (req, res) => {
  try {
    const r = await fetch('https://api-web.nhle.com/v1/standings/now');
    if (!r.ok) throw new Error('NHL standings API error');
    const data = await r.json();
    const teams = (data.standings || []).map((t) => ({
      team: t.teamName?.default || t.teamAbbrev?.default,
      wins: t.wins, losses: t.losses, otLosses: t.otLosses,
      points: t.points, division: t.divisionName,
    }));
    return res.json({ standings: teams });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/sports/last-games', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = NHL_NEXT_GAME_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `NHL team not found: ${req.query.team}` });
    const r = await fetch(`https://api-web.nhle.com/v1/club-schedule-season/${abbr}/now`);
    if (!r.ok) throw new Error(`NHL API error for ${abbr}`);
    const sched = await r.json();
    const finished = (sched.games || []).filter((g) => g.gameState === 'OFF' || g.gameState === 'FINAL').slice(-5);
    const games = finished.map((g) => {
      const isHome = g.homeTeam?.abbrev === abbr;
      const us = isHome ? g.homeTeam : g.awayTeam;
      const them = isHome ? g.awayTeam : g.homeTeam;
      const won = (us.score || 0) > (them.score || 0);
      return `${won ? 'W' : 'L'} ${us.score}-${them.score} vs ${them.commonName?.default || them.abbrev} (${g.gameDate})`;
    });
    return res.json({ team: abbr, lastGames: games });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/sports/team-record', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = NHL_NEXT_GAME_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `NHL team not found: ${req.query.team}` });
    const r = await fetch('https://api-web.nhle.com/v1/standings/now');
    if (!r.ok) throw new Error('NHL standings API error');
    const data = await r.json();
    const team = (data.standings || []).find((t) => t.teamAbbrev?.default === abbr);
    if (!team) return res.status(404).json({ error: `Team ${abbr} not found in standings` });
    return res.json({
      team: team.teamName?.default, wins: team.wins, losses: team.losses,
      otLosses: team.otLosses, points: team.points,
      divisionRank: team.divisionSequence, division: team.divisionName,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

process.on('exit', (code) => { console.log(`Process exiting with code: ${code}`); });
process.on('uncaughtException', (err) => { console.error('Uncaught Exception:', err); });
process.on('unhandledRejection', (reason, promise) => { console.error('Unhandled Rejection at:', promise, 'reason:', reason); });

app.listen(PORT, () => {
  console.log(`Aria backend running on http://localhost:${PORT}`);
  console.log(`SerpApi key loaded: ${process.env.SERPAPI_API_KEY ? 'yes' : 'no'}`);
  console.log(`OpenAI API key loaded: ${process.env.OPENAI_API_KEY ? 'yes' : 'no'}`);
}).on('error', (err) => { console.error('Server listen error:', err); });