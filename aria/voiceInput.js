import { fetchSportsData } from './sportsBackend.js';
import { speakResponse } from './ariaResponseHandler.js';

const TEAM_LEAGUE_MAP = {
  mets: 'MLB',
  yankees: 'MLB',
  dodgers: 'MLB',
  cubs: 'MLB',
  'red sox': 'MLB',
  braves: 'MLB',
  astros: 'MLB',
  giants: 'MLB',
  cardinals: 'MLB',
  phillies: 'MLB',
};

const INTENT_KEYWORDS = {
  nextGame: ['next game', 'next match', 'when do they play', 'when are they playing', 'upcoming game'],
  liveScore: ['score', 'live score', 'current score', 'what is the score', 'how are they doing'],
  standings: ['standing', 'standings', 'rank', 'ranking', 'where are they in the standings'],
  recentResults: ['last game', 'recent results', 'how did they do', 'did they win', 'recent game'],
};

function extractTeamName(transcript) {
  const lower = transcript.toLowerCase();
  const teams = Object.keys(TEAM_LEAGUE_MAP).sort((a, b) => b.length - a.length);
  for (const team of teams) {
    if (lower.includes(team)) {
      return team;
    }
  }
  return null;
}

function extractIntent(transcript) {
  const lower = transcript.toLowerCase();
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return intent;
      }
    }
  }
  return 'nextGame';
}

function isSportsQuery(transcript) {
  const lower = transcript.toLowerCase();
  const sportsWords = ['game', 'score', 'play', 'win', 'loss', 'standing', 'match', 'season', 'team', 'baseball'];
  const hasTeam = extractTeamName(transcript) !== null;
  const hasSportsWord = sportsWords.some(w => lower.includes(w));
  return hasTeam || hasSportsWord;
}

function formatSportsResponse(teamName, intent, data) {
  if (!data || data.error) {
    return `Sorry, I couldn't get the latest info for the ${teamName} right now.`;
  }

  switch (intent) {
    case 'nextGame': {
      const g = data.nextGame;
      if (!g) return `I don't have upcoming game info for the ${teamName}.`;
      return `The ${teamName} play next on ${g.date} at ${g.time} against the ${g.opponent}. The game is at ${g.venue}.`;
    }
    case 'liveScore': {
      const s = data.liveScore;
      if (!s) return `There's no live game for the ${teamName} right now.`;
      if (!s.isLive) return `The ${teamName} aren't playing right now. Their last score was ${s.homeTeam} ${s.homeScore}, ${s.awayTeam} ${s.awayScore}.`;
      return `Live score: ${s.homeTeam} ${s.homeScore}, ${s.awayTeam} ${s.awayScore}. It's the ${s.inning} inning.`;
    }
    case 'standings': {
      const st = data.standings;
      if (!st) return `I couldn't find standings info for the ${teamName}.`;
      return `The ${teamName} are currently ${st.rank} in the ${st.division} with a record of ${st.wins} wins and ${st.losses} losses.`;
    }
    case 'recentResults': {
      const r = data.recentResults;
      if (!r || !r.length) return `I don't have recent results for the ${teamName}.`;
      const last = r[0];
      return `In their last game, the ${teamName} ${last.result === 'W' ? 'won' : 'lost'} ${last.score} against the ${last.opponent} on ${last.date}.`;
    }
    default:
      return `I found some info about the ${teamName} but couldn't format it properly.`;
  }
}

async function handleSportsQuery(transcript, teamName, intent) {
  const league = TEAM_LEAGUE_MAP[teamName];
  let data;

  try {
    data = await fetchSportsData({ league, teamName, intent });
  } catch (err) {
    speakResponse(`I had trouble reaching the sports backend for the ${teamName}. Please try again.`);
    return;
  }

  if (!data) {
    speakResponse(`I didn't get a valid response for the ${teamName}. The backend may be unavailable.`);
    return;
  }

  const responseText = formatSportsResponse(teamName, intent, data);
  speakResponse(responseText);
}

export async function handleVoiceInput(transcript) {
  if (!transcript || typeof transcript !== 'string' || transcript.trim() === '') {
    speakResponse("I didn't catch that. Could you say that again?");
    return;
  }

  const trimmed = transcript.trim();

  if (!isSportsQuery(trimmed)) {
    return null;
  }

  const teamName = extractTeamName(trimmed);

  if (!teamName) {
    return null;
  }

  const intent = extractIntent(trimmed);
  await handleSportsQuery(trimmed, teamName, intent);
  return true;
}

export function initVoiceInput(onTranscript) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.error('SpeechRecognition not supported in this browser.');
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;

  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    const handled = await handleVoiceInput(transcript);
    if (!handled && onTranscript) {
      onTranscript(transcript);
    }
  };

  recognition.onerror = (event) => {
    if (event.error !== 'no-speech') {
      speakResponse('There was an issue with voice recognition. Please try again.');
    }
  };

  recognition.start();
  return recognition;
}