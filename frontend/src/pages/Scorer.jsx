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
  ====================================================
  LOAD MATCH
  ====================================================
  */

  const loadFull = useCallback(async () => {
    try {
      const data = await Matches.get(matchId);

      setMatch(data.match);
      setPlayers(Array.isArray(data.players) ? data.players : []);
      setInnings(Array.isArray(data.innings) ? data.innings : []);
    } catch (err) {
      console.error('Failed to load match:', err);
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
  ====================================================
  SOCKET
  ====================================================
  */

  useEffect(() => {
    socket.emit('join-match', matchId);

    const onUpdate = ({ match: m, innings: i }) => {
      if (m) {
        setMatch(m);
      }

      if (Array.isArray(i)) {
        setInnings(i);
      }
    };

    socket.on('score-update', onUpdate);

    return () => {
      socket.emit('leave-match', matchId);
      socket.off('score-update', onUpdate);
    };
  }, [matchId]);

  /*
  ====================================================
  PLAYER CREATED
  ====================================================
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
  ====================================================
  EFFECTS
  ====================================================
  */

  const popBoundary = (kind) => {
    clearTimeout(boundaryTimer.current);

    setBoundary(kind);

    boundaryTimer.current = setTimeout(() => {
      setBoundary(null);
    }, 1100);
  };

  const popWicket = () => {
    setFlashWicket(true);

    setTimeout(() => {
      setFlashWicket(false);
    }, 600);
  };

  /*
  ====================================================
  GENERIC ACTION
  ====================================================
  */

  const act = async (fn) => {
    setError('');

    try {
      return await fn();
    } catch (err) {
      console.error(err);

      const message =
        err?.response?.data?.error ||
        err?.message ||
        'Something went wrong';

      setError(message);

      throw err;
    }
  };

  /*
  ====================================================
  BASIC LOADING
  ====================================================
  */

  if (!match) {
    return (
      <p className="text-slate-400">
        Loading…
      </p>
    );
  }

  /*
  ====================================================
  CURRENT INNINGS
  ====================================================
  */

  const currentInnings =
    innings.length > 0
      ? innings[innings.length - 1]
      : null;

  /*
  ====================================================
  MATCH COMPLETED
  ====================================================
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
  ====================================================
  INNINGS BREAK
  ====================================================
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
            try {
              setError('');

              await Matches.startSecondInnings(matchId);

              await loadFull();
            } catch (err) {
              setError(
                err?.response?.data?.error ||
                err?.message ||
                'Failed to start second innings'
              );
            }
          }}
        >
          Start 2nd Innings
        </button>

        {error && (
          <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-2 text-sm">
            {error}
          </div>
        )}
      </div>
    );
  }

  /*
  ====================================================
  NO INNINGS
  ====================================================
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
  ====================================================
  PLAYERS
  ====================================================
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
  ====================================================
  OUT PLAYERS
  ====================================================
  */

  const outIds = new Set(
    (currentInnings.battingCard || [])
      .filter((b) => b.is_out)
      .map((b) => b.player_id)
  );

  /*
  ====================================================
  CURRENT PLAYERS
  ====================================================
  */

  const striker = players.find(
    (p) => p.id === inn.striker_id
  );

  const nonStriker = players.find(
    (p) => p.id === inn.non_striker_id
  );

  const bowler = players.find(
    (p) => p.id === inn.current_bowler_id
  );

  /*
  ====================================================
  WHAT NEEDS TO BE SELECTED?
  ====================================================
  */

  const needBatsmen =
    !inn.striker_id ||
    !inn.non_striker_id;

  const needBowler =
    !needBatsmen &&
    !inn.current_bowler_id;

  /*
  ====================================================
  BALL
  ====================================================
  */

  const playBall = async (payload) => {
    if (savingBall) {
      return;
    }

    setError('');
    setSavingBall(true);

    try {
      /*
      Boundary animation
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

      /*
      Send ball to backend
      */

      const result = await Innings.ball(
        inn.id,
        payload
      );

      /*
      IMPORTANT:
      Update the current innings immediately
      from the API response.

      This prevents waiting for Socket.IO
      before the scorer screen changes.
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
      Refresh full scoreboard data so batting,
      bowling and recent balls are immediately
      correct too.
      */

      try {
        await loadFull();
      } catch {
        // Socket/API local update already happened.
      }

    } catch (err) {
      console.error('Ball error:', err);

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
  ====================================================
  SELECT BATSMEN
  ====================================================
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
        onSelect={async (strikerId, nonStrikerId) => {
          await act(async () => {
            const result = await Innings.setBatsmen(
              inn.id,
              {
                striker_id:
                  strikerId || inn.striker_id,
                non_striker_id:
                  nonStrikerId || inn.non_striker_id
              }
            );

            /*
            Update locally immediately.
            */

            if (result) {
              setInnings((prev) =>
                prev.map((item) =>
                  item?.innings?.id === inn.id
                    ? {
                        ...item,
                        innings:
                          result.innings ||
                          result
                      }
                    : item
                )
              );
            }

            await loadFull();
          });
        }}
      />
    );
  }

  /*
  ====================================================
  BOWLER SELECTION
  ====================================================

  IMPORTANT:
  This is the ONLY place where the bowler
  is selected.

  It is NOT selected during scoreboard creation.
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
            Choose the bowler before the next ball.
          </p>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-2 text-sm">
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

            await act(async () => {
              const result =
                await Innings.setBowler(
                  inn.id,
                  {
                    bowler_id: bowlerId
                  }
                );

              /*
              Immediately update local innings.
              */

              if (result) {
                setInnings((prev) =>
                  prev.map((item) =>
                    item?.innings?.id === inn.id
                      ? {
                          ...item,
                          innings:
                            result.innings ||
                            result
                        }
                      : item
                  )
                );
              }

              await loadFull();
            });
          }}
          teamId={inn.bowling_team_id}
          onCreated={handlePlayerCreated}
          placeholder="Type or select bowler…"
        />

        <div className="text-xs text-slate-500 text-center">
          The bowler is selected here, not when creating the scoreboard.
        </div>
      </div>
    );
  }

  /*
  ====================================================
  SCORER
  ====================================================
  */

  return (
    <div className="max-w-2xl mx-auto space-y-4 fade-in">

      {/* BOUNDARY */}
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

      {/* SCORE HEADER */}
      <div
        className={`card ${
          flashWicket
            ? 'wicket-flash'
            : ''
        }`}
      >
        <div className="flex justify-between items-center flex-wrap gap-2">

          <div>
            <div className="text-sm text-slate-400">
              {match.team1_short}
              {' '}vs{' '}
              {match.team2_short}
              {' '}·{' '}
              {match.overs_limit}
              {' '}overs
            </div>

            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              {inn.total_runs}

              <span className="text-slate-400">
                /{inn.total_wickets}
              </span>

              <span className="text-lg text-slate-400 font-medium">
                {' '}({currentInnings.overs} ov)
              </span>
            </div>
          </div>

          <div className="text-right text-sm text-slate-400">
            <div>
              RR: {currentInnings.runRate}
            </div>

            {inn.target && (
              <div>
                Target: {inn.target}
              </div>
            )}
          </div>
        </div>

        {/* PLAYERS */}
        <div className="grid grid-cols-2 gap-2 mt-3 text-sm">

          <div className="bg-slate-900/70 rounded-xl p-3">
            <div className="text-xs text-slate-500 mb-1">
              STRIKER
            </div>

            <div className="font-semibold">
              🏏 {striker?.name || '—'}
              {' '}
              <span className="text-emerald-400">
                ●
              </span>
            </div>
          </div>

          <div className="bg-slate-900/70 rounded-xl p-3">
            <div className="text-xs text-slate-500 mb-1">
              NON-STRIKER
            </div>

            <div className="font-semibold">
              🏏 {nonStriker?.name || '—'}
            </div>
          </div>

          {/* BOWLER */}
          <div className="bg-slate-900/70 rounded-xl p-3 col-span-2">
            <div className="text-xs text-slate-500 mb-1">
              BOWLING
            </div>

            <div className="font-semibold">
              🎯 {bowler?.name || '—'}
            </div>
          </div>
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      {/* RUNS */}
      <div className="card">

        <h3 className="font-semibold mb-2 text-sm text-slate-400">
          Runs
        </h3>

        <div className="grid grid-cols-4 gap-2">

          {[0, 1, 2, 3].map((r) => (
            <button
              key={r}
              disabled={savingBall}
              className="run-btn bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
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
            className="run-btn bg-gold hover:brightness-110 text-slate-900 disabled:opacity-50"
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
            className="run-btn bg-purple-600 hover:bg-purple-500 disabled:opacity-50"
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
            className="run-btn bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
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
            className="run-btn bg-gradient-to-br from-red-600 to-red-800 disabled:opacity-50"
            onClick={() =>
              setShowWicket(true)
            }
          >
            OUT
          </button>
        </div>

        {savingBall && (
          <div className="text-center text-xs text-slate-500 mt-3">
            Saving ball…
          </div>
        )}
      </div>

      {/* EXTRAS */}
      <div className="card">

        <h3 className="font-semibold mb-2 text-sm text-slate-400">
          Extras
        </h3>

        {!extraPicker ? (
          <div className="grid grid-cols-4 gap-2">

            <button
              disabled={savingBall}
              className="btn btn-secondary text-sm disabled:opacity-50"
              onClick={() =>
                setExtraPicker('wide')
              }
            >
              Wide
            </button>

            <button
              disabled={savingBall}
              className="btn btn-secondary text-sm disabled:opacity-50"
              onClick={() =>
                setExtraPicker('noball')
              }
            >
              No Ball
            </button>

            <button
              disabled={savingBall}
              className="btn btn-secondary text-sm disabled:opacity-50"
              onClick={() =>
                setExtraPicker('bye')
              }
            >
              Bye
            </button>

            <button
              disabled={savingBall}
              className="btn btn-secondary text-sm disabled:opacity-50"
              onClick={() =>
                setExtraPicker('legbye')
              }
            >
              Leg Bye
            </button>

          </div>
        ) : (
          <div className="fade-in">

            <div className="flex items-center justify-between mb-2">

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
                className="text-xs text-slate-400 hover:text-white"
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
                  className="run-btn bg-slate-700 hover:bg-slate-600 !text-base !py-3 disabled:opacity-50"
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

      {/* ACTIONS */}
      <div className="grid grid-cols-2 gap-2">

        <button
          disabled={savingBall}
          className="btn btn-secondary disabled:opacity-50"
          onClick={async () => {
            await act(async () => {
              await Innings.undo(inn.id);
              await loadFull();
            });
          }}
        >
          ↺ Undo
        </button>

        <button
          disabled={savingBall}
          className="btn btn-secondary disabled:opacity-50"
          onClick={async () => {
            await act(async () => {
              await Innings.swapStrike(inn.id);
              await loadFull();
            });
          }}
        >
          ⇄ Swap Batsmen
        </button>

      </div>

      {/* FULL SCOREBOARD */}
      <button
        className="btn btn-secondary w-full"
        onClick={() =>
          navigate(`/match/${matchId}/live`)
        }
      >
        View Full Scoreboard
      </button>

      {/* WICKET MODAL */}
      {showWicket && (
        <WicketModal
          striker={striker}
          nonStriker={nonStriker}
          fieldingPlayers={bowlingTeamPlayers}
          fieldingTeamId={inn.bowling_team_id}
          onPlayerCreated={handlePlayerCreated}
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
====================================================
SELECT BATSMEN
====================================================
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
  const [striker, setStriker] = useState(null);
  const [nonStriker, setNonStriker] = useState(null);

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
