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
  const [error, setError] = useState('');
  const [boundary, setBoundary] = useState(null);
  const [extraPicker, setExtraPicker] = useState(null);
  const [flashWicket, setFlashWicket] = useState(false);
  const [savingBall, setSavingBall] = useState(false);

  const boundaryTimer = useRef(null);

  /*
  =====================================================
  LOAD MATCH - ONLY INITIAL LOAD / SOCKET SYNC
  =====================================================
  */

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

  /*
  =====================================================
  SOCKET
  =====================================================
  */

  useEffect(() => {
    socket.emit('join-match', matchId);

    const onUpdate = ({ match: updatedMatch, innings: updatedInnings }) => {
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

  /*
  =====================================================
  PLAYER CREATED
  =====================================================
  */

  const handlePlayerCreated = useCallback((player) => {
    setPlayers((prev) => {
      if (prev.some((p) => p.id === player.id)) {
        return prev;
      }

      return [...prev, player];
    });
  }, []);

  /*
  =====================================================
  EFFECTS
  =====================================================
  */

  const popBoundary = (kind) => {
    clearTimeout(boundaryTimer.current);

    setBoundary(kind);

    boundaryTimer.current = setTimeout(() => {
      setBoundary(null);
    }, 1000);
  };

  const popWicket = () => {
    setFlashWicket(true);

    setTimeout(() => {
      setFlashWicket(false);
    }, 600);
  };

  /*
  =====================================================
  GENERIC ACTION
  =====================================================
  */

  const act = async (fn) => {
    setError('');

    try {
      return await fn();
    } catch (err) {
      console.error(err);

      setError(
        err?.response?.data?.error ||
        err?.message ||
        'Something went wrong'
      );

      return null;
    }
  };

  /*
  =====================================================
  LOADING
  =====================================================
  */

  if (!match) {
    return (
      <p className="text-slate-400">
        Loading…
      </p>
    );
  }

  const currentInnings =
    innings.length > 0
      ? innings[innings.length - 1]
      : null;

  /*
  =====================================================
  MATCH COMPLETED
  =====================================================
  */

  if (match.status === 'completed') {
    return (
      <div className="max-w-lg mx-auto card text-center space-y-3 fade-in">
        <h1 className="text-2xl font-bold">
          🏆 Match Completed
        </h1>

        <p className="text-emerald-400 text-lg font-semibold">
          {match.result_text || 'Match completed'}
        </p>

        <button
          className="btn btn-primary"
          onClick={() =>
            navigate(`/match/${matchId}/live`)
          }
        >
          View Full Scorecard
        </button>
      </div>
    );
  }

  /*
  =====================================================
  INNINGS BREAK
  =====================================================
  */

  if (match.status === 'innings-break') {
    if (!currentInnings) {
      return (
        <p className="text-slate-400">
          Loading innings…
        </p>
      );
    }

    const breakInn = currentInnings.innings;

    return (
      <div className="max-w-lg mx-auto card text-center space-y-4 fade-in">

        <div className="text-4xl">
          🏏
        </div>

        <h1 className="text-2xl font-bold">
          Innings Break
        </h1>

        <p className="text-slate-300 text-lg">
          {breakInn.total_runs}/{breakInn.total_wickets}
          {' '}in {currentInnings.overs} overs
        </p>

        <button
          className="btn btn-primary w-full"
          onClick={async () => {
            const result = await act(
              () => Matches.startSecondInnings(matchId)
            );

            if (result) {
              await loadFull();
            }
          }}
        >
          Start 2nd Innings
        </button>

        {error && (
          <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
            {error}
          </div>
        )}

      </div>
    );
  }

  /*
  =====================================================
  NO INNINGS
  =====================================================
  */

  if (!currentInnings) {
    return (
      <p className="text-slate-400">
        Setting up…
      </p>
    );
  }

  const inn = currentInnings.innings;

  /*
  =====================================================
  TEAM PLAYERS
  =====================================================
  */

  const battingTeamPlayers = players.filter(
    (p) =>
      p.team_id === inn.batting_team_id &&
      p.active !== false
  );

  const bowlingTeamPlayers = players.filter(
    (p) =>
      p.team_id === inn.bowling_team_id &&
      p.active !== false
  );

  /*
  =====================================================
  OUT PLAYERS
  =====================================================
  */

  const battingCard =
    Array.isArray(currentInnings.battingCard)
      ? currentInnings.battingCard
      : [];

  const bowlingCard =
    Array.isArray(currentInnings.bowlingCard)
      ? currentInnings.bowlingCard
      : [];

  const outIds = new Set(
    battingCard
      .filter((b) => b.is_out)
      .map((b) => b.player_id)
  );

  /*
  =====================================================
  CURRENT BATTERS
  =====================================================
  */

  const striker = players.find(
    (p) => p.id === inn.striker_id
  );

  const nonStriker = players.find(
    (p) => p.id === inn.non_striker_id
  );

  /*
  =====================================================
  CURRENT BOWLER
  =====================================================
  */

  const bowler = players.find(
    (p) => p.id === inn.current_bowler_id
  );

  /*
  =====================================================
  BATTER STATISTICS
  =====================================================
  */

  const getBattingStats = (playerId) => {
    const row = battingCard.find(
      (b) =>
        b.player_id === playerId ||
        b.id === playerId
    );

    if (!row) {
      return {
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        is_out: false
      };
    }

    return {
      runs: Number(
        row.runs ??
        row.runs_scored ??
        row.total_runs ??
        0
      ),

      balls: Number(
        row.balls ??
        row.balls_faced ??
        0
      ),

      fours: Number(
        row.fours ??
        row.boundaries_4 ??
        0
      ),

      sixes: Number(
        row.sixes ??
        row.boundaries_6 ??
        0
      ),

      is_out: !!row.is_out
    };
  };

  const strikerStats = getBattingStats(
    inn.striker_id
  );

  const nonStrikerStats = getBattingStats(
    inn.non_striker_id
  );

  /*
  =====================================================
  BOWLER STATISTICS
  =====================================================
  */

  const getBowlingStats = (playerId) => {
    const row = bowlingCard.find(
      (b) =>
        b.player_id === playerId ||
        b.id === playerId
    );

    if (!row) {
      return {
        balls: 0,
        runs: 0,
        wickets: 0
      };
    }

    return {
      balls: Number(
        row.balls ??
        row.balls_bowled ??
        row.total_balls ??
        0
      ),

      runs: Number(
        row.runs ??
        row.runs_conceded ??
        0
      ),

      wickets: Number(
        row.wickets ??
        row.wickets_taken ??
        0
      )
    };
  };

  const bowlerStats = getBowlingStats(
    inn.current_bowler_id
  );

  /*
  =====================================================
  FORMAT OVERS
  =====================================================
  */

  const formatOvers = (balls) => {
    const totalBalls = Number(balls || 0);

    return `${Math.floor(totalBalls / 6)}.${totalBalls % 6}`;
  };

  /*
  =====================================================
  NEED BATTERS / BOWLER
  =====================================================
  */

  const needBatsmen =
    !inn.striker_id ||
    !inn.non_striker_id;

  const needBowler =
    !needBatsmen &&
    !inn.current_bowler_id;

  /*
  =====================================================
  RECORD BALL
  =====================================================
  */

  const playBall = async (payload) => {
    if (savingBall) {
      return;
    }

    setSavingBall(true);
    setError('');

    /*
    Immediately show boundary animation.
    */

    if (
      !payload.extra_type &&
      payload.runs === 4
    ) {
      popBoundary('four');
    }

    if (
      !payload.extra_type &&
      payload.runs === 6
    ) {
      popBoundary('six');
    }

    try {
      /*
      IMPORTANT:

      We do NOT call Matches.get() here.

      The backend ball response is used immediately,
      making the scorer much faster.
      */

      const result = await Innings.ball(
        inn.id,
        payload
      );

      /*
      Update innings immediately if backend
      returned the updated innings.
      */

      if (result?.innings) {
        setInnings((prev) =>
          prev.map((item) => {
            if (
              item?.innings?.id === inn.id
            ) {
              return {
                ...item,
                innings: result.innings
              };
            }

            return item;
          })
        );
      }

      /*
      If backend returned a complete scoreboard,
      use it immediately.

      This supports both current and future
      backend response formats.
      */

      if (
        result?.scoreboard &&
        result.scoreboard.innings
      ) {
        setInnings((prev) =>
          prev.map((item) =>
            item?.innings?.id === inn.id
              ? result.scoreboard
              : item
          )
        );
      }

      /*
      Socket.IO will also synchronize all connected
      scoreboards in the background.
      */

    } catch (err) {
      console.error(
        'Record ball error:',
        err
      );

      setError(
        err?.response?.data?.error ||
        err?.message ||
        'Failed to record ball'
      );
    } finally {
      setSavingBall(false);
    }
  };

  /*
  =====================================================
  SELECT BATSMEN
  =====================================================
  */

  if (needBatsmen) {
    return (
      <SelectBatsmen
        team={battingTeamPlayers}
        outIds={outIds}
        teamId={inn.batting_team_id}
        onPlayerCreated={handlePlayerCreated}
        hasStriker={!!inn.striker_id}
        hasNonStriker={!!inn.non_striker_id}
        onSelect={async (
          strikerId,
          nonStrikerId
        ) => {

          const result = await act(
            () =>
              Innings.setBatsmen(
                inn.id,
                {
                  striker_id:
                    strikerId ||
                    inn.striker_id,

                  non_striker_id:
                    nonStrikerId ||
                    inn.non_striker_id
                }
              )
          );

          if (result) {
            await loadFull();
          }
        }}
      />
    );
  }

  /*
  =====================================================
  SELECT BOWLER
  =====================================================
  */

  if (needBowler) {
    return (
      <div className="max-w-md mx-auto card space-y-4 fade-in">

        <div className="text-center">

          <div className="text-4xl mb-2">
            🎯
          </div>

          <h1 className="text-xl font-bold">
            Select Bowler
          </h1>

          <p className="text-sm text-slate-400 mt-1">
            Choose the bowler for this over.
          </p>

        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
            {error}
          </div>
        )}

        <PlayerAutocomplete
          players={bowlingTeamPlayers}
          value={null}
          onChange={async (bowlerId) => {

            if (!bowlerId) {
              return;
            }

            const result = await act(
              () =>
                Innings.setBowler(
                  inn.id,
                  {
                    bowler_id: bowlerId
                  }
                )
            );

            if (result) {
              await loadFull();
            }
          }}
          teamId={inn.bowling_team_id}
          onCreated={handlePlayerCreated}
          placeholder="Type or select bowler…"
        />

      </div>
    );
  }

  /*
  =====================================================
  MAIN SCORER
  =====================================================
  */

  return (
    <div className="max-w-2xl mx-auto space-y-3 fade-in">

      {/* =============================================
          BOUNDARY
      ============================================= */}

      {boundary && (
        <div className="boundary-overlay">
          <div
            className={`boundary-text boundary-${boundary}`}
          >
            {boundary === 'six'
              ? 'SIX! 🚀'
              : 'FOUR! 🔥'}
          </div>
        </div>
      )}

      {/* =============================================
          SCORE HEADER
      ============================================= */}

      <div
        className={`card ${
          flashWicket
            ? 'wicket-flash'
            : ''
        }`}
      >

        <div className="flex justify-between items-center">

          <div>

            <div className="text-sm text-slate-400">
              {match.team1_short}
              {' '}vs{' '}
              {match.team2_short}
              {' '}·{' '}
              {match.overs_limit}
              {' '}overs
            </div>

            <div className="text-4xl font-extrabold tracking-tight">
              {inn.total_runs}

              <span className="text-slate-400">
                /{inn.total_wickets}
              </span>

              <span className="text-base text-slate-400 font-medium">
                {' '}({currentInnings.overs} ov)
              </span>
            </div>

          </div>

          <div className="text-right">

            <div className="text-xs text-slate-500">
              RUN RATE
            </div>

            <div className="text-xl font-bold text-emerald-400">
              {currentInnings.runRate}
            </div>

            {inn.target && (
              <div className="text-xs text-slate-400">
                Target {inn.target}
              </div>
            )}

          </div>

        </div>

      </div>

      {/* =============================================
          BATTERS
      ============================================= */}

      <div className="card">

        <div className="flex justify-between items-center mb-2">

          <h3 className="font-semibold">
            🏏 Batters
          </h3>

          <span className="text-xs text-slate-500">
            LIVE
          </span>

        </div>

        {/* STRIKER */}

        <div className="bg-slate-900/70 rounded-xl p-3 mb-2">

          <div className="flex justify-between items-center">

            <div className="min-w-0">

              <div className="flex items-center gap-1">

                <span className="text-emerald-400">
                  ●
                </span>

                <span className="font-bold truncate">
                  {striker?.name || '—'}
                </span>

              </div>

              <div className="text-xs text-slate-500 mt-1">
                STRIKER
              </div>

            </div>

            <div className="text-right">

              <div className="text-xl font-bold">
                {strikerStats.runs}
                <span className="text-sm text-slate-500">
                  {' '}({strikerStats.balls})
                </span>
              </div>

              <div className="text-xs text-slate-500">
                {strikerStats.fours}×4
                {' '}
                {strikerStats.sixes}×6
              </div>

            </div>

          </div>

        </div>

        {/* NON STRIKER */}

        <div className="bg-slate-900/70 rounded-xl p-3">

          <div className="flex justify-between items-center">

            <div className="min-w-0">

              <div className="font-semibold truncate">
                {nonStriker?.name || '—'}
              </div>

              <div className="text-xs text-slate-500 mt-1">
                NON-STRIKER
              </div>

            </div>

            <div className="text-right">

              <div className="text-xl font-bold">
                {nonStrikerStats.runs}
                <span className="text-sm text-slate-500">
                  {' '}({nonStrikerStats.balls})
                </span>
              </div>

              <div className="text-xs text-slate-500">
                {nonStrikerStats.fours}×4
                {' '}
                {nonStrikerStats.sixes}×6
              </div>

            </div>

          </div>

        </div>

      </div>

      {/* =============================================
          BOWLER
      ============================================= */}

      <div className="card">

        <div className="flex justify-between items-center">

          <div>

            <div className="flex items-center gap-2">

              <span className="text-lg">
                🎯
              </span>

              <span className="font-bold">
                {bowler?.name || '—'}
              </span>

            </div>

            <div className="text-xs text-slate-500 mt-1">
              BOWLER
            </div>

          </div>

          <div className="text-right">

            <div className="text-xl font-bold">
              {formatOvers(
                bowlerStats.balls
              )}

            </div>

            <div className="text-xs text-slate-400">
              {bowlerStats.runs} runs
              {' · '}
              {bowlerStats.wickets} wkts
            </div>

          </div>

        </div>

        {/* CURRENT OVER */}

        <div className="mt-3 pt-3 border-t border-slate-700">

          <div className="flex justify-between text-xs text-slate-500">

            <span>
              Current over
            </span>

            <span>
              {formatOvers(
                bowlerStats.balls
              )}
            </span>

          </div>

        </div>

      </div>

      {/* =============================================
          ERROR
      ============================================= */}

      {error && (
        <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      {/* =============================================
          RUN BUTTONS
      ============================================= */}

      <div className="card">

        <h3 className="font-semibold mb-2 text-sm text-slate-400">
          Score
        </h3>

        <div className="grid grid-cols-4 gap-2">

          {[0, 1, 2, 3].map((r) => (

            <button
              key={r}
              disabled={savingBall}
              className="run-btn bg-slate-700 hover:bg-slate-600 disabled:opacity-40"
              onClick={() =>
                playBall({
                  runs: r,
                  extra_type: null
                })
              }
            >
              {r}
            </button>

          ))}

          <button
            disabled={savingBall}
            className="run-btn bg-gold hover:brightness-110 text-slate-900 disabled:opacity-40"
            onClick={() =>
              playBall({
                runs: 4,
                extra_type: null
              })
            }
          >
            4
          </button>

          <button
            disabled={savingBall}
            className="run-btn bg-purple-600 hover:bg-purple-500 disabled:opacity-40"
            onClick={() =>
              playBall({
                runs: 6,
                extra_type: null
              })
            }
          >
            6
          </button>

          <button
            disabled={savingBall}
            className="run-btn bg-slate-700 hover:bg-slate-600 disabled:opacity-40"
            onClick={() =>
              playBall({
                runs: 5,
                extra_type: null
              })
            }
          >
            5
          </button>

          <button
            disabled={savingBall}
            className="run-btn bg-gradient-to-br from-red-600 to-red-800 disabled:opacity-40"
            onClick={() =>
              setShowWicket(true)
            }
          >
            OUT
          </button>

        </div>

        {savingBall && (
          <div className="text-center text-xs text-emerald-400 mt-2">
            Updating…
          </div>
        )}

      </div>

      {/* =============================================
          EXTRAS
      ============================================= */}

      <div className="card">

        <h3 className="font-semibold mb-2 text-sm text-slate-400">
          Extras
        </h3>

        {!extraPicker ? (

          <div className="grid grid-cols-4 gap-2">

            <button
              disabled={savingBall}
              className="btn btn-secondary text-sm disabled:opacity-40"
              onClick={() =>
                setExtraPicker('wide')
              }
            >
              Wide
            </button>

            <button
              disabled={savingBall}
              className="btn btn-secondary text-sm disabled:opacity-40"
              onClick={() =>
                setExtraPicker('noball')
              }
            >
              No Ball
            </button>

            <button
              disabled={savingBall}
              className="btn btn-secondary text-sm disabled:opacity-40"
              onClick={() =>
                setExtraPicker('bye')
              }
            >
              Bye
            </button>

            <button
              disabled={savingBall}
              className="btn btn-secondary text-sm disabled:opacity-40"
              onClick={() =>
                setExtraPicker('legbye')
              }
            >
              Leg Bye
            </button>

          </div>

        ) : (

          <div>

            <div className="flex justify-between items-center mb-2">

              <span className="text-sm font-medium text-slate-300">

                {extraPicker === 'wide' &&
                  'Wide — extra runs'}

                {extraPicker === 'noball' &&
                  'No Ball — runs off bat'}

                {extraPicker === 'bye' &&
                  'Bye — runs'}

                {extraPicker === 'legbye' &&
                  'Leg Bye — runs'}

              </span>

              <button
                className="text-xs text-slate-400"
                onClick={() =>
                  setExtraPicker(null)
                }
              >
                ✕ Cancel
              </button>

            </div>

            <div className="grid grid-cols-6 gap-2">

              {[0, 1, 2, 3, 4, 6].map((r) => (

                <button
                  key={r}
                  disabled={savingBall}
                  className="run-btn bg-slate-700 hover:bg-slate-600 !text-base !py-3 disabled:opacity-40"
                  onClick={() => {

                    const type =
                      extraPicker;

                    setExtraPicker(null);

                    if (type === 'wide') {

                      playBall({
                        extra_type: 'wide',
                        extra_runs: 1 + r
                      });

                    } else if (
                      type === 'noball'
                    ) {

                      playBall({
                        extra_type: 'noball',
                        extra_runs: 1,
                        runs: r
                      });

                    } else {

                      playBall({
                        extra_type: type,
                        extra_runs:
                          Math.max(r, 1)
                      });

                    }

                  }}
                >
                  {r}
                </button>

              ))}

            </div>

          </div>

        )}

      </div>

      {/* =============================================
          ACTIONS
      ============================================= */}

      <div className="grid grid-cols-2 gap-2">

        <button
          disabled={savingBall}
          className="btn btn-secondary disabled:opacity-40"
          onClick={async () => {

            const result = await act(
              () =>
                Innings.undo(inn.id)
            );

            if (result) {
              await loadFull();
            }

          }}
        >
          ↺ Undo
        </button>

        <button
          disabled={savingBall}
          className="btn btn-secondary disabled:opacity-40"
          onClick={async () => {

            const result = await act(
              () =>
                Innings.swapStrike(inn.id)
            );

            if (result) {
              await loadFull();
            }

          }}
        >
          ⇄ Swap
        </button>

      </div>

      {/* =============================================
          SCOREBOARD
      ============================================= */}

      <button
        className="btn btn-secondary w-full"
        onClick={() =>
          navigate(`/match/${matchId}/live`)
        }
      >
        View Full Scoreboard
      </button>

      {/* =============================================
          WICKET MODAL
      ============================================= */}

      {showWicket && (

        <WicketModal

          striker={striker}

          nonStriker={nonStriker}

          fieldingPlayers={
            bowlingTeamPlayers
          }

          fieldingTeamId={
            inn.bowling_team_id
          }

          onPlayerCreated={
            handlePlayerCreated
          }

          onClose={() =>
            setShowWicket(false)
          }

          onConfirm={async ({
            wicketType,
            dismissedId,
            fielderId,
            runsBeforeWicket
          }) => {

            setShowWicket(false);

            popWicket();

            await playBall({

              runs:
                wicketType === 'run-out'
                  ? runsBeforeWicket
                  : 0,

              is_wicket: true,

              wicket_type:
                wicketType,

              dismissed_id:
                dismissedId,

              fielder_id:
                fielderId

            });

          }}

        />

      )}

    </div>
  );
}


/*
=======================================================
SELECT BATSMEN
=======================================================
*/

function SelectBatsmen({
  team,
  outIds,
  hasStriker,
  hasNonStriker,
  teamId,
  onPlayerCreated,
  onSelect
}) {

  const [striker, setStriker] =
    useState(null);

  const [nonStriker, setNonStriker] =
    useState(null);

  const available = team.filter(
    (p) => !outIds.has(p.id)
  );

  return (

    <div className="max-w-md mx-auto card space-y-4 fade-in">

      <div className="text-center">

        <div className="text-4xl mb-2">
          🏏
        </div>

        <h1 className="text-xl font-bold">
          Select Batsmen
        </h1>

      </div>

      {!hasStriker && (

        <div>

          <label className="text-sm text-slate-400 mb-1 block">
            On strike
          </label>

          <PlayerAutocomplete
            players={available}
            value={striker}
            onChange={setStriker}
            teamId={teamId}
            onCreated={onPlayerCreated}
            excludeIds={
              nonStriker
                ? [nonStriker]
                : []
            }
            placeholder="Type or add striker's name…"
          />

        </div>

      )}

      {!hasNonStriker && (

        <div>

          <label className="text-sm text-slate-400 mb-1 block">
            Non-striker
          </label>

          <PlayerAutocomplete
            players={available}
            value={nonStriker}
            onChange={setNonStriker}
            teamId={teamId}
            onCreated={onPlayerCreated}
            excludeIds={
              striker
                ? [striker]
                : []
            }
            placeholder="Type or add non-striker's name…"
          />

        </div>

      )}

      <button
        className="btn btn-primary w-full"
        disabled={
          (!hasStriker && !striker) ||
          (!hasNonStriker && !nonStriker)
        }
        onClick={() =>
          onSelect(
            striker || null,
            nonStriker || null
          )
        }
      >
        Continue
      </button>

    </div>

  );
}
