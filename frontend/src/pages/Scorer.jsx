const oldFOW =
  safeArray(
    previousOptimistic?.fallOfWickets ||
    currentInnings?.fallOfWickets
  );

const newFallOfWickets =
  isWicket
    ? [
        ...oldFOW,
        {
          wicket_number: newTotalWickets,

          player_id:
            payload?.dismissed_id ||
            strikerId,

          score: newTotalRuns,

          overs:
            `${Math.floor(
              newTotalBalls / 6
            )}.${newTotalBalls % 6}`,

          wicket_type:
            payload?.wicket_type ||
            'Wicket'
        }
      ]
    : oldFOW;


/*
 * ==================================================
 * RUN RATE
 * ==================================================
 */

const runRate =
  newTotalBalls > 0
    ? (
        newTotalRuns /
        (newTotalBalls / 6)
      ).toFixed(2)
    : '0.00';
