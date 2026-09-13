const scoreCalculator = require('../utils/scoreCalculator');
const db = require('../db/database');

/* =========================================================
   HELPERS
========================================================= */

function sendError(
  res,
  error,
  fallback = 'Something went wrong'
) {
  console.error(error);

  return res.status(500).json({
    error:
      error?.message ||
      fallback
  });
}

/* =========================================================
   GET ALL-TIME RECORDS
========================================================= */

exports.getRecords = async (
  req,
  res
) => {

  try {

    /* =====================================================
       GET RECORDS FROM SCORE CALCULATOR
    ===================================================== */

    const records =
      await scoreCalculator.getAllTimeRecords();

    /*
     * Always keep a valid object even if the calculator
     * returns undefined/null.
     */
    const safeRecords =
      records &&
      typeof records === 'object'
        ? records
        : {};

    /* =====================================================
       LOAD ALL PLAYERS
    ===================================================== */

    const players =
      await db.prepare(`
        SELECT
          id,
          name
        FROM players
      `).all();

    /* =====================================================
       LOAD ALL MATCHES
    ===================================================== */

    const matches =
      await db.prepare(`
        SELECT
          id,
          match_date,
          created_at
        FROM matches
      `).all();

    /* =====================================================
       CREATE QUICK LOOKUP MAPS

       This is safer and faster than repeatedly using
       players.find() / matches.find().
    ===================================================== */

    const playerMap =
      new Map(
        (players || []).map(
          player => [
            String(player.id),
            player
          ]
        )
      );

    const matchMap =
      new Map(
        (matches || []).map(
          match => [
            String(match.id),
            match
          ]
        )
      );

    /* =====================================================
       ATTACH PLAYER + MATCH INFORMATION
    ===================================================== */

    const attach = (
      entry
    ) => {

      if (
        !entry ||
        typeof entry !== 'object'
      ) {
        return null;
      }

      const player =
        entry.player_id
          ? playerMap.get(
              String(
                entry.player_id
              )
            )
          : null;

      const match =
        entry.match_id
          ? matchMap.get(
              String(
                entry.match_id
              )
            )
          : null;

      return {
        ...entry,

        player_name:
          entry.player_name ||
          player?.name ||
          'Unknown Player',

        match_date:
          entry.match_date ||
          match?.match_date ||
          match?.created_at ||
          null
      };
    };

    /* =====================================================
       ATTACH LIST
    ===================================================== */

    const attachList = (
      list
    ) => {

      if (
        !Array.isArray(list)
      ) {
        return [];
      }

      return list
        .map(attach)
        .filter(Boolean);
    };

    /* =====================================================
       FINAL RESPONSE
       
       ONLY SINGLE-INNINGS RECORDS:
       
       1. Best Batting Figure
       2. Best Bowling Figure
       
       highestScore is intentionally NOT returned.
    ===================================================== */

    const response = {

      /* ===================================================
         BEST SINGLE-INNINGS RECORDS
      =================================================== */

      bestBattingFigure:
        attach(
          safeRecords
            .bestBattingFigure
        ),

      bestBowling:
        attach(
          safeRecords
            .bestBowling
        ),

      /* ===================================================
         CAREER BATTING RECORDS
      =================================================== */

      mostRuns:
        attachList(
          safeRecords
            .mostRuns
        ),

      mostFours:
        attachList(
          safeRecords
            .mostFours
        ),

      mostSixes:
        attachList(
          safeRecords
            .mostSixes
        ),

      mostBallsFaced:
        attachList(
          safeRecords
            .mostBallsFaced
        ),

      bestStrikeRate:
        attachList(
          safeRecords
            .bestStrikeRate
        ),

      /* ===================================================
         CAREER BOWLING RECORDS
      =================================================== */

      mostWickets:
        attachList(
          safeRecords
            .mostWickets
        ),

      mostBallsBowled:
        attachList(
          safeRecords
            .mostBallsBowled
        ),

      bestEconomy:
        attachList(
          safeRecords
            .bestEconomy
        )
    };

    /* =====================================================
       DEBUG LOG
    ===================================================== */

    console.log(
      '=============================================='
    );

    console.log(
      'ALL-TIME RECORDS LOADED'
    );

    console.log(
      'Best batting:',
      response.bestBattingFigure
    );

    console.log(
      'Best bowling:',
      response.bestBowling
    );

    console.log(
      'Most runs:',
      response.mostRuns
    );

    console.log(
      'Most wickets:',
      response.mostWickets
    );

    console.log(
      '=============================================='
    );

    /* =====================================================
       SEND RESPONSE
    ===================================================== */

    return res.json(
      response
    );

  } catch (error) {

    console.error(
      'Failed to load all-time records:',
      error
    );

    return sendError(
      res,
      error,
      'Failed to load records'
    );
  }
};
