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
   NUMBER HELPER
============================================================ */

function numberValue(value) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
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

  const [refreshing, setRefreshing] =
    useState(false);

  const [search, setSearch] =
    useState('');

  const [showAdd, setShowAdd] =
    useState(false);

  const [activeTab, setActiveTab] =
    useState('batting');

  const [sortBy, setSortBy] =
    useState('runs');

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
     REFRESH
  ============================================================ */

  const refreshPlayers =
    useCallback(
      async () => {

        if (refreshing) {
          return;
        }

        setRefreshing(true);

        try {

          await Promise.all([
            loadPlayers(false),
            loadTeams()
          ]);

        } finally {

          setRefreshing(false);

        }

      },
      [
        refreshing,
        loadPlayers
      ]
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
     OPEN / CLOSE PLAYER
  ============================================================ */

  const openPlayer =
    useCallback(
      (player) => {

        /*
         * If same player clicked again,
         * close stats.
         */
        if (
          String(selected?.id) ===
          String(player.id)
        ) {

          setSelected(null);
          setStats(null);

          return;
        }


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
      [
        selected
      ]
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
     SEARCH + SORT
  ============================================================ */

  const filtered =
    useMemo(
      () => {

        const query =
          search
            .trim()
            .toLowerCase();


        let result =
          Array.isArray(players)
            ? [...players]
            : [];


        /* -----------------------------------------------
           SEARCH
        ----------------------------------------------- */

        if (query) {

          result =
            result.filter(
              player =>
                String(
                  player.name || ''
                )
                  .toLowerCase()
                  .includes(query)
            );

        }


        /* -----------------------------------------------
           SORT
        ----------------------------------------------- */

        result.sort(
          (a, b) => {

            switch (sortBy) {

              case 'runs':
                return (
                  numberValue(
                    b?.batting?.runs
                  ) -
                  numberValue(
                    a?.batting?.runs
                  )
                );


              case 'wickets':
                return (
                  numberValue(
                    b?.bowling?.wickets
                  ) -
                  numberValue(
                    a?.bowling?.wickets
                  )
                );


              case 'highest':
                return (
                  numberValue(
                    b?.batting?.highest_score
                  ) -
                  numberValue(
                    a?.batting?.highest_score
                  )
                );


              case 'strike_rate':
                return (
                  numberValue(
                    b?.batting?.strike_rate
                  ) -
                  numberValue(
                    a?.batting?.strike_rate
                  )
                );


              case 'economy':
                return (
                  numberValue(
                    a?.bowling?.economy
                  ) -
                  numberValue(
                    b?.bowling?.economy
                  )
                );


              case 'name':
                return String(
                  a?.name || ''
                ).localeCompare(
                  String(
                    b?.name || ''
                  ),
                  undefined,
                  {
                    sensitivity: 'base'
                  }
                );


              default:
                return 0;

            }

          }
        );


        return result;

      },
      [
        players,
        search,
        sortBy
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
     SORT LABEL
  ============================================================ */

  const sortLabel =
    useMemo(
      () => {

        const labels = {
          runs:
            'Runs ↓',
          wickets:
            'Wickets ↓',
          highest:
            'Highest Score ↓',
          strike_rate:
            'Strike Rate ↓',
          economy:
            'Economy ↑',
          name:
            'Name A–Z'
        };

        return (
          labels[sortBy] ||
          'Runs ↓'
        );

      },
      [sortBy]
    );


  /* ============================================================
     PLAYER STATS CONTENT
  ============================================================ */

  const statsContent = (

    <div
      className="
        space-y-3
        min-w-0
        w-full
      "
    >

      {/* PLAYER INFO */}

      <div
        className="
          card
          !p-3
          sm:!p-5
          min-w-0
          w-full
        "
      >

        <div
          className="
            flex
            items-center
            justify-between
            gap-3
            min-w-0
          "
        >

          <div
            className="
              min-w-0
              flex-1
            "
          >

            <h2
              className="
                text-lg
                sm:text-2xl
                font-bold
                truncate
              "
            >
              {stats?.player?.name ||
                selected?.name}
            </h2>


            <p
              className="
                text-xs
                sm:text-sm
                text-slate-400
                mt-1
                truncate
              "
            >
              {stats?.player?.team_name ||
                selected?.team_name ||
                'Team'}

              {' · '}

              {stats?.player?.role ||
                selected?.role ||
                'Player'}
            </p>

          </div>


          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setStats(null);
            }}
            className="
              w-9
              h-9
              min-w-9
              rounded-lg
              bg-slate-800
              text-slate-400
              hover:text-white
              hover:bg-slate-700
              flex
              items-center
              justify-center
              shrink-0
              transition
            "
            aria-label="Close player stats"
          >
            ✕
          </button>

        </div>

      </div>


      {/* BATTING / BOWLING TABS */}

      <div
        className="
          grid
          grid-cols-2
          gap-1.5
          p-1
          bg-slate-900
          rounded-xl
          shadow-lg
          w-full
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
            min-h-[44px]
            rounded-lg
            font-semibold
            text-xs
            sm:text-sm
            transition
            flex
            items-center
            justify-center
            gap-1.5
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
            min-h-[44px]
            rounded-lg
            font-semibold
            text-xs
            sm:text-sm
            transition
            flex
            items-center
            justify-center
            gap-1.5
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


      {/* =====================================================
          BATTING
      ===================================================== */}

      {activeTab ===
        'batting' && (

        <div
          className="
            card
            !p-3
            sm:!p-5
            min-w-0
            w-full
          "
        >

          <div
            className="
              flex
              items-center
              justify-between
              gap-2
              mb-3
              min-w-0
            "
          >

            <h3
              className="
                font-semibold
                text-emerald-400
                text-sm
                sm:text-base
                min-w-0
              "
            >
              🏏 Batting Details
            </h3>


            <span
              className="
                text-[10px]
                sm:text-xs
                text-slate-500
                shrink-0
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
              min-w-0
            "
          >

            <Stat
              label="Innings Batted"
              value={
                stats?.batting
                  ?.innings_batted
              }
            />

            <Stat
              label="Runs Scored"
              value={
                stats?.batting
                  ?.runs
              }
              highlight
            />

            <Stat
              label="Highest Score"
              value={
                stats?.batting
                  ?.highest_score
              }
            />

            <Stat
              label="Balls Faced"
              value={
                stats?.batting
                  ?.balls_faced
              }
            />

            <Stat
              label="Fours"
              value={
                stats?.batting
                  ?.fours
              }
            />

            <Stat
              label="Sixes"
              value={
                stats?.batting
                  ?.sixes
              }
            />

            <Stat
              label="Strike Rate"
              value={
                stats?.batting
                  ?.strike_rate
              }
            />

            <Stat
              label="Average"
              value={
                stats?.batting
                  ?.average
              }
            />

            <Stat
              label="Times Out"
              value={
                stats?.batting
                  ?.times_out
              }
            />

            <Stat
              label="Not Outs"
              value={
                stats?.batting
                  ?.not_outs
              }
            />

          </div>

        </div>

      )}


      {/* =====================================================
          BOWLING
      ===================================================== */}

      {activeTab ===
        'bowling' && (

        <div
          className="
            card
            !p-3
            sm:!p-5
            min-w-0
            w-full
          "
        >

          <div
            className="
              flex
              items-center
              justify-between
              gap-2
              mb-3
              min-w-0
            "
          >

            <h3
              className="
                font-semibold
                text-orange-400
                text-sm
                sm:text-base
                min-w-0
              "
            >
              🎯 Bowling Details
            </h3>


            <span
              className="
                text-[10px]
                sm:text-xs
                text-slate-500
                shrink-0
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
              min-w-0
            "
          >

            <Stat
              label="Innings Bowled"
              value={
                stats?.bowling
                  ?.innings_bowled
              }
            />

            <Stat
              label="Overs Bowled"
              value={
                stats?.bowling
                  ?.overs
              }
            />

            <Stat
              label="Balls Bowled"
              value={
                stats?.bowling
                  ?.balls_bowled
              }
            />

            <Stat
              label="Runs Given"
              value={
                stats?.bowling
                  ?.runs_given
              }
            />

            <Stat
              label="Wickets"
              value={
                stats?.bowling
                  ?.wickets
              }
              highlight
            />

            <Stat
              label="Economy"
              value={
                stats?.bowling
                  ?.economy
              }
            />

            <Stat
              label="Fours Given"
              value={
                stats?.bowling
                  ?.fours_given
              }
            />

            <Stat
              label="Sixes Given"
              value={
                stats?.bowling
                  ?.sixes_given
              }
            />

          </div>

        </div>

      )}

    </div>
  );


  /* ============================================================
     PLAYER LIST
  ============================================================ */

  const playerList = (

    <>

      {loadingStats &&
        players.length === 0 && (

        <div
          className="
            card
            text-slate-400
            min-w-0
          "
        >
          Loading player statistics...
        </div>

      )}


      {!loadingStats &&
        Object.keys(grouped).length === 0 && (

        <div
          className="
            card
            text-slate-400
            min-w-0
            text-center
            py-8
          "
        >

          <div className="text-3xl mb-2">
            🔎
          </div>

          <div className="font-semibold text-slate-300">
            No players found
          </div>

          <div className="text-xs text-slate-500 mt-1">
            Try another search or add a new player.
          </div>

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
            className="
              mb-4
              min-w-0
              w-full
            "
          >

            {/* TEAM HEADER */}

            <div
              className="
                flex
                items-center
                justify-between
                gap-2
                mb-2
                px-1
                min-w-0
              "
            >

              <h2
                className="
                  text-sm
                  font-semibold
                  text-slate-400
                  truncate
                "
              >
                {teamName}
              </h2>


              <span
                className="
                  text-[11px]
                  text-slate-600
                  shrink-0
                "
              >
                {teamPlayers.length}
              </span>

            </div>


            <div
              className="
                space-y-2
                min-w-0
                w-full
              "
            >

              {teamPlayers.map(
                (
                  player,
                  index
                ) => {

                  const isSelected =
                    String(selected?.id) ===
                    String(player.id);


                  const playerRuns =
                    numberValue(
                      player?.batting?.runs
                    );

                  const playerWickets =
                    numberValue(
                      player?.bowling?.wickets
                    );


                  return (

                    <div
                      key={player.id}
                      className="
                        min-w-0
                        w-full
                      "
                    >

                      {/* PLAYER ROW */}

                      <div
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
                          gap-2
                          py-2.5
                          px-3
                          min-w-0
                          w-full
                          cursor-pointer
                          transition
                          hover:border-emerald-500
                          active:scale-[0.99]
                          ${
                            isSelected
                              ? 'border-emerald-500 bg-slate-800/60 rounded-b-none'
                              : ''
                          }
                        `}
                      >

                        {/* LEFT */}

                        <div
                          className="
                            flex
                            items-center
                            gap-2.5
                            min-w-0
                            flex-1
                          "
                        >

                          {/* RANK */}

                          <div
                            className="
                              w-6
                              min-w-6
                              h-6
                              rounded-full
                              bg-slate-800
                              text-slate-500
                              text-[10px]
                              font-bold
                              flex
                              items-center
                              justify-center
                              shrink-0
                            "
                          >
                            {index + 1}
                          </div>


                          {/* PLAYER NAME */}

                          <div
                            className="
                              min-w-0
                              flex-1
                            "
                          >

                            <div
                              className="
                                font-medium
                                truncate
                              "
                            >
                              {player.name}
                            </div>


                            <div
                              className="
                                text-xs
                                text-slate-500
                                mt-0.5
                                truncate
                              "
                            >
                              {player.role ||
                                'Player'}
                            </div>

                          </div>

                        </div>


                        {/* RIGHT STATS */}

                        <div
                          className="
                            flex
                            items-center
                            gap-1.5
                            shrink-0
                          "
                        >

                          {/* RUNS */}

                          <div
                            className="
                              hidden
                              sm:flex
                              flex-col
                              items-center
                              min-w-[42px]
                            "
                          >

                            <span
                              className="
                                text-[9px]
                                text-slate-600
                                uppercase
                              "
                            >
                              Runs
                            </span>

                            <span
                              className="
                                text-xs
                                font-bold
                                text-emerald-400
                              "
                            >
                              {playerRuns}
                            </span>

                          </div>


                          {/* WICKETS */}

                          <div
                            className="
                              hidden
                              sm:flex
                              flex-col
                              items-center
                              min-w-[42px]
                            "
                          >

                            <span
                              className="
                                text-[9px]
                                text-slate-600
                                uppercase
                              "
                            >
                              Wkts
                            </span>

                            <span
                              className="
                                text-xs
                                font-bold
                                text-orange-400
                              "
                            >
                              {playerWickets}
                            </span>

                          </div>


                          {/* MOBILE RUNS */}

                          <div
                            className="
                              sm:hidden
                              min-w-[38px]
                              text-center
                            "
                          >

                            <div
                              className="
                                text-sm
                                font-bold
                                text-emerald-400
                              "
                            >
                              {playerRuns}
                            </div>

                            <div
                              className="
                                text-[8px]
                                text-slate-600
                                uppercase
                              "
                            >
                              Runs
                            </div>

                          </div>


                          {/* DELETE */}

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
                              w-9
                              h-9
                              min-w-9
                              rounded-lg
                              flex
                              items-center
                              justify-center
                              text-red-400
                              hover:text-red-300
                              hover:bg-red-500/10
                              active:scale-95
                              transition
                              shrink-0
                            "
                            aria-label={`Remove ${player.name}`}
                          >

                            {deletingId ===
                            player.id
                              ? '...'
                              : '🗑️'}

                          </button>

                        </div>

                      </div>


                      {/* =================================================
                          MOBILE INLINE STATS
                      ================================================= */}

                      {isSelected &&
                        stats && (

                        <div
                          className="
                            md:hidden
                            mt-0
                            rounded-b-2xl
                            bg-slate-950/60
                            border
                            border-t-0
                            border-emerald-500/50
                            p-2
                            min-w-0
                            w-full
                          "
                        >

                          {statsContent}

                        </div>

                      )}

                    </div>

                  );

                }
              )}

            </div>

          </div>

        )
      )}

    </>

  );


  /* ============================================================
     ADD PLAYER FORM
  ============================================================ */

  const addPlayerForm = (

    <form
      onSubmit={addPlayer}
      className="
        card
        space-y-3
        mb-4
        min-w-0
        w-full
      "
    >

      <div
        className="
          text-sm
          font-semibold
          text-emerald-400
        "
      >
        ➕ Add New Player
      </div>


      <select
        className="
          input
          min-h-[46px]
          w-full
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
          w-full
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
          w-full
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

  );


  /* ============================================================
     SEARCH + FILTER BAR
  ============================================================ */

  const controls = (

    <div
      className="
        space-y-2
        mb-4
        min-w-0
      "
    >

      {/* SEARCH */}

      <div
        className="
          relative
          min-w-0
        "
      >

        <span
          className="
            absolute
            left-3
            top-1/2
            -translate-y-1/2
            text-slate-500
            pointer-events-none
          "
        >
          🔍
        </span>

        <input
          className="
            input
            min-h-[46px]
            pl-10
            pr-10
            w-full
          "
          placeholder="Search player..."
          value={search}
          onChange={(e) =>
            setSearch(
              e.target.value
            )
          }
        />


        {search && (

          <button
            type="button"
            onClick={() =>
              setSearch('')
            }
            className="
              absolute
              right-2
              top-1/2
              -translate-y-1/2
              w-8
              h-8
              rounded-lg
              text-slate-500
              hover:text-white
              hover:bg-slate-800
              flex
              items-center
              justify-center
            "
            aria-label="Clear search"
          >
            ✕
          </button>

        )}

      </div>


      {/* SORT */}

      <div
        className="
          flex
          items-center
          gap-2
          min-w-0
        "
      >

        <div
          className="
            flex
            items-center
            gap-1.5
            text-xs
            text-slate-500
            shrink-0
          "
        >
          <span>↕️</span>
          <span className="hidden sm:inline">
            Sort
          </span>
        </div>


        <select
          value={sortBy}
          onChange={(e) =>
            setSortBy(
              e.target.value
            )
          }
          className="
            input
            min-h-[44px]
            py-2
            text-sm
            flex-1
            min-w-0
            cursor-pointer
          "
          aria-label="Sort players"
        >

          <option value="runs">
            Runs — Highest first
          </option>

          <option value="wickets">
            Wickets — Highest first
          </option>

          <option value="highest">
            Highest Score — Highest first
          </option>

          <option value="strike_rate">
            Strike Rate — Highest first
          </option>

          <option value="economy">
            Economy — Lowest first
          </option>

          <option value="name">
            Name — A to Z
          </option>

        </select>

      </div>


      {/* ACTIVE SORT INDICATOR */}

      <div
        className="
          flex
          items-center
          justify-between
          px-1
          text-[11px]
          text-slate-500
        "
      >

        <span>
          Showing {filtered.length} player
          {filtered.length !== 1 ? 's' : ''}
        </span>

        <span
          className="
            text-slate-600
          "
        >
          {sortLabel}
        </span>

      </div>

    </div>

  );


  /* ============================================================
     RENDER
  ============================================================ */

  return (

    <div
      className="
        w-full
        min-w-0
        overflow-x-hidden
        grid
        md:grid-cols-2
        gap-4
        md:gap-6
        fade-in
      "
    >

      {/* =====================================================
          MOBILE
      ===================================================== */}

      <div
        className="
          md:hidden
          min-w-0
          w-full
        "
      >

        {/* HEADER */}

        <div
          className="
            flex
            items-center
            justify-between
            gap-2
            mb-1
            min-w-0
          "
        >

          <div
            className="
              min-w-0
              flex-1
            "
          >

            <h1
              className="
                text-2xl
                font-bold
                truncate
              "
            >
              Player Stats
            </h1>

          </div>


          <div
            className="
              flex
              items-center
              gap-1.5
              shrink-0
            "
          >

            {/* REFRESH */}

            <button
              type="button"
              onClick={refreshPlayers}
              disabled={refreshing}
              className="
                w-10
                h-10
                rounded-xl
                bg-slate-800
                border
                border-slate-700
                text-slate-300
                flex
                items-center
                justify-center
                active:scale-95
                transition
              "
              aria-label="Refresh players"
            >
              {refreshing
                ? '…'
                : '↻'}
            </button>


            {/* ADD */}

            <button
              type="button"
              className="
                btn
                btn-primary
                text-sm
                whitespace-nowrap
                min-h-[44px]
                px-3
                shrink-0
              "
              onClick={() =>
                setShowAdd(
                  value => !value
                )
              }
            >

              {showAdd
                ? 'Cancel'
                : '+ Add'}

            </button>

          </div>

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

        {showAdd &&
          addPlayerForm}


        {/* SEARCH + SORT */}

        {controls}


        {/* PLAYER LIST */}

        <div>

          {playerList}

        </div>

      </div>


      {/* =====================================================
          DESKTOP PLAYER LIST
      ===================================================== */}

      <div
        className="
          hidden
          md:block
          min-w-0
          w-full
        "
      >

        {/* HEADER */}

        <div
          className="
            flex
            items-center
            justify-between
            gap-3
            mb-1
            min-w-0
          "
        >

          <h1
            className="
              text-2xl
              font-bold
            "
          >
            Player Stats
          </h1>


          <div
            className="
              flex
              items-center
              gap-2
              shrink-0
            "
          >

            <button
              type="button"
              onClick={refreshPlayers}
              disabled={refreshing}
              className="
                w-11
                h-11
                rounded-xl
                bg-slate-800
                border
                border-slate-700
                text-slate-300
                flex
                items-center
                justify-center
                hover:bg-slate-700
                transition
              "
              aria-label="Refresh players"
            >
              {refreshing
                ? '…'
                : '↻'}
            </button>


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

        </div>


        <p
          className="
            text-sm
            text-slate-500
            mb-4
          "
        >
          Career records for players on your own teams only.
        </p>


        {/* ADD PLAYER */}

        {showAdd &&
          addPlayerForm}


        {/* SEARCH + SORT */}

        {controls}


        {/* PLAYER LIST */}

        {playerList}

      </div>


      {/* =====================================================
          DESKTOP STATS
      ===================================================== */}

      <div
        className="
          hidden
          md:block
          min-w-0
          w-full
        "
      >

        <div
          className="
            flex
            items-center
            justify-between
            gap-2
            mb-4
          "
        >

          <h1
            className="
              text-2xl
              font-bold
            "
          >
            Career Record
          </h1>


          {selected && (

            <span
              className="
                text-xs
                text-slate-500
              "
            >
              {selected.name}
            </span>

          )}

        </div>


        {stats && selected
          ? statsContent
          : (

            <div
              className="
                card
                text-slate-400
                text-center
                py-10
              "
            >

              <div className="text-4xl mb-3">
                📊
              </div>

              <div
                className="
                  text-slate-300
                  font-semibold
                "
              >
                Select a player
              </div>

              <div
                className="
                  text-xs
                  text-slate-500
                  mt-1
                "
              >
                View their complete batting
                and bowling career.
              </div>

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
  value,
  highlight = false
}) {

  return (

    <div
      className={`
        bg-slate-900
        rounded-xl
        p-3
        min-h-[68px]
        sm:min-h-[72px]
        flex
        flex-col
        justify-center
        min-w-0
        ${
          highlight
            ? 'ring-1 ring-emerald-500/20'
            : ''
        }
      `}
    >

      <div
        className="
          text-slate-400
          text-xs
          leading-tight
          break-words
        "
      >
        {label}
      </div>


      <div
        className={`
          text-lg
          sm:text-xl
          font-bold
          mt-1
          ${
            highlight
              ? 'text-emerald-400'
              : 'text-white'
          }
        `}
      >
        {value ?? 0}
      </div>

    </div>

  );

}
