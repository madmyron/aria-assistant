const express = require('express');
const router = express.Router();
const axios = require('axios');

const NHL_API = 'https://api-web.nhle.com/v1';
const NBA_API = 'https://api.nba.com/v2';

const teamNameToId = {
  'oilers': { league: 'nhl', id: 'EDM', fullName: 'Edmonton Oilers' },
  'edmonton oilers': { league: 'nhl', id: 'EDM', fullName: 'Edmonton Oilers' },
  'maple leafs': { league: 'nhl', id: 'TOR', fullName: 'Toronto Maple Leafs' },
  'toronto maple leafs': { league: 'nhl', id: 'TOR', fullName: 'Toronto Maple Leafs' },
  'canucks': { league: 'nhl', id: 'VAN', fullName: 'Vancouver Canucks' },
  'flames': { league: 'nhl', id: 'CGY', fullName: 'Calgary Flames' },
  'senators': { league: 'nhl', id: 'OTT', fullName: 'Ottawa Senators' },
  'canadiens': { league: 'nhl', id: 'MTL', fullName: 'Montreal Canadiens' },
  'jets': { league: 'nhl', id: 'WPG', fullName: 'Winnipeg Jets' },
  'raptors': { league: 'nba', id: '28', fullName: 'Toronto Raptors' },
  'toronto raptors': { league: 'nba', id: '28', fullName: 'Toronto Raptors' },
};

async function getNHLSchedule(teamId) {
  try {
    const res = await axios.get(`${NHL_API}/club-schedule-season/${teamId}/now`);
    const games = res.data.games || [];
    const now = new Date();
    const upcoming = games
      .filter(g => new Date(g.gameDate) >= now)
      .slice(0, 10);

    return upcoming.map(g => {
      const isHome = g.homeTeam.abbrev === teamId;
      const opponent = isHome ? g.awayTeam.abbrev : g.homeTeam.abbrev;
      const isPlayoff = g.gameType === 3;
      const entry = {
        date: g.gameDate,
        opponent,
        home: isHome,
        gameType: isPlayoff ? 'playoff' : 'regular',
      };
      if (isPlayoff) {
        entry.gameNumber = g.seriesStatus?.gameNumberOfSeries || null;
        entry.seriesStatus = g.seriesStatus
          ? `${g.seriesStatus.topSeedTeamAbbrev} leads ${g.seriesStatus.topSeedWins}-${g.seriesStatus.bottomSeedWins}`
          : null;
        entry.round = g.seriesStatus?.seriesTitle || null;
      }
      return entry;
    });
  } catch {
    return [];
  }
}

async function getNBASchedule(teamId) {
  try {
    const res = await axios.get(`${NBA_API}/schedule`, {
      params: { teamId, season: '2024-25' }
    });
    const games = res.data?.response?.schedule || [];
    const now = new Date();
    return games
      .filter(g => new Date(g.date) >= now)
      .slice(0, 10)
      .map(g => ({
        date: g.date,
        opponent: g.hTeam?.triCode === teamId ? g.vTeam?.triCode : g.hTeam?.triCode,
        home: g.hTeam?.teamId === teamId,
        gameType: 'regular',
      }));
  } catch {
    return [];
  }
}

router.get('/team/:teamName/schedule', async (req, res) => {
  const key = req.params.teamName.toLowerCase();
  const teamInfo = teamNameToId[key];
  if (!teamInfo) return res.status(404).json({ error: 'Team not found' });

  let schedule = [];
  if (teamInfo.league === 'nhl') {
    schedule = await getNHLSchedule(teamInfo.id);
  } else if (teamInfo.league === 'nba') {
    schedule = await getNBASchedule(teamInfo.id);
  }

  res.json({ team: teamInfo.fullName, schedule: schedule.slice(0, 10) });
});

function extractRelevantGame(schedule, query) {
  if (!schedule || schedule.length === 0) return null;
  const q = query.toLowerCase();

  if (q.includes('next game') || q.includes('next match')) {
    return { game: schedule[0], index: 0 };
  }
  if (q.includes('game 7') || q.includes('game seven')) {
    const g = schedule.find(g => g.gameNumber === 7);
    return g ? { game: g, index: schedule.indexOf(g) } : { game: schedule[0], index: 0 };
  }
  const gameNumMatch = q.match(/game\s+(\d+)/);
  if (gameNumMatch) {
    const num = parseInt(gameNumMatch[1]);
    const g = schedule.find(g => g.gameNumber === num);
    return g ? { game: g, index: schedule.indexOf(g) } : { game: schedule[0], index: 0 };
  }
  if (q.includes('after') || q.includes('following')) {
    return schedule.length > 1 ? { game: schedule[1], index: 1 } : { game: schedule[0], index: 0 };
  }
  return { game: schedule[0], index: 0 };
}

function buildScheduleContext(teamName, schedule, relevantGameResult) {
  if (!schedule || schedule.length === 0) {
    return `No upcoming schedule found for ${teamName}.`;
  }
  const { game, index } = relevantGameResult;
  let ctx = `${teamName} upcoming games (next ${schedule.length}):\n`;
  schedule.forEach((g, i) => {
    const marker = i === index ? '>> ' : '   ';
    const loc = g.home ? 'vs' : '@';
    const playoff = g.gameType === 'playoff' ? ` [Game ${g.gameNumber}]` : '';
    const series = g.seriesStatus ? ` | Series: ${g.seriesStatus}` : '';
    ctx += `${marker}${g.date} ${loc} ${g.opponent}${playoff}${series}\n`;
  });
  if (game.gameType === 'playoff') {
    ctx += `\nFocused game: Game ${game.gameNumber} on ${game.date} ${game.home ? 'vs' : '@'} ${game.opponent}.`;
    if (game.seriesStatus) ctx += ` Current series status: ${game.seriesStatus}.`;
    if (game.round) ctx += ` Round: ${game.round}.`;
  } else {
    ctx += `\nNext game: ${game.date} ${game.home ? 'vs' : '@'} ${game.opponent}.`;
  }
  return ctx;
}

router.post('/voiceInput', async (req, res) => {
  const { transcript, sessionId } = req.body;
  if (!transcript) return res.status(400).json({ error: 'No transcript provided' });

  const lower = transcript.toLowerCase();
  let scheduleContext = null;
  let detectedTeam = null;

  const scheduleKeywords = ['next game', 'next match', 'schedule', 'when do they play', 'when is the game', 'playoff', 'series', 'game 7', 'game seven'];
  const wantsSchedule = scheduleKeywords.some(k => lower.includes(k));

  if (wantsSchedule) {
    for (const [key, info] of Object.entries(teamNameToId)) {
      if (lower.includes(key)) {
        detectedTeam = info;
        break;
      }
    }
    if (detectedTeam) {
      let schedule = [];
      if (detectedTeam.league === 'nhl') {
        schedule = await getNHLSchedule(detectedTeam.id);
      } else if (detectedTeam.league === 'nba') {
        schedule = await getNBASchedule(detectedTeam.id);
      }
      if (schedule.length > 0) {
        const relevant = extractRelevantGame(schedule, transcript);
        scheduleContext = buildScheduleContext(detectedTeam.fullName, schedule, relevant);
      }
    }
  }

  const payload = {
    transcript,
    sessionId,
    scheduleContext,
    detectedTeam: detectedTeam ? detectedTeam.fullName : null,
  };

  res.json(payload);
});

module.exports = router;