```jsx
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

  const [changingBowler, setChangingBowler] = useState(false);
  const [changingBatsmen, setChangingBatsmen] = useState(false);

  const [selectedBowler, setSelectedBowler] = useState(null);
  const [selectedStriker, setSelectedStriker] = useState(null);
  const [selectedNonStriker, setSelectedNonStriker] = useState(null);

  const boundaryTimer = useRef(null);

  /*
   * LOAD MATCH
   */
  const loadFull = useCallback(() => {
    Matches.get(matchId)
      .then((d) => {
        setMatch(d.match);
        setPlayers(d.players || []);
        setInnings(d.innings || []);
      })
      .catch((e) => {
        setError(
          e?.response?.data?.error ||
          e?.message ||
          'Unable to load match'
        );
      });
  }, [matchId]);

  useEffect(() => {
    loadFull();
  }, [loadFull]);

  /*
   * SOCKET LIVE UPDATES
   */
  useEffect(() => {
    socket.emit('join-match', matchId);

    const onUpdate = ({ match: m, innings: i }) => {
      setMatch(m);
      setInnings(i || []);
    };

    socket.on('score-update', onUpdate);

    return () => {
      socket.emit('leave-match', matchId);
      socket.off('score-update', onUpdate);
    };
  }, [matchId]);

  /*
   * PLAYER CREATED
   */
  const handlePlayerCreated = useCallback((player) => {
    setPlayers((prev) => {
      const exists = prev.some((p) => p.id === player.id);

      if (exists) return prev;

      return [...prev, player];
    });
  }, []);

  /*
   * VISUAL EFFECTS
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
   * GENERIC ACTION HANDLER
   */
  const act = async (fn) => {
    setError('');

    try {
      await fn();

      /*
       * Small refresh after action.
       * Socket update should normally update immediately.
       * This also protects against missing socket events.
       */
      setTimeout(() => {
        loadFull();
      }, 100);
    } catch (e) {
      setError(
        e?.response?.data?.error ||
        e?.message ||
        'Something went wrong'
      );
    }
  };

  /*
   * PLAY BALL
   */
  const playBall = async (payload) => {
    if (!payload.extra_type && payload.runs === 4) {
      popBoundary('four');
    }

    if (!payload.extra_type && payload.runs === 6) {
      popBoundary('six');
    }

    setError('');

    try {
      await Innings.ball(inn.id, payload);

      /*
       * Reset extra selector after scoring.
       */
      setExtraPicker(null);

      /*
       * Refresh state immediately.
       */
      setTimeout(() => {
        loadFull();
      }, 80);
    } catch (e) {
      setError(
        e?.response?.data?.error ||
        e?.message ||
        'Unable to record ball'
      );
    }
  };

  /*
   * WAIT FOR MATCH
   */
  if (!match) {
    return (
      <div className="max-w-2xl mx-auto card text-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    );
  }

  const currentInnings = innings[innings.length - 1];

  /*
   * MATCH COMPLETED
   */
  if (match.status === 'completed') {
    return (
      <div className="max-w-lg mx-auto card text-center space-y-3 fade-in">
        <h1 className="text-2xl font-bold">
          🏆 Match Completed
        </h1>

        <p className="text-emerald-400 text-lg font-semibold">
          {match.result_text}
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
   * SAFETY
   */
  if (!currentInnings) {
    return (
      <div className="max-w-lg mx-auto card text-center">
        <p className="text-slate-400">
          Setting up innings…
        </p>
      </div>
    );
  }

  const inn = currentInnings.innings;

  /*
   * INNINGS BREAK
   */
  if (match.status === 'innings-break') {
    return (
      <div className="max-w-lg mx-auto card text-center space-y-4 fade-in">
        <h1 className="text-2xl font-bold">
          🏏 Innings Break
        </h1>

        <p className="text-slate-300 text-lg">
          {inn.total_runs}/{inn.total_wickets}
          {' '}in{' '}
          {currentInnings.overs}
          {' '}overs
        </p>

        <button
          className="btn btn-primary w-full"
          onClick={async () => {
            try {
              await Matches.startSecondInnings(matchId);
              loadFull();
            } catch (e) {
              setError(
                e?.response?.data?.error ||
                e?.message ||
                'Unable to start second innings'
              );
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
   * PLAYERS
   */
  const battingTeamPlayers = players.filter(
    (p) =>
      p.team_id === inn.batting_team_id &&
      p.active
  );

  const bowlingTeamPlayers = players.filter(
    (p) =>
      p.team_id === inn.bowling_team_id &&
      p.active
  );

  /*
   * OUT PLAYERS
   */
  const outIds = new Set(
    (currentInnings.battingCard || [])
      .filter((b) => b.is_out)
      .map((b) => b.player_id)
  );

  /*
   * CURRENT BATSMEN / BOWLER
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
   * BATSMEN REQUIRED
   */
  const needBatsmen =
    !inn.striker_id ||
    !inn.non_striker_id;

  /*
   * BOWLER REQUIRED
   */
  const needBowler =
    !needBatsmen &&
    !inn.current_bowler_id;

  /*
   * CURRENT OVER
   *
   * If overs string is something like 3.0,
   * then the last completed over has 6 balls.
   *
   * The backend remains the authority.
   */
  const ballsInOver =
    Number.isFinite(Number(currentInnings.overs))
      ? Math.round(
          (Number(currentInnings.overs) -
            Math.floor(Number(currentInnings.overs))) * 10
        )
      : 0;

  /*
   * SAME SCREEN BATSMEN SELECTION
   */
  if (needBatsmen || changingBatsmen) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 fade-in">

        <div className="card">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-slate-400">
                {match.team1_short} vs {match.team2_short}
              </div>

              <h1 className="text-2xl font-bold mt-1">
                Select Batsmen
              </h1>
            </div>

            {!needBatsmen && (
              <button
                className="text-sm text-slate-400 hover:text-white"
                onClick={() => {
                  setChangingBatsmen(false);
                  setSelectedStriker(null);
                  setSelectedNonStriker(null);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        <SelectBatsmen
          team={battingTeamPlayers}
          outIds={outIds}
          teamId={inn.batting_team_id}
          onPlayerCreated={handlePlayerCreated}
          hasStriker={false}
          hasNonStriker={false}
          initialStriker={striker}
          initialNonStriker={nonStriker}
          onSelect={(strikerId, nonStrikerId) =>
            act(async () => {
              await Innings.setBatsmen(inn.id, {
                striker_id:
                  strikerId || inn.striker_id,
                non_striker_id:
                  nonStrikerId || inn.non_striker_id,
              });

              setChangingBatsmen(false);
              setSelectedStriker(null);
              setSelectedNonStriker(null);
            })
          }
        />

        {error && (
          <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
            {error}
          </div>
        )}
      </div>
    );
  }

  /*
   * BOWLER SELECTION
   *
   * IMPORTANT:
   * This is now shown inside the scorer page,
   * not as a separate navigation page.
   */
  if (needBowler || changingBowler) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 fade-in">

        <div className="card">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-slate-400">
                {match.team1_short} vs {match.team2_short}
              </div>

              <div className="text-3xl font-extrabold mt-1">
                {inn.total_runs}
                <span className="text-slate-400">
                  /{inn.total_wickets}
                </span>
              </div>

              <div className="text-sm text-slate-400">
                {currentInnings.overs} overs
              </div>
            </div>

            {!needBowler && (
              <button
                className="text-sm text-slate-400 hover:text-white"
                onClick={() => {
                  setChangingBowler(false);
                  setSelectedBowler(null);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        <SelectBowler
          team={bowlingTeamPlayers}
          teamId={inn.bowling_team_id}
          onPlayerCreated={handlePlayerCreated}
          initialBowler={bowler}
          onSelect={(bowlerId) =>
            act(async () => {
              await Innings.setBowler(inn.id, {
                bowler_id: bowlerId,
              });

              setChangingBowler(false);
              setSelectedBowler(null);
            })
          }
          error={error}
        />
      </div>
    );
  }

  /*
   * MAIN SCORER
   */
  return (
    <div className="max-w-2xl mx-auto space-y-4 fade-in">

      {/* BOUNDARY ANIMATION */}
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
          flashWicket ? 'wicket-flash' : ''
        }`}
      >
        <div className="flex justify-between items-center gap-3">

          <div className="min-w-0">
            <div className="text-sm text-slate-400 truncate">
              {match.team1_short} vs {match.team2_short}
              {' · '}
              {match.overs_limit} overs
            </div>

            <div className="text-4xl sm:text-5xl font-extrabold tracking-tight mt-1">
              {inn.total_runs}
              <span className="text-slate-400">
                /{inn.total_wickets}
              </span>
            </div>

            <div className="text-base text-slate-400 mt-1">
              ({currentInnings.overs} ov)
            </div>
          </div>

          <div className="text-right text-sm text-slate-400">
            <div>
              RR:{' '}
              <span className="text-white font-semibold">
                {currentInnings.runRate}
              </span>
            </div>

            {inn.target && (
              <div className="mt-1">
                Target:{' '}
                <span className="text-white font-semibold">
                  {inn.target}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* PLAYERS */}
        <div className="grid grid-cols-2 gap-2 mt-4">

          <button
            className="bg-slate-900/80 rounded-xl p-3 text-left hover:bg-slate-800 transition"
            onClick={() => {
              setChangingBatsmen(true);
              setSelectedStriker(striker);
              setSelectedNonStriker(nonStriker);
            }}
          >
            <div className="text-xs text-slate-500">
              ON STRIKE
            </div>

            <div className="font-semibold truncate">
              🏏 {striker?.name || 'Select'}
              {' '}
              <span className="text-emerald-400">
                ●
              </span>
            </div>
          </button>

          <button
            className="bg-slate-900/80 rounded-xl p-3 text-left hover:bg-slate-800 transition"
            onClick={() => {
              setChangingBatsmen(true);
              setSelectedStriker(striker);
              setSelectedNonStriker(nonStriker);
            }}
          >
            <div className="text-xs text-slate-500">
              NON-STRIKER
            </div>

            <div className="font-semibold truncate">
              🏏 {nonStriker?.name || 'Select'}
            </div>
          </button>

          {/* BOWLER */}
          <button
            className="bg-slate-900/80 rounded-xl p-3 text-left hover:bg-slate-800 transition col-span-2"
            onClick={() => {
              setChangingBowler(true);
              setSelectedBowler(bowler);
            }}
          >
            <div className="text-xs text-slate-500">
              BOWLER
            </div>

            <div className="font-semibold truncate">
              🎯 {bowler?.name || 'Select bowler'}
            </div>

            <div className="text-xs text-slate-500 mt-1">
              Tap to change bowler
            </div>
          </button>
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      {/* RUN BUTTONS */}
      <div className="card">

        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-sm text-slate-400">
            RUNS
          </h3>

          <span className="text-xs text-slate-500">
            Tap to score
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2">

          {[0, 1, 2, 3].map((r) => (
            <button
              key={r}
              className="run-btn bg-slate-700 hover:bg-slate-600 active:scale-95 transition"
              onClick={() =>
                playBall({
                  runs: r,
                  extra_type: null,
                })
              }
            >
              {r}
            </button>
          ))}

          <button
            className="run-btn bg-gold hover:brightness-110 text-slate-900 active:scale-95 transition"
            onClick={() =>
              playBall({
                runs: 4,
                extra_type: null,
              })
            }
          >
            4
          </button>

          <button
            className="run-btn bg-purple-600 hover:bg-purple-500 active:scale-95 transition"
            onClick={() =>
              playBall({
                runs: 6,
                extra_type: null,
              })
            }
          >
            6
          </button>

          <button
            className="run-btn bg-slate-700 hover:bg-slate-600 active:scale-95 transition"
            onClick={() =>
              playBall({
                runs: 5,
                extra_type: null,
              })
            }
          >
            5
          </button>

          <button
            className="run-btn bg-gradient-to-br from-red-600 to-red-800 active:scale-95 transition"
            onClick={() => setShowWicket(true)}
          >
            OUT
          </button>
        </div>
      </div>

      {/* EXTRAS */}
      <div className="card">

        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-sm text-slate-400">
            EXTRAS
          </h3>

          {extraPicker && (
            <button
              className="text-xs text-slate-400 hover:text-white"
              onClick={() => setExtraPicker(null)}
            >
              ✕ Cancel
            </button>
          )}
        </div>

        {!extraPicker ? (
          <div className="grid grid-cols-4 gap-2">

            <button
              className="btn btn-secondary text-sm"
              onClick={() => setExtraPicker('wide')}
            >
              Wide
            </button>

            <button
              className="btn btn-secondary text-sm"
              onClick={() => setExtraPicker('noball')}
            >
              No Ball
            </button>

            <button
              className="btn btn-secondary text-sm"
              onClick={() => setExtraPicker('bye')}
            >
              Bye
            </button>

            <button
              className="btn btn-secondary text-sm"
              onClick={() => setExtraPicker('legbye')}
            >
              Leg Bye
            </button>
          </div>
        ) : (
          <div className="fade-in">

            <div className="mb-3 text-sm font-medium text-slate-300">
              {extraPicker === 'wide' &&
                'Wide — select total extra runs'}

              {extraPicker === 'noball' &&
                'No Ball — select bat runs'}

              {extraPicker === 'bye' &&
                'Bye — select runs'}

              {extraPicker === 'legbye' &&
                'Leg Bye — select runs'}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">

              {[0, 1, 2, 3, 4, 6].map((r) => (
                <button
                  key={r}
                  className="run-btn bg-slate-700 hover:bg-slate-600 !text-base !py-3 active:scale-95 transition"
                  onClick={() => {

                    const type = extraPicker;

                    setExtraPicker(null);

                    if (type === 'wide') {
                      playBall({
                        extra_type: 'wide',
                        extra_runs: 1 + r,
                      });
                    }

                    else if (type === 'noball') {
                      playBall({
                        extra_type: 'noball',
                        extra_runs: 1,
                        runs: r,
                      });
                    }

                    else if (type === 'bye') {
                      playBall({
                        extra_type: 'bye',
                        extra_runs: Math.max(r, 1),
                      });
                    }

                    else if (type === 'legbye') {
                      playBall({
                        extra_type: 'legbye',
                        extra_runs: Math.max(r, 1),
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

      {/* QUICK ACTIONS */}
      <div className="grid grid-cols-2 gap-2">

        <button
          className="btn btn-secondary"
          onClick={() =>
            act(() => Innings.undo(inn.id))
          }
        >
          ↺ Undo
        </button>

        <button
          className="btn btn-secondary"
          onClick={() =>
            act(() => Innings.swapStrike(inn.id))
          }
        >
          ⇄ Swap
        </button>
      </div>

      {/* CHANGE BOWLER */}
      <button
        className="btn btn-secondary w-full"
        onClick={() => {
          setChangingBowler(true);
          setSelectedBowler(bowler);
        }}
      >
        🎯 Change Bowler
      </button>

      {/* SCOREBOARD */}
      <button
        className="btn btn-secondary w-full"
        onClick={() =>
          navigate(`/match/${matchId}/live`)
        }
      >
        📊 View Full Scoreboard
      </button>

      {/* WICKET MODAL */}
      {showWicket && (
        <WicketModal
          striker={striker}
          nonStriker={nonStriker}
          fieldingPlayers={bowlingTeamPlayers}
          fieldingTeamId={inn.bowling_team_id}
          onPlayerCreated={handlePlayerCreated}
          onClose={() => setShowWicket(false)}

          onConfirm={({
            wicketType,
            dismissedId,
            fielderId,
            runsBeforeWicket,
          }) => {

            setShowWicket(false);

            popWicket();

            playBall({
              runs:
                wicketType === 'run-out'
                  ? runsBeforeWicket
                  : 0,

              is_wicket: true,
              wicket_type: wicketType,
              dismissed_id: dismissedId,
              fielder_id: fielderId,
            });
          }}
        />
      )}
    </div>
  );
}


/*
 * ============================================================
 * SELECT BATSMEN
 * ============================================================
 */

function SelectBatsmen({
  team,
  outIds,
  teamId,
  onPlayerCreated,
  onSelect,
  initialStriker,
  initialNonStriker,
}) {
  const [striker, setStriker] =
    useState(initialStriker || null);

  const [nonStriker, setNonStriker] =
    useState(initialNonStriker || null);

  const available = team.filter(
    (p) => !outIds.has(p.id)
  );

  const canConfirm =
    striker &&
    nonStriker &&
    striker.id !== nonStriker.id;

  return (
    <div className="card space-y-5">

      <div>
        <h2 className="text-xl font-bold">
          🏏 Select Batsmen
        </h2>

        <p className="text-sm text-slate-400 mt-1">
          Choose the two batsmen currently at the crease.
        </p>
      </div>

      {/* STRIKER */}
      <div>
        <label className="text-sm text-slate-400 mb-2 block">
          On Strike
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

      {/* NON STRIKER */}
      <div>
        <label className="text-sm text-slate-400 mb-2 block">
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

      <button
        className="btn btn-primary w-full"
        disabled={!canConfirm}
        onClick={() =>
          onSelect(
            striker.id,
            nonStriker.id
          )
        }
      >
        Confirm Batsmen
      </button>
    </div>
  );
}


/*
 * ============================================================
 * SELECT BOWLER
 * ============================================================
 */

function SelectBowler({
  team,
  teamId,
  onPlayerCreated,
  onSelect,
  error,
  initialBowler,
}) {
  const [bowler, setBowler] =
    useState(initialBowler || null);

  return (
    <div className="card space-y-5">

      <div>
        <h2 className="text-xl font-bold">
          🎯 Select Bowler
        </h2>

        <p className="text-sm text-slate-400 mt-1">
          Select the bowler for the next over.
        </p>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      <PlayerAutocomplete
        players={team}
        value={bowler}
        onChange={setBowler}
        teamId={teamId}
        onCreated={onPlayerCreated}
        placeholder="Type or add bowler's name…"
      />

      <button
        className="btn btn-primary w-full"
        disabled={!bowler}
        onClick={() =>
          onSelect(bowler.id)
        }
      >
        🎯 Confirm Bowler
      </button>
    </div>
  );
}
```
