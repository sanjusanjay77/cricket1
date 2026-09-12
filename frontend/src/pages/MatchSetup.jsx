import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Matches } from '../api/api.js';

export default function MatchSetup() {
  const { matchId } = useParams();

  const [detail, setDetail] = useState(null);
  const [tossWinner, setTossWinner] = useState('');
  const [decision, setDecision] = useState('bat');
  const [saving, setSaving] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    Matches.get(matchId)
      .then(setDetail)
      .catch((error) => {
        console.error('Failed to load match:', error);
      });
  }, [matchId]);

  if (!detail) {
    return (
      <div className="max-w-xl mx-auto px-3 sm:px-0">
        <div className="pt-6 text-center text-slate-400">
          Loading match...
        </div>
      </div>
    );
  }

  const { match } = detail;

  const selectedTeam =
    tossWinner === match.team1_id
      ? match.team1_name
      : tossWinner === match.team2_id
      ? match.team2_name
      : '';

  const confirmToss = async () => {
    if (!tossWinner) {
      alert('Please select the team that won the toss.');
      return;
    }

    setSaving(true);

    try {
      await Matches.setToss(matchId, {
        toss_winner_id: tossWinner,
        toss_decision: decision,
      });

      navigate(`/match/${matchId}/score`);
    } catch (error) {
      console.error('Toss error:', error);

      alert(
        error?.response?.data?.error ||
        error?.message ||
        'Failed to start match.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen pb-8">
      <div className="max-w-xl mx-auto px-3 sm:px-0 fade-in">

        {/* BACK */}
        <div className="pt-2 mb-5">
          <Link
            to={`/match/${matchId}/live`}
            className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"
          >
            ← Match
          </Link>
        </div>

        {/* HEADER */}
        <div className="text-center mb-6">

          <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-3xl mb-3">
            🪙
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            Match Setup
          </h1>

          <p className="text-sm text-slate-500 mt-1">
            Complete the toss to start scoring
          </p>

        </div>

        {/* MATCH CARD */}
        <div className="card p-4 sm:p-5 mb-3">

          <div className="text-[10px] uppercase tracking-widest font-bold text-slate-600 mb-4 text-center">
            Match
          </div>

          <div className="flex items-center justify-between gap-3">

            {/* TEAM 1 */}
            <div className="flex-1 text-center min-w-0">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-xl mb-2">
                🏏
              </div>

              <div className="font-bold text-sm sm:text-base truncate">
                {match.team1_name}
              </div>

              <div className="text-[10px] text-slate-600 mt-0.5">
                TEAM 1
              </div>
            </div>

            {/* VS */}
            <div className="shrink-0">
              <div className="w-9 h-9 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
                <span className="text-[10px] font-black text-slate-500">
                  VS
                </span>
              </div>
            </div>

            {/* TEAM 2 */}
            <div className="flex-1 text-center min-w-0">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-xl mb-2">
                🏏
              </div>

              <div className="font-bold text-sm sm:text-base truncate">
                {match.team2_name}
              </div>

              <div className="text-[10px] text-slate-600 mt-0.5">
                TEAM 2
              </div>
            </div>

          </div>

          {/* OVERS */}
          <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Match format
            </span>

            <span className="text-sm font-bold">
              {match.overs_limit} overs
            </span>
          </div>

        </div>

        {/* TOSS CARD */}
        <div className="card p-4 sm:p-5">

          <div className="flex items-center justify-between mb-5">

            <div>
              <h2 className="font-bold text-lg">
                Toss
              </h2>

              <p className="text-xs text-slate-500 mt-0.5">
                Who won the toss?
              </p>
            </div>

            <div className="text-2xl">
              🪙
            </div>

          </div>

          {/* TOSS WINNER */}
          <div className="mb-5">

            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Toss winner
            </label>

            <div className="grid grid-cols-2 gap-2">

              <button
                type="button"
                onClick={() => setTossWinner(match.team1_id)}
                className={`min-h-[64px] rounded-xl border px-3 py-2 text-sm font-bold transition ${
                  tossWinner === match.team1_id
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                    : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-600'
                }`}
              >
                <div className="text-lg mb-1">
                  🏏
                </div>

                <div className="truncate">
                  {match.team1_name}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTossWinner(match.team2_id)}
                className={`min-h-[64px] rounded-xl border px-3 py-2 text-sm font-bold transition ${
                  tossWinner === match.team2_id
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                    : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-600'
                }`}
              >
                <div className="text-lg mb-1">
                  🏏
                </div>

                <div className="truncate">
                  {match.team2_name}
                </div>
              </button>

            </div>

          </div>

          {/* SELECTED TEAM */}
          {selectedTeam && (
            <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-3">

              <div className="text-[10px] uppercase tracking-widest font-bold text-emerald-500/70">
                Toss won by
              </div>

              <div className="font-bold text-emerald-400 mt-1">
                {selectedTeam}
              </div>

            </div>
          )}

          {/* DECISION */}
          <div>

            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Elected to
            </label>

            <div className="grid grid-cols-2 gap-2">

              {/* BAT */}
              <button
                type="button"
                onClick={() => setDecision('bat')}
                className={`min-h-[72px] rounded-xl border transition ${
                  decision === 'bat'
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'
                }`}
              >
                <div className="text-2xl mb-1">
                  🏏
                </div>

                <div
                  className={`font-bold ${
                    decision === 'bat'
                      ? 'text-emerald-400'
                      : 'text-slate-300'
                  }`}
                >
                  Bat
                </div>

                {decision === 'bat' && (
                  <div className="text-[10px] text-emerald-500 mt-1 font-semibold">
                    SELECTED
                  </div>
                )}
              </button>

              {/* BOWL */}
              <button
                type="button"
                onClick={() => setDecision('bowl')}
                className={`min-h-[72px] rounded-xl border transition ${
                  decision === 'bowl'
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'
                }`}
              >
                <div className="text-2xl mb-1">
                  🎯
                </div>

                <div
                  className={`font-bold ${
                    decision === 'bowl'
                      ? 'text-emerald-400'
                      : 'text-slate-300'
                  }`}
                >
                  Bowl
                </div>

                {decision === 'bowl' && (
                  <div className="text-[10px] text-emerald-500 mt-1 font-semibold">
                    SELECTED
                  </div>
                )}
              </button>

            </div>

          </div>

          {/* SUMMARY */}
          {selectedTeam && (
            <div className="mt-5 rounded-xl bg-slate-950 border border-slate-800 p-3">

              <div className="text-[10px] uppercase tracking-widest text-slate-600 font-bold mb-2">
                Match decision
              </div>

              <div className="text-sm">
                <span className="font-semibold text-emerald-400">
                  {selectedTeam}
                </span>

                <span className="text-slate-500">
                  {' '}won the toss and chose to{' '}
                </span>

                <span className="font-bold">
                  {decision === 'bat' ? 'BAT' : 'BOWL'}
                </span>
              </div>

            </div>
          )}

          {/* START */}
          <button
            type="button"
            onClick={confirmToss}
            disabled={saving || !tossWinner}
            className="w-full h-14 mt-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-black text-base shadow-lg shadow-emerald-500/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">
                  ⟳
                </span>
                Starting match...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                🏏
                Start Match
                <span>→</span>
              </span>
            )}
          </button>

        </div>

        {/* HELP */}
        <p className="text-center text-[11px] text-slate-600 mt-4">
          Select the toss winner, choose Bat or Bowl, then start scoring.
        </p>

      </div>
    </div>
  );
}
