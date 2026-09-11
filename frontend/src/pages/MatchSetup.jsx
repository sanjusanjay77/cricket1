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
    Matches.get(matchId).then(setDetail);
  }, [matchId]);

  if (!detail) {
    return <p className="text-slate-400">Loading…</p>;
  }

  const { match } = detail;

  const confirmToss = async () => {
    if (!tossWinner) {
      return alert('Select the toss-winning team');
    }

    setSaving(true);

    try {
      await Matches.setToss(matchId, {
        toss_winner_id: tossWinner,
        toss_decision: decision
      });

      navigate(`/match/${matchId}/score`);
    } catch (error) {
      console.error('Toss error:', error);

      alert(
        error?.response?.data?.error ||
        error?.message ||
        'Failed to start match'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md mx-auto fade-in">
      <h1 className="text-2xl font-bold mb-1">
        {match.team1_name} vs {match.team2_name}
      </h1>

      <p className="text-slate-400 mb-4">
        Toss
      </p>

      <div className="card space-y-4">
        <h2 className="font-semibold">
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
            onChange={(e) => setTossWinner(e.target.value)}
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

        {/* DECISION */}
        <div>
          <label className="text-sm text-slate-400">
            Elected to
          </label>

          <div className="flex gap-2 mt-1">
            <button
              type="button"
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
          onClick={confirmToss}
          disabled={saving}
          className="btn btn-primary w-full"
        >
          {saving ? 'Starting Match…' : 'Start Match'}
        </button>
      </div>
    </div>
  );
}
