const scoreCalculator = require('../utils/scoreCalculator');
const db = require('../db/database');

exports.getRecords = async (req, res) => {
  try {
    const records =
      await scoreCalculator.getAllTimeRecords();

    const players = await db
      .prepare(`
        SELECT id, name
        FROM players
      `)
      .all();

    const matches = await db
      .prepare(`
        SELECT id, match_date, created_at
        FROM matches
      `)
      .all();

    const attach = (entry) => {
      if (!entry) return entry;

      const player = players.find(
        p => String(p.id) === String(entry.player_id)
      );

      const match = matches.find(
        m => String(m.id) === String(entry.match_id)
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

    const attachList = (list) => {
      if (!Array.isArray(list)) {
        return [];
      }

      return list.map(attach);
    };

    const response = {
      highestScore: attach(
        records.highestScore
      ),

      bestBowling: attach(
        records.bestBowling
      ),

      mostRuns: attachList(
        records.mostRuns
      ),

      mostWickets: attachList(
        records.mostWickets
      ),

      mostFours: attachList(
        records.mostFours
      ),

      mostSixes: attachList(
        records.mostSixes
      ),

      bestStrikeRate: attachList(
        records.bestStrikeRate
      ),

      bestEconomy: attachList(
        records.bestEconomy
      )
    };

    console.log('ALL TIME RECORDS LOADED');

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
