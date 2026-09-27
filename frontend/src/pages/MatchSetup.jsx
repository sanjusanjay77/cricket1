import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Matches } from '../api/api.js';

export default function MatchSetup() {
  const { matchId } = useParams();

  const [detail, setDetail] = useState(null);
  const [tossWinner, setTossWinner] = useState('');
  const [decision, setDecision] = useState('bat');
  const [saving, setSaving] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    Matches.get(matchId)
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(
            'Failed to load match:',
            error
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const confirmToss = async () => {
    if (saving) {
      return;
    }

    if (!tossWinner) {
      alert('Select the toss-winning team');
      return;
    }

    setSaving(true);

    try {
      await Matches.setToss(matchId, {
        toss_winner_id: tossWinner,
        toss_decision: decision,
      });

      /*
       * Keep the original navigation behavior.
       */
      navigate(`/match/${matchId}/score`);
    } catch (error) {
      console.error('Toss error:', error);

      alert(
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to start match'
      );

      setSaving(false);
    }
  };

  if (!detail) {
    return (
      <p className="text-slate-400">
        Loading…
      </p>
    );
  }

  const { match } = detail;

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
              onClick={() => setDecision('bat')}
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
              onClick={() => setDecision('bowl')}
            >
              Bowl
            </button>

          </div>
        </div>

        {/* START MATCH */}
        <button
          type="button"
          onClick={confirmToss}
          disabled={saving}
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
