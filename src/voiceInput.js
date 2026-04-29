src/voiceInput.js

import { speakResponse } from './aria.js';

const NHL_TEAMS = [
  'Avalanche','Hurricanes','Red Wings','Panthers','Kings','Oilers','Flames',
  'Canucks','Stars','Wild','Predators','Blues','Maple Leafs','Lightning',
  'Senators','Flyers','Penguins','Rangers','Islanders','Devils','Capitals',
  'Bruins','Sabres','Kraken','Knights','Ducks','Sharks','Coyotes'
];

const TEAM_IDS = {
  'Avalanche':21,'Hurricanes':12,'Red Wings':17,'Panthers':13,'Kings':26,
  'Oilers':22,'Flames':20,'Canucks':23,'Stars':25,'Wild':30,'Predators':18,
  'Blues':19,'Maple Leafs':10,'Lightning':14,'Senators':9,'Flyers':4,
  'Penguins':5,'Rangers':3,'Islanders':2,'Devils':1,'Capitals':15,
  'Bruins':6,'Sabres':7,'Kraken':55,'Knights':54,'Ducks':24,'Sharks':28,
  'Coyotes':53
};

async function fetchSchedule(teamName) {
  const teamId = TEAM_IDS[teamName];
  if (!teamId) return null;

  const today = new Date().toISOString().split('T')[0];
  const future = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const url = `https://statsapi.web.nhl.com/api/v1/schedule?teamId=${teamId}&startDate=${today}&endDate=${future}&expand=schedule.linescore,schedule.broadcasts,schedule.game.seriesSummary`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    const games = [];
    for (const date of (data.dates || [])) {
      for (const game of (date.games || [])) {
        const home = game.teams.home.team.name;
        const away = game.teams.away.team.name;
        const opponent = home.includes(teamName) ? away : home;
        const gameDate = new Date(game.gameDate);
        const seriesSummary = game.seriesSummary || null;
        const gameNumber = seriesSummary ? seriesSummary.gameNumber : null;
        const seriesStatus = seriesSummary ? seriesSummary.seriesStatusShort : null;
        const isPlayoff = game.gameType === 'P';

        games.push({
          date: gameDate.toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' }),
          time: gameDate.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', timeZoneName:'short' }),
          opponent,
          isPlayoff,
          gameNumber,
          seriesStatus,
          venue: game.venue?.name || null,
          homeAway: home.includes(teamName) ? 'home' : 'away'
        });

        if (games.length >= 5) break;
      }
      if (games.length >= 5) break;
    }

    return { team: teamName, games };
  } catch {
    return null;
  }
}

function detectTeam(transcript) {
  const lower = transcript.toLowerCase();
  for (const team of NHL_TEAMS) {
    if (lower.includes(team.toLowerCase())) return team;
  }
  return null;
}

function isScheduleQuery(transcript) {
  const lower = transcript.toLowerCase();
  return lower.includes('next game') || lower.includes('schedule') ||
    lower.includes('upcoming game') || lower.includes('next match') ||
    lower.includes('when do') || lower.includes('when does') ||
    lower.includes('play next') || lower.includes('next few games');
}

function buildScheduleContext(scheduleData) {
  if (!scheduleData || !scheduleData.games.length) {
    return `No upcoming games found for the ${scheduleData?.team || 'team'}.`;
  }

  const lines = [`Upcoming schedule for the ${scheduleData.team}:`];
  scheduleData.games.forEach((g, i) => {
    let line = `Game ${i + 1}: ${g.date} at ${g.time} vs ${g.opponent} (${g.homeAway})`;
    if (g.isPlayoff && g.gameNumber) {
      line += ` — Playoff Game ${g.gameNumber}`;
    }
    if (g.seriesStatus) {
      line += `, Series: ${g.seriesStatus}`;
    }
    if (g.venue) {
      line += `, at ${g.venue}`;
    }
    lines.push(line);
  });

  return lines.join('\n');
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
      const team = detectTeam(transcript);
      if (team) {
        const scheduleData = await fetchSchedule(team);
        const context = buildScheduleContext(scheduleData);
        await speakResponse(transcript, { scheduleContext: context, scheduleData });
      } else {
        await speakResponse(transcript, {
          scheduleContext: 'User asked about a schedule but no specific NHL team was detected. Ask them which team they want.'
        });
      }
    } else {
      await speakResponse(transcript);
    }
  };

  recognition.onerror = (e) => {
    if (e.error !== 'no-speech') console.error('Voice error:', e.error);
  };

  return recognition;
}

export { fetchSchedule, NHL_TEAMS, TEAM_IDS };