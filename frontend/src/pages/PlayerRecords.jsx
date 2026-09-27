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

    return JSON.parse(value);

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

          setPlayers(
            playerList
          );

          writeCache(
            PLAYERS_CACHE_KEY,
            playerList
          );


          /* -----------------------------------------------
             Keep selected player updated
          ----------------------------------------------- */

          setSelected(
            currentSelected => {

              if (!currentSelected) {
                return currentSelected;
              }

              const updated =
                playerList.find(
                  player =>
                    String(player.id) ===
                    String(currentSelected.id)
                );

              if (!updated) {
                return null;
              }

              return updated;
            }
          );


          /* -----------------------------------------------
             Keep stats updated
          ----------------------------------------------- */

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
  ============================================================ */

  useEffect(() => {

    const hasCachedPlayers =
      Array.isArray(cachedPlayers);

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


        /* -----------------------------------------------
           Optimistic UI update
        ----------------------------------------------- */

        setPlayers(
          current => {

            const updated =
              current.filter(
                item =>
                  String(item.id) !==
                  String(player.id)
              );

            writeCache(
              PLAYERS_CACHE_KEY,
              updated
            );

            return updated;
          }
        );


        if (
          String(selected?.id) ===
          String(player.id)
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
     PLAYER LIST
  ============================================================ */

  const playerList = (

    <>

      {loadingStats &&
        players.length === 0 && (

        <div className="card text-slate-400">
          Loading player statistics...
        </div>

      )}


      {!loadingStats &&
        Object.keys(grouped).length === 0 && (

        <div className="card text-slate-400">
          No players found. Add one above.
        </div>

      )}


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
                px-1
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

                    <div className="min-w-0">

                      <div className="font-medium truncate">
                        {player.name}
                      </div>

                      {/* Mobile role */}
                      <div
                        className="
                          text-xs
                          text-slate-500
                          mt-0.5
                          sm:hidden
                        "
                      >
                        {player.role ||
                          'Player'}
                      </div>

                    </div>


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

    </>

  );


  /* ============================================================
     PLAYER STATS PANEL
  ============================================================ */

  const statsPanel = (

    <>

      {/* NOTHING SELECTED */}

      {!selected && (

        <div className="card text-slate-400">
          Select a player to see their full
          batting and bowling record.
        </div>

      )}


      {/* =======================================================
          SELECTED PLAYER
      ======================================================= */}

      {selected &&
        stats && (

        <div className="space-y-3">

          {/* PLAYER INFO */}

          <div
            className="
              card
              !p-4
              sm:!p-5
            "
          >

            <div
              className="
                flex
                items-center
                justify-between
                gap-3
              "
            >

              <div className="min-w-0">

                <h2
                  className="
                    text-xl
                    sm:text-2xl
                    font-bold
                    truncate
                  "
                >
                  {stats.player?.name ||
                    selected.name}
                </h2>


                <p
                  className="
                    text-sm
                    text-slate-400
                    mt-1
                    truncate
                  "
                >
                  {stats.player?.team_name ||
                    selected.team_name ||
                    'Team'}

                  {' · '}

                  {stats.player?.role ||
                    selected.role ||
                    'Player'}
                </p>

              </div>


              {/* Close selection on mobile */}

              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setStats(null);
                }}
                className="
                  md:hidden
                  min-w-[38px]
                  min-h-[38px]
                  rounded-lg
                  bg-slate-800
                  text-slate-400
                  hover:text-white
                  flex
                  items-center
                  justify-center
                  shrink-0
                "
                aria-label="Close player stats"
              >
                ✕
              </button>

            </div>

          </div>


          {/* BATTING / BOWLING */}

          <div
            className="
              grid
              grid-cols-2
              gap-1.5
              p-1
              bg-slate-900
              rounded-xl
              sticky
              top-2
              z-10
              shadow-lg
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
                min-h-[46px]
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

              <span>
                Batting
              </span>

            </button>


            <button
              type="button"
              onClick={() =>
                setActiveTab(
                  'bowling'
                )
              }
              className={`
                min-h-[46px]
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

              <span>
                Bowling
              </span>

            </button>

          </div>


          {/* =================================================
              BATTING
          ================================================= */}

          {activeTab ===
            'batting' && (

            <div className="card !p-3 sm:!p-5">

              <div
                className="
                  flex
                  items-center
                  justify-between
                  mb-3
                  sm:mb-4
                "
              >

                <h3
                  className="
                    font-semibold
                    text-emerald-400
                  "
                >
                  🏏 Batting Details
                </h3>


                <span
                  className="
                    text-xs
                    text-slate-500
                  "
                >
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

            <div className="card !p-3 sm:!p-5">

              <div
                className="
                  flex
                  items-center
                  justify-between
                  mb-3
                  sm:mb-4
                "
              >

                <h3
                  className="
                    font-semibold
                    text-orange-400
                  "
                >
                  🎯 Bowling Details
                </h3>


                <span
                  className="
                    text-xs
                    text-slate-500
                  "
                >
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

    </>

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
          MOBILE
          
          Stats are intentionally ABOVE player list.
          
          md:hidden = only mobile/tablet below md.
      ===================================================== */}

      <div className="md:hidden min-w-0">

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
              px-3
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


        <p
          className="
            text-sm
            text-slate-500
            mb-4
          "
        >
          Career records for your teams.
        </p>


        {/* ADD PLAYER */}

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


        {/* SEARCH */}

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


        {/* =================================================
            SELECTED PLAYER STATS
            THIS IS NOW ABOVE THE PLAYER LIST
        ================================================= */}

        {selected && stats && (

          <div className="mb-5">

            <div
              className="
                text-xs
                font-semibold
                uppercase
                tracking-wide
                text-slate-500
                mb-2
                px-1
              "
            >
              Selected Player
            </div>

            {statsPanel}

          </div>

        )}


        {/* OTHER PLAYERS */}

        <div>

          <div
            className="
              flex
              items-center
              justify-between
              mb-2
              px-1
            "
          >

            <h2
              className="
                text-sm
                font-semibold
                text-slate-300
              "
            >
              {selected
                ? 'Other Players'
                : 'Players'}
            </h2>


            <span
              className="
                text-xs
                text-slate-500
              "
            >
              {filtered.length}
            </span>

          </div>


          {playerList}

        </div>

      </div>


      {/* =====================================================
          DESKTOP
          
          Existing two-column layout remains.
      ===================================================== */}

      <div className="hidden md:block min-w-0">

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


        {/* ADD PLAYER */}

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


        {/* SEARCH */}

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


        {/* PLAYER LIST */}

        {playerList}

      </div>


      {/* =====================================================
          DESKTOP STATS
      ===================================================== */}

      <div className="hidden md:block min-w-0">

        <h1
          className="
            text-2xl
            font-bold
            mb-4
          "
        >
          Career Record
        </h1>

        {statsPanel}

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
        min-h-[68px]
        sm:min-h-[72px]
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
