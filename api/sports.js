const express = require('express');
const router = express.Router();
const axios = require('axios');

const TEAM_ID = 134;
const BASE_URL = 'https://www.thesportsdb.com/api/v1/json/3';

router.get('/next-game', async (req, res) => {
  try {
    const response = await axios.get(`${BASE_URL}/eventsnext.php?id=${TEAM_ID}`);
    const data = response.data;

    if (!data || !data.events || data.events.length === 0) {
      return res.status(404).json({ error: 'No upcoming games found' });
    }

    const now = new Date();
    const futureEvents = data.events.filter(event => {
      const eventDate = new Date(`${event.dateEvent}T${event.strTime || '00:00:00'}`);
      return eventDate >= now;
    });

    if (futureEvents.length === 0) {
      return res.status(404).json({ error: 'No future games found' });
    }

    const next = futureEvents[0];
    const isHome = next.strHomeTeam === 'Dallas Stars';
    const opponent = isHome ? next.strAwayTeam : next.strHomeTeam;

    return res.json({
      team: 'Dallas Stars',
      opponent,
      date: next.dateEvent,
      time: next.strTime,
      venue: next.strVenue,
      sport: 'hockey'
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch sports data', details: err.message });
  }
});

module.exports = router;