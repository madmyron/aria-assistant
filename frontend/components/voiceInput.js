import { fetchSchedule } from '../utils/api';
import { parseGameContext } from '../utils/contextParser';

const SCHEDULE_CACHE = {};
const CACHE_TTL = 5 * 60 * 1000;

async function getTeamSchedule(teamName) {
  const now = Date.now();
  if (SCHEDULE_CACHE[teamName] && now - SCHEDULE_CACHE[teamName].ts < CACHE_TTL) {
    return SCHEDULE_CACHE[teamName].data;
  }
  const data = await fetchSchedule(`/api/sports/team/${encodeURIComponent(teamName)}/schedule`);
  SCHEDULE_CACHE[teamName] = { data, ts: now };
  return data;
}

function extractRelevantGame(schedule, context) {
  if (!schedule || schedule.length === 0) return null;
  if (context.wantsImmediate) return schedule[0];
  if (context.gameNumber != null) {
    const found = schedule.find(g => g.gameNumber === context.gameNumber);
    if (found) return found;
  }
  if (context.opponentName) {
    const found = schedule.find(g =>
      g.opponent && g.opponent.toLowerCase().includes(context.opponentName.toLowerCase())
    );
    if (found) return found;
  }
  if (context.dateHint) {
    const hint = new Date(context.dateHint).toDateString();
    const found = schedule.find(g => new Date(g.date).toDateString() === hint);
    if (found) return found;
  }
  return schedule[0];
}

function buildSchedulePayload(game, schedule) {
  if (!game) return null;
  return {
    game,
    seriesContext: game.seriesStatus || null,
    remainingGames: schedule.filter(g => new Date(g.date) > new Date(game.date)),
    isPlayoff: game.gameNumber != null,
  };
}

function detectTeamFromTranscript(transcript) {
  const patterns = [
    /\b(next game|upcoming game|schedule|games left|playoff game|series)\b/i,
    /\bfor the\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*)\b/,
    /\b([A-Z][a-z]+(?: [A-Z][a-z]+)*)\s+(?:next game|schedule|play next)\b/i,
  ];
  for (const p of patterns) {
    const m = transcript.match(p);
    if (m && m[1] && m[1].length > 2) return m[1];
  }
  return null;
}

function isScheduleQuery(transcript) {
  return /next game|upcoming game|schedule|when do they play|games left|playoff|series status/i.test(transcript);
}

export async function handleVoiceInput(transcript, ariaResponseFn, options = {}) {
  if (!transcript || typeof transcript !== 'string') return;

  const trimmed = transcript.trim();

  if (!isScheduleQuery(trimmed)) {
    return ariaResponseFn({ transcript: trimmed, schedulePayload: null });
  }

  const teamName = options.teamName || detectTeamFromTranscript(trimmed);

  if (!teamName) {
    return ariaResponseFn({ transcript: trimmed, schedulePayload: null, error: 'no_team_detected' });
  }

  let schedule;
  try {
    schedule = await getTeamSchedule(teamName);
  } catch {
    return ariaResponseFn({ transcript: trimmed, schedulePayload: null, error: 'schedule_fetch_failed', teamName });
  }

  const context = parseGameContext(trimmed);
  const relevantGame = extractRelevantGame(schedule, context);
  const schedulePayload = buildSchedulePayload(relevantGame, schedule);

  return ariaResponseFn({ transcript: trimmed, teamName, schedulePayload });
}

export function createVoiceInputHandler(ariaResponseFn, defaultOptions = {}) {
  return function voiceInputHandler(transcript, options = {}) {
    return handleVoiceInput(transcript, ariaResponseFn, { ...defaultOptions, ...options });
  };
}