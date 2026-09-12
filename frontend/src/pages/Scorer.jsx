import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Matches, Innings } from '../api/api.js';
import WicketModal from '../components/WicketModal.jsx';
import PlayerAutocomplete from '../components/PlayerAutocomplete.jsx';
import socket from '../socket.js';

export default function Scorer() {
  const { matchId } = useParams();
  const navigate = useNavigate();

  const [match, setMatch] = useState(null);
  const [players, setPlayers] = useState([]);
  const [innings, setInnings] = useState([]);

  const [showWicket, setShowWicket] = useState(false);
  const [showNextBowler, setShowNextBowler] = useState(false);

  const [nextBowlerId, setNextBowlerId] = useState(null);

  // wide | noball | bye | null
  const [showExtraPicker, setShowExtraPicker] = useState(null);

  const [error, setError] = useState('');
  const [boundary, setBoundary] = useState(null);
  const [flashWicket, setFlashWicket] = useState(false);

  const [savingBall, setSavingBall] = useState(false);
  const [pendingBall, setPendingBall] = useState(null);

  const [selectingBowler, setSelectingBowler] = useState(false);

  const [showFullScoreboard, setShowFullScoreboard] =
    useState(false);

  const boundaryTimer = useRef(null);
  const wicketTimer = useRef(null);

  /* =====================================================
     LOAD
  ===================================================== */

  const loadFull = useCallback(async () => {
    try {
      const data = await Matches.get(matchId);

      setMatch(data.match);

      setPlayers(
        Array.isArray(data.players)
          ? data.players
          : []
      );

      setInnings(
        Array.isArray(data.innings)
          ? data.innings
          : []
      );

      setError('');
    } catch (err) {
      console.error('Load match error:', err);

      setError(
        err?.response?.data?.error ||
        err?.message ||
        'Failed to load match'
      );
    }
  }, [matchId]);

  useEffect(() => {
    loadFull();
  }, [loadFull]);

  /* =====================================================
     SOCKET
  ===================================================== */

  useEffect(() => {
    socket.emit('join-match', matchId);

    const onUpdate = ({
      match: updatedMatch,
      innings: updatedInnings
    }) => {
      if (updatedMatch) {
        setMatch(updatedMatch);
      }

      if (Array.isArray(updatedInnings)) {
        setInnings(updatedInnings);
      }
    };

    socket.on('score-update', onUpdate);

    return () => {
      socket.emit('leave-match', matchId);
      socket.off('score-update', onUpdate);
    };
  }, [matchId]);

  /* =====================================================
     CLEANUP
  ===================================================== */

  useEffect(() => {
    return () => {
      clearTimeout(boundaryTimer.current);
      clearTimeout(wicketTimer.current);
    };
  }, []);

  /* =====================================================
     PLAYER CREATED
  ===================================================== */

  const handlePlayerCreated = useCallback((player) => {
    setPlayers((prev) => {
      if (prev.some((p) => p.id === player.id)) {
        return prev;
      }

      return [...prev, player];
    });
  }, []);

  /* =====================================================
     FLASHES
  ===================================================== */

  const popBoundary = useCallback((kind) => {
    clearTimeout(boundaryTimer.current);

    setBoundary(kind);

    boundaryTimer.current = setTimeout(() => {
      setBoundary(null);
    }, 900);
  }, []);

  const popWicket = useCallback(() => {
    clearTimeout(wicketTimer.current);

    setFlashWicket(true);

    wicketTimer.current = setTimeout(() => {
      setFlashWicket(false);
    }, 600);
  }, []);

  /* =====================================================
     UPDATE CURRENT INNINGS
  ===================================================== */

  const updateCurrentInnings = useCallback((updated) => {
    if (!updated) return;

    setInnings((prev) =>
      prev.map((item) => {
        if (item?.innings?.id !== updated.id) {
          return item;
        }

        return {
          ...item,
          innings: {
            ...item.innings,
            ...updated
          }
        };
      })
    );
  }, []);

  /* =====================================================
     FAST OPTIMISTIC UPDATE
  ===================================================== */

  const optimisticBall = useCallback(
    (
      payload,
      currentInn,
      currentBattingCard,
      currentBowlingCard,
      currentOver
    ) => {
      const runs = Number(payload.runs || 0);
      const extraRuns = Number(payload.extra_runs || 0);

      let teamRuns = runs;
      let legalBall = true;
      let batsmanRuns = runs;

      if (payload.extra_type === 'wide') {
        teamRuns = Math.max(1, extraRuns);
        batsmanRuns = 0;
        legalBall = false;
      } else if (payload.extra_type === 'noball') {
        teamRuns = 1 + runs;
        batsmanRuns = runs;
        legalBall = false;
      } else if (
        payload.extra_type === 'bye'
      ) {
        teamRuns = Math.max(0, extraRuns);
        batsmanRuns = 0;
        legalBall = true;
      } else if (
        payload.extra_type === 'legbye'
      ) {
        teamRuns = Math.max(0, extraRuns);
        batsmanRuns = 0;
        legalBall = true;
      } else if (
        payload.extra_type === 'penalty'
      ) {
        teamRuns = Math.max(0, extraRuns);
        batsmanRuns = 0;
        legalBall = false;
      }

      const oldTotalRuns =
        Number(currentInn.total_runs || 0);

      const oldTotalBalls =
        Number(currentInn.total_balls || 0);

      const oldTotalWickets =
        Number(currentInn.total_wickets || 0);

      const newTotalRuns =
        oldTotalRuns + teamRuns;

      const newTotalBalls =
        oldTotalBalls +
        (legalBall ? 1 : 0);

      const newTotalWickets =
        oldTotalWickets +
        (payload.wicket ? 1 : 0);

      let newStrikerId =
        currentInn.striker_id;

      let newNonStrikerId =
        currentInn.non_striker_id;

      const runsForStrike =
        payload.extra_type === 'noball'
          ? runs
          : teamRuns;

      if (
        runsForStrike % 2 === 1
      ) {
        const temp =
          newStrikerId;

        newStrikerId =
          newNonStrikerId;

        newNonStrikerId =
          temp;
      }

      /*
       * DO NOT visually keep the old
       * over after 6 legal balls.
       */
      const overCompleted =
        legalBall &&
        newTotalBalls > 0 &&
        newTotalBalls % 6 === 0;

      if (overCompleted) {
        const temp =
          newStrikerId;

        newStrikerId =
          newNonStrikerId;

        newNonStrikerId =
          temp;
      }

      /* -----------------------------
         Batting card
      ----------------------------- */

      const battingCard =
        Array.isArray(currentBattingCard)
          ? currentBattingCard.map(
              (row) => ({
                ...row
              })
            )
          : [];

      if (currentInn.striker_id) {
        let strikerRow =
          battingCard.find(
            (row) =>
              row.player_id ===
              currentInn.striker_id
          );

        if (!strikerRow) {
          strikerRow = {
            player_id:
              currentInn.striker_id,
            runs: 0,
            balls: 0,
            fours: 0,
            sixes: 0,
            is_out: false
          };

          battingCard.push(
            strikerRow
          );
        }

        strikerRow.runs =
          Number(
            strikerRow.runs || 0
          ) +
          batsmanRuns;

        if (
          legalBall &&
          !payload.wicket
        ) {
          strikerRow.balls =
            Number(
              strikerRow.balls || 0
            ) +
            1;
        }

        if (
          !payload.extra_type &&
          runs === 4
        ) {
          strikerRow.fours =
            Number(
              strikerRow.fours || 0
            ) +
            1;
        }

        if (
          !payload.extra_type &&
          runs === 6
        ) {
          strikerRow.sixes =
            Number(
              strikerRow.sixes || 0
            ) +
            1;
        }
      }

      /* -----------------------------
         Bowling card
      ----------------------------- */

      const bowlingCard =
        Array.isArray(currentBowlingCard)
          ? currentBowlingCard.map(
              (row) => ({
                ...row
              })
            )
          : [];

      if (
        currentInn.current_bowler_id
      ) {
        let bowlerRow =
          bowlingCard.find(
            (row) =>
              row.player_id ===
              currentInn.current_bowler_id
          );

        if (!bowlerRow) {
          bowlerRow = {
            player_id:
              currentInn.current_bowler_id,
            balls: 0,
            runs: 0,
            wickets: 0,
            maidens: 0
          };

          bowlingCard.push(
            bowlerRow
          );
        }

        bowlerRow.runs =
          Number(
            bowlerRow.runs || 0
          ) +
          teamRuns;

        if (legalBall) {
          bowlerRow.balls =
            Number(
              bowlerRow.balls || 0
            ) +
            1;
        }

        if (payload.wicket) {
          bowlerRow.wickets =
            Number(
              bowlerRow.wickets || 0
            ) +
            1;
        }

        const bowlingBalls =
          Number(
            bowlerRow.balls ||
              bowlerRow.legalBalls ||
              0
          );

        bowlerRow.economy =
          bowlingBalls > 0
            ? (
                Number(
                  bowlerRow.runs || 0
                ) /
                (bowlingBalls / 6)
              ).toFixed(2)
            : '0.00';
      }

      /* -----------------------------
         Current over
      ----------------------------- */

      const optimisticDisplay =
        getPendingDisplay(payload);

      const newBall = {
        id: `pending-${Date.now()}`,
        runs:
          payload.runs || 0,
        runs_batsman:
          payload.runs || 0,
        extra_type:
          payload.extra_type ||
          null,
        extra_runs:
          payload.extra_runs || 0,
        wicket:
          !!payload.wicket,
        display:
          optimisticDisplay,
        ball_display:
          optimisticDisplay,
        result:
          optimisticDisplay
      };

      const newCurrentOver =
        Array.isArray(currentOver)
          ? [
              ...currentOver,
              newBall
            ]
          : [newBall];

      /*
       * VERY IMPORTANT:
       *
       * At exactly 6, 12, 18...
       * clear the over immediately.
       */
      const visualCurrentOver =
        overCompleted
          ? []
          : newCurrentOver;

      setInnings((prev) =>
        prev.map((item) => {
          if (
            item?.innings?.id !==
            currentInn.id
          ) {
            return item;
          }

          return {
            ...item,

            innings: {
              ...item.innings,

              total_runs:
                newTotalRuns,

              total_balls:
                newTotalBalls,

              total_wickets:
                newTotalWickets,

              striker_id:
                newStrikerId,

              non_striker_id:
                newNonStrikerId
            },

            battingCard,

            bowlingCard,

            /*
             * Clear current over
             * immediately.
             */
            currentOver:
              visualCurrentOver
          };
        })
      );

      setPendingBall({
        payload,
        teamRuns
      });

      return {
        teamRuns,
        legalBall,
        newTotalBalls,
        overCompleted
      };
    },
    []
  );

  /* =====================================================
     SWAP BATSMEN
  ===================================================== */

  const swapBatsmen = async () => {
    if (savingBall) {
      return;
    }

    if (
      !inn.striker_id ||
      !inn.non_striker_id
    ) {
      setError(
        'Both batsmen must be selected.'
      );

      return;
    }

    try {
      setError('');

      /*
       * Use existing setBatsmen API.
       * No backend change required.
       */
      const result =
        await Innings.setBatsmen(
          inn.id,
          {
            striker_id:
              inn.non_striker_id,

            non_striker_id:
              inn.striker_id
          }
        );

      if (result?.innings) {
        updateCurrentInnings(
          result.innings
        );
      }

      /*
       * Refresh database state so
       * everything remains authoritative.
       */
      await loadFull();
    } catch (err) {
      console.error(
        'Swap batsmen error:',
        err
      );

      setError(
        err?.response?.data?.error ||
        err?.message ||
        'Failed to swap batsmen'
      );
    }
  };

  /* =====================================================
     PLAY BALL
  ===================================================== */

  const playBall = async (payload) => {
    if (savingBall) {
      return;
    }

    if (
      !inn.striker_id ||
      !inn.non_striker_id
    ) {
      setError(
        'Select both batsmen first.'
      );

      return;
    }

    if (!inn.current_bowler_id) {
      setError(
        'Select a bowler first.'
      );

      setShowNextBowler(true);

      return;
    }

    setError('');

    if (
      !payload.extra_type &&
      Number(payload.runs) === 4
    ) {
      popBoundary('four');
    }

    if (
      !payload.extra_type &&
      Number(payload.runs) === 6
    ) {
      popBoundary('six');
    }

    if (payload.wicket) {
      popWicket();
    }

    optimisticBall(
      payload,
      inn,
      battingCard,
      bowlingCard,
      currentOver
    );

    setSavingBall(true);

    try {
      const result =
        await Innings.ball(
          inn.id,
          payload
        );

      if (result?.innings) {
        updateCurrentInnings(
          result.innings
        );
      }

      if (
        result?.scoreboard?.innings
      ) {
        setInnings((prev) =>
          prev.map((item) =>
            item?.innings?.id ===
            inn.id
              ? result.scoreboard
              : item
          )
        );
      }

      if (
        result?.overJustCompleted
      ) {
        setNextBowlerId(null);
        setShowNextBowler(true);
      }

      if (
        result?.innings?.is_completed
      ) {
        await loadFull();
      }

      setPendingBall(null);
    } catch (err) {
      console.error(
        'Record ball error:',
        err
      );

      setPendingBall(null);

      await loadFull();

      setError(
        err?.response?.data?.error ||
        err?.message ||
        'Failed to record ball'
      );
    } finally {
      setSavingBall(false);
    }
  };

  /* =====================================================
     RUNS
  ===================================================== */

  const recordRuns = (runs) => {
    playBall({
      runs,
      extra_type: null,
      extra_runs: 0
    });
  };

  /* =====================================================
     EXTRA PICKER
  ===================================================== */

  const openExtraPicker = (type) => {
    if (savingBall) {
      return;
    }

    setError('');

    setShowExtraPicker((prev) =>
      prev === type
        ? null
        : type
    );
  };

  const confirmExtraNumber = (
    number
  ) => {
    if (!showExtraPicker) {
      return;
    }

    if (
      showExtraPicker ===
      'wide'
    ) {
      playBall({
        runs: 0,
        extra_type: 'wide',
        extra_runs:
          number + 1
      });
    }

    if (
      showExtraPicker ===
      'noball'
    ) {
      playBall({
        runs: number,
        extra_type:
          'noball',
        extra_runs: 1
      });
    }

    if (
      showExtraPicker ===
      'bye'
    ) {
      playBall({
        runs: 0,
        extra_type: 'bye',
        extra_runs: number
      });
    }

    setShowExtraPicker(null);
  };

  /* =====================================================
     WICKET
  ===================================================== */

  const handleWicket = async (
    data
  ) => {
    setShowWicket(false);

    await playBall({
      runs: Number(
        data?.runs_before_wicket ||
        0
      ),

      extra_type:
        data?.extra_type ||
        null,

      extra_runs: Number(
        data?.extra_runs || 0
      ),

      wicket: true,

      wicket_type:
        data?.wicket_type ||
        'unknown',

      dismissed_player_id:
        data?.dismissed_player_id ||
        inn.striker_id,

      fielder_id:
        data?.fielder_id ||
        null
    });
  };

  /* =====================================================
     LOADING
  ===================================================== */

  if (!match) {
    return (
      <div className="max-w-2xl mx-auto py-10 text-center text-slate-400">
        Loading scorer…
      </div>
    );
  }

  const currentInnings =
    innings.length
      ? innings[innings.length - 1]
      : null;

  /* =====================================================
     MATCH COMPLETED
  ===================================================== */

  if (
    match.status ===
    'completed'
  ) {
    return (
      <div className="max-w-lg mx-auto card text-center space-y-4">
        <div className="text-5xl">
          🏆
        </div>

        <h1 className="text-2xl font-bold">
          Match Completed
        </h1>

        <p className="text-emerald-400 font-bold">
          {match.result_text ||
            'Match completed'}
        </p>

        <button
          className="btn btn-primary w-full"
          onClick={() =>
            navigate(
              `/match/${matchId}/live`
            )
          }
        >
          View Full Scorecard
        </button>
      </div>
    );
  }

  /* =====================================================
     INNINGS BREAK
  ===================================================== */

  if (
    match.status ===
    'innings-break'
  ) {
    if (!currentInnings) {
      return (
        <div className="text-center py-10">
          Loading…
        </div>
      );
    }

    const breakInn =
      currentInnings.innings;

    return (
      <div className="max-w-lg mx-auto card text-center space-y-4">
        <div className="text-5xl">
          🏏
        </div>

        <h1 className="text-2xl font-bold">
          Innings Break
        </h1>

        <p className="text-lg">
          {breakInn.total_runs}/
          {breakInn.total_wickets}
        </p>

        <button
          className="btn btn-primary w-full"
          onClick={async () => {
            try {
              await Matches.startSecondInnings(
                matchId
              );

              await loadFull();
            } catch (err) {
              setError(
                err?.response?.data?.error ||
                err?.message ||
                'Failed to start innings'
              );
            }
          }}
        >
          Start 2nd Innings
        </button>

        {error && (
          <ErrorBox error={error} />
        )}
      </div>
    );
  }

  if (!currentInnings) {
    return (
      <div className="text-center py-10 text-slate-400">
        Setting up scorer…
      </div>
    );
  }

  const inn =
    currentInnings.innings;

  /* =====================================================
     PLAYERS
  ===================================================== */

  const battingTeamPlayers =
    players.filter(
      (p) =>
        p.team_id ===
          inn.batting_team_id &&
        p.active !== false
    );

  const bowlingTeamPlayers =
    players.filter(
      (p) =>
        p.team_id ===
          inn.bowling_team_id &&
        p.active !== false
    );

  const battingCard =
    Array.isArray(
      currentInnings.battingCard
    )
      ? currentInnings.battingCard
      : [];

  const bowlingCard =
    Array.isArray(
      currentInnings.bowlingCard
    )
      ? currentInnings.bowlingCard
      : [];

  /*
   * IMPORTANT:
   * If 6 legal balls are completed,
   * NEVER display the old over.
   */
  const rawCurrentOver =
    Array.isArray(
      currentInnings.currentOver
    )
      ? currentInnings.currentOver
      : [];

  const totalBalls =
    Number(
      inn.total_balls || 0
    );

  const currentOver =
    totalBalls > 0 &&
    totalBalls % 6 === 0
      ? []
      : rawCurrentOver;

  const recentBalls =
    Array.isArray(
      currentInnings.recentBalls
    )
      ? currentInnings.recentBalls
      : [];

  /* =====================================================
     EXTRAS
  ===================================================== */

  const extras =
    currentInnings.extras || {
      wide: Number(
        inn.extras_wide || 0
      ),

      noball: Number(
        inn.extras_noball || 0
      ),

      bye: Number(
        inn.extras_bye || 0
      ),

      legbye: Number(
        inn.extras_legbye || 0
      ),

      penalty: Number(
        inn.extras_penalty || 0
      )
    };

  const totalExtras =
    Number(
      extras.total ??
      (
        Number(extras.wide || 0) +
        Number(extras.noball || 0) +
        Number(extras.bye || 0) +
        Number(extras.legbye || 0) +
        Number(extras.penalty || 0)
      )
    );

  /* =====================================================
     BATSMEN
  ===================================================== */

  const outIds =
    new Set(
      battingCard
        .filter(
          (b) => b.is_out
        )
        .map(
          (b) => b.player_id
        )
    );

  const striker =
    players.find(
      (p) =>
        p.id ===
        inn.striker_id
    );

  const nonStriker =
    players.find(
      (p) =>
        p.id ===
        inn.non_striker_id
    );

  const bowler =
    players.find(
      (p) =>
        p.id ===
        inn.current_bowler_id
    );

  /* =====================================================
     STATS
  ===================================================== */

  const getBattingStats =
    (playerId) => {
      const row =
        battingCard.find(
          (b) =>
            b.player_id ===
            playerId
        );

      return {
        runs: Number(
          row?.runs || 0
        ),

        balls: Number(
          row?.balls || 0
        ),

        fours: Number(
          row?.fours || 0
        ),

        sixes: Number(
          row?.sixes || 0
        ),

        is_out:
          !!row?.is_out
      };
    };

  const getBowlingStats =
    (playerId) => {
      const row =
        bowlingCard.find(
          (b) =>
            b.player_id ===
            playerId
        );

      const balls = Number(
        row?.balls ||
        row?.legalBalls ||
        0
      );

      const runs = Number(
        row?.runs || 0
      );

      return {
        balls,

        runs,

        wickets: Number(
          row?.wickets || 0
        ),

        maidens: Number(
          row?.maidens || 0
        ),

        economy:
          row?.economy ??
          (
            balls > 0
              ? (
                  runs /
                  (balls / 6)
                ).toFixed(2)
              : '0.00'
          )
      };
    };

  const strikerStats =
    getBattingStats(
      inn.striker_id
    );

  const nonStrikerStats =
    getBattingStats(
      inn.non_striker_id
    );

  const bowlerStats =
    getBowlingStats(
      inn.current_bowler_id
    );

  const totalRuns =
    Number(
      inn.total_runs || 0
    );

  const totalWickets =
    Number(
      inn.total_wickets || 0
    );

  const oversText =
    formatOvers(
      totalBalls
    );

  const runRate =
    totalBalls > 0
      ? (
          totalRuns /
          (totalBalls / 6)
        ).toFixed(2)
      : '0.00';

  const needBatsmen =
    !inn.striker_id ||
    !inn.non_striker_id;

  const needBowler =
    !needBatsmen &&
    !inn.current_bowler_id;

  /*
   * Partnership.
   *
   * Backend may return:
   * currentInnings.partnership
   */
  const partnership =
    currentInnings.partnership || {
      runs: 0,
      balls: 0
    };

  /* =====================================================
     BATSMEN SETUP
  ===================================================== */

  if (needBatsmen) {
    return (
      <SelectBatsmen
        team={battingTeamPlayers}
        outIds={outIds}
        teamId={
          inn.batting_team_id
        }
        onPlayerCreated={
          handlePlayerCreated
        }
        onSelect={async (
          strikerId,
          nonStrikerId
        ) => {
          try {
            const result =
              await Innings.setBatsmen(
                inn.id,
                {
                  striker_id:
                    strikerId,

                  non_striker_id:
                    nonStrikerId
                }
              );

            if (
              result?.innings
            ) {
              updateCurrentInnings(
                result.innings
              );
            }

            await loadFull();

            setNextBowlerId(null);
            setShowNextBowler(true);
          } catch (err) {
            setError(
              err?.response?.data?.error ||
              err?.message ||
              'Failed to set batsmen'
            );
          }
        }}
      />
    );
  }

  /* =====================================================
     MAIN UI
  ===================================================== */

  return (
    <div className="max-w-2xl mx-auto space-y-3 pb-10 px-1 sm:px-0">

      {/* =================================================
          LIVE HEADER
      ================================================= */}

      <div className="card p-3 sm:p-4">

        <div className="flex items-center justify-between gap-2">

          <div className="min-w-0">

            <div className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">
              Live Scoring
            </div>

            <h1 className="text-base sm:text-xl font-black truncate mt-1">
              {match.team1_name ||
                match.team1?.name ||
                'Team'}{' '}
              <span className="text-slate-500">
                vs
              </span>{' '}
              {match.team2_name ||
                match.team2?.name ||
                'Team'}
            </h1>

          </div>

          <div className="text-right shrink-0">

            <div className="text-3xl sm:text-4xl font-black leading-none">
              {totalRuns}/
              {totalWickets}
            </div>

            <div className="text-[10px] sm:text-xs text-slate-400 mt-1">
              {oversText} overs
            </div>

          </div>

        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">

          <div className="bg-slate-900 rounded-xl px-3 py-2.5">

            <div className="text-[10px] text-slate-500 font-bold">
              RUN RATE
            </div>

            <div className="text-base font-black">
              {runRate}
            </div>

          </div>

          <div className="bg-slate-900 rounded-xl px-3 py-2.5">

            <div className="text-[10px] text-slate-500 font-bold">
              TARGET
            </div>

            <div className="text-base font-black">
              {inn.target || '—'}
            </div>

          </div>

        </div>

      </div>

      {error && (
        <ErrorBox error={error} />
      )}

      {/* =================================================
          CURRENT PLAYERS
      ================================================= */}

      <div className="card p-3 sm:p-4">

        <div className="flex items-center justify-between mb-3">

          <h2 className="font-black text-base">
            🏏 Current Batters
          </h2>

          <div className="text-[10px] text-slate-500 uppercase">
            Partnership
          </div>

        </div>

        <div className="grid grid-cols-2 gap-2">

          <BatterRow
            player={striker}
            stats={strikerStats}
            striker
          />

          <BatterRow
            player={nonStriker}
            stats={nonStrikerStats}
          />

        </div>

        {/* Partnership */}

        <div className="mt-2 bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-3">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-[10px] uppercase text-slate-500 font-bold">
                Current Partnership
              </div>

              <div className="font-black text-lg text-emerald-300">
                {Number(
                  partnership.runs || 0
                )}{' '}
                <span className="text-sm text-slate-400 font-medium">
                  runs
                </span>
              </div>

            </div>

            <div className="text-right">

              <div className="text-[10px] uppercase text-slate-500 font-bold">
                Balls
              </div>

              <div className="font-black text-lg">
                {Number(
                  partnership.balls || 0
                )}
              </div>

            </div>

          </div>

        </div>

        {/* Bowling */}

        <div className="border-t border-slate-700/60 mt-3 pt-3">

          <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">
            🎯 Current Bowler
          </div>

          {bowler ? (
            <div className="bg-slate-900 rounded-xl p-3 flex justify-between items-center">

              <div className="min-w-0">

                <div className="font-bold truncate">
                  {bowler.name}
                </div>

                <div className="text-[11px] text-slate-400">
                  {formatOvers(
                    bowlerStats.balls
                  )}{' '}
                  O ·{' '}
                  {bowlerStats.runs}{' '}
                  R ·{' '}
                  {bowlerStats.wickets}{' '}
                  W
                </div>

              </div>

              <div className="text-right shrink-0">

                <div className="font-black">
                  {bowlerStats.economy}
                </div>

                <div className="text-[9px] text-slate-500">
                  ECON
                </div>

              </div>

            </div>
          ) : (
            <div className="text-center text-amber-400 bg-slate-900 rounded-xl p-3 text-sm">
              Select bowler from popup
            </div>
          )}

        </div>

      </div>

      {/* =================================================
          CURRENT OVER
      ================================================= */}

      <div className="card p-3 sm:p-4">

        <div className="flex justify-between items-center mb-3">

          <div>

            <div className="text-[10px] text-slate-500 uppercase font-bold">
              Current Over
            </div>

            <h2 className="font-black text-lg">
              Over{' '}
              {Math.floor(
                totalBalls / 6
              ) + 1}
            </h2>

          </div>

          <div className="bg-slate-900 rounded-xl px-3 py-2 text-xs font-bold text-slate-400">
            {currentOver.length}/6
          </div>

        </div>

        {currentOver.length === 0 ? (
          <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4 text-center">

            <div className="text-2xl mb-1">
              🏏
            </div>

            <div className="text-xs text-slate-500">
              {totalBalls > 0 &&
              totalBalls % 6 === 0
                ? 'New over — ready for next ball'
                : 'No balls yet'}
            </div>

          </div>
        ) : (
          <div className="flex flex-wrap gap-2">

            {currentOver.map(
              (ball, index) => (
                <BallChip
                  key={
                    ball.id ||
                    index
                  }
                  ball={ball}
                />
              )
            )}

            {pendingBall &&
              !currentOver.some(
                (b) =>
                  String(
                    b.id || ''
                  ).startsWith(
                    'pending-'
                  )
              ) && (
                <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-400 flex items-center justify-center font-bold animate-pulse">
                  {getPendingDisplay(
                    pendingBall.payload
                  )}
                </div>
              )}

          </div>
        )}

      </div>

      {/* =================================================
          UNIQUE MOBILE SCORE PANEL
      ================================================= */}

      <div className="card p-3 sm:p-4">

        <div className="flex items-center justify-between mb-3">

          <div>

            <div className="text-[10px] text-slate-500 uppercase font-bold">
              Score Runs
            </div>

            <h2 className="text-lg font-black">
              Tap to score
            </h2>

          </div>

          <div className="text-[10px] text-slate-500">
            {savingBall
              ? 'SAVING…'
              : 'READY'}
          </div>

        </div>

        {/* TOP RUN BUTTONS */}

        <div className="grid grid-cols-4 gap-2">

          {[0, 1, 2, 3].map(
            (run) => (
              <button
                key={run}
                disabled={
                  savingBall ||
                  needBowler
                }
                onClick={() =>
                  recordRuns(run)
                }
                className={[
                  'h-14 sm:h-16 rounded-2xl',
                  'font-black text-xl',
                  'border border-slate-700',
                  'bg-slate-900',
                  'active:scale-95',
                  'transition-all',
                  'disabled:opacity-30'
                ].join(' ')}
              >
                {run}
              </button>
            )
          )}

        </div>

        {/* FOUR / SIX */}

        <div className="grid grid-cols-2 gap-2 mt-2">

          <button
            disabled={
              savingBall ||
              needBowler
            }
            onClick={() =>
              recordRuns(4)
            }
            className="h-16 sm:h-20 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-95 border border-blue-400/30 font-black text-2xl transition-all disabled:opacity-30"
          >
            <span className="block">
              4
            </span>
            <span className="text-[10px] font-bold opacity-70">
              FOUR
            </span>
          </button>

          <button
            disabled={
              savingBall ||
              needBowler
            }
            onClick={() =>
              recordRuns(6)
            }
            className="h-16 sm:h-20 rounded-2xl bg-purple-600 hover:bg-purple-500 active:scale-95 border border-purple-400/30 font-black text-2xl transition-all disabled:opacity-30"
          >
            <span className="block">
              6
            </span>
            <span className="text-[10px] font-bold opacity-70">
              SIX
            </span>
          </button>

        </div>

        {/* SWAP + WICKET */}

        <div className="grid grid-cols-2 gap-2 mt-2">

          <button
            disabled={
              savingBall ||
              needBowler
            }
            onClick={
              swapBatsmen
            }
            className="h-14 rounded-2xl bg-cyan-700 hover:bg-cyan-600 active:scale-95 border border-cyan-400/20 font-black transition-all disabled:opacity-30"
          >
            <span className="text-xl">
              ⇄
            </span>{' '}
            SWAP
          </button>

          <button
            disabled={
              savingBall ||
              needBowler
            }
            onClick={() =>
              setShowWicket(true)
            }
            className="h-14 rounded-2xl bg-red-700 hover:bg-red-600 active:scale-95 border border-red-400/20 font-black transition-all disabled:opacity-30"
          >
            <span className="text-xl">
              W
            </span>{' '}
            WICKET
          </button>

        </div>

        {/* EXTRAS SINGLE LINE */}

        <div className="mt-3">

          <div className="text-[10px] text-slate-500 uppercase font-bold mb-2">
            Extras
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">

            <ExtraAction
              label="WD"
              active={
                showExtraPicker ===
                'wide'
              }
              disabled={
                savingBall ||
                needBowler
              }
              onClick={() =>
                openExtraPicker(
                  'wide'
                )
              }
            />

            <ExtraAction
              label="NB"
              active={
                showExtraPicker ===
                'noball'
              }
              disabled={
                savingBall ||
                needBowler
              }
              onClick={() =>
                openExtraPicker(
                  'noball'
                )
              }
            />

            <ExtraAction
              label="B"
              active={
                showExtraPicker ===
                'bye'
              }
              disabled={
                savingBall ||
                needBowler
              }
              onClick={() =>
                openExtraPicker(
                  'bye'
                )
              }
            />

            <ExtraAction
              label="LB"
              disabled
            />

            <ExtraAction
              label="P"
              disabled
            />

          </div>

        </div>

        {/* EXTRA NUMBER PICKER */}

        {showExtraPicker && (
          <div className="mt-3 bg-slate-900 rounded-2xl p-3 border border-slate-700">

            <div className="text-[10px] text-center text-slate-400 uppercase font-bold mb-2">
              {showExtraPicker ===
              'wide'
                ? 'Wide — total wide runs'
                : showExtraPicker ===
                  'noball'
                ? 'No Ball — bat runs'
                : 'Bye — runs'}
            </div>

            <div className="grid grid-cols-7 gap-1">

              {[0, 1, 2, 3, 4, 5, 6].map(
                (number) => (
                  <button
                    key={number}
                    disabled={
                      savingBall
                    }
                    onClick={() =>
                      confirmExtraNumber(
                        number
                      )
                    }
                    className="h-11 rounded-xl bg-slate-800 hover:bg-emerald-700 active:scale-95 font-black disabled:opacity-30"
                  >
                    {number}
                  </button>
                )
              )}

            </div>

          </div>
        )}

      </div>

      {/* =================================================
          EXTRAS SUMMARY — SINGLE LINE
      ================================================= */}

      <div className="card p-3">

        <div className="flex items-center justify-between mb-2">

          <h2 className="font-black">
            Extras
          </h2>

          <div className="font-black text-amber-400">
            {totalExtras}
          </div>

        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">

          <CompactExtra
            label="WD"
            value={extras.wide}
          />

          <CompactExtra
            label="NB"
            value={extras.noball}
          />

          <CompactExtra
            label="B"
            value={extras.bye}
          />

          <CompactExtra
            label="LB"
            value={extras.legbye}
          />

          <CompactExtra
            label="P"
            value={extras.penalty}
          />

          <div className="h-9 min-w-[62px] px-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center gap-1 shrink-0">

            <span className="text-[9px] text-amber-400 font-bold">
              TOTAL
            </span>

            <span className="font-black text-sm text-amber-300">
              {totalExtras}
            </span>

          </div>

        </div>

      </div>

      {/* =================================================
          FALL OF WICKETS
      ================================================= */}

      <FallOfWickets
        fallOfWickets={
          currentInnings.fallOfWickets ||
          []
        }
        players={players}
      />

      {/* =================================================
          FULL SCOREBOARD
      ================================================= */}

      <button
        onClick={() =>
          setShowFullScoreboard(
            (prev) => !prev
          )
        }
        className={[
          'w-full h-14 rounded-2xl font-black text-base',
          'border active:scale-[0.99]',
          'transition',
          showFullScoreboard
            ? 'bg-slate-800 border-slate-600'
            : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500'
        ].join(' ')}
      >
        {showFullScoreboard
          ? '▲ HIDE FULL SCOREBOARD'
          : '▼ FULL SCOREBOARD'}
      </button>

      {/* =================================================
          FULL SCOREBOARD
      ================================================= */}

      {showFullScoreboard && (
        <div className="card p-3 sm:p-4">

          <div className="flex justify-between items-center mb-5">

            <div>

              <div className="text-xs text-slate-500 uppercase">
                Full Scoreboard
              </div>

              <h2 className="text-2xl font-black">
                {totalRuns}/
                {totalWickets}
              </h2>

              <div className="text-sm text-slate-400 mt-1">
                {oversText} overs · RR{' '}
                {runRate}
              </div>

            </div>

            <div className="text-right">

              <div className="text-xs text-slate-500">
                TARGET
              </div>

              <div className="text-xl font-black">
                {inn.target || '—'}
              </div>

            </div>

          </div>

          {/* EXTRAS */}

          <div className="bg-slate-900 rounded-2xl p-3 mb-6">

            <div className="font-bold mb-3">
              EXTRAS
            </div>

            <div className="flex gap-2 overflow-x-auto">

              <MiniStat
                label="WD"
                value={
                  extras.wide ||
                  0
                }
              />

              <MiniStat
                label="NB"
                value={
                  extras.noball ||
                  0
                }
              />

              <MiniStat
                label="B"
                value={
                  extras.bye ||
                  0
                }
              />

              <MiniStat
                label="LB"
                value={
                  extras.legbye ||
                  0
                }
              />

              <MiniStat
                label="P"
                value={
                  extras.penalty ||
                  0
                }
              />

              <MiniStat
                label="TOTAL"
                value={
                  totalExtras
                }
              />

            </div>

          </div>

          {/* BATTING */}

          <div className="mb-7">

            <h3 className="font-bold mb-3">
              🏏 BATTING
            </h3>

            <div className="overflow-x-auto">

              <table className="w-full text-sm">

                <thead>
                  <tr className="text-slate-500 border-b border-slate-700">

                    <th className="text-left py-2">
                      Batter
                    </th>

                    <th className="text-right py-2">
                      R
                    </th>

                    <th className="text-right py-2">
                      B
                    </th>

                    <th className="text-right py-2">
                      4s
                    </th>

                    <th className="text-right py-2">
                      6s
                    </th>

                    <th className="text-right py-2">
                      SR
                    </th>

                  </tr>
                </thead>

                <tbody>

                  {battingCard.map(
                    (row) => {
                      const player =
                        players.find(
                          (p) =>
                            p.id ===
                            row.player_id
                        );

                      const runs =
                        Number(
                          row.runs || 0
                        );

                      const balls =
                        Number(
                          row.balls || 0
                        );

                      const sr =
                        balls > 0
                          ? (
                              (runs /
                                balls) *
                              100
                            ).toFixed(1)
                          : '0.0';

                      return (
                        <tr
                          key={
                            row.player_id
                          }
                          className="border-b border-slate-800"
                        >

                          <td className="py-3 font-semibold">

                            {player?.name ||
                              row.player_id}

                            {row.is_out && (
                              <span className="text-red-400 text-xs ml-2">
                                OUT
                              </span>
                            )}

                            {row.player_id ===
                              inn.striker_id && (
                              <span className="text-emerald-400 ml-1">
                                ●
                              </span>
                            )}

                          </td>

                          <td className="text-right font-bold">
                            {runs}
                          </td>

                          <td className="text-right">
                            {balls}
                          </td>

                          <td className="text-right">
                            {row.fours ||
                              0}
                          </td>

                          <td className="text-right">
                            {row.sixes ||
                              0}
                          </td>

                          <td className="text-right">
                            {sr}
                          </td>

                        </tr>
                      );
                    }
                  )}

                  <tr className="border-b border-slate-700">

                    <td className="py-3 font-semibold text-amber-400">
                      Extras
                    </td>

                    <td className="text-right font-bold text-amber-400">
                      {totalExtras}
                    </td>

                    <td colSpan="4">

                      <div className="text-right text-xs text-slate-400 whitespace-nowrap">
                        WD{' '}
                        {extras.wide ||
                          0}{' '}
                        · NB{' '}
                        {extras.noball ||
                          0}{' '}
                        · B{' '}
                        {extras.bye ||
                          0}{' '}
                        · LB{' '}
                        {extras.legbye ||
                          0}{' '}
                        · P{' '}
                        {extras.penalty ||
                          0}
                      </div>

                    </td>

                  </tr>

                </tbody>

              </table>

            </div>

            <div className="flex justify-between mt-3 bg-slate-900 rounded-xl p-3">

              <span className="font-bold">
                TOTAL
              </span>

              <span className="font-black text-xl">
                {totalRuns}/
                {totalWickets}
              </span>

            </div>

          </div>

          {/* BOWLING */}

          <div>

            <h3 className="font-bold mb-3">
              🎯 BOWLING
            </h3>

            <div className="overflow-x-auto">

              <table className="w-full text-sm">

                <thead>
                  <tr className="text-slate-500 border-b border-slate-700">

                    <th className="text-left py-2">
                      Bowler
                    </th>

                    <th className="text-right py-2">
                      O
                    </th>

                    <th className="text-right py-2">
                      R
                    </th>

                    <th className="text-right py-2">
                      W
                    </th>

                    <th className="text-right py-2">
                      ECO
                    </th>

                  </tr>
                </thead>

                <tbody>

                  {bowlingCard.map(
                    (row) => {
                      const player =
                        players.find(
                          (p) =>
                            p.id ===
                            row.player_id
                        );

                      const balls =
                        Number(
                          row.balls ||
                          row.legalBalls ||
                          0
                        );

                      const runs =
                        Number(
                          row.runs || 0
                        );

                      const wickets =
                        Number(
                          row.wickets || 0
                        );

                      const economy =
                        balls > 0
                          ? (
                              runs /
                              (balls / 6)
                            ).toFixed(2)
                          : '0.00';

                      return (
                        <tr
                          key={
                            row.player_id
                          }
                          className="border-b border-slate-800"
                        >

                          <td className="py-3 font-semibold">
                            {player?.name ||
                              row.player_id}
                          </td>

                          <td className="text-right">
                            {formatOvers(
                              balls
                            )}
                          </td>

                          <td className="text-right">
                            {runs}
                          </td>

                          <td className="text-right font-bold">
                            {wickets}
                          </td>

                          <td className="text-right">
                            {economy}
                          </td>

                        </tr>
                      );
                    }
                  )}

                </tbody>

              </table>

            </div>

          </div>

          {/* RECENT BALLS */}

          {recentBalls.length > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-800">

              <h3 className="font-bold mb-3">
                Recent Balls
              </h3>

              <div className="flex flex-wrap gap-2">

                {recentBalls
                  .slice(-12)
                  .map(
                    (ball, index) => (
                      <BallChip
                        key={
                          ball.id ||
                          index
                        }
                        ball={ball}
                      />
                    )
                  )}

              </div>

            </div>
          )}

        </div>
      )}

      {/* =================================================
          NEXT BOWLER POPUP
      ================================================= */}

      {showNextBowler && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">

          <div className="w-full max-w-md bg-slate-950 border border-slate-700 rounded-3xl p-5 shadow-2xl">

            <div className="text-center">

              <div className="text-5xl">
                🎯
              </div>

              <h2 className="text-2xl font-black mt-2">
                {totalBalls === 0
                  ? 'SELECT BOWLER'
                  : 'OVER COMPLETED'}
              </h2>

              <p className="text-sm text-slate-400 mt-1">
                Select the bowler for
                the next over.
              </p>

            </div>

            {totalBalls > 0 && (
              <div className="grid grid-cols-2 gap-2 mt-5">

                <div className="bg-slate-900 rounded-xl p-3 text-center">

                  <div className="text-xs text-slate-500">
                    OVERS
                  </div>

                  <div className="text-xl font-black">
                    {oversText}
                  </div>

                </div>

                <div className="bg-slate-900 rounded-xl p-3 text-center">

                  <div className="text-xs text-slate-500">
                    SCORE
                  </div>

                  <div className="text-xl font-black">
                    {totalRuns}/
                    {totalWickets}
                  </div>

                </div>

              </div>
            )}

            <div className="mt-5">

              <label className="block text-sm font-semibold mb-2">
                NEXT BOWLER
              </label>

              <PlayerAutocomplete
                players={
                  bowlingTeamPlayers
                }
                value={
                  nextBowlerId
                }
                onChange={
                  setNextBowlerId
                }
                teamId={
                  inn.bowling_team_id
                }
                onCreated={
                  handlePlayerCreated
                }
                placeholder="Select or type bowler…"
              />

            </div>

            <button
              disabled={
                !nextBowlerId ||
                selectingBowler
              }
              onClick={async () => {
                try {
                  setSelectingBowler(
                    true
                  );

                  const result =
                    await Innings.setBowler(
                      inn.id,
                      {
                        bowler_id:
                          nextBowlerId
                      }
                    );

                  if (
                    result?.innings
                  ) {
                    updateCurrentInnings(
                      result.innings
                    );
                  }

                  setShowNextBowler(
                    false
                  );

                  setNextBowlerId(
                    null
                  );

                  await loadFull();
                } catch (err) {
                  setError(
                    err?.response?.data?.error ||
                    err?.message ||
                    'Failed to select bowler'
                  );
                } finally {
                  setSelectingBowler(
                    false
                  );
                }
              }}
              className="w-full h-14 mt-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 font-black text-lg disabled:opacity-40"
            >
              {selectingBowler
                ? 'STARTING…'
                : 'START OVER'}
            </button>

          </div>

        </div>
      )}

      {/* =================================================
          WICKET MODAL
      ================================================= */}

      {showWicket && (
        <WicketModal
          striker={striker}
          nonStriker={
            nonStriker
          }
          players={
            battingTeamPlayers
          }
          onClose={() =>
            setShowWicket(false)
          }
          onConfirm={
            handleWicket
          }
        />
      )}

      {/* =================================================
          BOUNDARY FLASH
      ================================================= */}

      {boundary && (
        <div className="fixed inset-0 z-[120] pointer-events-none flex items-center justify-center">

          <div className="text-7xl font-black animate-ping">
            {boundary === 'six'
              ? 'SIX! 🔥'
              : 'FOUR! 💥'}
          </div>

        </div>
      )}

      {/* =================================================
          WICKET FLASH
      ================================================= */}

      {flashWicket && (
        <div className="fixed inset-0 z-[120] pointer-events-none flex items-center justify-center">

          <div className="text-7xl font-black text-red-400 animate-ping">
            WICKET! 🏏
          </div>

        </div>
      )}

    </div>
  );
}


/* =====================================================
   MINI STAT
===================================================== */

function MiniStat({
  label,
  value
}) {
  return (
    <div className="bg-slate-950 rounded-xl p-2 text-center min-w-[60px] shrink-0">

      <div className="text-[10px] text-slate-500 font-bold">
        {label}
      </div>

      <div className="text-lg font-black mt-1">
        {Number(value || 0)}
      </div>

    </div>
  );
}


/* =====================================================
   EXTRA ACTION
===================================================== */

function ExtraAction({
  label,
  active = false,
  disabled = false,
  onClick
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={[
        'h-11 rounded-xl',
        'font-black text-sm',
        'border',
        'active:scale-95',
        'transition-all',
        'disabled:opacity-30',
        active
          ? 'bg-emerald-600 border-emerald-400'
          : 'bg-slate-900 border-slate-700 hover:bg-slate-800'
      ].join(' ')}
    >
      {label}
    </button>
  );
}


/* =====================================================
   COMPACT EXTRA
===================================================== */

function CompactExtra({
  label,
  value
}) {
  return (
    <div className="h-9 min-w-[55px] px-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center gap-1 shrink-0">

      <span className="text-[9px] text-slate-500 font-black">
        {label}
      </span>

      <span className="text-sm font-black">
        {Number(value || 0)}
      </span>

    </div>
  );
}


/* =====================================================
   BATTER
===================================================== */

function BatterRow({
  player,
  stats,
  striker = false
}) {
  return (
    <div
      className={[
        'rounded-xl p-3 min-w-0',
        striker
          ? 'bg-emerald-900/25 border border-emerald-500/30'
          : 'bg-slate-900/60 border border-slate-800'
      ].join(' ')}
    >

      <div className="flex items-center gap-1.5">

        {striker && (
          <span className="text-sm">
            🏏
          </span>
        )}

        <div className="font-bold text-sm truncate">
          {player?.name ||
            'Not selected'}
        </div>

      </div>

      <div className="mt-2 flex items-end justify-between gap-1">

        <div className="text-[10px] text-slate-400">
          {stats.fours}×4 ·{' '}
          {stats.sixes}×6
        </div>

        <div className="text-right">

          <div className="text-xl font-black leading-none">
            {stats.runs}
            <span className="text-[11px] text-slate-400">
              {' '}({stats.balls})
            </span>
          </div>

          {stats.is_out && (
            <div className="text-[9px] text-red-400 mt-1">
              OUT
            </div>
          )}

        </div>

      </div>

    </div>
  );
}


/* =====================================================
   FALL OF WICKETS
===================================================== */

function FallOfWickets({
  fallOfWickets,
  players
}) {
  if (
    !Array.isArray(
      fallOfWickets
    ) ||
    fallOfWickets.length === 0
  ) {
    return null;
  }

  return (
    <div className="card p-3 sm:p-4">

      <div className="flex items-center justify-between mb-3">

        <div>
          <div className="text-[10px] text-slate-500 uppercase font-bold">
            Fall of Wickets
          </div>

          <h2 className="font-black text-lg">
            Wickets
          </h2>
        </div>

        <div className="text-xs text-slate-500">
          {fallOfWickets.length}
        </div>

      </div>

      <div className="space-y-2">

        {fallOfWickets.map(
          (wicket, index) => {
            const dismissed =
              players.find(
                (p) =>
                  p.id ===
                  wicket.dismissed_id
              );

            return (
              <div
                key={
                  wicket.id ||
                  `${wicket.dismissed_id}-${index}`
                }
                className="bg-slate-900 rounded-xl p-3 flex items-center justify-between gap-3"
              >

                <div className="flex items-center gap-3 min-w-0">

                  <div className="w-8 h-8 rounded-full bg-red-900/50 border border-red-500/40 flex items-center justify-center text-red-300 font-black shrink-0">
                    {index + 1}
                  </div>

                  <div className="min-w-0">

                    <div className="font-bold truncate">
                      {dismissed?.name ||
                        wicket.dismissed_name ||
                        wicket.dismissed_id ||
                        'Batter'}
                    </div>

                    <div className="text-[10px] text-slate-500 uppercase">
                      {wicket.wicket_type ||
                        'Wicket'}
                    </div>

                  </div>

                </div>

                <div className="text-right shrink-0">

                  <div className="font-black text-amber-400">
                    {wicket.team_runs ??
                      wicket.runs ??
                      0}
                  </div>

                  <div className="text-[10px] text-slate-500">
                    {wicket.over_display ||
                      wicket.over ||
                      '—'}
                  </div>

                </div>

              </div>
            );
          }
        )}

      </div>

    </div>
  );
}


/* =====================================================
   BALL CHIP
===================================================== */

function BallChip({
  ball
}) {
  const display =
    ball.display ??
    ball.ball_display ??
    ball.result ??
    getBallFallback(ball);

  const wicket =
    display === 'W' ||
    ball.wicket ||
    ball.is_wicket;

  const boundary =
    display === '4' ||
    display === '6';

  const extra =
    String(display).startsWith(
      'WD'
    ) ||
    String(display).startsWith(
      'NB'
    ) ||
    String(display).startsWith(
      'B'
    ) ||
    String(display).startsWith(
      'LB'
    );

  return (
    <div
      className={[
        'w-10 h-10 rounded-full',
        'flex items-center justify-center',
        'font-bold text-xs border',

        wicket
          ? 'bg-red-900/50 border-red-500 text-red-300'
          : boundary
          ? 'bg-amber-900/40 border-amber-500 text-amber-300'
          : extra
          ? 'bg-emerald-900/40 border-emerald-500 text-emerald-300'
          : 'bg-slate-800 border-slate-700'
      ].join(' ')}
    >
      {display}
    </div>
  );
}


/* =====================================================
   SELECT BATSMEN
===================================================== */

function SelectBatsmen({
  team,
  outIds,
  teamId,
  onPlayerCreated,
  onSelect
}) {
  const [strikerId, setStrikerId] =
    useState(null);

  const [
    nonStrikerId,
    setNonStrikerId
  ] = useState(null);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState('');

  const available =
    team.filter(
      (p) =>
        !outIds.has(p.id)
    );

  const submit = async () => {
    if (
      !strikerId ||
      !nonStrikerId
    ) {
      setError(
        'Select both batsmen.'
      );

      return;
    }

    if (
      strikerId ===
      nonStrikerId
    ) {
      setError(
        'Batsmen must be different.'
      );

      return;
    }

    setSaving(true);
    setError('');

    try {
      await onSelect(
        strikerId,
        nonStrikerId
      );
    } catch (err) {
      setError(
        err?.message ||
        'Failed to set batsmen'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md mx-auto card space-y-5">

      <div className="text-center">

        <div className="text-5xl">
          🏏
        </div>

        <h1 className="text-2xl font-black">
          Select Batsmen
        </h1>

        <p className="text-sm text-slate-400">
          Choose the opening batsmen.
        </p>

      </div>

      {error && (
        <ErrorBox error={error} />
      )}

      <div>

        <label className="block text-sm font-semibold mb-2">
          Striker
        </label>

        <PlayerAutocomplete
          players={
            available.filter(
              (p) =>
                p.id !==
                nonStrikerId
            )
          }
          value={strikerId}
          onChange={
            setStrikerId
          }
          teamId={teamId}
          onCreated={
            onPlayerCreated
          }
          placeholder="Select striker…"
        />

      </div>

      <div>

        <label className="block text-sm font-semibold mb-2">
          Non-Striker
        </label>

        <PlayerAutocomplete
          players={
            available.filter(
              (p) =>
                p.id !==
                strikerId
            )
          }
          value={nonStrikerId}
          onChange={
            setNonStrikerId
          }
          teamId={teamId}
          onCreated={
            onPlayerCreated
          }
          placeholder="Select non-striker…"
        />

      </div>

      <button
        disabled={
          saving ||
          !strikerId ||
          !nonStrikerId
        }
        onClick={submit}
        className="btn btn-primary w-full"
      >
        {saving
          ? 'STARTING…'
          : 'START SCORING'}
      </button>

    </div>
  );
}


/* =====================================================
   ERROR
===================================================== */

function ErrorBox({
  error
}) {
  return (
    <div className="bg-red-900/40 border border-red-600/60 text-red-200 rounded-xl p-3 text-sm">
      {error}
    </div>
  );
}


/* =====================================================
   OVERS
===================================================== */

function formatOvers(balls) {
  const total =
    Number(balls || 0);

  return `${Math.floor(
    total / 6
  )}.${total % 6}`;
}


/* =====================================================
   PENDING DISPLAY
===================================================== */

function getPendingDisplay(
  payload
) {
  if (payload?.wicket) {
    return 'W';
  }

  if (
    payload?.extra_type ===
    'wide'
  ) {
    const total =
      Number(
        payload.extra_runs || 1
      );

    return total > 1
      ? `WD${total}`
      : 'WD';
  }

  if (
    payload?.extra_type ===
    'noball'
  ) {
    const additional =
      Number(
        payload.runs || 0
      );

    return additional > 0
      ? `NB+${additional}`
      : 'NB';
  }

  if (
    payload?.extra_type ===
    'bye'
  ) {
    const runs =
      Number(
        payload.extra_runs || 0
      );

    return `B${runs}`;
  }

  if (
    payload?.extra_type ===
    'legbye'
  ) {
    const runs =
      Number(
        payload.extra_runs || 0
      );

    return `LB${runs}`;
  }

  if (
    payload?.extra_type ===
    'penalty'
  ) {
    return `P${
      payload.extra_runs || 0
    }`;
  }

  return String(
    Number(
      payload?.runs || 0
    )
  );
}


/* =====================================================
   BALL FALLBACK
===================================================== */

function getBallFallback(ball) {
  if (
    ball?.wicket ||
    ball?.is_wicket
  ) {
    return 'W';
  }

  if (
    ball?.extra_type ===
    'wide'
  ) {
    const total =
      Number(
        ball?.extra_runs || 1
      );

    return total > 1
      ? `WD${total}`
      : 'WD';
  }

  if (
    ball?.extra_type ===
    'noball'
  ) {
    const additional =
      Number(
        ball?.runs || 0
      );

    return additional > 0
      ? `NB+${additional}`
      : 'NB';
  }

  if (
    ball?.extra_type ===
    'bye'
  ) {
    return `B${
      ball.extra_runs ?? 0
    }`;
  }

  if (
    ball?.extra_type ===
    'legbye'
  ) {
    return `LB${
      ball.extra_runs ?? 0
    }`;
  }

  if (
    ball?.extra_type ===
    'penalty'
  ) {
    return `P${
      ball.extra_runs ?? 0
    }`;
  }

  return String(
    Number(
      ball?.runs_batsman ??
      ball?.runs ??
      0
    )
  );
}
