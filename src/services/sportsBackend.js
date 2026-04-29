src/services/sportsBackend.js

const NHL_TEAMS = [
  { id: 'COL', name: 'Avalanche', fullName: 'Colorado Avalanche' },
  { id: 'CAR', name: 'Hurricanes', fullName: 'Carolina Hurricanes' },
  { id: 'DET', name: 'Red Wings', fullName: 'Detroit Red Wings' },
  { id: 'FLA', name: 'Panthers', fullName: 'Florida Panthers' },
  { id: 'LAK', name: 'Kings', fullName: 'Los Angeles Kings' },
  { id: 'EDM', name: 'Oilers', fullName: 'Edmonton Oilers' },
  { id: 'CGY', name: 'Flames', fullName: 'Calgary Flames' },
  { id: 'VAN', name: 'Canucks', fullName: 'Vancouver Canucks' },
  { id: 'DAL', name: 'Stars', fullName: 'Dallas Stars' },
  { id: 'MIN', name: 'Wild', fullName: 'Minnesota Wild' },
  { id: 'NSH', name: 'Predators', fullName: 'Nashville Predators' },
  { id: 'STL', name: 'Blues', fullName: 'St. Louis Blues' },
  { id: 'TOR', name: 'Maple Leafs', fullName: 'Toronto Maple Leafs' },
  { id: 'TBL', name: 'Lightning', fullName: 'Tampa Bay Lightning' },
  { id: 'OTT', name: 'Senators', fullName: 'Ottawa Senators' },
  { id: 'PHI', name: 'Flyers', fullName: 'Philadelphia Flyers' },
  { id: 'PIT', name: 'Penguins', fullName: 'Pittsburgh Penguins' },
  { id: 'NYR', name: 'Rangers', fullName: 'New York Rangers' },
  { id: 'NYI', name: 'Islanders', fullName: 'New York Islanders' },
  { id: 'NJD', name: 'Devils', fullName: 'New Jersey Devils' },
  { id: 'WSH', name: 'Capitals', fullName: 'Washington Capitals' },
  { id: 'BOS', name: 'Bruins', fullName: 'Boston Bruins' },
  { id: 'BUF', name: 'Sabres', fullName: 'Buffalo Sabres' },
  { id: 'SEA', name: 'Kraken', fullName: 'Seattle Kraken' },
  { id: 'VGK', name: 'Knights', fullName: 'Vegas Golden Knights' },
  { id: 'ANA', name: 'Ducks', fullName: 'Anaheim Ducks' },
  { id: 'SJS', name: 'Sharks', fullName: 'San Jose Sharks' },
  { id: 'ARI', name: 'Coyotes', fullName: 'Arizona Coyotes' },
  { id: 'CBJ', name: 'Blue Jackets', fullName: 'Columbus Blue Jackets' },
  { id: 'WPG', name: 'Jets', fullName: 'Winnipeg Jets' },
  { id: 'MTL', name: 'Canadiens', fullName: 'Montreal Canadiens' },
  { id: 'CHI', name: 'Blackhawks', fullName: 'Chicago Blackhawks' },
];

const NHL_API_BASE = 'https://api-web.nhle.com/v1';

export function findTeam(query) {
  if (!query) return null;
  const q = query.toLowerCase();
  return NHL_TEAMS.find(
    t =>
      t.id.toLowerCase() === q ||
      t.name.toLowerCase().includes(q) ||
      t.fullName.toLowerCase().includes(q)
  ) || null;
}

export function getAllTeams() {
  return NHL_TEAMS;
}

async function fetchTeamScheduleRaw(teamId) {
  const res = await fetch(`${NHL_API_BASE}/club-schedule-season/${teamId}/now`);
  if (!res.ok) throw new Error(`Schedule fetch failed for ${teamId}: ${res.status}`);
  return res.json();
}

async function fetchPlayoffSeriesStatus(teamId) {
  try {
    const res = await fetch(`${NHL_API_BASE}/playoffs/now`);
    if (!res.ok) return null;
    const data = await res.json();
    const rounds = data?.rounds || [];
    for (const round of rounds) {
      for (const series of round.series || []) {
        const ids = [
          series.topSeedTeam?.abbrev,
          series.bottomSeedTeam?.abbrev,
        ];
        if (ids.includes(teamId)) {
          return {
            round: round.roundNumber,
            roundName: round.roundLabel || `Round ${round.roundNumber}`,
            opponent:
              ids[0] === teamId
                ? series.bottomSeedTeam?.abbrev
                : series.topSeedTeam?.abbrev,
            topSeedWins: series.topSeedWins ?? 0,
            bottomSeedWins: series.bottomSeedWins ?? 0,
            seriesStatus: series.seriesStatus || null,
            isTopSeed: series.topSeedTeam?.abbrev === teamId,
          };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchSchedule(teamQuery, count = 5) {
  const team = typeof teamQuery === 'string' ? findTeam(teamQuery) : teamQuery;
  if (!team) throw new Error(`Unknown team: ${teamQuery}`);

  const [scheduleData, playoffSeries] = await Promise.all([
    fetchTeamScheduleRaw(team.id),
    fetchPlayoffSeriesStatus(team.id),
  ]);

  const now = Date.now();
  const games = (scheduleData?.games || [])
    .filter(g => {
      const t = new Date(g.startTimeUTC || g.gameDate).getTime();
      return t >= now;
    })
    .sort((a, b) => new Date(a.startTimeUTC || a.gameDate) - new Date(b.startTimeUTC || b.gameDate))
    .slice(0, count);

  return {
    team,
    playoffSeries,
    upcomingGames: games.map((g, idx) => {
      const homeAbbrev = g.homeTeam?.abbrev;
      const awayAbbrev = g.awayTeam?.abbrev;
      const isHome = homeAbbrev === team.id;
      const opponentAbbrev = isHome ? awayAbbrev : homeAbbrev;
      const opponentTeam = findTeam(opponentAbbrev) || { id: opponentAbbrev, name: opponentAbbrev, fullName: opponentAbbrev };
      const gameDate = new Date(g.startTimeUTC || g.gameDate);

      return {
        gameNumber: idx + 1,
        gameId: g.id,
        date: gameDate.toISOString(),
        dateLocal: gameDate.toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        }),
        isHome,
        opponent: opponentTeam,
        venue: g.venue?.default || (isHome ? 'Home' : 'Away'),
        gameType: g.gameType,
        isPlayoff: g.gameType === 3,
        seriesGameNumber: g.seriesStatus?.seriesGameNumber || null,
        seriesStatus: playoffSeries && g.gameType === 3
          ? {
              ...playoffSeries,
              teamWins: playoffSeries.isTopSeed ? playoffSeries.topSeedWins : playoffSeries.bottomSeedWins,
              opponentWins: playoffSeries.isTopSeed ? playoffSeries.bottomSeedWins : playoffSeries.topSeedWins,
            }
          : null,
      };
    }),
  };
}

export function formatScheduleForSpeech(scheduleResult) {
  const { team, upcomingGames, playoffSeries } = scheduleResult;
  if (!upcomingGames.length) {
    return `No upcoming games found for the ${team.fullName}.`;
  }

  let context = `Upcoming schedule for the ${team.fullName}:\n`;

  if (playoffSeries) {
    const tw = playoffSeries.isTopSeed ? playoffSeries.topSeedWins : playoffSeries.bottomSeedWins;
    const ow = playoffSeries.isTopSeed ? playoffSeries.bottomSeedWins : playoffSeries.topSeedWins;
    context += `Currently in playoffs: ${playoffSeries.roundName} vs ${playoffSeries.opponent}. Series: ${team.id} leads ${tw}-${ow} or is down ${ow}-${tw}.\n`;
  }

  upcomingGames.forEach(g => {
    const homeAway = g.isHome ? 'vs' : '@';
    const playoff = g.isPlayoff && g.seriesStatus
      ? ` [Playoffs Game ${g.seriesGameNumber || g.gameNumber}, Series: ${g.seriesStatus.teamWins}-${g.seriesStatus.opponentWins}]`
      : '';
    context += `Game ${g.gameNumber}: ${g.dateLocal} — ${homeAway} ${g.opponent.fullName}${playoff}\n`;
  });

  return context.trim();
}