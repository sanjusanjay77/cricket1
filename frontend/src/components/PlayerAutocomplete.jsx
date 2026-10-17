
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * Type-to-search player picker.
 *
 * Props:
 * - players: available players
 * - value: selected player ID
 * - onChange: callback receiving the selected ID or null
 * - placeholder: optional input placeholder
 * - excludeIds: player IDs to hide from the results
 */

export default function PlayerAutocomplete({
  players = [],
  value = null,
  onChange,
  placeholder = 'Type a player name…',
  excludeIds = [],
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const safePlayers = Array.isArray(players)
    ? players
    : [];

  const safeExcludeIds = Array.isArray(excludeIds)
    ? excludeIds
    : [];

  const selectedPlayer = useMemo(
    () =>
      safePlayers.find(
        player => String(player.id) === String(value)
      ) || null,
    [safePlayers, value]
  );

  const matches = useMemo(() => {
    const search = query.trim().toLowerCase();

    return safePlayers
      .filter(player => {
        if (!player || player.id == null) {
          return false;
        }

        const excluded = safeExcludeIds.some(
          id => String(id) === String(player.id)
        );

        if (excluded) {
          return false;
        }

        const playerName = String(player.name ?? '');

        return (
          !search ||
          playerName.toLowerCase().includes(search)
        );
      })
      .slice(0, 8);
  }, [safePlayers, query, safeExcludeIds]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        boxRef.current &&
        !boxRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener(
      'mousedown',
      handleClickOutside
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside
      );
    };
  }, []);

  function selectPlayer(playerId) {
    if (typeof onChange === 'function') {
      onChange(playerId);
    }

    setQuery('');
    setOpen(false);
  }

  function clearSelection() {
    if (typeof onChange === 'function') {
      onChange(null);
    }

    setQuery('');
    setOpen(false);
  }

  if (selectedPlayer) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-600/60 bg-slate-900 px-3 py-2">
        <span className="min-w-0 truncate font-medium">
          {selectedPlayer.name}
        </span>

        <button
          type="button"
          className="shrink-0 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
          onClick={clearSelection}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        type="text"
        className="input"
        placeholder={placeholder}
        value={query}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={event => {
          setQuery(event.target.value);
          setOpen(true);
        }}
      />

      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-600 bg-slate-800 shadow-xl">
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">
              No matching players
            </div>
          ) : (
            matches.map(player => (
              <button
                type="button"
                key={player.id}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-emerald-600/20"
                onClick={() => selectPlayer(player.id)}
              >
                <span className="min-w-0 truncate">
                  {player.name}
                </span>

                {player.role && (
                  <span className="shrink-0 text-xs text-slate-400">
                    {player.role}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
