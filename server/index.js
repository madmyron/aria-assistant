import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import twilio from 'twilio';
import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const PORT = 3001;

function getAnthropicKey() {
  return process.env.VITE_ANTHROPIC_KEY || '';
}

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
      if (email && token) {
        accounts.set(email.trim(), token.trim());
      }
    });
  }

  if (!accounts.size && process.env.GOOGLE_REFRESH_TOKEN) {
    const email = process.env.GOOGLE_ACCOUNT_EMAIL?.trim() || 'default';
    accounts.set(email, process.env.GOOGLE_REFRESH_TOKEN.trim());
  }

  return accounts;
}

const GOOGLE_ACCOUNTS = parseGoogleAccounts();

function getGoogleAccountEmails() {
  return Array.from(GOOGLE_ACCOUNTS.keys());
}

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

  if (!clientId || !clientSecret || !refreshToken || refreshToken === 'your_google_refresh_token_here') {
    return null;
  }

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
  if (lower.includes('cowboys') || lower.includes('nfl') || lower.includes('football')) {
    return { sport: 'football', league: 'nfl' };
  }
  if (lower.includes('mavs') || lower.includes('nba') || lower.includes('basketball')) {
    return { sport: 'basketball', league: 'nba' };
  }
  if (lower.includes('stars') || lower.includes('nhl') || lower.includes('hockey')) {
    return { sport: 'hockey', league: 'nhl' };
  }
  return { sport: 'baseball', league: 'mlb' };
}

function formatCalendarEvent(event) {
  const start = event.start?.dateTime || event.start?.date;
  const when = start ? new Date(start).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }) : 'No date';
  return {
    id: event.id,
    title: event.summary || 'Untitled event',
    when,
    rawStart: start
  };
}

function getHeader(headers = [], name) {
  return headers.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

app.post('/api/sms', async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

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

app.post('/api/chat', async (req, res) => {
  try {
    const apiKey = getAnthropicKey();
    if (!apiKey) {
      return res.status(500).json({ error: 'Anthropic API key is missing' });
    }

    const payload = {
      model: req.body?.model || 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: req.body?.system || '',
      messages: Array.isArray(req.body?.messages) ? req.body.messages : []
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || 'Claude request failed' });
    }

    res.json({
      reply: data?.content?.[0]?.text || '',
      raw: data
    });
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

    if (!accounts.length) {
      return res.json({ configured: false, events: [], message: 'Google Calendar is not configured.' });
    }

    const allEvents = [];
    const now = new Date();
    const max = new Date(now);
    max.setDate(now.getDate() + 7);

    for (const acct of accounts) {
      const auth = getGoogleAuth(acct);
      if (!auth) continue;
      const calendar = google.calendar({ version: 'v3', auth });
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: max.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 20
      });
      allEvents.push(...(response.data.items || []).map((event) => ({ ...formatCalendarEvent(event), account: acct })));
    }

    if (!allEvents.length) {
      return res.json({ configured: false, events: [], message: 'Google Calendar is not configured.' });
    }

    res.json({
      configured: true,
      accounts,
      events: allEvents
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Calendar fetch failed' });
  }
});

app.post('/api/calendar', async (req, res) => {
  try {
    const account = req.body?.account || req.query?.account;
    const auth = getGoogleAuth(account);
    if (!auth) {
      return res.status(400).json({ error: 'Google Calendar is not configured.' });
    }

    const title = String(req.body?.title || '').trim();
    const date = String(req.body?.date || '').trim();
    const time = String(req.body?.time || '09:00').trim();
    const duration = Number(req.body?.duration || 60);

    if (!title || !date) {
      return res.status(400).json({ error: 'title and date are required' });
    }

    const start = new Date(`${date}T${time}:00-05:00`);
    if (Number.isNaN(start.getTime())) {
      return res.status(400).json({ error: 'Invalid date or time.' });
    }

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

    res.json({
      success: true,
      event: { ...formatCalendarEvent(response.data), account: resolveGoogleAccount(account) }
    });
  } catch (error) {
    console.error('Calendar create error:', error);
    res.status(500).json({ error: error.message || 'Calendar create failed' });
  }
});

app.get('/api/gmail', async (req, res) => {
  try {
    const account = req.query?.account;
    const accounts = account ? [account] : getGoogleAccountEmails();

    if (!accounts.length) {
      return res.json({ configured: false, emails: [], message: 'Gmail is not configured.' });
    }

    const allEmails = [];
    for (const acct of accounts) {
      const auth = getGoogleAuth(acct);
      if (!auth) continue;
      const gmail = google.gmail({ version: 'v1', auth });
      const list = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: 5
      });
      const ids = list.data.messages || [];
      for (const item of ids) {
        const message = await gmail.users.messages.get({
          userId: 'me',
          id: item.id,
          format: 'full'
        });
        const headers = message.data.payload?.headers || [];
        allEmails.push({
          account: acct,
          sender: getHeader(headers, 'From'),
          subject: getHeader(headers, 'Subject') || '(No subject)',
          snippet: message.data.snippet || ''
        });
      }
    }

    if (!allEmails.length) {
      return res.json({ configured: false, emails: [], message: 'Gmail is not configured.' });
    }

    res.json({ configured: true, accounts, emails: allEmails });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Gmail fetch failed' });
  }
});

app.post('/api/gmail/draft', async (req, res) => {
  try {
    const account = req.body?.account || req.query?.account;
    const auth = getGoogleAuth(account);
    if (!auth) {
      return res.status(400).json({ error: 'Gmail is not configured.' });
    }

    const to = String(req.body?.to || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const body = String(req.body?.body || '').trim();
    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'to, subject, and body are required' });
    }

    const gmail = google.gmail({ version: 'v1', auth });
    const rawMessage = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      body
    ].join('\n');

    const encoded = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

    const response = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: { raw: encoded }
      }
    });

    res.json({ success: true, id: response.data.id });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Gmail draft failed' });
  }
});

app.get('/api/google/accounts', (_req, res) => {
  const accounts = getGoogleAccountEmails();
  if (!accounts.length) {
    return res.json({ configured: false, accounts: [], message: 'No Google accounts are configured.' });
  }
  res.json({ configured: true, accounts });
});

app.get('/api/search', async (req, res) => {
  try {
    const query = String(req.query?.query || '').trim();
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const braveKey = process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY;
    const serpKey = process.env.SERPAPI_API_KEY;

    if (braveKey) {
      const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=3`, {
        headers: { 'X-Subscription-Token': braveKey }
      });
      const data = await response.json();
      const results = (data?.web?.results || []).slice(0, 3).map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.description
      }));
      return res.json({ configured: true, provider: 'brave', results });
    }

    if (serpKey) {
      const response = await fetch(`https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(serpKey)}`);
      const data = await response.json();
      const results = (data?.organic_results || []).slice(0, 3).map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet
      }));
      return res.json({ configured: true, provider: 'serpapi', results });
    }

    res.json({ configured: false, results: [], message: 'Search is not configured.' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Search failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Aria backend running on http://localhost:${PORT}`);
});
