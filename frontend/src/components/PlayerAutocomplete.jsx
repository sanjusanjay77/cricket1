
import { useEffect, useMemo, useRef, useState } from 'react';
import { Players } from '../api/api.js';

function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeId(id) {
  return id === undefined || id === null || id === ''
    ? ''
    : String(id);
}

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

  // Always work with safe arrays.
  const safePlayers = useMemo(
    () => (Array.isArray(players) ? players : []),
    [players]
  );

  const safeExcludeIds = useMemo(
    () => (Array.isArray(excludeIds) ? excludeIds : []),
    [excludeIds]
  );

  /*
   * Remove duplicate records.
   *
   * First, deduplicate by player ID.
   * Then, deduplicate by normalized name so the same
   * name cannot appear multiple times in this picker.
   */
  const uniquePlayers = useMemo(() => {
    const byId = new Map();

    for (const player of safePlayers) {
      if (!player || player.id == null) continue;

      const id = normalizeId(player.id);
      const existing = byId.get(id);

      if (!existing) {
        byId.set(id, player);
      } else {
        // Keep the record containing the most useful information.
        const existingScore =
          Number(Boolean(existing.name)) +
          Number(Boolean(existing.role)) +
          Number(Boolean(existing.team_id));

        const playerScore =
          Number(Boolean(player.name)) +
          Number(Boolean(player.role)) +
          Number(Boolean(player.team_id));

        if (playerScore > existingScore) {
          byId.set(id, player);
        }
      }
    }

    const byName = new Map();

    for (const player of byId.values()) {
      const nameKey = normalizeName(player.name);

      // Ignore empty names.
      if (!nameKey) continue;

      // Preserve the first player for each normalized name.
      if (!byName.has(nameKey)) {
        byName.set(nameKey, player);
      }
    }

    return Array.from(byName.values());
  }, [safePlayers]);

  // Find the selected player using the original player ID.
  const selectedPlayer = useMemo(() => {
    const selectedId = normalizeId(value);

    if (!selectedId) return null;

    return (
      safePlayers.find(
        (player) =>
          player &&
          normalizeId(player.id) === selectedId
      ) || null
    );
  }, [safePlayers, value]);

  // Build the dropdown without duplicate names.
  const matches = useMemo(() => {
    const excluded = new Set(
      safeExcludeIds.map(normalizeId)
    );

    const pool = uniquePlayers.filter(
      (player) => !excluded.has(normalizeId(player.id))
    );

    const q = normalizeName(query);

    const filtered = q
      ? pool.filter((player) =>
          normalizeName(player.name).includes(q)
        )
      : pool;

    return filtered.slice(0, 8);
  }, [uniquePlayers, safeExcludeIds, query]);

  // Find an existing player by normalized name.
  const exactMatch = useMemo(() => {
    const q = normalizeName(query);

    if (!q) return null;

    return (
      uniquePlayers.find(
        (player) => normalizeName(player.name) === q
      ) || null
    );
  }, [uniquePlayers, query]);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    const onClickOutside = (event) => {
      if (
        boxRef.current &&
        !boxRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onClickOutside);

    return () => {
      document.removeEventListener(
        'mousedown',
        onClickOutside
      );
    };
  }, []);

  // Select an existing player by their existing ID.
  const selectPlayer = (player) => {
    if (!player || player.id == null) return;

    if (typeof onChange === 'function') {
      onChange(player.id);
    }

    setQuery('');
    setOpen(false);
  };

  // Create a new player only if the name does not already exist.
  const createPlayer = async () => {
    const cleanName = String(query ?? '')
      .normalize('NFKC')
      .trim()
      .replace(/\s+/g, ' ');

    if (!cleanName || creating || !teamId) return;

    // Prevent duplicate creation if an existing name matches.
    const existing = uniquePlayers.find(
      (player) =>
        normalizeName(player.name) === normalizeName(cleanName)
    );

    if (existing) {
      selectPlayer(existing);
      return;
    }

    setCreating(true);

    try {
      const result = await Players.create({
        team_id: teamId,
        name: cleanName,
      });

      // Support APIs that return either a player or { player }.
      const player = result?.player ?? result;

      if (!player || player.id == null) {
        throw new Error(
          'The server did not return the created player ID.'
        );
      }

      if (typeof onCreated === 'function') {
        onCreated(player);
      }

      if (typeof onChange === 'function') {
        onChange(player.id);
      }

      setQuery('');
      setOpen(false);
    } catch (error) {
      console.error('Failed to create player:', error);

      // If another request created the player concurrently,
      // use that existing player instead of creating another.
      try {
        const refreshed = await Players.list(teamId);
        const refreshedPlayers = Array.isArray(refreshed)
          ? refreshed
          : Array.isArray(refreshed?.players)
            ? refreshed.players
            : [];

        const existing = refreshedPlayers.find(
          (player) =>
            normalizeName(player?.name) ===
            normalizeName(cleanName)
        );

        if (existing && existing.id != null) {
          if (typeof onCreated === 'function') {
            onCreated(existing);
          }

          if (typeof onChange === 'function') {
            onChange(existing.id);
          }

          setQuery('');
          setOpen(false);
          return;
        }
      } catch (refreshError) {
        console.error(
          'Failed to refresh player list:',
          refreshError
        );
      }

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

  // Selected player display.
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

            setQuery('');
            setOpen(false);
          }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        className="input"
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
      />

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-slate-800 border border-slate-600 rounded-lg shadow-xl">
          {matches.length === 0 && !query.trim() && (
            <div className="px-3 py-2 text-sm text-slate-400">
              No players yet
            </div>
          )}

          {matches.map((player) => (
            <button
              type="button"
              key={normalizeId(player.id)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-600/20 flex justify-between"
              onClick={() => selectPlayer(player)}
            >
              <span>{player.name}</span>

              {player.role && (
                <span className="text-slate-500 text-xs">
                  {player.role}
                </span>
              )}
            </button>
          ))}

          {teamId && query.trim() && (
            exactMatch ? (
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-600/20 border-t border-slate-700 font-medium"
                onClick={() => selectPlayer(exactMatch)}
              >
                Select existing: {exactMatch.name}
              </button>
            ) : (
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
            )
          )}
        </div>
      )}
    </div>
  );
}
