import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { Players } from '../api/api.js';

/**
 * FAST PlayerAutocomplete
 *
 * Optimized for match creation where multiple player selectors
 * (batter/bowler) can exist on the same page.
 *
 * Main optimizations:
 * - Only searches the first 8 matching players.
 * - Uses Set for excludeIds.
 * - Performs exact-match check during the same filtering pass.
 * - Avoids unnecessary callback recreation.
 * - Keeps typing state local to this component.
 * - Memoized with React.memo().
 */

function PlayerAutocomplete({
  players = [],
  value,
  onChange,
  onCreated,
  teamId,
  placeholder = 'Type a player name…',
  excludeIds = []
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const boxRef = useRef(null);

  /*
   * ----------------------------------------------------
   * EXCLUDED PLAYERS
   * ----------------------------------------------------
   *
   * Set lookup is much faster than:
   *
   * excludeIds.includes(p.id)
   *
   * especially when the component is rendered many times.
   */
  const excludedSet = useMemo(() => {
    if (!excludeIds || excludeIds.length === 0) {
      return null;
    }

    return new Set(excludeIds);
  }, [excludeIds]);

  /*
   * ----------------------------------------------------
   * SELECTED PLAYER
   * ----------------------------------------------------
   */

  const selectedPlayer = useMemo(() => {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    return players.find(
      p => String(p.id) === String(value)
    ) || null;
  }, [players, value]);

  /*
   * ----------------------------------------------------
   * SEARCH
   * ----------------------------------------------------
   *
   * One loop does both:
   *
   * 1. Build dropdown matches
   * 2. Check exact match
   *
   * This avoids two separate scans through players.
   */

  const {
    matches,
    exactMatch
  } = useMemo(() => {

    const trimmed = query.trim();

    /*
     * No search text:
     * show first 8 available players.
     */
    if (!trimmed) {

      const result = [];

      for (let i = 0; i < players.length && result.length < 8; i++) {

        const player = players[i];

        if (
          excludedSet &&
          excludedSet.has(player.id)
        ) {
          continue;
        }

        result.push(player);
      }

      return {
        matches: result,
        exactMatch: false
      };
    }

    const search = trimmed.toLowerCase();

    const result = [];
    let foundExact = false;

    for (let i = 0; i < players.length; i++) {

      const player = players[i];

      if (
        excludedSet &&
        excludedSet.has(player.id)
      ) {
        continue;
      }

      const name = String(player.name || '');
      const lowerName = name.toLowerCase();

      /*
       * Exact match.
       */
      if (lowerName === search) {
        foundExact = true;
      }

      /*
       * Dropdown result.
       */
      if (
        result.length < 8 &&
        lowerName.includes(search)
      ) {
        result.push(player);
      }

      /*
       * Once we have 8 results and already found
       * the exact player, nothing else is needed.
       */
      if (
        result.length >= 8 &&
        foundExact
      ) {
        break;
      }
    }

    return {
      matches: result,
      exactMatch: foundExact
    };

  }, [players, query, excludedSet]);

  /*
   * ----------------------------------------------------
   * OUTSIDE CLICK
   * ----------------------------------------------------
   */

  useEffect(() => {

    const handleOutsideClick = (event) => {

      if (
        boxRef.current &&
        !boxRef.current.contains(event.target)
      ) {
        setOpen(false);
      }

    };

    document.addEventListener(
      'mousedown',
      handleOutsideClick
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handleOutsideClick
      );
    };

  }, []);

  /*
   * ----------------------------------------------------
   * SELECT PLAYER
   * ----------------------------------------------------
   */

  const selectPlayer = useCallback(
    (playerId) => {

      /*
       * Update parent immediately.
       */
      onChange(playerId);

      /*
       * Close UI immediately.
       */
      setQuery('');
      setOpen(false);

    },
    [onChange]
  );

  /*
   * ----------------------------------------------------
   * INPUT CHANGE
   * ----------------------------------------------------
   */

  const handleInputChange = useCallback(
    (event) => {

      const nextValue = event.target.value;

      setQuery(nextValue);
      setOpen(true);

    },
    []
  );

  /*
   * ----------------------------------------------------
   * CREATE PLAYER
   * ----------------------------------------------------
   */

  const createPlayer = useCallback(
    async () => {

      const name = query.trim();

      if (
        !name ||
        creating ||
        !teamId
      ) {
        return;
      }

      setCreating(true);

      try {

        const player = await Players.create({
          team_id: teamId,
          name
        });

        /*
         * Tell parent about newly-created player.
         */
        onCreated?.(player);

        /*
         * Select immediately.
         */
        onChange(player.id);

        /*
         * Close immediately.
         */
        setQuery('');
        setOpen(false);

      } catch (error) {

        console.error(
          'Failed to create player:',
          error
        );

      } finally {

        setCreating(false);

      }

    },
    [
      query,
      creating,
      teamId,
      onCreated,
      onChange
    ]
  );

  /*
   * ----------------------------------------------------
   * SELECTED PLAYER VIEW
   * ----------------------------------------------------
   */

  if (selectedPlayer) {

    return (
      <div className="flex items-center justify-between bg-slate-900 border border-emerald-600/60 rounded-lg px-3 py-2">

        <span className="font-medium truncate">
          {selectedPlayer.name}
        </span>

        <button
          type="button"
          className="ml-2 text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
          onClick={() => onChange(null)}
        >
          Change
        </button>

      </div>
    );
  }

  /*
   * ----------------------------------------------------
   * INPUT + DROPDOWN
   * ----------------------------------------------------
   */

  return (
    <div
      className="relative"
      ref={boxRef}
    >

      <input
        className="input"
        placeholder={placeholder}
        value={query}
        autoComplete="off"

        onFocus={() => {
          setOpen(true);
        }}

        onChange={handleInputChange}
      />

      {open && (

        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-slate-800 border border-slate-600 rounded-lg shadow-xl">

          {matches.length === 0 && !query.trim() && (

            <div className="px-3 py-2 text-sm text-slate-400">
              No players yet
            </div>

          )}

          {matches.map(player => (

            <button
              type="button"
              key={player.id}

              className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-600/20 flex justify-between"

              onClick={() => {
                selectPlayer(player.id);
              }}
            >

              <span className="truncate">
                {player.name}
              </span>

              {player.role && (
                <span className="ml-2 text-slate-500 text-xs shrink-0">
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
                : `+ Add new player "${query.trim()}"`
              }

            </button>

          )}

        </div>

      )}

    </div>
  );
}

/*
 * ----------------------------------------------------
 * IMPORTANT
 * ----------------------------------------------------
 *
 * React.memo prevents this selector from rendering again
 * when its props haven't actually changed.
 *
 * This is particularly useful when your match creation
 * page contains:
 *
 * Batter 1
 * Batter 2
 * Bowler
 * etc.
 */
export default memo(PlayerAutocomplete);
