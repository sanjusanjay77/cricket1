async function getAllTimeRecords() {
  // Get only players who belong to GCC
  const gccPlayers = await db.prepare(`
    SELECT DISTINCT tp.player_id AS id
    FROM team_players tp
    INNER JOIN teams t
      ON t.id = tp.team_id
    WHERE UPPER(TRIM(t.name)) = 'GCC'
  `).all();

  const gccPlayerIds = new Set(
    gccPlayers
      .map(row => row.id)
      .filter(Boolean)
  );

  if (gccPlayerIds.size === 0) {
    return {
      highestScore: null,
      bestBowling: null,
      mostRuns: [],
      mostFours: [],
      mostSixes: [],
      mostBallsFaced: [],
      bestStrikeRate: [],
      mostWickets: [],
      mostBallsBowled: [],
      bestEconomy: []
    };
  }

  const inningsRows = await db.prepare(`
    SELECT id, match_id
    FROM innings
  `).all();

  let highestScore = null;
  let bestBowling = null;

  for (const innings of inningsRows) {
    const scoreboard = await getScoreboard(innings.id);

    if (!scoreboard) continue;

    // -----------------------------
    // GCC BATTING RECORDS ONLY
    // -----------------------------
    for (const batting of scoreboard.battingCard) {
      if (!gccPlayerIds.has(batting.player_id)) {
        continue;
      }

      if (
        !highestScore ||
        batting.runs > highestScore.runs
      ) {
        highestScore = {
          player_id: batting.player_id,
          runs: batting.runs,
          balls: batting.balls,
          fours: batting.fours,
          sixes: batting.sixes,
          strike_rate: batting.strike_rate,
          innings_id: innings.id,
          match_id: innings.match_id
        };
      }
    }

    // -----------------------------
    // GCC BOWLING RECORDS ONLY
    // -----------------------------
    for (const bowling of scoreboard.bowlingCard) {
      if (!gccPlayerIds.has(bowling.player_id)) {
        continue;
      }

      const better =
        !bestBowling ||
        bowling.wickets > bestBowling.wickets ||
        (
          bowling.wickets === bestBowling.wickets &&
          bowling.runs < bestBowling.runs
        );

      if (better) {
        bestBowling = {
          player_id: bowling.player_id,
          wickets: bowling.wickets,
          runs: bowling.runs,
          overs: bowling.overs,
          economy: bowling.economy,
          innings_id: innings.id,
          match_id: innings.match_id
        };
      }
    }
  }

  // -----------------------------
  // GCC BATTING LEADERS
  // -----------------------------
  const battingLeaders = await Promise.all(
    [...gccPlayerIds].map(async playerId => ({
      player_id: playerId,
      ...await computeCareerBattingStats(playerId)
    }))
  );

  // -----------------------------
  // GCC BOWLING LEADERS
  // -----------------------------
  const bowlingLeaders = await Promise.all(
    [...gccPlayerIds].map(async playerId => ({
      player_id: playerId,
      ...await computeCareerBowlingStats(playerId)
    }))
  );

  const topBy = (
    array,
    key,
    count = 10
  ) =>
    [...array]
      .sort(
        (a, b) =>
          Number(b[key] || 0) -
          Number(a[key] || 0)
      )
      .slice(0, count);

  return {
    // Best single performance
    highestScore,

    bestBowling,

    // GCC batting records
    mostRuns:
      topBy(
        battingLeaders,
        'runs'
      ),

    mostFours:
      topBy(
        battingLeaders,
        'fours'
      ),

    mostSixes:
      topBy(
        battingLeaders,
        'sixes'
      ),

    mostBallsFaced:
      topBy(
        battingLeaders,
        'balls_faced'
      ),

    bestStrikeRate:
      topBy(
        battingLeaders.filter(
          player =>
            player.balls_faced >= 10
        ),
        'strike_rate'
      ),

    // GCC bowling records
    mostWickets:
      topBy(
        bowlingLeaders,
        'wickets'
      ),

    mostBallsBowled:
      topBy(
        bowlingLeaders,
        'balls_bowled'
      ),

    bestEconomy:
      [...bowlingLeaders]
        .filter(
          player =>
            player.balls_bowled >= 12
        )
        .sort(
          (a, b) =>
            Number(a.economy || 0) -
            Number(b.economy || 0)
        )
        .slice(0, 10)
  };
}
