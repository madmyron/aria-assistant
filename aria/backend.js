const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

const MLB_TEAMS = {
  mets: { id: 121, name: 'New York Mets', abbr: 'NYM' },
  yankees: { id: 147, name: 'New York Yankees', abbr: 'NYY' },
  dodgers: { id: 119, name: 'Los Angeles Dodgers', abbr: 'LAD' },
  braves: { id: 144, name: 'Atlanta Braves', abbr: 'ATL' },
  cubs: { id: 112, name: 'Chicago Cubs', abbr: 'CHC' },
  sox: { id: 111, name: 'Boston Red Sox', abbr: 'BOS' },
  redsox: { id: 111, name: 'Boston Red Sox', abbr: 'BOS' },
  astros: { id: 117, name: 'Houston Astros', abbr: 'HOU' },
  phillies: { id: 143, name: 'Philadelphia Phillies', abbr: 'PHI' },
  cardinals: { id: 138, name: 'St. Louis Cardinals', abbr: 'STL' }
};

const MLB_BASE = 'https://statsapi.mlb.com/api/v1';

function extractTeamFromText(text) {
  const lower = text.toLowerCase();
  for (const key of Object.keys(MLB_TEAMS)) {
    if (lower.includes(key)) return MLB_TEAMS[key];
  }
  for (const team of Object.values(MLB_TEAMS)) {
    if (lower.includes(team.name.toLowerCase()) || lower.includes(team.abbr.toLowerCase())) {
      return team;
    }
  }
  return null;
}

function isSportsQuery(text) {
  const keywords = ['game', 'score', 'next', 'play', 'playing', 'standing', 'record', 'win', 'loss', 'beat', 'pitcher', 'schedule', 'series', 'inning', 'baseball'];
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

async function fetchTeamSchedule(teamId) {
  const today = new Date().toISOString().split('T')[0];
  const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const url = `${MLB_BASE}/schedule?sportId=1&teamId=${teamId}&startDate=${today}&endDate=${end}&hydrate=team,linescore`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Schedule fetch failed: ${res.status}`);
  return res.json();
}

async function fetchLiveScore(teamId) {
  const today = new Date().toISOString().split('T')[0];
  const url = `${MLB_BASE}/schedule?sportId=1&teamId=${teamId}&startDate=${today}&endDate=${today}&hydrate=linescore,team`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Live score fetch failed: ${res.status}`);
  return res.json();
}

async function fetchTeamStandings(teamId) {
  const year = new Date().getFullYear();
  const url = `${MLB_BASE}/standings?leagueId=103,104&season=${year}&hydrate=team`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Standings fetch failed: ${res.status}`);
  return res.json();
}

async function fetchRecentResults(teamId) {
  const today = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const url = `${MLB_BASE}/schedule?sportId=1&teamId=${teamId}&startDate=${start}&endDate=${today}&hydrate=linescore,team`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Recent results fetch failed: ${res.status}`);
  return res.json();
}

function parseNextGame(scheduleData, teamName) {
  const dates = scheduleData.dates || [];
  for (const date of dates) {
    for (const game of (date.games || [])) {
      if (['Preview', 'Pre-Game', 'Scheduled', 'Warmup'].includes(game.status?.abstractGameState) ||
          game.status?.detailedState === 'Scheduled') {
        const home = game.teams?.home?.team?.name;
        const away = game.teams?.away?.team?.name;
        const time = game.gameDate ? new Date(game.gameDate).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'TBD';
        const venue = game.venue?.name || '';
        return `The ${teamName}'s next game is ${away} at ${home} on ${time}${venue ? ' at ' + venue : ''}.`;
      }
    }
  }
  return null;
}

function parseLiveScore(liveData, teamName) {
  const dates = liveData.dates || [];
  for (const date of dates) {
    for (const game of (date.games || [])) {
      const state = game.status?.abstractGameState;
      if (state === 'Live') {
        const home = game.teams?.home?.team?.name;
        const away = game.teams?.away?.team?.name;
        const homeScore = game.teams?.home?.score ?? '?';
        const awayScore = game.teams?.away?.score ?? '?';
        const inning = game.linescore?.currentInningOrdinal || '';
        const half = game.linescore?.inningHalf || '';
        return `${teamName} are playing right now. It's ${away} ${awayScore}, ${home} ${homeScore} in the ${half} ${inning}.`;
      }
      if (state === 'Final') {
        const home = game.teams?.home?.team?.name;
        const away = game.teams?.away?.team?.name;
        const homeScore = game.teams?.home?.score ?? '?';
        const awayScore = game.teams?.away?.score ?? '?';
        return `Today's game is final: ${away} ${awayScore}, ${home} ${homeScore}.`;
      }
    }
  }
  return null;
}

function parseStandings(standingsData, teamId, teamName) {
  for (const record of (standingsData.records || [])) {
    for (const entry of (record.teamRecords || [])) {
      if (entry.team?.id === teamId) {
        const w = entry.wins;
        const l = entry.losses;
        const pct = entry.winningPercentage;
        const gb = entry.gamesBack === '-' ? '0' : entry.gamesBack;
        const div = record.division?.name || 'their division';
        const place = entry.divisionRank || '?';
        const ordinal = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th', '5': '5th' }[place] || `${place}th`;
        return `The ${teamName} are ${ordinal} in the ${div} with a record of ${w} and ${l}, a winning percentage of ${pct}, ${gb} games back.`;
      }
    }
  }
  return null;
}

function parseRecentResults(recentData, teamName) {
  const results = [];
  for (const date of (recentData.dates || [])) {
    for (const game of (date.games || [])) {
      if (game.status?.abstractGameState === 'Final') {
        const home = game.teams?.home?.team?.name;
        const away = game.teams?.away?.team?.name;
        const homeScore = game.teams?.home?.score;
        const awayScore = game.teams?.away?.score;
        const gameDate = new Date(game.gameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const won = (home === teamName && homeScore > awayScore) || (away === teamName && awayScore > homeScore);
        results.push(`${gameDate}: ${won ? 'W' : 'L'} ${away} ${awayScore}-${homeScore} ${home}`);
      }
    }
  }
  if (results.length === 0) return null;
  return `Recent results for the ${teamName}: ${results.slice(-5).join('; ')}.`;
}

router.post('/voice-query', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'No text provided', fallback: true });

  const team = extractTeamFromText(text);
  if (!team || !isSportsQuery(text)) {
    return res.json({ fallback: true, text });
  }

  try {
    const [liveData, scheduleData, standingsData, recentData] = await Promise.all([
      fetchLiveScore(team.id),
      fetchTeamSchedule(team.id),
      fetchTeamStandings(team.id),
      fetchRecentResults(team.id)
    ]);

    const live = parseLiveScore(liveData, team.name);
    const next = parseNextGame(scheduleData, team.name);
    const standings = parseStandings(standingsData, team.id, team.name);
    const recent = parseRecentResults(recentData, team.name);

    const parts = [live, next, standings, recent].filter(Boolean);

    if (parts.length === 0) {
      return res.json({ fallback: false, spoken: `I couldn't find current game data for the ${team.name} right now.`, team: team.name });
    }

    return res.json({ fallback: false, spoken: parts.join(' '), team: team.name, data: { live, next, standings, recent } });
  } catch (err) {
    return res.status(500).json({ fallback: true, error: err.message });
  }
});

router.get('/team/:name', async (req, res) => {
  const team = extractTeamFromText(req.params.name);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  try {
    const [liveData, scheduleData, standingsData, recentData] = await Promise.all([
      fetchLiveScore(team.id),
      fetchTeamSchedule(team.id),
      fetchTeamStandings(team.id),
      fetchRecentResults(team.id)
    ]);

    res.json({
      team: team.name,
      live: parseLiveScore(liveData, team.name),
      next: parseNextGame(scheduleData, team.name),
      standings: parseStandings(standingsData, team.id, team.name),
      recent: parseRecentResults(recentData, team.name)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;