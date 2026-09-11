
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Matches } from '../api/api.js';

export default function MatchSetup() {
  const { matchId } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [tossWinner, setTossWinner] = useState('');
  const [decision, setDecision] = useState('bat');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let active = true;

    Matches.get(matchId)
      .then(data => {
        if (active) setDetail(data);
      })
      .catch(err => {
        console.error('Failed to load match:', err);
      });

    return () => {
      active = false;
    };
  }, [matchId]);

  if (!detail) {
    return <p className="text-slate-400">Loading…</p>;
  }

  const { match } = detail;

  const confirmToss = async () => {
    if (!tossWinner || starting) return;

    setStarting(true);

    try {
      // Save toss
      await Matches.setToss(matchId, {
        toss_winner_id: tossWinner,
        toss_decision: decision
      });

      // Immediately move to scorer after successful save
      navigate(`/match/${matchId}/score`, { replace: true });
    } catch (error) {
      console.error('Toss error:', error);
      alert('Could not save toss. Please try again.');
      setStarting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto fade-in">
      <h1 className="text-2xl font-bold mb-1">
        {match.team1_name} vs {match.team2_name}
      </h1>

      <p className="text-slate-400 mb-4">
        {match.overs_limit || 'unlimited'} overs
      </p>

      <div className="card space-y-4">
        <h2 className="font-semibold">Toss</h2>

        <div>
          <label className="text-sm text-slate-400">
            Won the toss
          </label>

          <select
            className="input"
            value={tossWinner}
            onChange={e => setTossWinner(e.target.value)}
            disabled={starting}
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
              disabled={starting}
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
              disabled={starting}
            >
              Bowl
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={confirmToss}
          disabled={!tossWinner || starting}
          className="btn btn-primary w-full"
        >
          {starting ? 'Starting…' : 'Start Match'}
        </button>
      </div>
    </div>
  );
}

