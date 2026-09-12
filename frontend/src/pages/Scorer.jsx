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
  const [nextBowlerId, setNextBowlerId] = useState('');

  const [showExtraPicker, setShowExtraPicker] = useState(false);
  const [error, setError] = useState('');
  const [boundary, setBoundary] = useState(null);
  const [flashWicket, setFlashWicket] = useState(false);

  const [savingBall, setSavingBall] = useState(false);
  const [pendingBall, setPendingBall] = useState(null);

  const [selectingBowler, setSelectingBowler] = useState(false);
  const [showFullScoreboard, setShowFullScoreboard] = useState(false);

  const boundaryTimer = useRef(null);
  const wicketTimer = useRef(null);

  const loadFull = useCallback(async () => {
    try {
      setError('');

      const data = await Matches.get(matchId);

      setMatch(data?.match || data);
      setPlayers(data?.players || []);
      setInnings(data?.innings || []);
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.error ||
        err?.message ||
        'Failed to load match'
      );
    }
  }, [matchId]);

  useEffect(() => {
    loadFull();

    socket.emit('join-match', matchId);

    const onScoreUpdate = (payload) => {
      if (!payload) return;

      if (payload.innings) {
        setInnings((prev) =>
          prev.map((inn) =>
            inn.id === payload.innings.id
              ? { ...inn, ...payload.innings }
              : inn
          )
        );
      }

      if (payload.scoreboard?.innings) {
        setInnings((prev) =>
          prev.map((inn) =>
            inn.id === payload.scoreboard.innings.id
              ? { ...inn, ...payload.scoreboard.innings }
              : inn
          )
        );
      }
    };

    socket.on('score-update', onScoreUpdate);

    return () => {
      socket.off('score-update', onScoreUpdate);

      if (boundaryTimer.current) {
        clearTimeout(boundaryTimer.current);
      }

      if (wicketTimer.current) {
        clearTimeout(wicketTimer.current);
      }
    };
  }, [matchId, loadFull]);

  const currentInnings =
    innings?.find((i) => i.status === 'live') ||
    innings?.[innings.length - 1];

  const currentBattingCard =
    currentInnings?.battingCard ||
    currentInnings?.batting_card ||
    [];

  const currentBowlingCard =
    currentInnings?.bowlingCard ||
    currentInnings?.bowling_card ||
    [];

  const striker =
    players.find((p) => p.id === currentInnings?.striker_id) || null;

  const nonStriker =
    players.find((p) => p.id === currentInnings?.non_striker_id) || null;

  const currentBowler =
    players.find((p) => p.id === currentInnings?.bowler_id) || null;

  const totalRuns = Number(currentInnings?.runs || 0);
  const totalWickets = Number(currentInnings?.wickets || 0);
  const totalBalls = Number(currentInnings?.balls || 0);

  /*
   * IMPORTANT:
   * `balls` from backend is the number of LEGAL balls.
   *
   * Therefore:
   * - Wide      = does NOT increase ball count
   * - No Ball   = does NOT increase ball count
   * - Bye       = legal ball
   * - Leg Bye   = legal ball
   * - Normal    = legal ball
   */
  const legalBalls = totalBalls;

  const overs = `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;

  const currentOverNumber =
    Math.floor(legalBalls / 6) + 1;

  /*
   * When exactly 6 legal balls are completed, immediately
   * show an empty new over.
   */
  const overJustFinished =
    legalBalls > 0 && legalBalls % 6 === 0;

  const currentOver =
    currentInnings?.currentOver ||
    currentInnings?.current_over ||
    [];

  const displayedCurrentOver = overJustFinished
    ? []
    : Array.isArray(currentOver)
      ? currentOver
      : [];

  const extras = {
    wide: Number(
      currentInnings?.extras?.wide ??
      currentInnings?.wide ??
      0
    ),
    noball: Number(
      currentInnings?.extras?.noball ??
      currentInnings?.noball ??
      0
    ),
    bye: Number(
      currentInnings?.extras?.bye ??
      currentInnings?.bye ??
      0
    ),
    legbye: Number(
      currentInnings?.extras?.legbye ??
      currentInnings?.legbye ??
      0
    ),
    penalty: Number(
      currentInnings?.extras?.penalty ??
      currentInnings?.penalty ??
      0
    ),
  };

  const totalExtras =
    extras.wide +
    extras.noball +
    extras.bye +
    extras.legbye +
    extras.penalty;

  const partnership =
    currentInnings?.partnership || {
      runs: 0,
      balls: 0,
    };

  const fallOfWickets = Array.isArray(
    currentInnings?.fallOfWickets
  )
    ? currentInnings.fallOfWickets
    : [];

  const updateCurrentInnings = (updated) => {
    if (!updated?.id) return;

    setInnings((prev) =>
      prev.map((inn) =>
        inn.id === updated.id
          ? { ...inn, ...updated }
          : inn
      )
    );
  };

  const popBoundary = (runs) => {
    setBoundary(runs);

    if (boundaryTimer.current) {
      clearTimeout(boundaryTimer.current);
    }

    boundaryTimer.current = setTimeout(() => {
      setBoundary(null);
    }, 900);
  };

  const popWicket = () => {
    setFlashWicket(true);

    if (wicketTimer.current) {
      clearTimeout(wicketTimer.current);
    }

    wicketTimer.current = setTimeout(() => {
      setFlashWicket(false);
    }, 1000);
  };

  /*
   * Swap batsmen using the existing set-batsmen API.
   */
  const swapBatsmen = async () => {
    if (
      savingBall ||
      !currentInnings?.striker_id ||
      !currentInnings?.non_striker_id
    ) {
      return;
    }

    try {
      setError('');

      const result = await Innings.setBatsmen(
        currentInnings.id,
        {
          striker_id: currentInnings.non_striker_id,
          non_striker_id: currentInnings.striker_id,
        }
      );

      if (result?.innings) {
        updateCurrentInnings(result.innings);
      }

      await loadFull();
    } catch (err) {
      console.error(err);

      setError(
        err?.response?.data?.error ||
        err?.message ||
        'Failed to swap batsmen'
      );
    }
  };

  /*
   * Optimistic UI.
   *
   * IMPORTANT:
   * Only legal balls increment `balls`.
   * Wide and no-ball are not legal deliveries.
   */
  const optimisticBall = (
    payload,
    currentInn,
    battingCard,
    bowlingCard,
    currentOverData
  ) => {
    const extraType = payload?.extra_type || null;

    const isWide = extraType === 'wide';
    const isNoBall = extraType === 'noball';

    const isLegal =
      payload?.is_legal !== undefined
        ? Boolean(payload.is_legal)
        : !isWide && !isNoBall;

    const batsmanRuns = Number(
      payload?.runs_batsman || 0
    );

    const extraRuns = Number(
      payload?.extra_runs || 0
    );

    const teamRuns =
      batsmanRuns + extraRuns;

    /*
     * ONLY legal delivery increments ball count.
     */
    const newBalls =
      Number(currentInn?.balls || 0) +
      (isLegal ? 1 : 0);

    const newRuns =
      Number(currentInn?.runs || 0) +
      teamRuns;

    const newWickets =
      Number(currentInn?.wickets || 0) +
      (payload?.is_wicket ? 1 : 0);

    let newStrikerId =
      currentInn?.striker_id;

    let newNonStrikerId =
      currentInn?.non_striker_id;

    /*
     * Odd batsman runs change strike.
     * Extras alone do not change strike except
     * normal over completion.
     */
    if (isLegal && batsmanRuns % 2 === 1) {
      [
        newStrikerId,
        newNonStrikerId,
      ] = [
        newNonStrikerId,
        newStrikerId,
      ];
    }

    /*
     * At the end of a legal over, strike changes.
     */
    if (
      isLegal &&
      newBalls > 0 &&
      newBalls % 6 === 0
    ) {
      [
        newStrikerId,
        newNonStrikerId,
      ] = [
        newNonStrikerId,
        newStrikerId,
      ];
    }

    const updatedInn = {
      ...currentInn,
      runs: newRuns,
      wickets: newWickets,
      balls: newBalls,
      striker_id: newStrikerId,
      non_striker_id: newNonStrikerId,
    };

    let newBattingCard = Array.isArray(battingCard)
      ? [...battingCard]
      : [];

    let newBowlingCard = Array.isArray(bowlingCard)
      ? [...bowlingCard]
      : [];

    const batsmanIndex =
      newBattingCard.findIndex(
        (row) =>
          row.player_id === payload.batsman_id
      );

    if (batsmanIndex >= 0) {
      const row = {
        ...newBattingCard[batsmanIndex],
      };

      row.runs =
        Number(row.runs || 0) +
        batsmanRuns;

      if (isLegal) {
        row.balls =
          Number(row.balls || 0) + 1;
      }

      if (batsmanRuns === 4) {
        row.fours =
          Number(row.fours || 0) + 1;
      }

      if (batsmanRuns === 6) {
        row.sixes =
          Number(row.sixes || 0) + 1;
      }

      if (payload?.is_wicket) {
        row.is_out = 1;
      }

      newBattingCard[batsmanIndex] = row;
    }

    const bowlerIndex =
      newBowlingCard.findIndex(
        (row) =>
          row.player_id === payload.bowler_id
      );

    if (bowlerIndex >= 0) {
      const row = {
        ...newBowlingCard[bowlerIndex],
      };

      row.runs_conceded =
        Number(row.runs_conceded || 0) +
        (
          isWide || isNoBall
            ? teamRuns
            : batsmanRuns
        );

      if (isLegal) {
        row.balls =
          Number(row.balls || 0) + 1;
      }

      if (payload?.is_wicket) {
        row.wickets =
          Number(row.wickets || 0) + 1;
      }

      newBowlingCard[bowlerIndex] = row;
    }

    /*
     * Do not show an old over after exactly 6 legal balls.
     */
    let newCurrentOver = Array.isArray(
      currentOverData
    )
      ? [...currentOverData]
      : [];

    newCurrentOver.push({
      ...payload,
      team_runs: teamRuns,
      is_legal: isLegal,
    });

    if (
      isLegal &&
      newBalls > 0 &&
      newBalls % 6 === 0
    ) {
      newCurrentOver = [];
    }

    setInnings((prev) =>
      prev.map((inn) =>
        inn.id === currentInn.id
          ? {
              ...inn,
              ...updatedInn,
              battingCard:
                newBattingCard,
              bowlingCard:
                newBowlingCard,
              currentOver:
                newCurrentOver,
            }
          : inn
      )
    );

    setPendingBall({
      ...payload,
      team_runs: teamRuns,
      is_legal: isLegal,
    });

    return updatedInn;
  };

  const playBall = async (payload) => {
    if (savingBall) return;

    if (!currentInnings) {
      setError('No active innings');
      return;
    }

    if (
      !currentInnings.striker_id ||
      !currentInnings.non_striker_id
    ) {
      setError('Please select both batsmen');
      return;
    }

    if (!currentInnings.bowler_id) {
      setError('Please select a bowler');
      return;
    }

    try {
      setSavingBall(true);
      setError('');

      const currentInn = currentInnings;

      optimisticBall(
        payload,
        currentInn,
        currentBattingCard,
        currentBowlingCard,
        currentOver
      );

      if (
        Number(payload?.runs_batsman || 0) === 4 ||
        Number(payload?.runs_batsman || 0) === 6
      ) {
        popBoundary(
          Number(payload.runs_batsman)
        );
      }

      if (payload?.is_wicket) {
        popWicket();
      }

      const result = await Innings.ball(
        currentInn.id,
        payload
      );

      setPendingBall(null);

      if (result?.innings) {
        updateCurrentInnings(
          result.innings
        );
      }

      if (result?.scoreboard?.innings) {
        updateCurrentInnings(
          result.scoreboard.innings
        );
      }

      if (result?.overJustCompleted) {
        setShowNextBowler(true);
        setNextBowlerId('');
      }

      if (
        result?.innings?.status === 'completed' ||
        result?.scoreboard?.innings?.status ===
          'completed'
      ) {
        await loadFull();
      }
    } catch (err) {
      console.error(err);

      setPendingBall(null);

      setError(
        err?.response?.data?.error ||
        err?.message ||
        'Failed to record ball'
      );

      await loadFull();
    } finally {
      setSavingBall(false);
    }
  };

  const recordRuns = async (runs) => {
    await playBall({
      batsman_id:
        currentInnings.striker_id,
      non_striker_id:
        currentInnings.non_striker_id,
      bowler_id:
        currentInnings.bowler_id,
      runs_batsman: runs,
      extra_type: null,
      extra_runs: 0,
      is_wicket: false,
      wicket_type: null,
      dismissed_id: null,
      fielder_id: null,
      is_legal: true,
      commentary: '',
    });
  };

  const recordExtra = async (type) => {
    setShowExtraPicker(false);

    let extraRuns = 1;

    await playBall({
      batsman_id:
        currentInnings.striker_id,
      non_striker_id:
        currentInnings.non_striker_id,
      bowler_id:
        currentInnings.bowler_id,
      runs_batsman: 0,
      extra_type: type,
      extra_runs: extraRuns,
      is_wicket: false,
      wicket_type: null,
      dismissed_id: null,
      fielder_id: null,

      /*
       * Wide and No Ball are NOT legal.
       * Bye and Leg Bye ARE legal.
       */
      is_legal:
        type !== 'wide' &&
        type !== 'noball',

      commentary: '',
    });
  };

  const handleWicket = async (data) => {
    setShowWicket(false);

    await playBall({
      batsman_id:
        currentInnings.striker_id,
      non_striker_id:
        currentInnings.non_striker_id,
      bowler_id:
        currentInnings.bowler_id,
      runs_batsman: Number(
        data?.runs_batsman || 0
      ),
      extra_type:
        data?.extra_type || null,
      extra_runs: Number(
        data?.extra_runs || 0
      ),
      is_wicket: true,
      wicket_type:
        data?.wicket_type || 'bowled',
      dismissed_id:
        data?.dismissed_id ||
        currentInnings.striker_id,
      fielder_id:
        data?.fielder_id || null,
      is_legal:
        data?.is_legal !== undefined
          ? data.is_legal
          : true,
      commentary:
        data?.commentary || '',
    });
  };

  const setBatsmen = async (
    strikerId,
    nonStrikerId
  ) => {
    try {
      const result =
        await Innings.setBatsmen(
          currentInnings.id,
          {
            striker_id: strikerId,
            non_striker_id:
              nonStrikerId,
          }
        );

      if (result?.innings) {
        updateCurrentInnings(
          result.innings
        );
      }

      await loadFull();
    } catch (err) {
      setError(
        err?.response?.data?.error ||
        err?.message ||
        'Failed to set batsmen'
      );
    }
  };

  const setBowler = async (bowlerId) => {
    try {
      setSelectingBowler(true);
      setError('');

      const result =
        await Innings.setBowler(
          currentInnings.id,
          {
            bowler_id: bowlerId,
          }
        );

      if (result?.innings) {
        updateCurrentInnings(
          result.innings
        );
      }

      setShowNextBowler(false);
      setNextBowlerId('');

      await loadFull();
    } catch (err) {
      setError(
        err?.response?.data?.error ||
        err?.message ||
        'Failed to set bowler'
      );
    } finally {
      setSelectingBowler(false);
    }
  };

  if (!match || !currentInnings) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-3xl mb-3">🏏</div>
          <p className="text-slate-300">
            Loading scoreboard...
          </p>

          {error && (
            <p className="text-red-400 text-sm mt-3">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (
    currentInnings.status === 'completed'
  ) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-4">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="mb-5 px-4 py-2 rounded-xl bg-slate-800"
          >
            ← Back
          </button>

          <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 text-center">
            <div className="text-5xl mb-4">
              🏏
            </div>

            <h1 className="text-2xl font-bold">
              Innings Completed
            </h1>

            <div className="text-5xl font-black mt-4">
              {totalRuns}/{totalWickets}
            </div>

            <div className="text-slate-400 mt-2">
              {overs} overs
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-10">
      <div className="max-w-5xl mx-auto px-3 sm:px-5 pt-3">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => navigate(-1)}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm"
          >
            ← Back
          </button>

          <div className="text-right">
            <div className="text-xs text-slate-400">
              LIVE SCORING
            </div>

            <div className="font-bold">
              {match?.name ||
                match?.title ||
                'Cricket Match'}
            </div>
          </div>
        </div>

        {/* SCORE HEADER */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400">
                {currentInnings.team_name ||
                  currentInnings.batting_team ||
                  'Batting'}
              </div>

              <div className="flex items-end gap-2 mt-1">
                <span className="text-4xl sm:text-5xl font-black">
                  {totalRuns}
                </span>

                <span className="text-2xl sm:text-3xl text-slate-400 font-bold">
                  /
                  {totalWickets}
                </span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs text-slate-400">
                OVERS
              </div>

              <div className="text-2xl font-bold">
                {overs}
              </div>

              <div className="text-[10px] text-slate-500 mt-1">
                {legalBalls} legal balls
              </div>
            </div>
          </div>
        </div>

        {/* CURRENT PLAYERS */}
        <div className="mt-3 rounded-2xl bg-slate-900 border border-slate-800 p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold">
              CURRENT BATTERS
            </h2>

            <button
              onClick={swapBatsmen}
              disabled={
                savingBall ||
                !striker ||
                !nonStriker
              }
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 active:scale-95 disabled:opacity-40"
            >
              ↔ Swap
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <BatterRow
              player={striker}
              active
              label="STRIKER"
            />

            <BatterRow
              player={nonStriker}
              label="NON-STRIKER"
            />
          </div>

          {/* PARTNERSHIP */}
          <div className="mt-2 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-500">
                PARTNERSHIP
              </div>

              <div className="font-bold">
                {partnership.runs || 0}{' '}
                <span className="text-slate-500 font-normal">
                  ({partnership.balls || 0})
                </span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] text-slate-500">
                WICKETS
              </div>

              <div className="font-bold">
                {totalWickets}
              </div>
            </div>
          </div>
        </div>

        {/* BOWLER */}
        <div className="mt-3 rounded-2xl bg-slate-900 border border-slate-800 p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-500 uppercase">
                CURRENT BOWLER
              </div>

              <div className="font-bold mt-0.5">
                {currentBowler?.name ||
                  'Select bowler'}
              </div>
            </div>

            <button
              onClick={() =>
                setSelectingBowler(true)
              }
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs"
            >
              Change
            </button>
          </div>
        </div>

        {/* CURRENT OVER */}
        <div className="mt-3 rounded-2xl bg-slate-900 border border-slate-800 p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-sm font-bold">
                CURRENT OVER
              </h2>

              <div className="text-[10px] text-slate-500">
                OVER {currentOverNumber}
              </div>
            </div>

            <div className="text-xs text-slate-500">
              {displayedCurrentOver.length}/6
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {displayedCurrentOver.length === 0 ? (
              <div className="text-xs text-slate-500 py-2">
                New over — ready for next ball
              </div>
            ) : (
              displayedCurrentOver.map(
                (ball, index) => (
                  <BallChip
                    key={index}
                    ball={ball}
                  />
                )
              )
            )}

            {!overJustFinished &&
              pendingBall && (
                <BallChip
                  ball={pendingBall}
                  pending
                />
              )}
          </div>
        </div>

        {/* =====================================================
            COMPACT SCORE RUNS
        ====================================================== */}
        <div className="mt-3 rounded-2xl bg-slate-900 border border-slate-800 p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-sm font-bold">
                SCORE RUNS
              </h2>

              <div className="text-[10px] text-slate-500">
                Tap once to record the ball
              </div>
            </div>

            <div className="text-[10px] px-2 py-1 rounded-lg bg-slate-800 text-slate-400">
              {legalBalls % 6}/6 balls
            </div>
          </div>

          {/* SMALL RUN BUTTONS */}
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((runs) => (
              <button
                key={runs}
                disabled={savingBall}
                onClick={() => recordRuns(runs)}
                className="
                  h-12
                  rounded-xl
                  bg-slate-800
                  border border-slate-700
                  hover:bg-slate-700
                  active:scale-95
                  transition
                  disabled:opacity-40
                  font-bold
                  text-lg
                "
              >
                {runs}
              </button>
            ))}

            <button
              disabled={savingBall}
              onClick={() => recordRuns(4)}
              className="
                h-12
                rounded-xl
                bg-emerald-900/50
                border border-emerald-700/50
                hover:bg-emerald-800/60
                active:scale-95
                transition
                disabled:opacity-40
                font-bold
                text-lg
              "
            >
              4
            </button>

            <button
              disabled={savingBall}
              onClick={() => recordRuns(6)}
              className="
                h-12
                rounded-xl
                bg-amber-900/50
                border border-amber-700/50
                hover:bg-amber-800/60
                active:scale-95
                transition
                disabled:opacity-40
                font-bold
                text-lg
              "
            >
              6
            </button>

            {/* SWAP INSIDE SCORE FIELD */}
            <button
              disabled={
                savingBall ||
                !striker ||
                !nonStriker
              }
              onClick={swapBatsmen}
              className="
                col-span-2
                h-12
                rounded-xl
                bg-indigo-900/40
                border border-indigo-700/50
                text-indigo-200
                hover:bg-indigo-800/50
                active:scale-[0.98]
                transition
                disabled:opacity-40
                font-bold
                text-sm
              "
            >
              ↔ SWAP BATSMEN
            </button>
          </div>

          {/* EXTRAS + WICKET */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              disabled={savingBall}
              onClick={() =>
                setShowExtraPicker(
                  (v) => !v
                )
              }
              className="
                h-11
                rounded-xl
                bg-slate-800
                border border-slate-700
                active:scale-95
                transition
                disabled:opacity-40
                text-sm
                font-semibold
              "
            >
              + EXTRAS
            </button>

            <button
              disabled={savingBall}
              onClick={() =>
                setShowWicket(true)
              }
              className="
                h-11
                rounded-xl
                bg-red-900/40
                border border-red-700/50
                text-red-200
                active:scale-95
                transition
                disabled:opacity-40
                text-sm
                font-bold
              "
            >
              WICKET
            </button>
          </div>

          {/* EXTRA PICKER */}
          {showExtraPicker && (
            <div className="grid grid-cols-4 gap-2 mt-2">
              <button
                disabled={savingBall}
                onClick={() =>
                  recordExtra('wide')
                }
                className="h-10 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold"
              >
                WIDE
              </button>

              <button
                disabled={savingBall}
                onClick={() =>
                  recordExtra('noball')
                }
                className="h-10 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold"
              >
                NO BALL
              </button>

              <button
                disabled={savingBall}
                onClick={() =>
                  recordExtra('bye')
                }
                className="h-10 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold"
              >
                BYE
              </button>

              <button
                disabled={savingBall}
                onClick={() =>
                  recordExtra('legbye')
                }
                className="h-10 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold"
              >
                LEG BYE
              </button>
            </div>
          )}
        </div>

        {/* EXTRAS SINGLE LINE */}
        <div className="mt-3 rounded-2xl bg-slate-900 border border-slate-800 p-3">
          <div className="text-[10px] text-slate-500 mb-2">
            EXTRAS
          </div>

          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap">
            <ExtraInline
              label="WD"
              value={extras.wide}
            />

            <ExtraInline
              label="NB"
              value={extras.noball}
            />

            <ExtraInline
              label="B"
              value={extras.bye}
            />

            <ExtraInline
              label="LB"
              value={extras.legbye}
            />

            <ExtraInline
              label="P"
              value={extras.penalty}
            />

            <div className="ml-auto shrink-0 px-3 py-2 rounded-lg bg-slate-800">
              <span className="text-[10px] text-slate-500">
                TOTAL
              </span>

              <span className="ml-2 font-bold">
                {totalExtras}
              </span>
            </div>
          </div>
        </div>

        {/* ERROR */}
        {error && (
          <div className="mt-3 rounded-xl bg-red-950/50 border border-red-800 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* FULL SCOREBOARD BUTTON */}
        <button
          onClick={() =>
            setShowFullScoreboard(
              (v) => !v
            )
          }
          className="w-full mt-4 h-11 rounded-xl bg-slate-800 border border-slate-700 font-semibold text-sm"
        >
          {showFullScoreboard
            ? '▲ Hide Full Scoreboard'
            : '▼ Full Scoreboard'}
        </button>

        {/* =====================================================
            FULL SCOREBOARD
        ====================================================== */}
        {showFullScoreboard && (
          <div className="mt-3 space-y-3">

            {/* BATTING */}
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3">
              <h3 className="text-sm font-bold mb-3">
                BATTING
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] text-slate-500 border-b border-slate-800">
                      <th className="text-left py-2">
                        BATTER
                      </th>
                      <th className="text-right">
                        R
                      </th>
                      <th className="text-right">
                        B
                      </th>
                      <th className="text-right">
                        4s
                      </th>
                      <th className="text-right">
                        6s
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {currentBattingCard.map(
                      (row, index) => {
                        const player =
                          players.find(
                            (p) =>
                              p.id ===
                              row.player_id
                          );

                        return (
                          <tr
                            key={
                              row.player_id ||
                              index
                            }
                            className="border-b border-slate-800/60"
                          >
                            <td className="py-2 font-medium">
                              {player?.name ||
                                row.player_name ||
                                'Player'}

                              {row.player_id ===
                                currentInnings.striker_id && (
                                <span className="ml-1 text-emerald-400">
                                  *
                                </span>
                              )}
                            </td>

                            <td className="text-right font-bold">
                              {row.runs || 0}
                            </td>

                            <td className="text-right text-slate-400">
                              {row.balls || 0}
                            </td>

                            <td className="text-right text-slate-400">
                              {row.fours || 0}
                            </td>

                            <td className="text-right text-slate-400">
                              {row.sixes || 0}
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* BOWLING */}
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3">
              <h3 className="text-sm font-bold mb-3">
                BOWLING
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] text-slate-500 border-b border-slate-800">
                      <th className="text-left py-2">
                        BOWLER
                      </th>
                      <th className="text-right">
                        O
                      </th>
                      <th className="text-right">
                        R
                      </th>
                      <th className="text-right">
                        W
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {currentBowlingCard.map(
                      (row, index) => {
                        const player =
                          players.find(
                            (p) =>
                              p.id ===
                              row.player_id
                          );

                        const ballsBowled =
                          Number(
                            row.balls || 0
                          );

                        const bowlerOvers =
                          `${Math.floor(
                            ballsBowled / 6
                          )}.${ballsBowled % 6}`;

                        return (
                          <tr
                            key={
                              row.player_id ||
                              index
                            }
                            className="border-b border-slate-800/60"
                          >
                            <td className="py-2 font-medium">
                              {player?.name ||
                                row.player_name ||
                                'Bowler'}
                            </td>

                            <td className="text-right text-slate-400">
                              {bowlerOvers}
                            </td>

                            <td className="text-right">
                              {row.runs_conceded ||
                                0}
                            </td>

                            <td className="text-right font-bold">
                              {row.wickets || 0}
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* PARTNERSHIP */}
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3">
              <h3 className="text-sm font-bold mb-3">
                PARTNERSHIP
              </h3>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-black">
                    {partnership.runs || 0}
                  </div>

                  <div className="text-xs text-slate-500">
                    runs
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-2xl font-bold">
                    {partnership.balls || 0}
                  </div>

                  <div className="text-xs text-slate-500">
                    balls
                  </div>
                </div>
              </div>
            </div>

            {/* FALL OF WICKETS */}
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3">
              <h3 className="text-sm font-bold mb-3">
                FALL OF WICKETS
              </h3>

              {fallOfWickets.length === 0 ? (
                <div className="text-sm text-slate-500">
                  No wickets yet
                </div>
              ) : (
                <div className="space-y-2">
                  {fallOfWickets.map(
                    (wicket, index) => {
                      const playerId =
                        wicket.player_id ??
                        wicket.dismissed_id;

                      const player =
                        players.find(
                          (p) =>
                            p.id === playerId
                        );

                      const score =
                        wicket.score ??
                        wicket.runs ??
                        0;

                      const over =
                        wicket.over ??
                        wicket.over_display ??
                        '';

                      return (
                        <div
                          key={
                            wicket.id ||
                            `${playerId}-${index}`
                          }
                          className="flex items-center justify-between rounded-xl bg-slate-950 border border-slate-800 px-3 py-2"
                        >
                          <div>
                            <div className="font-semibold text-sm">
                              {index + 1}.{' '}
                              {player?.name ||
                                wicket.player_name ||
                                'Wicket'}
                            </div>

                            <div className="text-[10px] text-slate-500 uppercase">
                              {wicket.wicket_type ||
                                'OUT'}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-bold">
                              {score}
                            </div>

                            {over && (
                              <div className="text-[10px] text-slate-500">
                                {over}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>

            {/* SCORE SUMMARY */}
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3">
              <h3 className="text-sm font-bold mb-3">
                SCORE SUMMARY
              </h3>

              <div className="grid grid-cols-3 gap-2">
                <MiniStat
                  label="RUNS"
                  value={totalRuns}
                />

                <MiniStat
                  label="WICKETS"
                  value={totalWickets}
                />

                <MiniStat
                  label="LEGAL BALLS"
                  value={legalBalls}
                />
              </div>
            </div>

            {/* RECENT BALLS REMOVED */}
            {/*
              Recent Balls section intentionally removed.
            */}
          </div>
        )}

        {/* NEXT BOWLER */}
        {showNextBowler && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-5 shadow-2xl">
              <div className="text-center">
                <div className="text-4xl">
                  🔄
                </div>

                <h2 className="text-xl font-black mt-2">
                  OVER COMPLETED
                </h2>

                <p className="text-sm text-slate-400 mt-1">
                  Select the next bowler
                </p>
              </div>

              <div className="mt-4">
                <PlayerAutocomplete
                  players={players}
                  value={nextBowlerId}
                  onChange={setNextBowlerId}
                  placeholder="Search next bowler..."
                />
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4">
                <button
                  onClick={() =>
                    setShowNextBowler(false)
                  }
                  className="h-11 rounded-xl bg-slate-800"
                >
                  Later
                </button>

                <button
                  disabled={
                    !nextBowlerId ||
                    selectingBowler
                  }
                  onClick={() =>
                    setBowler(
                      nextBowlerId
                    )
                  }
                  className="h-11 rounded-xl bg-emerald-600 font-bold disabled:opacity-40"
                >
                  {selectingBowler
                    ? 'Saving...'
                    : 'Start Over'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* WICKET MODAL */}
        {showWicket && (
          <WicketModal
            players={players}
            striker={striker}
            onClose={() =>
              setShowWicket(false)
            }
            onConfirm={handleWicket}
          />
        )}

        {/* BOUNDARY FLASH */}
        {boundary !== null && (
          <div className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center">
            <div className="text-7xl sm:text-9xl font-black italic drop-shadow-2xl">
              {boundary === 6
                ? 'SIX!'
                : 'FOUR!'}
            </div>
          </div>
        )}

        {/* WICKET FLASH */}
        {flashWicket && (
          <div className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center">
            <div className="text-6xl sm:text-8xl font-black italic text-red-400 drop-shadow-2xl">
              WICKET!
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function BatterRow({
  player,
  active = false,
  label,
}) {
  return (
    <div
      className={`rounded-xl p-3 border ${
        active
          ? 'bg-emerald-950/30 border-emerald-700/50'
          : 'bg-slate-950 border-slate-800'
      }`}
    >
      <div className="text-[9px] text-slate-500 mb-1">
        {label}
      </div>

      <div className="font-semibold truncate">
        {player?.name || 'Not selected'}
      </div>

      {active && (
        <div className="text-[9px] text-emerald-400 mt-1">
          ● ON STRIKE
        </div>
      )}
    </div>
  );
}

function BallChip({
  ball,
  pending = false,
}) {
  if (!ball) return null;

  const isWicket = Boolean(
    ball.is_wicket
  );

  const extraType =
    ball.extra_type;

  let label = ball.runs_batsman ?? 0;

  if (extraType === 'wide') {
    label = 'WD';
  } else if (extraType === 'noball') {
    label = 'NB';
  } else if (extraType === 'bye') {
    label = 'B';
  } else if (extraType === 'legbye') {
    label = 'LB';
  }

  if (isWicket) {
    label = 'W';
  }

  return (
    <div
      className={`
        shrink-0
        min-w-9
        h-9
        px-2
        rounded-lg
        flex
        items-center
        justify-center
        text-xs
        font-bold
        border
        ${
          isWicket
            ? 'bg-red-950 border-red-700 text-red-300'
            : extraType
              ? 'bg-amber-950/50 border-amber-700/50 text-amber-300'
              : 'bg-slate-800 border-slate-700'
        }
        ${
          pending
            ? 'opacity-50'
            : ''
        }
      `}
    >
      {label}
    </div>
  );
}

function ExtraInline({
  label,
  value,
}) {
  return (
    <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800">
      <span className="text-[10px] text-slate-500">
        {label}
      </span>

      <span className="text-sm font-bold">
        {value}
      </span>
    </div>
  );
}

function MiniStat({
  label,
  value,
}) {
  return (
    <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 text-center">
      <div className="text-lg font-black">
        {value}
      </div>

      <div className="text-[9px] text-slate-500 mt-1">
        {label}
      </div>
    </div>
  );
}
