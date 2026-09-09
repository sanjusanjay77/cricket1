import { useState } from 'react';
import PlayerAutocomplete from './PlayerAutocomplete.jsx';

const WICKET_TYPES = ['bowled', 'caught', 'lbw', 'run-out', 'stumped', 'hit-wicket', 'retired'];

export default function WicketModal({ striker, nonStriker, fieldingPlayers, fieldingTeamId, onPlayerCreated, onConfirm, onClose }) {
  const [wicketType, setWicketType] = useState('bowled');
  const [dismissedId, setDismissedId] = useState(striker?.id);
  const [fielderId, setFielderId] = useState(null);
  const [runsBeforeWicket, setRunsBeforeWicket] = useState(0);

  const needsFielder = ['caught', 'run-out', 'stumped'].includes(wicketType);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-30 p-4">
      <div className="card w-full max-w-sm space-y-3">
        <h2 className="font-bold text-lg">Wicket!</h2>

        <div>
          <label className="text-sm text-slate-400">How out?</label>
          <select className="input" value={wicketType} onChange={e => setWicketType(e.target.value)}>
            {WICKET_TYPES.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>

        <div>
          <label className="text-sm text-slate-400">Batsman dismissed</label>
          <select className="input" value={dismissedId} onChange={e => setDismissedId(e.target.value)}>
            {striker && <option value={striker.id}>{striker.name} (striker)</option>}
            {nonStriker && <option value={nonStriker.id}>{nonStriker.name} (non-striker)</option>}
          </select>
        </div>

        {needsFielder && (
          <div>
            <label className="text-sm text-slate-400 mb-1 block">Fielder {wicketType === 'stumped' ? '(keeper)' : ''}</label>
            <PlayerAutocomplete players={fieldingPlayers} value={fielderId} onChange={setFielderId}
              teamId={fieldingTeamId} onCreated={onPlayerCreated} placeholder="Type or add fielder's name…" />
          </div>
        )}

        {wicketType === 'run-out' && (
          <div>
            <label className="text-sm text-slate-400">Runs completed before run-out</label>
            <input type="number" min={0} max={3} className="input" value={runsBeforeWicket}
              onChange={e => setRunsBeforeWicket(Number(e.target.value))} />
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button className="btn btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger flex-1"
            onClick={() => onConfirm({ wicketType, dismissedId, fielderId, runsBeforeWicket })}>
            Confirm Out
          </button>
        </div>
      </div>
    </div>
  );
}
