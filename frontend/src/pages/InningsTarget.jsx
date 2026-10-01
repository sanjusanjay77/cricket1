import {
  useCallback,
  useEffect,
  useState
} from 'react';

import {
  useLocation,
  useNavigate,
  useParams
} from 'react-router-dom';

import { Matches } from '../api/api.js';


export default function InningsTarget() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  /*
   * =========================================================
   * INSTANT DATA FROM SCORER
   * =========================================================
   *
   * Scorer sends this when the final ball is clicked.
   *
   * React Router stores navigate(..., { state })
   * on the destination Location.
   */

  const navigationState =
    location?.state || null;

  const hasInstantState =
    navigationState?.inningsCompleted ===
    true;


  /*
   * =========================================================
   * STATE
   * =========================================================
   */

  const [match, setMatch] =
    useState(null);

  const [innings, setInnings] =
    useState([]);

  const [loading, setLoading] =
    useState(!hasInstantState);

  const [starting, setStarting] =
    useState(false);

  const [error, setError] =
    useState('');


  /*
   * =========================================================
   * LOAD MATCH
   * =========================================================
   */

  const loadMatch =
    useCallback(async () => {
      try {
        setError('');

        const data =
          await Matches.get(matchId);

        setMatch(
          data?.match || null
        );

        setInnings(
          Array.isArray(
            data?.innings
          )
            ? data.innings
            : []
        );
      } catch (err) {
        console.error(
          'Failed to load target:',
          err
        );

        setError(
          err?.response?.data?.error ||
          err?.message ||
          'Unable to load match'
        );
      } finally {
        setLoading(false);
      }
    }, [matchId]);


  /*
   * =========================================================
   * INITIAL SERVER LOAD
   * =========================================================
   *
   * Even when instant state exists, we still load
   * the server in the background.
   *
   * But we DO NOT wait for it before showing
   * the target screen.
   */

  useEffect(() => {
    loadMatch();
  }, [loadMatch]);


  /*
   * =========================================================
   * FIND FIRST INNINGS
   * =========================================================
   */

  const firstInnings =
    innings.find((item) => {
      const number =
        Number(
          item?.innings
            ?.innings_number ??
          item?.innings
            ?.innings_no ??
          item?.innings
            ?.number
        );

      return number === 1;
    }) ||
    innings[0] ||
    null;


  const firstInn =
    firstInnings?.innings ||
    null;


  /*
   * =========================================================
   * SCORE
   * =========================================================
   *
   * PRIORITY:
   *
   * 1. Instant state from Scorer
   * 2. Server data
   * 3. Safe defaults
   */

  const firstScore =
    hasInstantState &&
    navigationState?.score != null
      ? Number(
          navigationState.score
        )
      : Number(
          firstInn?.total_runs || 0
        );


  const firstWickets =
    hasInstantState &&
    navigationState?.wickets != null
      ? Number(
          navigationState.wickets
        )
      : Number(
          firstInn?.total_wickets || 0
        );


  const firstBalls =
    hasInstantState &&
    navigationState?.balls != null
      ? Number(
          navigationState.balls
        )
      : Number(
          firstInn?.total_balls || 0
        );


  const firstOvers =
    `${Math.floor(
      firstBalls / 6
    )}.${firstBalls % 6}`;


  /*
   * =========================================================
   * TARGET
   * =========================================================
   */

  const target =
    hasInstantState &&
    navigationState?.target != null
      ? Number(
          navigationState.target
        )
      : firstScore + 1;


  /*
   * =========================================================
   * TEAM NAMES
   * =========================================================
   */

  const battingTeam =
    hasInstantState &&
    navigationState?.battingTeam
      ? navigationState.battingTeam
      : firstInn?.batting_team_name ||
        firstInn?.batting_team_short ||
        match?.batting_team_name ||
        match?.team1_short ||
        'Batting Team';


  const bowlingTeam =
    hasInstantState &&
    navigationState?.bowlingTeam
      ? navigationState.bowlingTeam
      : firstInn?.bowling_team_name ||
        firstInn?.bowling_team_short ||
        match?.bowling_team_name ||
        match?.team2_short ||
        'Bowling Team';


  /*
   * =========================================================
   * START SECOND INNINGS
   * =========================================================
   */

  const continueToSecondInnings =
    async () => {
      if (starting) {
        return;
      }

      setStarting(true);
      setError('');

      try {
        /*
         * This is the ONLY operation needed
         * to begin the second innings.
         */

        await Matches.startSecondInnings(
          matchId
        );

        /*
         * Go back to scorer.
         *
         * IMPORTANT:
         * Do NOT use navigate(-1).
         * The target route may have been entered
         * in different ways.
         */

        navigate(
          `/match/${matchId}`,
          {
            replace: true
          }
        );

      } catch (err) {
        console.error(
          'Failed to start second innings:',
          err
        );

        setError(
          err?.response?.data?.error ||
          err?.message ||
          'Unable to start second innings'
        );

        setStarting(false);
      }
    };


  /*
   * =========================================================
   * LOADING
   * =========================================================
   *
   * Only show loading when we don't have instant data.
   */

  if (
    loading &&
    !hasInstantState
  ) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">

        <div className="w-full max-w-md card text-center">

          <div className="text-4xl mb-4">
            🏏
          </div>

          <div className="text-xl font-bold text-white">
            Loading innings…
          </div>

          <div className="text-sm text-slate-400 mt-2">
            Preparing the target
          </div>

        </div>

      </div>
    );
  }


  /*
   * =========================================================
   * MAIN TARGET SCREEN
   * =========================================================
   */

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-6">

      <div className="w-full max-w-lg">

        <div className="card overflow-hidden">

          {/* =================================================
              HEADER
              ================================================= */}

          <div className="text-center">

            <div className="text-emerald-400 text-sm font-bold uppercase tracking-widest">
              1st Innings Complete
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold text-white mt-2">
              Innings Break
            </h1>

            <p className="text-slate-400 text-sm mt-2">
              {bowlingTeam} will now chase the target
            </p>

          </div>


          {/* =================================================
              SCORE
              ================================================= */}

          <div className="mt-6 bg-slate-900/80 rounded-2xl border border-slate-700 p-6 text-center">

            <div className="text-xs text-slate-500 uppercase tracking-widest">
              {battingTeam}
            </div>

            <div className="text-5xl sm:text-6xl font-extrabold text-white mt-2">
              {firstScore}
              <span className="text-slate-500">
                /{firstWickets}
              </span>
            </div>

            <div className="text-slate-400 mt-2">
              {firstOvers} overs
            </div>

          </div>


          {/* =================================================
              TARGET
              ================================================= */}

          <div className="mt-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 text-center">

            <div className="text-sm text-emerald-300 uppercase tracking-widest font-semibold">
              Target
            </div>

            <div className="text-6xl sm:text-7xl font-extrabold text-emerald-400 mt-1">
              {target}
            </div>

            <div className="text-sm text-slate-400 mt-2">
              {bowlingTeam} needs{' '}
              <span className="text-white font-bold">
                {target}
              </span>{' '}
              runs to win
            </div>

          </div>


          {/* =================================================
              ERROR
              ================================================= */}

          {error && (
            <div className="mt-4 bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm text-center">
              {error}
            </div>
          )}


          {/* =================================================
              CONTINUE
              ================================================= */}

          <button
            type="button"
            className="btn btn-primary w-full mt-5 h-14 text-lg font-extrabold"
            disabled={starting}
            onClick={
              continueToSecondInnings
            }
          >
            {starting
              ? 'Starting 2nd Innings…'
              : 'Continue to 2nd Innings →'}
          </button>


          {/* =================================================
              INFO
              ================================================= */}

          <div className="text-center text-xs text-slate-500 mt-3">
            Target: {target} runs
          </div>

        </div>

      </div>

    </div>
  );
}
