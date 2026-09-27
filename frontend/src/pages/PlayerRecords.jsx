import {
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';

import {
  Players,
  Teams,
} from '../api/api.js';


/* ============================================================
   CACHE
============================================================ */

const PLAYERS_CACHE_KEY =
  'gcc_player_records_cache_v2';

const TEAMS_CACHE_KEY =
  'gcc_teams_cache_v1';


function readCache(key) {
  try {
    const value =
      localStorage.getItem(key);

    if (!value) {
      return null;
    }

    const parsed =
      JSON.parse(value);

    return parsed;

  } catch {
    return null;
  }
}


function writeCache(key, value) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(value)
    );
  } catch {
    // Ignore localStorage errors.
  }
}


/* ============================================================
   PLAYER RECORDS
============================================================ */

export default function PlayerRecords() {

  /* ==========================================================
     INITIAL CACHE

     Read cached data immediately.
     This prevents the page from waiting for the API.
  ========================================================== */

  const cachedPlayers =
    useState(
      () =>
        readCache(
          PLAYERS_CACHE_KEY
        )
    )[0];

  const cachedTeams =
    useState(
      () =>
        readCache(
          TEAMS_CACHE_KEY
        )
    )[0];


  /* ==========================================================
     STATE
  ========================================================== */

  const [players, setPlayers] =
    useState(
      Array.isArray(cachedPlayers)
        ? cachedPlayers
        : []
    );

  const [teams, setTeams] =
    useState(
      Array.isArray(cachedTeams)
        ? cachedTeams
        : []
    );


  const [selected, setSelected] =
    useState(null);


  const [stats, setStats] =
    useState(null);


  /*
   * IMPORTANT:
   *
   * If cache exists, don't block the page
   * with a loading screen.
   */
  const [loadingStats, setLoadingStats] =
    useState(
      !Array.isArray(cachedPlayers)
    );


  const [search, setSearch] =
    useState('');


  const [showAdd, setShowAdd] =
    useState(false);


  const [activeTab, setActiveTab] =
    useState('batting');


  const [newPlayer, setNewPlayer] =
    useState({
      team_id: '',
      name: '',
      role: 'batsman'
    });


  const [deletingId, setDeletingId] =
    useState(null);


  /* ============================================================
     LOAD PLAYERS

     One API request:
     /players/all/career-stats

     Cache is updated after fresh data arrives.
  ============================================================ */

  const loadPlayers =
    useCallback(
      async (
        showLoader = false
      ) => {

        if (showLoader) {
          setLoadingStats(true);
        }

        try {

          const data =
            await Players.allCareerStats();


          const playerList =
            Array.isArray(data)
              ? data
              : [];


          /*
           * Update UI immediately.
           */
          setPlayers(
            playerList
          );


          /*
           * Save fresh data.
           */
          writeCache(
            PLAYERS_CACHE_KEY,
            playerList
          );


          /*
           * Keep selected player
           * synchronized after refresh.
           */
          setSelected(
            currentSelected => {

              if (!currentSelected) {
                return currentSelected;
              }


              const updated =
                playerList.find(
                  player =>
                    String(player.id) ===
                    String(
                      currentSelected.id
                    )
                );


              if (!updated) {
                return null;
              }


              return updated;

            }
          );


          /*
           * If a player is selected,
           * refresh the displayed stats
           * from the already-loaded data.
           */
          setStats(
            currentStats => {

              if (
                !currentStats?.player
              ) {
                return currentStats;
              }


              const updated =
                playerList.find(
                  player =>
                    String(player.id) ===
                    String(
                      currentStats.player.id
                    )
                );


              if (!updated) {
                return null;
              }


              return {
                player: updated,
                batting:
                  updated.batting || {},
                bowling:
                  updated.bowling || {}
              };

            }
          );


        } catch (err) {

          console.error(
            'Failed to load player career statistics:',
            err
          );

        } finally {

          if (showLoader) {
            setLoadingStats(false);
          }

        }

      },
      []
    );


  /* ============================================================
     LOAD TEAMS
  ============================================================ */

  const loadTeams =
    useCallback(
      async () => {

        try {

          const data =
            await Teams.list();


          const teamList =
            Array.isArray(data)
              ? data
              : [];


          setTeams(
            teamList
          );


          writeCache(
            TEAMS_CACHE_KEY,
            teamList
          );


        } catch (err) {

          console.error(
            'Failed to load teams:',
            err
          );

        }

      },
      []
    );


  /* ============================================================
     INITIAL LOAD

     VERY IMPORTANT:

     - Cached player data displays immediately.
     - API requests happen in background.
     - Players + Teams start together.
  ============================================================ */

  useEffect(() => {

    /*
     * Don't show loading if cache already exists.
     */
    const hasCachedPlayers =
      Array.isArray(cachedPlayers);


    /*
     * Run both requests simultaneously.
     */
    loadPlayers(
      !hasCachedPlayers
    );

    loadTeams();

  }, [
    loadPlayers,
    loadTeams,
    cachedPlayers
  ]);


  /* ============================================================
     OPEN PLAYER

     NO API REQUEST.
  ============================================================ */

  const openPlayer =
    useCallback(
      (player) => {

        setSelected(
          player
        );


        setStats({
          player,
          batting:
            player.batting || {},
          bowling:
            player.bowling || {}
        });


        setActiveTab(
          'batting'
        );

      },
      []
    );


  /* ============================================================
     ADD PLAYER
  ============================================================ */

  const addPlayer =
    async (e) => {

      e.preventDefault();


      if (
        !newPlayer.team_id ||
        !newPlayer.name.trim()
      ) {

        alert(
          'Select a team and enter player name'
        );

        return;

      }


      try {

        await Players.create(
          newPlayer
        );


        setNewPlayer({
          team_id:
            newPlayer.team_id,
          name: '',
          role: 'batsman'
        });


        setShowAdd(
          false
        );


        /*
         * Refresh in background.
         */
        await loadPlayers(
          false
        );


      } catch (err) {

        console.error(
          'Failed to add player:',
          err
        );


        alert(
          err?.response?.data?.error ||
          err?.message ||
          'Failed to add player'
        );

      }

    };


  /* ============================================================
     REMOVE PLAYER
  ============================================================ */

  const removePlayer =
    async (
      player,
      e
    ) => {

      e.stopPropagation();


      const confirmed =
        window.confirm(
          `Remove ${player.name}? Their past match stats stay on record, but they won't be selectable in new matches.`
        );


      if (!confirmed) {
        return;
      }


      setDeletingId(
        player.id
      );


      try {

        await Players.remove(
          player.id
        );


        /*
         * Immediately remove from
         * current UI instead of waiting
         * for the API refresh.
         */
        setPlayers(
          current =>
            current.filter(
              item =>
                String(item.id) !==
                String(player.id)
            )
        );


        /*
         * Update cache immediately.
         */
        setPlayers(
          current => {

            writeCache(
              PLAYERS_CACHE_KEY,
              current
            );

            return current;

          }
        );


        if (
          selected?.id ===
          player.id
        ) {

          setSelected(
            null
          );

          setStats(
            null
          );

        }


        /*
         * Confirm fresh backend data
         * in background.
         */
        loadPlayers(
          false
        );


      } catch (err) {

        console.error(
          'Failed to remove player:',
          err
        );


        alert(
          err?.response?.data?.error ||
          err?.message ||
          'Failed to remove player'
        );

      } finally {

        setDeletingId(
          null
        );

      }

    };


  /* ============================================================
     SEARCH

     useMemo prevents recalculating
     unnecessarily.
  ============================================================ */

  const filtered =
    useMemo(
      () => {

        const query =
          search
            .trim()
            .toLowerCase();


        if (!query) {
          return players;
        }


        return players.filter(
          player =>
            String(
              player.name || ''
            )
              .toLowerCase()
              .includes(query)
        );

      },
      [
        players,
        search
      ]
    );


  /* ============================================================
     GROUP BY TEAM
  ============================================================ */

  const grouped =
    useMemo(
      () => {

        return filtered.reduce(
          (
            acc,
            player
          ) => {

            const teamName =
              player.team_name ||
              'Team';


            if (!acc[teamName]) {
              acc[teamName] = [];
            }


            acc[teamName].push(
              player
            );


            return acc;

          },
          {}
        );

      },
      [filtered]
    );


  /* ============================================================
     RENDER
  ============================================================ */

  return (

    <div
      className="
        grid
        md:grid-cols-2
        gap-4
        md:gap-6
        fade-in
      "
    >

      {/* =====================================================
          LEFT - PLAYERS
      ===================================================== */}

      <div className="min-w-0">

        {/* HEADER */}

        <div
          className="
            flex
            items-center
            justify-between
            gap-3
            mb-1
          "
        >

          <h1 className="text-2xl font-bold">
            Player Stats
          </h1>


          <button
            type="button"
            className="
              btn
              btn-primary
              text-sm
              whitespace-nowrap
              min-h-[44px]
            "
            onClick={() =>
              setShowAdd(
                value => !value
              )
            }
          >

            {showAdd
              ? 'Cancel'
              : '+ Add Player'}

          </button>

        </div>


        <p className="text-sm text-slate-500 mb-4">
          Career records for players on your own teams only.
        </p>


        {/* ===================================================
            ADD PLAYER
        =================================================== */}

        {showAdd && (

          <form
            onSubmit={addPlayer}
            className="
              card
              space-y-3
              mb-4
            "
          >

            <select
              className="
                input
                min-h-[46px]
              "
              value={
                newPlayer.team_id
              }
              onChange={(e) =>
                setNewPlayer({
                  ...newPlayer,
                  team_id:
                    e.target.value
                })
              }
            >

              <option value="">
                Select team
              </option>


              {teams.map(
                team => (

                  <option
                    key={team.id}
                    value={team.id}
                  >
                    {team.name}
                  </option>

                )
              )}

            </select>


            <input
              className="
                input
                min-h-[46px]
              "
              placeholder="Player name"
              value={
                newPlayer.name
              }
              onChange={(e) =>
                setNewPlayer({
                  ...newPlayer,
                  name:
                    e.target.value
                })
              }
            />


            <select
              className="
                input
                min-h-[46px]
              "
              value={
                newPlayer.role
              }
              onChange={(e) =>
                setNewPlayer({
                  ...newPlayer,
                  role:
                    e.target.value
                })
              }
            >

              <option value="batsman">
                Batsman
              </option>

              <option value="bowler">
                Bowler
              </option>

              <option value="all-rounder">
                All-rounder
              </option>

              <option value="wicketkeeper">
                Wicketkeeper
              </option>

            </select>


            <button
              type="submit"
              className="
                btn
                btn-primary
                w-full
                min-h-[46px]
              "
            >
              Add Player
            </button>

          </form>

        )}


        {/* ===================================================
            SEARCH
        =================================================== */}

        <input
          className="
            input
            mb-4
            min-h-[46px]
          "
          placeholder="Search player..."
          value={search}
          onChange={(e) =>
            setSearch(
              e.target.value
            )
          }
        />


        {/* ===================================================
            BACKGROUND REFRESH INDICATOR

            Only show this when there are no players yet.
            If cache exists, don't disturb the UI.
        =================================================== */}

        {loadingStats &&
          players.length === 0 && (

          <div className="card text-slate-400">
            Loading player statistics...
          </div>

        )}


        {/* ===================================================
            NO PLAYERS
        =================================================== */}

        {!loadingStats &&
          Object.keys(grouped).length === 0 && (

          <div className="card text-slate-400">
            No players found. Add one above.
          </div>

        )}


        {/* ===================================================
            PLAYER LIST
        =================================================== */}

        {Object.entries(
          grouped
        ).map(
          (
            [
              teamName,
              teamPlayers
            ]
          ) => (

            <div
              key={teamName}
              className="mb-4"
            >

              <h2
                className="
                  text-sm
                  font-semibold
                  text-slate-400
                  mb-2
                "
              >
                {teamName}
              </h2>


              <div className="space-y-2">

                {teamPlayers.map(
                  player => (

                    <div
                      key={player.id}
                      onClick={() =>
                        openPlayer(
                          player
                        )
                      }
                      className={`
                        card
                        flex
                        items-center
                        justify-between
                        gap-3
                        py-3
                        px-3
                        cursor-pointer
                        transition
                        hover:border-emerald-500
                        active:scale-[0.99]
                        ${
                          selected?.id ===
                          player.id
                            ? 'border-emerald-500 bg-slate-800/60'
                            : ''
                        }
                      `}
                    >

                      {/* PLAYER NAME */}

                      <div className="min-w-0">

                        <div className="font-medium truncate">
                          {player.name}
                        </div>

                      </div>


                      {/* ROLE + DELETE */}

                      <div
                        className="
                          flex
                          items-center
                          gap-2
                          shrink-0
                        "
                      >

                        <span
                          className="
                            text-xs
                            text-slate-400
                            hidden
                            sm:block
                          "
                        >
                          {player.role ||
                            'Player'}
                        </span>


                        <button
                          type="button"
                          onClick={(e) =>
                            removePlayer(
                              player,
                              e
                            )
                          }
                          disabled={
                            deletingId ===
                            player.id
                          }
                          className="
                            min-w-[36px]
                            min-h-[36px]
                            flex
                            items-center
                            justify-center
                            rounded-lg
                            text-red-400
                            hover:text-red-300
                            hover:bg-red-500/10
                          "
                        >

                          {deletingId ===
                          player.id
                            ? '...'
                            : '🗑️'}

                        </button>

                      </div>

                    </div>

                  )
                )}

              </div>

            </div>

          )
        )}

      </div>


      {/* =====================================================
          RIGHT - CAREER RECORD
      ===================================================== */}

      <div className="min-w-0">

        <h1
          className="
            text-2xl
            font-bold
            mb-4
          "
        >
          Career Record
        </h1>


        {/* NOTHING SELECTED */}

        {!selected && (

          <div className="card text-slate-400">
            Select a player to see their full
            batting and bowling record.
          </div>

        )}


        {/* ===================================================
            STATS
        =================================================== */}

        {selected &&
          stats && (

          <div className="space-y-4">

            {/* PLAYER INFO */}

            <div className="card">

              <h2 className="text-xl font-bold">
                {stats.player?.name ||
                  selected.name}
              </h2>


              <p className="text-sm text-slate-400 mt-1">

                {stats.player?.team_name ||
                  selected.team_name ||
                  'Team'}

                {' · '}

                {stats.player?.role ||
                  selected.role ||
                  'Player'}

              </p>

            </div>


            {/* BATTING / BOWLING */}

            <div
              className="
                grid
                grid-cols-2
                gap-2
                p-1
                bg-slate-900
                rounded-xl
                sticky
                top-2
                z-10
              "
            >

              <button
                type="button"
                onClick={() =>
                  setActiveTab(
                    'batting'
                  )
                }
                className={`
                  min-h-[48px]
                  rounded-lg
                  font-semibold
                  text-sm
                  transition
                  flex
                  items-center
                  justify-center
                  gap-2
                  ${
                    activeTab ===
                    'batting'
                      ? 'bg-emerald-500 text-white shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }
                `}
              >
                <span>🏏</span>
                <span>Batting</span>
              </button>


              <button
                type="button"
                onClick={() =>
                  setActiveTab(
                    'bowling'
                  )
                }
                className={`
                  min-h-[48px]
                  rounded-lg
                  font-semibold
                  text-sm
                  transition
                  flex
                  items-center
                  justify-center
                  gap-2
                  ${
                    activeTab ===
                    'bowling'
                      ? 'bg-orange-500 text-white shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }
                `}
              >
                <span>🎯</span>
                <span>Bowling</span>
              </button>

            </div>


            {/* =================================================
                BATTING
            ================================================= */}

            {activeTab ===
              'batting' && (

              <div className="card">

                <div
                  className="
                    flex
                    items-center
                    justify-between
                    mb-4
                  "
                >

                  <h3 className="font-semibold text-emerald-400">
                    🏏 Batting Details
                  </h3>


                  <span className="text-xs text-slate-500">
                    Career
                  </span>

                </div>


                <div
                  className="
                    grid
                    grid-cols-2
                    gap-2
                    sm:gap-3
                    text-sm
                  "
                >

                  <Stat
                    label="Innings Batted"
                    value={
                      stats.batting
                        ?.innings_batted
                    }
                  />

                  <Stat
                    label="Runs Scored"
                    value={
                      stats.batting
                        ?.runs
                    }
                  />

                  <Stat
                    label="Highest Score"
                    value={
                      stats.batting
                        ?.highest_score
                    }
                  />

                  <Stat
                    label="Balls Faced"
                    value={
                      stats.batting
                        ?.balls_faced
                    }
                  />

                  <Stat
                    label="Fours"
                    value={
                      stats.batting
                        ?.fours
                    }
                  />

                  <Stat
                    label="Sixes"
                    value={
                      stats.batting
                        ?.sixes
                    }
                  />

                  <Stat
                    label="Strike Rate"
                    value={
                      stats.batting
                        ?.strike_rate
                    }
                  />

                  <Stat
                    label="Average"
                    value={
                      stats.batting
                        ?.average
                    }
                  />

                  <Stat
                    label="Times Out"
                    value={
                      stats.batting
                        ?.times_out
                    }
                  />

                  <Stat
                    label="Not Outs"
                    value={
                      stats.batting
                        ?.not_outs
                    }
                  />

                </div>

              </div>

            )}


            {/* =================================================
                BOWLING
            ================================================= */}

            {activeTab ===
              'bowling' && (

              <div className="card">

                <div
                  className="
                    flex
                    items-center
                    justify-between
                    mb-4
                  "
                >

                  <h3 className="font-semibold text-orange-400">
                    🎯 Bowling Details
                  </h3>


                  <span className="text-xs text-slate-500">
                    Career
                  </span>

                </div>


                <div
                  className="
                    grid
                    grid-cols-2
                    gap-2
                    sm:gap-3
                    text-sm
                  "
                >

                  <Stat
                    label="Innings Bowled"
                    value={
                      stats.bowling
                        ?.innings_bowled
                    }
                  />

                  <Stat
                    label="Overs Bowled"
                    value={
                      stats.bowling
                        ?.overs
                    }
                  />

                  <Stat
                    label="Balls Bowled"
                    value={
                      stats.bowling
                        ?.balls_bowled
                    }
                  />

                  <Stat
                    label="Runs Given"
                    value={
                      stats.bowling
                        ?.runs_given
                    }
                  />

                  <Stat
                    label="Wickets"
                    value={
                      stats.bowling
                        ?.wickets
                    }
                  />

                  <Stat
                    label="Economy"
                    value={
                      stats.bowling
                        ?.economy
                    }
                  />

                  <Stat
                    label="Fours Given"
                    value={
                      stats.bowling
                        ?.fours_given
                    }
                  />

                  <Stat
                    label="Sixes Given"
                    value={
                      stats.bowling
                        ?.sixes_given
                    }
                  />

                </div>

              </div>

            )}

          </div>

        )}


        {/* FAILED */}

        {selected &&
          !stats &&
          !loadingStats && (

          <div className="card text-red-400">
            Unable to load this player's
            statistics.
          </div>

        )}

      </div>

    </div>

  );

}


/* ============================================================
   STAT COMPONENT
============================================================ */

function Stat({
  label,
  value
}) {

  return (

    <div
      className="
        bg-slate-900
        rounded-xl
        p-3
        min-h-[72px]
        flex
        flex-col
        justify-center
      "
    >

      <div
        className="
          text-slate-400
          text-xs
          leading-tight
        "
      >
        {label}
      </div>


      <div
        className="
          text-lg
          sm:text-xl
          font-bold
          mt-1
        "
      >
        {value ?? 0}
      </div>

    </div>

  );

}
