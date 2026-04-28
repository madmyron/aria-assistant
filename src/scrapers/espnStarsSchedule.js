const fetch = require('node-fetch');
const cheerio = require('cheerio');

const ESPN_STARS_URL = 'https://www.espn.com/nhl/team/schedule/_/name/dal';

async function getNextStarsGame() {
  try {
    const response = await fetch(ESPN_STARS_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 15000,
    });

    if (!response.ok) {
      throw new Error(`HTTP error fetching ESPN schedule: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const now = new Date();
    let nextGame = null;

    // ESPN schedule table rows
    const rows = $('tr.Table__TR').toArray();

    for (const row of rows) {
      const cells = $(row).find('td');
      if (cells.length < 3) continue;

      const dateText = $(cells[0]).text().trim();
      const opponentCell = $(cells[1]);
      const resultOrTimeCell = $(cells[2]);

      if (!dateText || dateText.toLowerCase() === 'date') continue;

      // Try to parse the date from ESPN format (e.g., "Thu, Oct 10")
      const parsedDate = parseDateText(dateText, now);
      if (!parsedDate) continue;

      // Only look at future games
      if (parsedDate < now) continue;

      // Extract opponent
      let opponent = opponentCell.find('.Table__Team').text().trim();
      if (!opponent) {
        opponent = opponentCell.text().trim();
      }

      // Extract time or result
      const timeOrResult = resultOrTimeCell.text().trim();

      // Check if this is a past game (has a score rather than a time)
      const hasScore = /^\d+-\d+/.test(timeOrResult) || /^[WL]\s+\d+-\d+/.test(timeOrResult);
      if (hasScore) continue;

      // Extract venue if available
      const venueText = cells.length > 3 ? $(cells[3]).text().trim() : '';

      // Determine home/away
      const opponentRaw = opponentCell.text().trim();
      const isAway = opponentRaw.startsWith('@') || opponentCell.find('.Schedule__at').length > 0;

      nextGame = {
        date: parsedDate.toISOString(),
        time: extractTime(timeOrResult),
        opponent: cleanOpponentName(opponent || opponentRaw),
        venue: venueText || (isAway ? 'Away' : 'American Airlines Center'),
        isHome: !isAway,
      };

      break;
    }

    // Fallback: try alternative ESPN schedule structure
    if (!nextGame) {
      nextGame = parseAlternativeStructure($, now);
    }

    if (!nextGame) {
      return {
        error: 'No upcoming game found',
        source: ESPN_STARS_URL,
        fetchedAt: new Date().toISOString(),
      };
    }

    return {
      ...nextGame,
      source: ESPN_STARS_URL,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[espnStarsSchedule] Error fetching schedule:', error.message);

    return {
      error: error.message,
      source: ESPN_STARS_URL,
      fetchedAt: new Date().toISOString(),
    };
  }
}

function parseAlternativeStructure($, now) {
  let nextGame = null;

  // Try to find schedule items in a different ESPN layout
  $('.ScheduleTables tbody tr, .schedule__table tbody tr').each((i, row) => {
    if (nextGame) return;

    const cells = $(row).find('td');
    if (cells.length < 2) return;

    const dateText = $(cells[0]).text().trim();
    if (!dateText || dateText.toLowerCase() === 'date') return;

    const parsedDate = parseDateText(dateText, now);
    if (!parsedDate || parsedDate < now) return;

    const opponentRaw = $(cells[1]).text().trim();
    const timeRaw = cells.length > 2 ? $(cells[2]).text().trim() : '';
    const venueRaw = cells.length > 3 ? $(cells[3]).text().trim() : '';

    const hasScore = /^\d+-\d+/.test(timeRaw) || /^[WL]\s+\d+-\d+/.test(timeRaw);
    if (hasScore) return;

    const isAway = opponentRaw.startsWith('@');

    nextGame = {
      date: parsedDate.toISOString(),
      time: extractTime(timeRaw),
      opponent: cleanOpponentName(opponentRaw),
      venue: venueRaw || (isAway ? 'Away' : 'American Airlines Center'),
      isHome: !isAway,
    };
  });

  return nextGame;
}

function parseDateText(dateText, referenceDate) {
  if (!dateText) return null;

  // Clean up the date text
  const cleaned = dateText.replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s*/i, '').trim();

  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth(); // 0-indexed

  // Try parsing "Oct 10", "Nov 5", etc.
  const monthDayMatch = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (monthDayMatch) {
    const monthStr = monthDayMatch[1];
    const day = parseInt(monthDayMatch[2], 10);
    const monthIndex = parseMonthName(monthStr);

    if (monthIndex === -1) return null;

    // Determine correct year (NHL season spans Oct-June, so handle year boundary)
    let year = currentYear;
    // If we're in the fall (Oct-Dec) and the month is Jan-June, it's next year
    if (currentMonth >= 9 && monthIndex <= 5) {
      year = currentYear + 1;
    }

    const date = new Date(year, monthIndex, day);
    return isNaN(date.getTime()) ? null : date;
  }

  // Try full date formats
  const fullDate = new Date(cleaned);
  if (!isNaN(fullDate.getTime())) {
    return fullDate;
  }

  return null;
}

function parseMonthName(monthStr) {
  const months = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    january: 0, february: 1, march: 2, april: 3, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  };
  return months[monthStr.toLowerCase()] !== undefined ? months[monthStr.toLowerCase()] : -1;
}

function extractTime(timeText) {
  if (!timeText) return 'TBD';

  // Match patterns like "7:00 PM ET", "7:30 PM", "19:00"
  const timeMatch = timeText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?(?:\s*ET|CT|MT|PT)?)/i);
  if (timeMatch) {
    return timeMatch[1].trim();
  }

  // If it just says TBD or similar
  if (/tbd|tba/i.test(timeText)) return 'TBD';

  return timeText || 'TBD';
}

function cleanOpponentName(opponentText) {
  if (!opponentText) return 'Unknown';

  // Remove @ symbol and leading/trailing whitespace
  let cleaned = opponentText.replace(/^[@\s]+/, '').trim();

  // Remove record in parentheses like "(15-10-3)"
  cleaned = cleaned.replace(/\(\d+-\d+-?\d*\)/, '').trim();

  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned || 'Unknown';
}

module.exports = { getNextStarsGame };