import { speakResponse } from './aria.js';

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3001'
  : 'https://aria-assistant-production-6730.up.railway.app';

const NHL_TEAM_ALIASES = [
  ['dallas stars', 'stars'],
  ['boston bruins', 'bruins'],
  ['buffalo sabres', 'sabres'],
  ['calgary flames', 'flames'],
  ['carolina hurricanes', 'hurricanes', 'canes'],
  ['chicago blackhawks', 'blackhawks', 'hawks'],
  ['colorado avalanche', 'avalanche', 'avs'],
  ['columbus blue jackets', 'blue jackets'],
  ['detroit red wings', 'red wings'],
  ['edmonton oilers', 'oilers'],
  ['florida panthers', 'panthers'],
  ['los angeles kings', 'la kings', 'kings'],
  ['minnesota wild', 'wild'],
  ['montreal canadiens', 'canadiens', 'habs'],
  ['nashville predators', 'predators', 'preds'],
  ['new jersey devils', 'devils'],
  ['new york islanders', 'islanders'],
  ['new york rangers', 'rangers'],
  ['ottawa senators', 'senators', 'sens'],
  ['philadelphia flyers', 'flyers'],
  ['pittsburgh penguins', 'penguins', 'pens'],
  ['san jose sharks', 'sharks'],
  ['seattle kraken', 'kraken'],
  ['st. louis blues', 'blues'],
  ['tampa bay lightning', 'lightning', 'bolts'],
  ['toronto maple leafs', 'maple leafs', 'leafs'],
  ['utah mammoth', 'mammoth'],
  ['vancouver canucks', 'canucks'],
  ['vegas golden knights', 'golden knights', 'knights'],
  ['washington capitals', 'capitals', 'caps'],
  ['winnipeg jets', 'jets'],
  ['anaheim ducks', 'ducks'],
];

const conversationContext = {
  last_team: null,
  last_sport: null,
};

function detectNHLTeam(transcript) {
  const lower = transcript.toLowerCase();
  for (const aliases of NHL_TEAM_ALIASES) {
    if (aliases.some((a) => lower.includes(a))) return aliases[0];
  }
  return null;
}

function isScheduleQuery(transcript) {
  const lower = transcript.toLowerCase();
  return (
    lower.includes('next game') ||
    lower.includes('schedule') ||
    lower.includes('upcoming game') ||
    lower.includes('next match') ||
    lower.includes('when do') ||
    lower.includes('when does') ||
    lower.includes('play next') ||
    lower.includes('next few games') ||
    lower.includes('playing next')
  );
}

async function fetchNextGame(teamName) {
  try {
    const res = await fetch(`${API_BASE}/api/sports/next-game?team=${encodeURIComponent(teamName)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function initVoiceInput(onTranscript) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    if (onTranscript) onTranscript(transcript);

    if (isScheduleQuery(transcript)) {
      const detectedTeam = detectNHLTeam(transcript);
      const team = detectedTeam || conversationContext.last_team;

      if (detectedTeam && detectedTeam !== conversationContext.last_team) {
        conversationContext.last_team = detectedTeam;
        conversationContext.last_sport = 'nhl';
      } else if (detectedTeam) {
        conversationContext.last_sport = 'nhl';
      }

      if (team) {
        const game = await fetchNextGame(team);
        if (game) {
          const homeAway = game.home ? 'at home vs' : 'away against';
          const context = `Next ${game.team} game: ${homeAway} ${game.opponent} on ${game.date} at ${game.venue}.`;
          await speakResponse(transcript, { scheduleContext: context });
        } else {
          await speakResponse(transcript, { scheduleContext: `Couldn't find upcoming games for the ${team}.` });
        }
      } else {
        await speakResponse(transcript, {
          scheduleContext: 'User asked about a schedule but no specific NHL team was detected. Ask them which team they want.',
        });
      }
    } else {
      const detectedTeam = detectNHLTeam(transcript);
      if (detectedTeam) {
        conversationContext.last_team = detectedTeam;
        conversationContext.last_sport = 'nhl';
      }
      await speakResponse(transcript);
    }
  };

  recognition.onerror = (e) => {
    if (e.error !== 'no-speech') console.error('Voice error:', e.error);
  };

  return recognition;
}