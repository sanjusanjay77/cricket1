import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Matches } from '../api/api.js';

export default function InningsTarget() {
  const { matchId } = useParams();
  const navigate = useNavigate();

  const [match, setMatch] = useState(null);
  const [innings, setInnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  /*
   * =========================================================
   * LOAD MATCH
   * =========================================================
   */

  const loadMatch = useCallback(
    async () => {
      try {
        setError('');

        const data =
          await Matches.get(matchId);

        setMatch(data.match || null);
        setInnings(
          data.innings || []
        );
      } catch (err) {
        console.error(
          'Failed to load innings target:',
          err
        );

        setError(
          err?.response?.data
            ?.error ||
          err?.message ||
          'Unable to load match'
        );
      } finally {
        setLoading(false);
      }
    },
    [matchId]
  );

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
          item?.innings?.number
        );

      return number === 1;
    }) ||
    innings[0];

  const firstInn =
    firstInnings?.innings;

  const firstScore =
    Number(
      firstInn?.total_runs || 0
    );

  const firstWickets =
    Number(
      firstInn?.total_wickets || 0
    );

  const firstBalls =
    Number(
      firstInn?.total_balls || 0
    );

  const firstOvers =
    `${Math.floor(
      firstBalls / 6
    )}.${firstBalls % 6}`;

  /*
   * TARGET
   *
   * Target is first innings
   * score + 1.
   */

  const target =
    firstScore + 1;

  /*
   * =========================================================
   * TEAMS
   * =========================================================
   */

  const battingTeam =
    firstInn?.batting_team_name ||
    firstInn?.batting_team_short ||
    match?.batting_team_name ||
    match?.team1_short ||
    'Batting Team';

  const bowlingTeam =
    firstInn?.bowling_team_name ||
    firstInn?.bowling_team_short ||
    match?.bowling_team_name ||
    match?.team2_short ||
    'Bowling Team';

  /*
   * =========================================================
   * CONTINUE
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
         * Backend creates/activates
         * second innings.
         */

        await Matches.startSecondInnings(
          matchId
        );

        /*
         * IMPORTANT:
         *
         * Go back to scorer after
         * second innings is created.
         *
         * The target page is opened
         * from Scorer, so browser
         * history takes us back to it.
         */

        navigate(-1);
      } catch (err) {
        console.error(
          'Failed to start second innings:',
          err
        );

        setError(
          err?.response?.data
            ?.error ||
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
   */

  if (loading) {
    return (
      <div className="max-w-lg mx-auto">

        <div className="card text-center py-10">

          <div className="text-3xl mb-3">
            🏏
          </div>

          <div className="text-slate-300 font-semibold">
            Loading innings…
          </div>

          <div className="text-xs text-slate-500 mt-1">
            Preparing target
          </div>

        </div>

      </div>
    );
  }

  /*
   * =========================================================
   * ERROR / NO DATA
   * =========================================================
   */

  if (!match || !firstInn) {
    return (
      <div className="max-w-lg mx-auto">

        <div className="card text-center">

          <div className="text-red-400 text-3xl mb-3">
            ⚠️
          </div>

          <h2 className="text-xl font-bold">
            Unable to load innings
          </h2>

          <p className="text-sm text-slate-400 mt-2">
            {error ||
              'First innings data was not found.'}
          </p>

          <button
            className="btn btn-secondary mt-5"
            onClick={
              loadMatch
            }
          >
            Try Again
          </button>

        </div>

      </div>
    );
  }

  /*
   * =========================================================
   * TARGET PAGE
   * =========================================================
   */

  return (
    <div className="max-w-lg mx-auto space-y-4 fade-in">

      {/* HEADER */}

      <div className="card text-center">

        <div className="text-xs uppercase tracking-[0.2em] text-emerald-400 font-semibold">
          Innings Break
        </div>

        <h1 className="text-3xl font-extrabold text-white mt-2">
          Target Set 🎯
        </h1>

        <p className="text-sm text-slate-400 mt-2">
          First innings is complete
        </p>

      </div>

      {/* FIRST INNINGS SCORE */}

      <div className="card">

        <div className="text-center">

          <div className="text-sm text-slate-400">
            {battingTeam}
          </div>

          <div className="text-5xl font-extrabold text-white mt-2">
            {firstScore}
            <span className="text-slate-500">
              /{firstWickets}
            </span>
          </div>

          <div className="text-sm text-slate-500 mt-2">
            {firstOvers} overs
          </div>

        </div>

      </div>

      {/* TARGET */}

      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center">

        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-emerald-500/10 blur-2xl" />

        <div className="relative">

          <div className="text-xs uppercase tracking-[0.2em] text-emerald-400 font-semibold">
            Target for 2nd Innings
          </div>

          <div className="text-6xl font-black text-white mt-3">
            {target}
          </div>

          <div className="text-sm text-slate-400 mt-2">
            {bowlingTeam} must score{' '}
            <span className="text-white font-semibold">
              {target}
            </span>{' '}
            to win
          </div>

        </div>

      </div>

      {/* SIMPLE TARGET INFO */}

      <div className="card">

        <div className="grid grid-cols-2 gap-3">

          <div className="bg-slate-900/70 rounded-xl p-4 text-center">

            <div className="text-xs text-slate-500 uppercase">
              1st Innings
            </div>

            <div className="text-xl font-bold mt-1">
              {firstScore}
            </div>

          </div>

          <div className="bg-slate-900/70 rounded-xl p-4 text-center">

            <div className="text-xs text-slate-500 uppercase">
              Target
            </div>

            <div className="text-xl font-bold text-emerald-400 mt-1">
              {target}
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

      {/* CONTINUE */}

      <button
        type="button"
        className="w-full h-14 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg transition active:scale-[0.98]"
        disabled={starting}
        onClick={
          continueToSecondInnings
        }
      >
        {starting
          ? 'Starting 2nd Innings…'
          : 'Continue — Start 2nd Innings →'}
      </button>

      <div className="text-center text-xs text-slate-500 pb-4">
        After continuing, select the opening batsmen and bowler.
      </div>

    </div>
  );
}
