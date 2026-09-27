import { useEffect, useMemo, useRef, useState } from 'react';
import { Players } from '../api/api.js';

/**
 * Type-to-search player picker.
 *
 * - If `value` is already set, shows the selected player with "Change".
 * - Otherwise shows a searchable player input.
 * - If `teamId` is provided, allows creating a new player.
 *
 * IMPORTANT:
 * `players` may temporarily be undefined while Scorer is loading.
 * This component therefore always works with a safe array.
 */
export default function PlayerAutocomplete({
  players,
  value,
  onChange,
  onCreated,
  teamId,
  placeholder = 'Type a player name…',
  excludeIds = [],
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const boxRef = useRef(null);

  /*
   * Always guarantee an array.
   *
   * This prevents:
   *   players.find(...)
   *   players.filter(...)
   *   players.some(...)
   *
   * from crashing the entire Scorer page.
   */
  const safePlayers = useMemo(() => {
    return Array.isArray(players) ? players : [];
  }, [players]);

  /*
   * Always guarantee excludeIds is an array too.
   */
  const safeExcludeIds = useMemo(() => {
    return Array.isArray(excludeIds) ? excludeIds : [];
  }, [excludeIds]);

  /*
   * Find the currently selected player safely.
   */
  const selectedPlayer = useMemo(() => {
    if (
      value === undefined ||
      value === null ||
      value === ''
    ) {
      return null;
    }

    return (
      safePlayers.find(
        (player) =>
          player &&
          String(player.id) === String(value)
      ) || null
    );
  }, [safePlayers, value]);

  /*
   * Build the dropdown list safely.
   */
  const matches = useMemo(() => {
    const pool = safePlayers.filter((player) => {
      if (!player) return false;

      return !safeExcludeIds.some(
        (id) => String(id) === String(player.id)
      );
    });

    const cleanQuery = query.trim();

    if (!cleanQuery) {
      return pool.slice(0, 8);
    }

    const q = cleanQuery.toLowerCase();

    return pool
      .filter((player) =>
        String(player.name || '')
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 8);
  }, [safePlayers, safeExcludeIds, query]);

  /*
   * Check for an exact name match safely.
   */
  const exactMatch = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();

    if (!cleanQuery) {
      return false;
    }

    return safePlayers.some(
      (player) =>
        String(player?.name || '')
          .trim()
          .toLowerCase() === cleanQuery
    );
  }, [safePlayers, query]);

  /*
   * Close dropdown when clicking outside.
   */
  useEffect(() => {
    const onClickOutside = (e) => {
      if (
        boxRef.current &&
        !boxRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener(
      'mousedown',
      onClickOutside
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        onClickOutside
      );
    };
  }, []);

  /*
   * Create a new player.
   */
  const createPlayer = async () => {
    const cleanName = query.trim();

    if (
      !cleanName ||
      creating ||
      !teamId
    ) {
      return;
    }

    setCreating(true);

    try {
      const player = await Players.create({
        team_id: teamId,
        name: cleanName,
      });

      if (player) {
        if (typeof onCreated === 'function') {
          onCreated(player);
        }

        if (
          typeof onChange === 'function' &&
          player.id !== undefined &&
          player.id !== null
        ) {
          onChange(player.id);
        }

        setQuery('');
        setOpen(false);
      }
    } catch (error) {
      console.error(
        'Failed to create player:',
        error
      );

      alert(
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to add player'
      );
    } finally {
      setCreating(false);
    }
  };

  /*
   * Selected player chip.
   */
  if (selectedPlayer) {
    return (
      <div className="flex items-center justify-between bg-slate-900 border border-emerald-600/60 rounded-lg px-3 py-2">
        <span className="font-medium">
          {selectedPlayer.name}
        </span>

        <button
          type="button"
          className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
          onClick={() => {
            if (typeof onChange === 'function') {
              onChange(null);
            }
          }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative"
      ref={boxRef}
    >
      <input
        className="input"
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-slate-800 border border-slate-600 rounded-lg shadow-xl">

          {matches.length === 0 &&
            !query.trim() && (
              <div className="px-3 py-2 text-sm text-slate-400">
                No players yet
              </div>
            )}

          {matches.map((player) => (
            <button
              type="button"
              key={player.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-600/20 flex justify-between"
              onClick={() => {
                if (
                  typeof onChange === 'function'
                ) {
                  onChange(player.id);
                }

                setQuery('');
                setOpen(false);
              }}
            >
              <span>
                {player.name}
              </span>

              {player.role && (
                <span className="text-slate-500 text-xs">
                  {player.role}
                </span>
              )}
            </button>
          ))}

          {teamId &&
            query.trim() &&
            !exactMatch && (
              <button
                type="button"
                disabled={creating}
                className="w-full text-left px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-600/20 border-t border-slate-700 font-medium disabled:opacity-50"
                onClick={createPlayer}
              >
                {creating
                  ? 'Adding…'
                  : `+ Add new player "${query.trim()}"`}
              </button>
            )}
        </div>
      )}
    </div>
  );
}
