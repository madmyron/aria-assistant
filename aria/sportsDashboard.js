const SPORTS_BACKEND_URL = process.env.SPORTS_BACKEND_URL || "http://localhost:4000";

const TEAM_LEAGUE_MAP = {
  mets: "MLB",
  yankees: "MLB",
  "red sox": "MLB",
  dodgers: "MLB",
  cubs: "MLB",
  braves: "MLB",
  astros: "MLB",
  giants: "MLB",
  cardinals: "MLB",
  phillies: "MLB",
  "white sox": "MLB",
  brewers: "MLB",
  padres: "MLB",
  mariners: "MLB",
  rangers: "MLB",
  athletics: "MLB",
  tigers: "MLB",
  twins: "MLB",
  royals: "MLB",
  angels: "MLB",
};

const TEAM_KEYWORDS = Object.keys(TEAM_LEAGUE_MAP);

function extractTeamFromTranscript(transcript) {
  if (!transcript || typeof transcript !== "string") return null;
  const lower = transcript.toLowerCase();
  for (const team of TEAM_KEYWORDS) {
    if (lower.includes(team)) {
      return { team, league: TEAM_LEAGUE_MAP[team] };
    }
  }
  return null;
}

async function fetchTeamData(team, league) {
  const params = new URLSearchParams({ team, league });
  const url = `${SPORTS_BACKEND_URL}/api/sports/team?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Sports backend responded with status ${response.status}`);
  }

  const data = await response.json();
  return data;
}

function parseSportsResponse(data, teamName) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const parts = [];

  if (data.liveScore && data.liveScore.inProgress) {
    const { homeTeam, awayTeam, homeScore, awayScore, inning } = data.liveScore;
    parts.push(
      `Right now the ${homeTeam} are hosting the ${awayTeam}, ${homeScore} to ${awayScore} in the ${inning}.`
    );
  }

  if (data.nextGame) {
    const { opponent, date, time, location } = data.nextGame;
    const dateStr = date ? new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "upcoming";
    const timeStr = time || "";
    const locationStr = location ? ` at ${location}` : "";
    parts.push(
      `The ${teamName} next play the ${opponent} on ${dateStr}${timeStr ? " at " + timeStr : ""}${locationStr}.`
    );
  }

  if (data.standings) {
    const { wins, losses, divisionRank, division } = data.standings;
    if (wins !== undefined && losses !== undefined) {
      const rankStr = divisionRank ? `, ranked ${ordinal(divisionRank)} in the ${division || "division"}` : "";
      parts.push(`They are currently ${wins} and ${losses}${rankStr}.`);
    }
  }

  if (data.recentResults && Array.isArray(data.recentResults) && data.recentResults.length > 0) {
    const recent = data.recentResults.slice(0, 3);
    const resultStrings = recent.map((game) => {
      const outcome = game.win ? "beat" : "lost to";
      return `${outcome} the ${game.opponent} ${game.teamScore}-${game.opponentScore}`;
    });
    parts.push(`Recently they ${resultStrings.join(", then ")}.`);
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

async function handleVoiceInput(transcript, ariaResponseHandler) {
  if (!transcript || typeof transcript !== "string" || transcript.trim() === "") {
    ariaResponseHandler({ source: "fallback", text: null });
    return;
  }

  const match = extractTeamFromTranscript(transcript);

  if (!match) {
    ariaResponseHandler({ source: "fallback", text: null });
    return;
  }

  const { team, league } = match;

  let data;
  try {
    data = await fetchTeamData(team, league);
  } catch (err) {
    console.error("[sportsDashboard] Backend fetch failed:", err.message);
    ariaResponseHandler({
      source: "fallback",
      text: null,
      error: err.message,
    });
    return;
  }

  if (!data) {
    ariaResponseHandler({ source: "fallback", text: null });
    return;
  }

  const spokenText = parseSportsResponse(data, team.charAt(0).toUpperCase() + team.slice(1));

  if (!spokenText) {
    ariaResponseHandler({ source: "fallback", text: null });
    return;
  }

  ariaResponseHandler({
    source: "sports",
    team,
    league,
    text: spokenText,
    raw: data,
  });
}

function initSportsDashboard(ariaResponseHandler) {
  if (typeof window === "undefined" || !window.SpeechRecognition && !window.webkitSpeechRecognition) {
    console.error("[sportsDashboard] SpeechRecognition not available in this environment.");
    return null;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();

  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    console.log("[sportsDashboard] Voice transcript:", transcript);
    handleVoiceInput(transcript, ariaResponseHandler);
  };

  recognition.onerror = (event) => {
    console.error("[sportsDashboard] SpeechRecognition error:", event.error);
    ariaResponseHandler({ source: "fallback", text: null, error: event.error });
  };

  recognition.onend = () => {
    console.log("[sportsDashboard] Voice input session ended.");
  };

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
    abort: () => recognition.abort(),
  };
}

module.exports = {
  initSportsDashboard,
  handleVoiceInput,
  extractTeamFromTranscript,
  fetchTeamData,
  parseSportsResponse,
  TEAM_LEAGUE_MAP,
};