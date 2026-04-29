import { Router } from 'express';
import fetch from 'node-fetch';

const router = Router();

// ─── Team lookup maps ────────────────────────────────────────────────────────

const NHL_TEAMS = {
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectSport(query = '') {
  const lower = query.toLowerCase();
  if (lower.includes('cowboys') || lower.includes('nfl') || lower.includes('football')) return { sport: 'football', league: 'nfl' };
  if (lower.includes('mavs') || lower.includes('nba') || lower.includes('basketball')) return { sport: 'basketball', league: 'nba' };
  if (lower.includes('stars') || lower.includes('nhl') || lower.includes('hockey')) return { sport: 'hockey', league: 'nhl' };
  return { sport: 'baseball', league: 'mlb' };
}

const ESPN_CACHE = new Map();
const ESPN_CACHE_TTL = 60 * 60 * 1000;

async function fetchESPNGames(espnSport, espnLeague) {
  const key = `${espnSport}/${espnLeague}`;
  const cached = ESPN_CACHE.get(key);
  if (cached && Date.now() - cached.ts < ESPN_CACHE_TTL) return cached.data;
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${espnSport}/${espnLeague}/scoreboard`);
  if (!r.ok) return [];
  const data = await r.json();
  const games = (data?.events || []).map(event => {
    const comp = event?.competitions?.[0];
    const home = comp?.competitors?.find(t => t.homeAway === 'home');
    const away = comp?.competitors?.find(t => t.homeAway === 'away');
    const state = comp?.status?.type?.state || '';
    return {
      homeTeam: home?.team?.displayName || '', homeAbbr: home?.team?.abbreviation || '',
      awayTeam: away?.team?.displayName || '', awayAbbr: away?.team?.abbreviation || '',
      homeScore: home?.score || null, awayScore: away?.score || null,
      datetime: event.date || null,
      status: state === 'pre' ? 'upcoming' : state === 'in' ? 'live' : 'final',
      statusDesc: comp?.status?.type?.description || '',
    };
  });
  ESPN_CACHE.set(key, { ts: Date.now(), data: games });
  return games;
}

const NHL_LIVE = ['LIVE', 'PRG', 'CRIT'];
const NHL_DONE = ['OFF', 'FINAL'];

// ─── Generic sports routes ────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { sport, league } = detectSport(req.query?.query || '');
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard`);
    const data = await r.json();
    const games = (data?.events || []).slice(0, 3).map(event => {
      const comp = event?.competitions?.[0];
      const home = comp?.competitors?.find(t => t.homeAway === 'home');
      const away = comp?.competitors?.find(t => t.homeAway === 'away');
      const detail = comp?.status?.type?.shortDetail || 'Scheduled';
      return `${away?.team?.abbreviation || 'AWAY'} ${away?.score || ''} @ ${home?.team?.abbreviation || 'HOME'} ${home?.score || ''} (${detail})`.replace(/\s+/g, ' ').trim();
    });
    res.json({ games });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/nfl', async (_req, res) => {
  try {
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
    if (!r.ok) throw new Error(`ESPN NFL scoreboard returned ${r.status}`);
    const data = await r.json();
    const games = (data?.events || []).map(event => {
      const comp = event?.competitions?.[0];
      const home = comp?.competitors?.find(c => c.homeAway === 'home');
      const away = comp?.competitors?.find(c => c.homeAway === 'away');
      const state = comp?.status?.type?.state || '';
      return {
        away: away?.team?.displayName || '', home: home?.team?.displayName || '',
        time: event.date || null,
        status: state === 'pre' ? 'scheduled' : state === 'in' ? 'live' : 'final',
      };
    });
    res.json({ sport: 'NFL', games });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ESPN team schedule endpoints only return past games; find next game by walking
// forward through the scoreboard day-by-day until we find the team.
async function espnFindNextGame(sport, league, abbr, maxDays = 14) {
  const now = new Date();
  for (let i = 0; i <= maxDays; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard?dates=${dateStr}`);
    if (!r.ok) continue;
    const data = await r.json();
    const game = (data.events || []).find(e => {
      const state = e.competitions?.[0]?.status?.type?.state;
      return (state === 'pre' || state === 'in') && e.competitions?.[0]?.competitors?.some(c => c.team?.abbreviation === abbr);
    });
    if (game) return game;
  }
  return null;
}

// ─── NHL routes ───────────────────────────────────────────────────────────────

router.get('/next-game', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = NHL_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `NHL team not found: ${req.query.team}` });
    const r = await fetch(`https://api-web.nhle.com/v1/club-schedule-season/${abbr}/now`);
    if (!r.ok) throw new Error(`NHL API error for ${abbr}`);
    const sched = await r.json();
    const now = new Date();
    const next = (sched.games || []).find(g => new Date(g.gameDate) >= now && !NHL_DONE.includes(g.gameState) && !NHL_LIVE.includes(g.gameState));
    if (!next) return res.status(404).json({ error: `No upcoming games found for ${teamQuery}` });
    const isHome = next.homeTeam?.abbrev === abbr;
    const opponent = isHome ? next.awayTeam?.commonName?.default || next.awayTeam?.abbrev : next.homeTeam?.commonName?.default || next.homeTeam?.abbrev;
    const dateStr = new Date(next.gameDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return res.json({ sport: 'NHL', team: isHome ? next.homeTeam?.commonName?.default : next.awayTeam?.commonName?.default, opponent, date: dateStr, venue: next.venue?.default || 'TBD', home: isHome });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/score', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = NHL_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `NHL team not found: ${req.query.team}` });
    const r = await fetch(`https://api-web.nhle.com/v1/club-schedule-season/${abbr}/now`);
    if (!r.ok) throw new Error(`NHL API error for ${abbr}`);
    const sched = await r.json();
    const live = (sched.games || []).find(g => NHL_LIVE.includes(g.gameState));
    if (!live) return res.status(404).json({ error: 'No game in progress', live: false });
    const homeScore = live.homeTeam?.score ?? 0;
    const awayScore = live.awayTeam?.score ?? 0;
    const homeName = live.homeTeam?.commonName?.default || live.homeTeam?.abbrev;
    const awayName = live.awayTeam?.commonName?.default || live.awayTeam?.abbrev;
    const period = live.periodDescriptor?.number || '?';
    const periodLabel = live.periodDescriptor?.periodType === 'OT' ? 'OT' : `P${period}`;
    return res.json({ live: true, homeName, awayName, homeScore, awayScore, period, periodLabel, summary: `${awayName} ${awayScore}, ${homeName} ${homeScore} — ${periodLabel} in progress` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/standings', async (_req, res) => {
  try {
    const r = await fetch('https://api-web.nhle.com/v1/standings/now');
    if (!r.ok) throw new Error('NHL standings API error');
    const data = await r.json();
    const teams = (data.standings || []).map(t => ({
      team: t.teamName?.default || t.teamAbbrev?.default,
      wins: t.wins, losses: t.losses, otLosses: t.otLosses, points: t.points, division: t.divisionName,
    }));
    return res.json({ standings: teams });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/last-games', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = NHL_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `NHL team not found: ${req.query.team}` });
    const r = await fetch(`https://api-web.nhle.com/v1/club-schedule-season/${abbr}/now`);
    if (!r.ok) throw new Error(`NHL API error for ${abbr}`);
    const sched = await r.json();
    const finished = (sched.games || []).filter(g => NHL_DONE.includes(g.gameState)).slice(-5);
    const games = finished.map(g => {
      const isHome = g.homeTeam?.abbrev === abbr;
      const us = isHome ? g.homeTeam : g.awayTeam;
      const them = isHome ? g.awayTeam : g.homeTeam;
      return `${(us.score || 0) > (them.score || 0) ? 'W' : 'L'} ${us.score}-${them.score} vs ${them.commonName?.default || them.abbrev} (${g.gameDate})`;
    });
    return res.json({ team: abbr, lastGames: games });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/team-record', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = NHL_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `NHL team not found: ${req.query.team}` });
    const r = await fetch('https://api-web.nhle.com/v1/standings/now');
    if (!r.ok) throw new Error('NHL standings API error');
    const data = await r.json();
    const team = (data.standings || []).find(t => t.teamAbbrev?.default === abbr);
    if (!team) return res.status(404).json({ error: `Team ${abbr} not found in standings` });
    return res.json({ team: team.teamName?.default, wins: team.wins, losses: team.losses, otLosses: team.otLosses, points: team.points, divisionRank: team.divisionSequence, division: team.divisionName });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── NBA routes ───────────────────────────────────────────────────────────────

router.get('/nba/next-game', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = NBA_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `NBA team not found: ${req.query.team}` });
    const next = await espnFindNextGame('basketball', 'nba', abbr);
    if (!next) return res.status(404).json({ error: `No upcoming NBA games for ${teamQuery}` });
    const comp = next.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway === 'home');
    const away = comp?.competitors?.find(c => c.homeAway === 'away');
    const isHome = home?.team?.abbreviation === abbr;
    return res.json({ sport: 'NBA', team: isHome ? home?.team?.displayName : away?.team?.displayName, opponent: isHome ? away?.team?.displayName : home?.team?.displayName, date: new Date(next.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), venue: comp?.venue?.fullName || 'TBD', home: isHome });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/nba/score', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = NBA_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `NBA team not found: ${req.query.team}` });
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
    if (!r.ok) throw new Error('ESPN NBA scoreboard error');
    const data = await r.json();
    const game = (data.events || []).find(e => e.competitions?.[0]?.status?.type?.state === 'in' && e.competitions?.[0]?.competitors?.some(c => c.team?.abbreviation === abbr));
    if (!game) return res.status(404).json({ error: 'No NBA game in progress', live: false });
    const comp = game.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway === 'home');
    const away = comp?.competitors?.find(c => c.homeAway === 'away');
    const period = comp?.status?.period || '?';
    const clock = comp?.status?.displayClock || '';
    return res.json({ live: true, homeName: home?.team?.displayName, awayName: away?.team?.displayName, homeScore: home?.score, awayScore: away?.score, period, clock, summary: `${away?.team?.displayName} ${away?.score}, ${home?.team?.displayName} ${home?.score} — Q${period} ${clock}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/nba/standings', async (_req, res) => {
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

router.get('/nba/last-games', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = NBA_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `NBA team not found: ${req.query.team}` });
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${abbr}/schedule`);
    if (!r.ok) throw new Error('ESPN NBA schedule error');
    const data = await r.json();
    const now = new Date();
    const finished = (data.events || []).filter(e => new Date(e.date) < now && e.competitions?.[0]?.status?.type?.state === 'post').slice(-5);
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

router.get('/nba/team-record', async (req, res) => {
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

// ─── NFL routes ───────────────────────────────────────────────────────────────

const NFL_TEAMS = {
  'arizona cardinals': 'ARI', 'cardinals': 'ARI',
  'atlanta falcons': 'ATL', 'falcons': 'ATL',
  'baltimore ravens': 'BAL', 'ravens': 'BAL',
  'buffalo bills': 'BUF', 'bills': 'BUF',
  'carolina panthers': 'CAR', 'panthers': 'CAR',
  'chicago bears': 'CHI', 'bears': 'CHI',
  'cincinnati bengals': 'CIN', 'bengals': 'CIN',
  'cleveland browns': 'CLE', 'browns': 'CLE',
  'dallas cowboys': 'DAL', 'cowboys': 'DAL',
  'denver broncos': 'DEN', 'broncos': 'DEN',
  'detroit lions': 'DET', 'lions': 'DET',
  'green bay packers': 'GB', 'packers': 'GB',
  'houston texans': 'HOU', 'texans': 'HOU',
  'indianapolis colts': 'IND', 'colts': 'IND',
  'jacksonville jaguars': 'JAX', 'jaguars': 'JAX', 'jags': 'JAX',
  'kansas city chiefs': 'KC', 'chiefs': 'KC',
  'las vegas raiders': 'LV', 'raiders': 'LV',
  'los angeles chargers': 'LAC', 'chargers': 'LAC',
  'los angeles rams': 'LAR', 'rams': 'LAR',
  'miami dolphins': 'MIA', 'dolphins': 'MIA',
  'minnesota vikings': 'MIN', 'vikings': 'MIN',
  'new england patriots': 'NE', 'patriots': 'NE', 'pats': 'NE',
  'new orleans saints': 'NO', 'saints': 'NO',
  'new york giants': 'NYG', 'giants': 'NYG',
  'new york jets': 'NYJ', 'jets': 'NYJ',
  'philadelphia eagles': 'PHI', 'eagles': 'PHI',
  'pittsburgh steelers': 'PIT', 'steelers': 'PIT',
  'san francisco 49ers': 'SF', '49ers': 'SF', 'niners': 'SF',
  'seattle seahawks': 'SEA', 'seahawks': 'SEA',
  'tampa bay buccaneers': 'TB', 'buccaneers': 'TB', 'bucs': 'TB',
  'tennessee titans': 'TEN', 'titans': 'TEN',
  'washington commanders': 'WSH', 'commanders': 'WSH',
};

router.get('/nfl/next-game', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = NFL_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `NFL team not found: ${req.query.team}` });
    const next = await espnFindNextGame('football', 'nfl', abbr);
    if (!next) return res.status(404).json({ error: `No upcoming NFL games for ${teamQuery}` });
    const comp = next.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway === 'home');
    const away = comp?.competitors?.find(c => c.homeAway === 'away');
    const isHome = home?.team?.abbreviation === abbr;
    return res.json({ sport: 'NFL', team: isHome ? home?.team?.displayName : away?.team?.displayName, opponent: isHome ? away?.team?.displayName : home?.team?.displayName, date: new Date(next.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), venue: comp?.venue?.fullName || 'TBD', home: isHome });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/nfl/score', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = NFL_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `NFL team not found: ${req.query.team}` });
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
    if (!r.ok) throw new Error('ESPN NFL scoreboard error');
    const data = await r.json();
    const game = (data.events || []).find(e => e.competitions?.[0]?.status?.type?.state === 'in' && e.competitions?.[0]?.competitors?.some(c => c.team?.abbreviation === abbr));
    if (!game) return res.status(404).json({ error: 'No NFL game in progress', live: false });
    const comp = game.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway === 'home');
    const away = comp?.competitors?.find(c => c.homeAway === 'away');
    const period = comp?.status?.period || '?';
    const clock = comp?.status?.displayClock || '';
    return res.json({ live: true, homeName: home?.team?.displayName, awayName: away?.team?.displayName, homeScore: home?.score, awayScore: away?.score, period, clock, summary: `${away?.team?.displayName} ${away?.score}, ${home?.team?.displayName} ${home?.score} — Q${period} ${clock}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/nfl/standings', async (_req, res) => {
  try {
    const r = await fetch('https://site.api.espn.com/apis/v2/sports/football/nfl/standings');
    if (!r.ok) throw new Error('ESPN NFL standings error');
    const data = await r.json();
    const teams = [];
    for (const conf of (data.children || [])) {
      for (const div of (conf.children || [])) {
        for (const entry of (div.standings?.entries || [])) {
          const stats = {};
          (entry.stats || []).forEach(s => { stats[s.name] = s.value; });
          teams.push({ team: entry.team?.displayName, wins: stats.wins || 0, losses: stats.losses || 0, ties: stats.ties || 0, pct: stats.winPercent || 0, conference: conf.name, division: div.name });
        }
      }
    }
    return res.json({ standings: teams.sort((a, b) => b.pct - a.pct) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/nfl/last-games', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = NFL_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `NFL team not found: ${req.query.team}` });
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${abbr}/schedule`);
    if (!r.ok) throw new Error('ESPN NFL schedule error');
    const data = await r.json();
    const now = new Date();
    const finished = (data.events || []).filter(e => new Date(e.date) < now && e.competitions?.[0]?.status?.type?.state === 'post').slice(-5);
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

router.get('/nfl/team-record', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = NFL_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `NFL team not found: ${req.query.team}` });
    const r = await fetch('https://site.api.espn.com/apis/v2/sports/football/nfl/standings');
    if (!r.ok) throw new Error('ESPN NFL standings error');
    const data = await r.json();
    for (const conf of (data.children || [])) {
      for (const div of (conf.children || [])) {
        for (const entry of (div.standings?.entries || [])) {
          if (entry.team?.abbreviation === abbr) {
            const stats = {};
            (entry.stats || []).forEach(s => { stats[s.name] = s.value; });
            return res.json({ team: entry.team?.displayName, wins: stats.wins, losses: stats.losses, ties: stats.ties, pct: stats.winPercent, conference: conf.name, division: div.name });
          }
        }
      }
    }
    return res.status(404).json({ error: `Team ${abbr} not found in NFL standings` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── MLB routes ───────────────────────────────────────────────────────────────

const MLB_TEAMS = {
  'arizona diamondbacks': 'ARI', 'diamondbacks': 'ARI', 'dbacks': 'ARI',
  'atlanta braves': 'ATL', 'braves': 'ATL',
  'baltimore orioles': 'BAL', 'orioles': 'BAL',
  'boston red sox': 'BOS', 'red sox': 'BOS',
  'chicago cubs': 'CHC', 'cubs': 'CHC',
  'chicago white sox': 'CWS', 'white sox': 'CWS',
  'cincinnati reds': 'CIN', 'reds': 'CIN',
  'cleveland guardians': 'CLE', 'guardians': 'CLE',
  'colorado rockies': 'COL', 'rockies': 'COL',
  'detroit tigers': 'DET', 'tigers': 'DET',
  'houston astros': 'HOU', 'astros': 'HOU',
  'kansas city royals': 'KC', 'royals': 'KC',
  'los angeles angels': 'LAA', 'angels': 'LAA',
  'los angeles dodgers': 'LAD', 'dodgers': 'LAD',
  'miami marlins': 'MIA', 'marlins': 'MIA',
  'milwaukee brewers': 'MIL', 'brewers': 'MIL',
  'minnesota twins': 'MIN', 'twins': 'MIN',
  'new york mets': 'NYM', 'mets': 'NYM',
  'new york yankees': 'NYY', 'yankees': 'NYY',
  'oakland athletics': 'OAK', 'athletics': 'OAK', 'as': 'OAK',
  'philadelphia phillies': 'PHI', 'phillies': 'PHI',
  'pittsburgh pirates': 'PIT', 'pirates': 'PIT',
  'san diego padres': 'SD', 'padres': 'SD',
  'san francisco giants': 'SF', 'sf giants': 'SF',
  'seattle mariners': 'SEA', 'mariners': 'SEA',
  'st. louis cardinals': 'STL', 'cardinals': 'STL',
  'tampa bay rays': 'TB', 'rays': 'TB',
  'texas rangers': 'TEX', 'rangers': 'TEX',
  'toronto blue jays': 'TOR', 'blue jays': 'TOR', 'jays': 'TOR',
  'washington nationals': 'WSH', 'nationals': 'WSH', 'nats': 'WSH',
};

router.get('/mlb/next-game', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = MLB_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `MLB team not found: ${req.query.team}` });
    const next = await espnFindNextGame('baseball', 'mlb', abbr);
    if (!next) return res.status(404).json({ error: `No upcoming MLB games for ${teamQuery}` });
    const comp = next.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway === 'home');
    const away = comp?.competitors?.find(c => c.homeAway === 'away');
    const isHome = home?.team?.abbreviation === abbr;
    return res.json({ sport: 'MLB', team: isHome ? home?.team?.displayName : away?.team?.displayName, opponent: isHome ? away?.team?.displayName : home?.team?.displayName, date: new Date(next.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), venue: comp?.venue?.fullName || 'TBD', home: isHome });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/mlb/score', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = MLB_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `MLB team not found: ${req.query.team}` });
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard');
    if (!r.ok) throw new Error('ESPN MLB scoreboard error');
    const data = await r.json();
    const game = (data.events || []).find(e => e.competitions?.[0]?.status?.type?.state === 'in' && e.competitions?.[0]?.competitors?.some(c => c.team?.abbreviation === abbr));
    if (!game) return res.status(404).json({ error: 'No MLB game in progress', live: false });
    const comp = game.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway === 'home');
    const away = comp?.competitors?.find(c => c.homeAway === 'away');
    const inning = comp?.status?.period || '?';
    const clock = comp?.status?.displayClock || '';
    return res.json({ live: true, homeName: home?.team?.displayName, awayName: away?.team?.displayName, homeScore: home?.score, awayScore: away?.score, inning, clock, summary: `${away?.team?.displayName} ${away?.score}, ${home?.team?.displayName} ${home?.score} — Inning ${inning} ${clock}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/mlb/standings', async (_req, res) => {
  try {
    const r = await fetch('https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings');
    if (!r.ok) throw new Error('ESPN MLB standings error');
    const data = await r.json();
    const teams = [];
    for (const conf of (data.children || [])) {
      for (const div of (conf.children || [])) {
        for (const entry of (div.standings?.entries || [])) {
          const stats = {};
          (entry.stats || []).forEach(s => { stats[s.name] = s.value; });
          teams.push({ team: entry.team?.displayName, wins: stats.wins || 0, losses: stats.losses || 0, pct: stats.winPercent || 0, league: conf.name, division: div.name });
        }
      }
    }
    return res.json({ standings: teams.sort((a, b) => b.pct - a.pct) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/mlb/last-games', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = MLB_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `MLB team not found: ${req.query.team}` });
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/${abbr}/schedule`);
    if (!r.ok) throw new Error('ESPN MLB schedule error');
    const data = await r.json();
    const now = new Date();
    const finished = (data.events || []).filter(e => new Date(e.date) < now && e.competitions?.[0]?.status?.type?.state === 'post').slice(-5);
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

router.get('/mlb/team-record', async (req, res) => {
  try {
    const teamQuery = (req.query.team || '').toLowerCase().trim();
    const abbr = MLB_TEAMS[teamQuery];
    if (!abbr) return res.status(404).json({ error: `MLB team not found: ${req.query.team}` });
    const r = await fetch('https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings');
    if (!r.ok) throw new Error('ESPN MLB standings error');
    const data = await r.json();
    for (const conf of (data.children || [])) {
      for (const div of (conf.children || [])) {
        for (const entry of (div.standings?.entries || [])) {
          if (entry.team?.abbreviation === abbr) {
            const stats = {};
            (entry.stats || []).forEach(s => { stats[s.name] = s.value; });
            return res.json({ team: entry.team?.displayName, wins: stats.wins, losses: stats.losses, pct: stats.winPercent, league: conf.name, division: div.name });
          }
        }
      }
    }
    return res.status(404).json({ error: `Team ${abbr} not found in MLB standings` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
