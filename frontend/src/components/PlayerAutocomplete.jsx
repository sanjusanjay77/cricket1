import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { Teams } from '../api/api.js';

/**
 * FAST TeamAutocomplete
 *
 * Optimized for match creation.
 *
 * - Memoized component
 * - Uses one search pass for matches + exact match
 * - Maximum 8 dropdown results
 * - Uses Set-style lookup logic through direct comparisons
 * - Selection happens immediately
 * - Does not reload teams after selecting
 */

function TeamAutocomplete({
  teams = [],
  value,
  onCreated,
  onChange,
  placeholder = 'Type team name…',
  excludeId = null
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const boxRef = useRef(null);

  /*
   * ====================================================
   * SELECTED TEAM
   * ====================================================
   */

  const selectedTeam = useMemo(() => {

    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {
      return null;
    }

    return (
      teams.find(
        team => String(team.id) === String(value)
      ) || null
    );

  }, [teams, value]);

  /*
   * ====================================================
   * SEARCH
   * ====================================================
   *
   * One loop handles:
   *
   * - filtering
   * - exact match detection
   * - maximum 8 results
   *
   * instead of scanning teams multiple times.
   */

  const {
    matches,
    exactMatch
  } = useMemo(() => {

    const trimmed = query.trim();

    /*
     * ------------------------------------------------
     * No search text
     * ------------------------------------------------
     */

    if (!trimmed) {

      const result = [];

      for (
        let i = 0;
        i < teams.length && result.length < 8;
        i++
      ) {

        const team = teams[i];

        if (
          excludeId !== null &&
          excludeId !== undefined &&
          String(team.id) === String(excludeId)
        ) {
          continue;
        }

        result.push(team);
      }

      return {
        matches: result,
        exactMatch: false
      };
    }

    /*
     * ------------------------------------------------
     * Search text
     * ------------------------------------------------
     */

    const search = trimmed.toLowerCase();

    const result = [];
    let foundExact = false;

    for (let i = 0; i < teams.length; i++) {

      const team = teams[i];

      /*
       * Don't show excluded team.
       */
      if (
        excludeId !== null &&
        excludeId !== undefined &&
        String(team.id) === String(excludeId)
      ) {
        continue;
      }

      const name = String(team.name || '');
      const lowerName = name.toLowerCase();

      /*
       * Exact team name.
       */
      if (lowerName === search) {
        foundExact = true;
      }

      /*
       * Matching teams.
       */
      if (
        result.length < 8 &&
        lowerName.includes(search)
      ) {
        result.push(team);
      }

      /*
       * Nothing else needed once we have:
       *
       * 8 results + exact match.
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

  }, [teams, query, excludeId]);

  /*
   * ====================================================
   * OUTSIDE CLICK
   * ====================================================
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
   * ====================================================
   * SELECT TEAM
   * ====================================================
   *
   * Important:
   * No API call here.
   *
   * The parent receives the ID immediately.
   */

  const selectTeam = useCallback(
    (teamId) => {

      onChange(teamId);

      setQuery('');
      setOpen(false);

    },
    [onChange]
  );

  /*
   * ====================================================
   * INPUT CHANGE
   * ====================================================
   */

  const handleInputChange = useCallback(
    (event) => {

      setQuery(event.target.value);
      setOpen(true);

    },
    []
  );

  /*
   * ====================================================
   * CREATE TEAM
   * ====================================================
   */

  const createTeam = useCallback(
    async () => {

      const name = query.trim();

      if (
        !name ||
        creating
      ) {
        return;
      }

      setCreating(true);

      try {

        const shortName =
          name
            .slice(0, 4)
            .toUpperCase();

        const team = await Teams.create({
          name,
          short_name: shortName
        });

        /*
         * Tell parent immediately.
         */
        onCreated?.(team);

        /*
         * Select newly-created team.
         */
        onChange(team.id);

        /*
         * Close dropdown.
         */
        setQuery('');
        setOpen(false);

      } catch (error) {

        console.error(
          'Failed to create team:',
          error
        );

      } finally {

        setCreating(false);

      }

    },
    [
      query,
      creating,
      onCreated,
      onChange
    ]
  );

  /*
   * ====================================================
   * SELECTED TEAM UI
   * ====================================================
   */

  if (selectedTeam) {

    return (
      <div className="flex items-center justify-between bg-slate-900 border border-emerald-600/60 rounded-xl px-3 py-2">

        <span className="font-medium flex items-center gap-2 min-w-0">

          <span
            className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold shrink-0"
            style={{
              background:
                selectedTeam.logo_color
            }}
          >
            {selectedTeam.short_name?.slice(0, 2)}
          </span>

          <span className="truncate">
            {selectedTeam.name}
          </span>

        </span>

        <button
          type="button"
          className="ml-2 text-xs text-emerald-400 hover:text-emerald-300 font-semibold shrink-0"
          onClick={() => onChange(null)}
        >
          Change
        </button>

      </div>
    );
  }

  /*
   * ====================================================
   * INPUT + DROPDOWN
   * ====================================================
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

        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-slate-800 border border-slate-600 rounded-xl shadow-xl">

          {matches.map(team => (

            <button
              type="button"
              key={team.id}

              className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-600/20 flex items-center gap-2"

              onClick={() => {
                selectTeam(team.id);
              }}
            >

              <span
                className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold shrink-0"
                style={{
                  background: team.logo_color
                }}
              >
                {team.short_name?.slice(0, 2)}
              </span>

              <span className="truncate">
                {team.name}
              </span>

            </button>

          ))}

          {query.trim() && !exactMatch && (

            <button
              type="button"
              disabled={creating}

              className="w-full text-left px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-600/20 border-t border-slate-700 font-medium disabled:opacity-50"

              onClick={createTeam}
            >

              {creating
                ? 'Creating…'
                : `+ Create team "${query.trim()}"`
              }

            </button>

          )}

          {matches.length === 0 && !query.trim() && (

            <div className="px-3 py-2 text-sm text-slate-400">
              Start typing a team name…
            </div>

          )}

        </div>

      )}

    </div>
  );
}

/*
 * Prevent unnecessary renders when the parent
 * re-renders for unrelated match-creation state.
 */
export default memo(TeamAutocomplete);
