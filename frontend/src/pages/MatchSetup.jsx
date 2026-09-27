import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Matches } from '../api/api.js';

const MATCH_SETUP_CACHE_PREFIX = 'gcc_match_setup_';

function readMatchCache(matchId) {
  if (!matchId) {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(
      `${MATCH_SETUP_CACHE_PREFIX}${matchId}`
    );

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);

    if (!parsed || !parsed.match) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn(
      'Failed to read match setup cache:',
      error
    );

    return null;
  }
}

function writeMatchCache(matchId, detail) {
  if (!matchId || !detail?.match) {
    return;
  }

  try {
    sessionStorage.setItem(
      `${MATCH_SETUP_CACHE_PREFIX}${matchId}`,
      JSON.stringify(detail)
    );
  } catch (error) {
    console.warn(
      'Failed to write match setup cache:',
      error
    );
  }
}

export default function MatchSetup() {
  const { matchId } = useParams();

  const navigate = useNavigate();

  /*
   * ----------------------------------------------------
   * MATCH DETAIL
   * ----------------------------------------------------
   *
   * Use session cache first.
   *
   * This avoids showing a blank/loading screen when
   * the match was already loaded recently.
   */
  const [detail, setDetail] = useState(() =>
    readMatchCache(matchId)
  );

  const [tossWinner, setTossWinner] = useState('');

  const [decision, setDecision] = useState('bat');

  const [saving, setSaving] = useState(false);

  /*
   * ----------------------------------------------------
   * LOAD MATCH
   * ----------------------------------------------------
   *
   * If cached data exists, display it immediately.
   *
   * Still refresh from backend in the background so
   * the information stays correct.
   */
  useEffect(() => {
    let cancelled = false;

    Matches.get(matchId)
      .then((data) => {
        if (cancelled) {
          return;
        }

        if (data?.match) {
          setDetail(data);
          writeMatchCache(matchId, data);
        } else {
          setDetail(data);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.error(
          'Failed to load match:',
          error
        );
      });

    return () => {
      cancelled = true;
    };
  }, [matchId]);

  /*
   * ----------------------------------------------------
   * CONFIRM TOSS
   * ----------------------------------------------------
   */
  const confirmToss = useCallback(async () => {
    /*
     * Do not allow another request while the current
     * toss request is being saved.
     */
    if (saving) {
      return;
    }

    if (!tossWinner) {
      alert('Select the toss-winning team');
      return;
    }

    setSaving(true);

    try {
      /*
       * Only ONE backend request is required here.
       *
       * We wait for it because the backend must create/
       * update the innings state correctly before opening
       * the scorer.
       */
      await Matches.setToss(matchId, {
        toss_winner_id: tossWinner,
        toss_decision: decision,
      });

      /*
       * Navigate immediately after the backend confirms
       * the toss was saved.
       */
      navigate(`/match/${matchId}/score`, {
        replace: true,
      });
    } catch (error) {
      console.error(
        'Toss error:',
        error
      );

      alert(
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to start match'
      );

      setSaving(false);
    }
  }, [
    matchId,
    tossWinner,
    decision,
    saving,
    navigate,
  ]);

  /*
   * ----------------------------------------------------
   * LOADING
   * ----------------------------------------------------
   */
  if (!detail) {
    return (
      <div className="max-w-md mx-auto fade-in">
        <p className="text-slate-400">
          Loading…
        </p>
      </div>
    );
  }

  const { match } = detail;

  /*
   * ----------------------------------------------------
   * UI
   * ----------------------------------------------------
   */
  return (
    <div className="max-w-md mx-auto fade-in">

      {/* MATCH TITLE */}
      <h1 className="text-2xl font-bold mb-4">
        {match.team1_name} vs {match.team2_name}
      </h1>

      {/* TOSS CARD */}
      <div className="card space-y-4">

        <h2 className="font-semibold text-lg">
          Toss
        </h2>

        {/* TOSS WINNER */}
        <div>
          <label className="text-sm text-slate-400">
            Won the toss
          </label>

          <select
            className="input mt-1"
            value={tossWinner}
            onChange={(e) =>
              setTossWinner(e.target.value)
            }
            disabled={saving}
          >
            <option value="">
              Select team
            </option>

            <option value={match.team1_id}>
              {match.team1_name}
            </option>

            <option value={match.team2_id}>
              {match.team2_name}
            </option>
          </select>
        </div>

        {/* BAT / BOWL */}
        <div>
          <label className="text-sm text-slate-400">
            Elected to
          </label>

          <div className="flex gap-2 mt-1">

            <button
              type="button"
              disabled={saving}
              className={`btn flex-1 ${
                decision === 'bat'
                  ? 'btn-primary'
                  : 'btn-secondary'
              }`}
              onClick={() =>
                setDecision('bat')
              }
            >
              Bat
            </button>

            <button
              type="button"
              disabled={saving}
              className={`btn flex-1 ${
                decision === 'bowl'
                  ? 'btn-primary'
                  : 'btn-secondary'
              }`}
              onClick={() =>
                setDecision('bowl')
              }
            >
              Bowl
            </button>

          </div>
        </div>

        {/* START MATCH */}
        <button
          type="button"
          onClick={confirmToss}
          disabled={saving || !tossWinner}
          className="btn btn-primary w-full"
        >
          {saving
            ? 'Starting Match…'
            : 'Start Match'}
        </button>

      </div>
    </div>
  );
}
