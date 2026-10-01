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
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  /*
  =========================================================
  IMMEDIATE DATA FROM SCORER
  =========================================================
  */

  const hasPassedScore =
    passedState.inningsCompleted === true &&
    passedState.score !== undefined &&
    passedState.score !== null;

  const immediateScore = hasPassedScore
    ? Number(passedState.score)
    : 0;

  const immediateWickets =
    passedState.wickets !== undefined
      ? Number(passedState.wickets)
      : 0;

  const immediateBalls =
    passedState.balls !== undefined
      ? Number(passedState.balls)
      : 0;

  const immediateTarget =
    passedState.target !== undefined &&
    passedState.target !== null
      ? Number(passedState.target)
      : immediateScore + 1;

  /*
  =========================================================
  LOAD MATCH
  =========================================================
  */

  useEffect(() => {
    let cancelled = false;

    async function loadMatch() {
      if (!matchId) {
        setError('Match ID is missing.');
        setLoading(false);
        return;
      }

      try {
        const data = await Matches.get(matchId);

        if (cancelled) return;

        setMatch(data?.match || null);

        setInnings(
          Array.isArray(data?.innings)
            ? data.innings
            : []
        );

        setError('');
      } catch (err) {
        console.error(
          'InningsTarget load error:',
          err
        );

        if (!cancelled) {
          setError(
            err?.response?.data?.error ||
            err?.message ||
            'Unable to load match information.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadMatch();

    return () => {
      cancelled = true;
    };
  }, [matchId]);

  /*
  =========================================================
  FIND FIRST INNINGS
  =========================================================
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
    firstInningsEntry?.innings ||
    firstInningsEntry ||
    null;

  /*
  =========================================================
  SERVER DATA
  =========================================================
  */

  const serverScore = Number(
    firstInnings?.total_runs || 0
  );

  const serverWickets = Number(
    firstInnings?.total_wickets || 0
  );

  const serverBalls = Number(
    firstInnings?.total_balls || 0
  );

  /*
  =========================================================
  FINAL DISPLAY VALUES
  =========================================================
  */

  const score = hasPassedScore
    ? immediateScore
    : serverScore;

  const wickets = hasPassedScore
    ? immediateWickets
    : serverWickets;

  const balls = hasPassedScore
    ? immediateBalls
    : serverBalls;

  const target =
    hasPassedScore
      ? immediateTarget
      : serverScore + 1;

  const overs =
    `${Math.floor(balls / 6)}.${balls % 6}`;

  /*
  =========================================================
  TEAM NAMES
  =========================================================
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
  =========================================================
  CONTINUE TO SECOND INNINGS
  =========================================================
  */

  const continueToSecondInnings = async () => {
    if (starting) return;

    setStarting(true);
    setError('');

    try {
      /*
      -------------------------------------------------------
      Start second innings on backend
      -------------------------------------------------------
      */

      if (
        typeof Matches.startSecondInnings === 'function'
      ) {
        await Matches.startSecondInnings(matchId);
      }

      /*
      -------------------------------------------------------
      IMPORTANT
      -------------------------------------------------------

      Your actual scorer route is:

      /match/:matchId/score

      So go there explicitly.
      -------------------------------------------------------
      */

      navigate(
        `/match/${matchId}/score`,
        {
          replace: true,
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
        'Unable to start second innings.'
      );

      setStarting(false);
    }
  };

  /*
  =========================================================
  LOADING
  =========================================================
  */

  if (
    loading &&
    !hasPassedScore
  ) {
    return (
      <div className="min-h-[500px] w-full flex items-center justify-center bg-slate-950 text-white">

        <div className="text-center">

          <div className="text-xl font-bold">
            Loading innings...
          </div>

          <div className="mt-2 text-sm text-slate-400">
            Preparing target
          </div>

        </div>

      </div>
    );
  }

  /*
  =========================================================
  MAIN SCREEN
  =========================================================
  */

  return (
    <div className="min-h-[500px] w-full bg-slate-950 text-white px-4 py-8">

      <div className="mx-auto w-full max-w-md">

        {/* =================================================
            HEADER
        ================================================= */}

        <div className="mb-8 text-center">

          <div className="text-sm font-bold uppercase tracking-widest text-emerald-400">
            1st Innings Complete
          </div>

          <h1 className="mt-2 text-3xl font-black">
            Innings Break
          </h1>

        </div>

        {/* =================================================
            SCORE CARD
        ================================================= */}

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">

          {/* TEAM */}

          <div className="text-center">

            <div className="text-sm text-slate-400">
              {battingTeam}
            </div>

            <div className="mt-2 text-5xl font-black">
              {score}/{wickets}
            </div>

            <div className="mt-2 text-sm text-slate-400">
              {overs} overs
            </div>

          </div>

          {/* DIVIDER */}

          <div className="my-6 border-t border-slate-800" />

          {/* TARGET */}

          <div className="text-center">

            <div className="text-sm font-medium text-slate-400">
              TARGET
            </div>

            <div className="mt-2 text-6xl font-black text-emerald-400">
              {target}
            </div>

            <div className="mt-2 text-sm text-slate-400">
              {bowlingTeam} to chase
            </div>

          </div>

          {/* =================================================
              ERROR
          ================================================= */}

          {error && (
            <div className="mt-6 rounded-xl border border-red-800 bg-red-950/40 p-4">

              <div className="text-sm font-bold text-red-400">
                Error
              </div>

              <div className="mt-1 break-words text-sm text-red-300">
                {error}
              </div>

            </div>
          )}

          {/* =================================================
              CONTINUE
          ================================================= */}

          <button
            type="button"
            onClick={continueToSecondInnings}
            disabled={starting}
            className="
              mt-6
              min-h-[52px]
              w-full
              rounded-xl
              bg-emerald-500
              px-4
              py-4
              font-black
              text-slate-950
              transition
              hover:bg-emerald-400
              disabled:cursor-not-allowed
              disabled:bg-slate-700
              disabled:text-slate-400
            "
          >
            {starting
              ? 'Starting 2nd Innings...'
              : 'Continue to 2nd Innings'}
          </button>

        </div>

        {/* =================================================
            BACK
        ================================================= */}

        <button
          type="button"
          onClick={() =>
            navigate(
              `/match/${matchId}/score`
            )
          }
          className="
            mt-4
            min-h-[48px]
            w-full
            rounded-xl
            border
            border-slate-800
            bg-slate-900
            px-4
            py-3
            text-slate-300
            transition
            hover:bg-slate-800
          "
        >
          Back to Scorer
        </button>

      </div>

    </div>
  );
}
