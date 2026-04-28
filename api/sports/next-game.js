const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const teamId = '134919';
  const url = `https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=${teamId}`;

  const fetchData = (url) => {
    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (err) {
            reject(new Error('Failed to parse response from TheSportsDB'));
          }
        });

        response.on('error', (err) => {
          reject(err);
        });
      }).on('error', (err) => {
        reject(err);
      });
    });
  };

  try {
    const data = await fetchData(url);

    if (!data || !data.events || data.events.length === 0) {
      return res.status(404).json({
        error: 'No upcoming games found for Dallas Stars',
      });
    }

    const now = new Date();

    const upcomingEvents = data.events.filter((event) => {
      const eventDateStr = event.dateEvent;
      const eventTimeStr = event.strTime || '00:00:00';
      const eventDateTime = new Date(`${eventDateStr}T${eventTimeStr}`);
      return eventDateTime >= now;
    });

    if (upcomingEvents.length === 0) {
      return res.status(404).json({
        error: 'No upcoming games found for Dallas Stars',
      });
    }

    upcomingEvents.sort((a, b) => {
      const dateA = new Date(`${a.dateEvent}T${a.strTime || '00:00:00'}`);
      const dateB = new Date(`${b.dateEvent}T${b.strTime || '00:00:00'}`);
      return dateA - dateB;
    });

    const nextGame = upcomingEvents[0];

    const homeTeam = nextGame.strHomeTeam || '';
    const awayTeam = nextGame.strAwayTeam || '';
    const dallasIsHome = homeTeam.toLowerCase().includes('dallas');
    const opponent = dallasIsHome ? awayTeam : homeTeam;

    const rawTime = nextGame.strTime || null;
    let formattedTime = null;

    if (rawTime) {
      try {
        const timeParts = rawTime.split(':');
        let hours = parseInt(timeParts[0], 10);
        const minutes = timeParts[1] || '00';
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        formattedTime = `${hours}:${minutes} ${ampm}`;
      } catch (e) {
        formattedTime = rawTime;
      }
    }

    const venue = nextGame.strVenue || (dallasIsHome ? 'American Airlines Center' : null);

    return res.status(200).json({
      sport: 'NHL',
      team: 'Dallas Stars',
      opponent: opponent || 'TBD',
      date: nextGame.dateEvent || null,
      time: formattedTime,
      venue: venue || 'TBD',
    });
  } catch (error) {
    console.error('Error fetching next game data:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch next game data',
      details: error.message,
    });
  }
};