import { useState } from 'react';

// GCC Admin Password
const SCOREBOARD_PASSWORD = 'gcc';

export default function ScoreboardGate({ children }) {
  const [unlocked, setUnlocked] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const submit = (e) => {
    e.preventDefault();

    if (checking) return;

    setChecking(true);
    setError('');

    const password = input.trim();

    if (password === SCOREBOARD_PASSWORD) {
      setUnlocked(true);
      setInput('');
      setError('');
      setChecking(false);
      return;
    }

    setError('Incorrect password');
    setInput('');
    setChecking(false);
  };

  /*
   * IMPORTANT:
   * Once unlocked, render the Scorer directly.
   */
  if (unlocked) {
    return children;
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm card space-y-4 fade-in text-center">

        <div className="text-4xl">
          🔒
        </div>

        <h1 className="text-xl font-bold">
          GCC Scoreboard Lock
        </h1>

        <p className="text-sm text-slate-400">
          Enter password to access scoring panel.
        </p>

        <form
          onSubmit={submit}
          className="space-y-3 text-left"
        >

          <input
            type="password"
            className="input w-full"
            placeholder="Enter GCC Password"
            value={input}
            autoFocus
            disabled={checking}
            onChange={(e) => {
              setInput(e.target.value);
              setError('');
            }}
          />

          {error && (
            <p className="text-red-400 text-sm">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={checking}
          >
            {checking ? 'Checking…' : 'Unlock'}
          </button>

        </form>

      </div>
    </div>
  );
}
