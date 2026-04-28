const NHL_TEAMS = [
  { id: 1, abbr: "NJD", name: "New Jersey Devils" },
  { id: 2, abbr: "NYI", name: "New York Islanders" },
  { id: 3, abbr: "NYR", name: "New York Rangers" },
  { id: 4, abbr: "PHI", name: "Philadelphia Flyers" },
  { id: 5, abbr: "PIT", name: "Pittsburgh Penguins" },
  { id: 6, abbr: "BOS", name: "Boston Bruins" },
  { id: 7, abbr: "BUF", name: "Buffalo Sabres" },
  { id: 8, abbr: "MTL", name: "Montreal Canadiens" },
  { id: 9, abbr: "OTT", name: "Ottawa Senators" },
  { id: 10, abbr: "TOR", name: "Toronto Maple Leafs" },
  { id: 12, abbr: "CAR", name: "Carolina Hurricanes" },
  { id: 13, abbr: "FLA", name: "Florida Panthers" },
  { id: 14, abbr: "TBL", name: "Tampa Bay Lightning" },
  { id: 15, abbr: "WSH", name: "Washington Capitals" },
  { id: 16, abbr: "CHI", name: "Chicago Blackhawks" },
  { id: 17, abbr: "DET", name: "Detroit Red Wings" },
  { id: 18, abbr: "NSH", name: "Nashville Predators" },
  { id: 19, abbr: "STL", name: "St. Louis Blues" },
  { id: 20, abbr: "CGY", name: "Calgary Flames" },
  { id: 21, abbr: "COL", name: "Colorado Avalanche" },
  { id: 22, abbr: "EDM", name: "Edmonton Oilers" },
  { id: 23, abbr: "VAN", name: "Vancouver Canucks" },
  { id: 24, abbr: "ANA", name: "Anaheim Ducks" },
  { id: 25, abbr: "DAL", name: "Dallas Stars" },
  { id: 26, abbr: "LAK", name: "Los Angeles Kings" },
  { id: 28, abbr: "SJS", name: "San Jose Sharks" },
  { id: 29, abbr: "CBJ", name: "Columbus Blue Jackets" },
  { id: 30, abbr: "MIN", name: "Minnesota Wild" },
  { id: 52, abbr: "WPG", name: "Winnipeg Jets" },
  { id: 53, abbr: "ARI", name: "Utah Hockey Club" },
  { id: 54, abbr: "VGK", name: "Vegas Golden Knights" },
  { id: 55, abbr: "SEA", name: "Seattle Kraken" },
];

const NHL_API_BASE = "https://api-web.nhle.com/v1";
const NHL_STATS_API = "https://api.nhle.com/stats/rest/en";

function getTeamById(id) {
  return NHL_TEAMS.find((t) => t.id === id) || null;
}

function getTeamByAbbr(abbr) {
  return NHL_TEAMS.find((t) => t.abbr === abbr.toUpperCase()) || null;
}

function getAllTeams() {
  return NHL_TEAMS;
}

async function fetchTeamRoster(teamAbbr) {
  const res = await fetch(`${NHL_API_BASE}/roster/${teamAbbr}/current`);
  if (!res.ok) throw new Error(`Failed to fetch roster for ${teamAbbr}`);
  return res.json();
}

async function fetchTeamSchedule(teamAbbr) {
  const res = await fetch(`${NHL_API_BASE}/club-schedule-season/${teamAbbr}/now`);
  if (!res.ok) throw new Error(`Failed to fetch schedule for ${teamAbbr}`);
  return res.json();
}

async function fetchTeamStats(teamAbbr) {
  const res = await fetch(`${NHL_STATS_API}/team?cayenneExp=triCode="${teamAbbr}"`);
  if (!res.ok) throw new Error(`Failed to fetch stats for ${teamAbbr}`);
  return res.json();
}

async function fetchScoreboard() {
  const today = new Date().toISOString().split("T")[0];
  const res = await fetch(`${NHL_API_BASE}/score/${today}`);
  if (!res.ok) throw new Error("Failed to fetch scoreboard");
  return res.json();
}

async function fetchStandings() {
  const res = await fetch(`${NHL_API_BASE}/standings/now`);
  if (!res.ok) throw new Error("Failed to fetch standings");
  return res.json();
}

async function fetchPlayerStats(playerId) {
  const res = await fetch(`${NHL_API_BASE}/player/${playerId}/landing`);
  if (!res.ok) throw new Error(`Failed to fetch player ${playerId}`);
  return res.json();
}

async function fetchTeamProspects(teamAbbr) {
  const res = await fetch(`${NHL_API_BASE}/prospects/${teamAbbr}`);
  if (!res.ok) throw new Error(`Failed to fetch prospects for ${teamAbbr}`);
  return res.json();
}

module.exports = {
  NHL_TEAMS,
  NHL_API_BASE,
  NHL_STATS_API,
  getTeamById,
  getTeamByAbbr,
  getAllTeams,
  fetchTeamRoster,
  fetchTeamSchedule,
  fetchTeamStats,
  fetchScoreboard,
  fetchStandings,
  fetchPlayerStats,
  fetchTeamProspects,
};