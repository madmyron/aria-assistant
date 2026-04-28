const https = require('https');

const NHL_TEAMS = {
  'anaheim ducks': { id: '134846', name: 'Anaheim Ducks' },
  'ducks': { id: '134846', name: 'Anaheim Ducks' },
  'boston bruins': { id: '134830', name: 'Boston Bruins' },
  'bruins': { id: '134830', name: 'Boston Bruins' },
  'buffalo sabres': { id: '134831', name: 'Buffalo Sabres' },
  'sabres': { id: '134831', name: 'Buffalo Sabres' },
  'calgary flames': { id: '134848', name: 'Calgary Flames' },
  'flames': { id: '134848', name: 'Calgary Flames' },
  'carolina hurricanes': { id: '134838', name: 'Carolina Hurricanes' },
  'hurricanes': { id: '134838', name: 'Carolina Hurricanes' },
  'canes': { id: '134838', name: 'Carolina Hurricanes' },
  'chicago blackhawks': { id: '134854', name: 'Chicago Blackhawks' },
  'blackhawks': { id: '134854', name: 'Chicago Blackhawks' },
  'hawks': { id: '134854', name: 'Chicago Blackhawks' },
  'colorado avalanche': { id: '134855', name: 'Colorado Avalanche' },
  'avalanche': { id: '134855', name: 'Colorado Avalanche' },
  'avs': { id: '134855', name: 'Colorado Avalanche' },
  'columbus blue jackets': { id: '134839', name: 'Columbus Blue Jackets' },
  'blue jackets': { id: '134839', name: 'Columbus Blue Jackets' },
  'dallas stars': { id: '134856', name: 'Dallas Stars' },
  'stars': { id: '134856', name: 'Dallas Stars' },
  'detroit red wings': { id: '134832', name: 'Detroit Red Wings' },
  'red wings': { id: '134832', name: 'Detroit Red Wings' },
  'edmonton oilers': { id: '134849', name: 'Edmonton Oilers' },
  'oilers': { id: '134849', name: 'Edmonton Oilers' },
  'florida panthers': { id: '134833', name: 'Florida Panthers' },
  'panthers': { id: '134833', name: 'Florida Panthers' },
  'los angeles kings': { id: '134852', name: 'Los Angeles Kings' },
  'la kings': { id: '134852', name: 'Los Angeles Kings' },
  'kings': { id: '134852', name: 'Los Angeles Kings' },
  'minnesota wild': { id: '134857', name: 'Minnesota Wild' },
  'wild': { id: '134857', name: 'Minnesota Wild' },
  'montreal canadiens': { id: '134834', name: 'Montreal Canadiens' },
  'canadiens': { id: '134834', name: 'Montreal Canadiens' },
  'habs': { id: '134834', name: 'Montreal Canadiens' },
  'nashville predators': { id: '134858', name: 'Nashville Predators' },
  'predators': { id: '134858', name: 'Nashville Predators' },
  'preds': { id: '134858', name: 'Nashville Predators' },
  'new jersey devils': { id: '134840', name: 'New Jersey Devils' },
  'devils': { id: '134840', name: 'New Jersey Devils' },
  'new york islanders': { id: '134841', name: 'New York Islanders' },
  'islanders': { id: '134841', name: 'New York Islanders' },
  'new york rangers': { id: '134842', name: 'New York Rangers' },
  'rangers': { id: '134842', name: 'New York Rangers' },
  'ottawa senators': { id: '134835', name: 'Ottawa Senators' },
  'senators': { id: '134835', name: 'Ottawa Senators' },
  'sens': { id: '134835', name: 'Ottawa Senators' },
  'philadelphia flyers': { id: '134843', name: 'Philadelphia Flyers' },
  'flyers': { id: '134843', name: 'Philadelphia Flyers' },
  'pittsburgh penguins': { id: '134844', name: 'Pittsburgh Penguins' },
  'penguins': { id: '134844', name: 'Pittsburgh Penguins' },
  'pens': { id: '134844', name: 'Pittsburgh Penguins' },
  'san jose sharks': { id: '134853', name: 'San Jose Sharks' },
  'sharks': { id: '134853', name: 'San Jose Sharks' },
  'seattle kraken': { id: '140082', name: 'Seattle Kraken' },
  'kraken': { id: '140082', name: 'Seattle Kraken' },
  'st. louis blues': { id: '134859', name: 'St. Louis Blues' },
  'st louis blues': { id: '134859', name: 'St. Louis Blues' },
  'blues': { id: '134859', name: 'St. Louis Blues' },
  'tampa bay lightning': { id: '134836', name: 'Tampa Bay Lightning' },
  'lightning': { id: '134836', name: 'Tampa Bay Lightning' },
  'bolts': { id: '134836', name: 'Tampa Bay Lightning' },
  'toronto maple leafs': { id: '134837', name: 'Toronto Maple Leafs' },
  'maple leafs': { id: '134837', name: 'Toronto Maple Leafs' },
  'leafs': { id: '134837', name: 'Toronto Maple Leafs' },
  'utah mammoth': { id: '148494', name: 'Utah Mammoth' },
  'mammoth': { id: '148494', name: 'Utah Mammoth' },
  'utah hockey club': { id: '148494', name: 'Utah Mammoth' },
  'vancouver canucks': { id: '134850', name: 'Vancouver Canucks' },
  'canucks': { id: '134850', name: 'Vancouver Canucks' },
  'vegas golden knights': { id: '135913', name: 'Vegas Golden Knights' },
  'golden knights': { id: '135913', name: 'Vegas Golden Knights' },
  'knights': { id: '135913', name: 'Vegas Golden Knights' },
  'washington capitals': { id: '134845', name: 'Washington Capitals' },
  'capitals': { id: '134845', name: 'Washington Capitals' },
  'caps': { id: '134845', name: 'Washington Capitals' },
  'winnipeg jets': { id: '134851', name: 'Winnipeg Jets' },
  'jets': { id: '134851', name: 'Winnipeg Jets' },
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function formatTime(rawTime) {
  if (!rawTime) return null;
  const parts = rawTime.split(':');
  let h = parseInt(parts[0], 10);
  const m = parts[1] || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const teamQuery = (req.query.team || 'dallas stars').toLowerCase().trim();
  const teamInfo = NHL_TEAMS[teamQuery];
  if (!teamInfo) {
    return res.status(404).json({ error: `Team not found: ${req.query.team}` });
  }

  try {
    const data = await fetchJson(`https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=${teamInfo.id}`);
    if (!data || !data.events || !data.events.length) {
      return res.status(404).json({ error: `No upcoming games found for ${teamInfo.name}` });
    }

    const now = new Date();
    const upcoming = data.events
      .filter((e) => new Date(`${e.dateEvent}T${e.strTime || '00:00:00'}`) >= now)
      .sort((a, b) => new Date(`${a.dateEvent}T${a.strTime || '00:00:00'}`) - new Date(`${b.dateEvent}T${b.strTime || '00:00:00'}`));

    if (!upcoming.length) {
      return res.status(404).json({ error: `No upcoming games found for ${teamInfo.name}` });
    }

    const g = upcoming[0];
    const firstWord = teamQuery.split(' ')[0];
    const isHome = (g.strHomeTeam || '').toLowerCase().includes(firstWord);
    const opponent = isHome ? g.strAwayTeam : g.strHomeTeam;

    return res.status(200).json({
      sport: 'NHL',
      team: teamInfo.name,
      opponent: opponent || 'TBD',
      date: g.dateEvent || null,
      time: formatTime(g.strTime),
      venue: g.strVenue || 'TBD',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch game data', details: err.message });
  }
};
