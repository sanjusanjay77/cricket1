import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Matches } from '../api/api.js';

export default function InningsTarget() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const passedState = location.state || {};

  const [match, setMatch] = useState(null);
  const [innings, setInnings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  /*
  ====================================================
  IMMEDIATE DATA FROM SCORER
  ====================================================
  */

  const immediateScore = Number(passedState.score || 0);
  const immediateWickets = Number(passedState.wickets || 0);
  const immediateBalls = Number(passedState.balls || 0);

  const hasImmediateData =
    passedState.inningsCompleted === true &&
    Number.isFinite(immediateScore);

  /*
  ====================================================
  LOAD SERVER DATA
  ====================================================
  */

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        /*
         * We already have everything needed to show the
         * target immediately, so don't block the screen.
         */
        if (hasImmediateData) {
          setLoading(false);
        } else {
          setLoading(true);
        }

        const data = await Matches.get(matchId);

        if (cancelled) return;

        setMatch(data?.match || null);
        setInnings(Array.isArray(data?.innings) ? data.innings : []);
        setError('');
      } catch (err) {
        console.error('TARGET LOAD ERROR:', err);

        if (!cancelled) {
          /*
           * Do NOT make the whole page black if the API fails.
           */
          setError(
            err?.response?.data?.error ||
            err?.message ||
            'Unable to load match data'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (matchId) {
      load();
    }

    return () => {
      cancelled = true;
    };
  }, [matchId, hasImmediateData]);

  /*
  ====================================================
  FIND FIRST INNINGS
  ====================================================
  */

  const firstInningsEntry =
    innings.find((item) => {
      const number = Number(
        item?.innings?.innings_number ??
        item?.innings?.innings_no ??
        item?.innings?.number ??
        item?.innings_number ??
        item?.innings_no ??
        item?.number
      );

      return number === 1;
    }) || innings[0];

  const firstInnings =
    firstInningsEntry?.innings || firstInningsEntry || null;

  /*
  ====================================================
  SCORE
  ====================================================
  */

  const serverScore = Number(firstInnings?.total_runs || 0);

  const serverWickets = Number(
    firstInnings?.total_wickets || 0
  );

  const serverBalls = Number(
    firstInnings?.total_balls || 0
  );

  const score = hasImmediateData
    ? immediateScore
    : serverScore;

  const wickets = hasImmediateData
    ? immediateWickets
    : serverWickets;

  const balls = hasImmediateData
    ? immediateBalls
    : serverBalls;

  const target =
    Number(passedState.target) > 0
      ? Number(passedState.target)
      : score + 1;

  const overs =
    `${Math.floor(balls / 6)}.${balls % 6}`;

  /*
  ====================================================
  TEAMS
  ====================================================
  */

  const battingTeam =
    passedState.battingTeam ||
    firstInnings?.batting_team_name ||
    firstInnings?.batting_team_short ||
    match?.team1_short ||
    match?.team1_name ||
    'Batting Team';

  const bowlingTeam =
    passedState.bowlingTeam ||
    firstInnings?.bowling_team_name ||
    firstInnings?.bowling_team_short ||
    match?.team2_short ||
    match?.team2_name ||
    'Bowling Team';

  /*
  ====================================================
  CONTINUE
  ====================================================
  */

  const continueToSecondInnings = async () => {
    if (starting) return;

    setStarting(true);
    setError('');

    try {
      if (
        typeof Matches.startSecondInnings === 'function'
      ) {
        await Matches.startSecondInnings(matchId);
      }

      /*
       * IMPORTANT:
       * Go back to the scorer page.
       *
       * Do NOT use:
       * navigate(`/match/${matchId}`)
       *
       * because your scorer route may be:
       * /match/:matchId/scorer
       */

      navigate(-1);
    } catch (err) {
      console.error(
        'START SECOND INNINGS ERROR:',
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
  ====================================================
  LOADING
  ====================================================
  */

  if (loading && !hasImmediateData) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-xl font-semibold">
            Loading...
          </div>

          <div className="text-slate-400 text-sm mt-2">
            Preparing innings target
          </div>
        </div>
      </div>
    );
  }

  /*
  ====================================================
  ALWAYS RENDER SOMETHING
  ====================================================
  */

  return (
    <div className="min-h-screen bg-slate-950 text-white px-4 py-8">
      <div className="max-w-md mx-auto">

        {/* HEADER */}

        <div className="text-center mb-8">
          <div className="text-emerald-400 text-sm font-semibold uppercase tracking-wider">
            1st Innings Complete
          </div>

          <h1 className="text-3xl font-bold mt-2">
            Innings Break
          </h1>
        </div>

        {/* SCORE CARD */}

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-xl">

          <div className="text-center">

            <div className="text-slate-400 text-sm">
              {battingTeam}
            </div>

            <div className="text-5xl font-bold mt-2">
              {score}/{wickets}
            </div>

            <div className="text-slate-400 mt-2">
              {overs} overs
            </div>

          </div>

          <div className="border-t border-slate-800 my-6" />

          {/* TARGET */}

          <div className="text-center">

            <div className="text-slate-400 text-sm">
              Target
            </div>

            <div className="text-6xl font-black text-emerald-400 mt-2">
              {target}
            </div>

            <div className="text-slate-400 mt-2">
              {bowlingTeam} to chase
            </div>

          </div>

          {/* ERROR */}

          {error && (
            <div className="mt-6 rounded-xl bg-red-950/40 border border-red-800 p-4">
              <div className="text-red-400 text-sm font-semibold">
                Error
              </div>

              <div className="text-red-300 text-sm mt-1 break-words">
                {error}
              </div>
            </div>
          )}

          {/* CONTINUE */}

          <button
            type="button"
            onClick={continueToSecondInnings}
            disabled={starting}
            className="
              w-full
              mt-6
              rounded-xl
              bg-emerald-500
              hover:bg-emerald-400
              disabled:bg-slate-700
              disabled:text-slate-400
              text-slate-950
              font-bold
              py-4
              transition
            "
          >
            {starting
              ? 'Starting 2nd Innings...'
              : 'Continue to 2nd Innings'}
          </button>

        </div>

        {/* BACK */}

        <button
          type="button"
          onClick={() => navigate(-1)}
          className="
            w-full
            mt-4
            py-3
            rounded-xl
            bg-slate-900
            border
            border-slate-800
            text-slate-300
            hover:bg-slate-800
          "
        >
          Back to Scorer
        </button>

      </div>
    </div>
  );
}
