const scoreCalculator = require('../utils/scoreCalculator');
const db = require('../db/database');

/* =========================================================
   GET ALL TIME RECORDS
========================================================= */

exports.getRecords = async (req, res) => {
  try {
    /* =====================================================
       GET RECORDS FROM SCORE CALCULATOR
    ===================================================== */

    const records =
      await scoreCalculator.getAllTimeRecords();

    /* =====================================================
       LOAD ALL PLAYERS
    ===================================================== */

    const players =
      await db
        .prepare(`
          SELECT
            id,
            name
          FROM players
        `)
        .all();

    /* =====================================================
       LOAD ALL MATCHES
    ===================================================== */

    const matches =
      await db
        .prepare(`
          SELECT
            id,
            match_date,
            created_at
          FROM matches
        `)
        .all();

    /* =====================================================
       ATTACH PLAYER + MATCH INFORMATION
    ===================================================== */

    const attach = (entry) => {
      if (!entry) {
        return null;
      }

      const player =
        players.find(
          (p) =>
            String(p.id) ===
            String(entry.player_id)
        );

      const match =
        matches.find(
          (m) =>
            String(m.id) ===
            String(entry.match_id)
        );

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

    const attachList = (list) => {
      if (!Array.isArray(list)) {
        return [];
      }

      return list.map(attach);
    };

    /* =====================================================
       FINAL RESPONSE

       ONLY TWO SINGLE-INNINGS RECORDS:
       1. Best Batting Figure
       2. Best Bowling Figure

       IMPORTANT:
       highestScore has been completely removed.
    ===================================================== */

    const response = {

      /* ===================================================
         BEST SINGLE-INNINGS RECORDS
      =================================================== */

      bestBattingFigure:
        attach(
          records.bestBattingFigure
        ),

      bestBowling:
        attach(
          records.bestBowling
        ),

      /* ===================================================
         CAREER BATTING RECORDS
      =================================================== */

      mostRuns:
        attachList(
          records.mostRuns
        ),

      mostFours:
        attachList(
          records.mostFours
        ),

      mostSixes:
        attachList(
          records.mostSixes
        ),

      mostBallsFaced:
        attachList(
          records.mostBallsFaced
        ),

      bestStrikeRate:
        attachList(
          records.bestStrikeRate
        ),

      /* ===================================================
         CAREER BOWLING RECORDS
      =================================================== */

      mostWickets:
        attachList(
          records.mostWickets
        ),

      mostBallsBowled:
        attachList(
          records.mostBallsBowled
        ),

      bestEconomy:
        attachList(
          records.bestEconomy
        )
    };

    /* =====================================================
       DEBUG LOGS
    ===================================================== */

    console.log(
      '=============================================='
    );

    console.log(
      'ALL TIME RECORDS LOADED'
    );

    console.log(
      'BEST BATTING FIGURE:',
      response.bestBattingFigure
    );

    console.log(
      'BEST BOWLING:',
      response.bestBowling
    );

    console.log(
      'MOST RUNS:',
      response.mostRuns
    );

    console.log(
      '=============================================='
    );

    /* =====================================================
       SEND RESPONSE
    ===================================================== */

    res.json(response);

  } catch (error) {

    console.error(
      'Failed to load all-time records:',
      error
    );

    res.status(500).json({
      error: 'Failed to load records',
      message: error.message
    });
  }
};
