import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Matches } from '../api/api.js';

export default function MatchSetup() {
  const { matchId } = useParams();
  const [detail, setDetail] = useState(null);
  const [tossWinner, setTossWinner] = useState('');
  const [decision, setDecision] = useState('bat');
  const [overs, setOvers] = useState('');
  const [saving, setSaving] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    Matches.get(matchId).then((data) => {
      setDetail(data);

      // Use the existing overs value if already available
      if (data?.match?.overs_limit) {
        setOvers(String(data.match.overs_limit));
      }
    });
  }, [matchId]);

  if (!detail) {
    return <p className="text-slate-400">Loading…</p>;
  }

  const { match } = detail;

  const confirmToss = async () => {
    if (!tossWinner) {
      return alert('Select the toss-winning team');
    }

    const oversNumber = Number(overs);

    if (!overs || !Number.isInteger(oversNumber) || oversNumber <= 0) {
      return alert('Enter a valid number of overs');
    }

    if (oversNumber > 100) {
      return alert('Overs cannot be more than 100');
    }

    setSaving(true);

    try {
      /*
       * Save the overs limit together with the toss.
       * This requires the backend setToss endpoint to accept overs_limit.
       */
      await Matches.setToss(matchId, {
        toss_winner_id: tossWinner,
        toss_decision: decision,
        overs_limit: oversNumber
      });

      navigate(`/match/${matchId}/score`);
    } catch (error) {
      console.error(error);
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
        Set match details before starting
      </p>

      <div className="card space-y-4">
        <h2 className="font-semibold">Match Settings</h2>

        {/* OVERS INPUT */}
        <div>
          <label className="text-sm text-slate-400">
            Overs per innings
          </label>

          <input
            className="input mt-1"
            type="number"
            min="1"
            max="100"
            step="1"
            placeholder="Enter number of overs"
            value={overs}
            onChange={(e) => setOvers(e.target.value)}
          />

          <p className="text-xs text-slate-500 mt-1">
            Example: 5, 10, 20 or 50 overs
          </p>
        </div>

        {/* TOSS */}
        <div>
          <h2 className="font-semibold mb-2">Toss</h2>

          <label className="text-sm text-slate-400">
            Won the toss
          </label>

          <select
            className="input mt-1"
            value={tossWinner}
            onChange={(e) => setTossWinner(e.target.value)}
          >
            <option value="">Select team</option>

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

        {/* START */}
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
