import axios from 'axios';

const API_URL =
  import.meta.env.VITE_API_URL ||
  'https://cricket1-mvsi.onrender.com/api';


/* =========================================================
   AXIOS
========================================================= */

const api = axios.create({
  baseURL: API_URL,
});


/* =========================================================
   TEAMS
========================================================= */

export const Teams = {

  /* -------------------------------------------------------
     GET ALL TEAMS
  ------------------------------------------------------- */

  list: () =>
    api
      .get('/teams')
      .then(r => r.data),


  /* -------------------------------------------------------
     GET SINGLE TEAM
  ------------------------------------------------------- */

  get: (id) =>
    api
      .get(`/teams/${id}`)
      .then(r => r.data),


  /* -------------------------------------------------------
     CREATE TEAM
  ------------------------------------------------------- */

  create: (data) =>
    api
      .post('/teams', data)
      .then(r => r.data),


  /* -------------------------------------------------------
     UPDATE TEAM
  ------------------------------------------------------- */

  update: (id, data) =>
    api
      .put(`/teams/${id}`, data)
      .then(r => r.data),


  /* -------------------------------------------------------
     DELETE TEAM
  ------------------------------------------------------- */

  remove: (id) =>
    api
      .delete(`/teams/${id}`)
      .then(r => r.data),

};


/* =========================================================
   PLAYERS
========================================================= */

export const Players = {

  /* -------------------------------------------------------
     GET PLAYERS BY TEAM
  ------------------------------------------------------- */

  list: (team_id) =>
    api
      .get('/players', {
        params: {
          team_id,
        },
      })
      .then(r => r.data),


  /* -------------------------------------------------------
     GET ALL PLAYERS WITH TEAMS
  ------------------------------------------------------- */

  listAll: () =>
    api
      .get('/players/all/with-teams')
      .then(r => r.data),


  /* -------------------------------------------------------
     GET ALL CAREER STATS
  ------------------------------------------------------- */

  allCareerStats: () =>
    api
      .get('/players/all/career-stats')
      .then(r => r.data),


  /* -------------------------------------------------------
     GET PLAYER STATS
  ------------------------------------------------------- */

  stats: (id) =>
    api
      .get(`/players/${id}/stats`)
      .then(r => r.data),


  /* -------------------------------------------------------
     CREATE PLAYER
  ------------------------------------------------------- */

  create: (data) =>
    api
      .post('/players', data)
      .then(r => r.data),


  /* -------------------------------------------------------
     UPDATE PLAYER
  ------------------------------------------------------- */

  update: (id, data) =>
    api
      .put(`/players/${id}`, data)
      .then(r => r.data),


  /* -------------------------------------------------------
     DELETE PLAYER
  ------------------------------------------------------- */

  remove: (id) =>
    api
      .delete(`/players/${id}`)
      .then(r => r.data),

};


/* =========================================================
   MATCHES
========================================================= */

export const Matches = {

  /* -------------------------------------------------------
     GET ALL MATCHES
  ------------------------------------------------------- */

  list: () =>
    api
      .get('/matches')
      .then(r => r.data),


  /* -------------------------------------------------------
     GET SINGLE MATCH
  ------------------------------------------------------- */

  get: (id) =>
    api
      .get(`/matches/${id}`)
      .then(r => r.data),


  /* -------------------------------------------------------
     CREATE MATCH
  ------------------------------------------------------- */

  create: (data) =>
    api
      .post('/matches', data)
      .then(r => r.data),


  /* -------------------------------------------------------
     SET TOSS
  ------------------------------------------------------- */

  setToss: (id, data) =>
    api
      .post(`/matches/${id}/toss`, data)
      .then(r => r.data),


  /* -------------------------------------------------------
     START SECOND INNINGS
  ------------------------------------------------------- */

  startSecondInnings: (id) =>
    api
      .post(`/matches/${id}/second-innings`)
      .then(r => r.data),


  /* -------------------------------------------------------
     DELETE MATCH
  ------------------------------------------------------- */

  remove: (id) =>
    api
      .delete(`/matches/${id}`)
      .then(r => r.data),

};


/* =========================================================
   INNINGS
========================================================= */

export const Innings = {

  /* -------------------------------------------------------
     GET SCOREBOARD
  ------------------------------------------------------- */

  scoreboard: (id) =>
    api
      .get(`/innings/${id}/scoreboard`)
      .then(r => r.data),


  /* -------------------------------------------------------
     SET BATSMEN
  ------------------------------------------------------- */

  setBatsmen: (id, data) =>
    api
      .post(`/innings/${id}/set-batsmen`, data)
      .then(r => r.data),


  /* -------------------------------------------------------
     SWAP STRIKE
  ------------------------------------------------------- */

  swapStrike: (id) =>
    api
      .post(`/innings/${id}/swap-batsmen`)
      .then(r => r.data),


  /* -------------------------------------------------------
     SET BOWLER
  ------------------------------------------------------- */

  setBowler: (id, data) =>
    api
      .post(`/innings/${id}/set-bowler`, data)
      .then(r => r.data),


  /* -------------------------------------------------------
     RECORD BALL
  ------------------------------------------------------- */

  ball: (id, data) =>
    api
      .post(`/innings/${id}/ball`, data)
      .then(r => r.data),


  /* -------------------------------------------------------
     UNDO LAST BALL
  ------------------------------------------------------- */

  undo: (id) =>
    api
      .post(`/innings/${id}/undo`)
      .then(r => r.data),

};


/* =========================================================
   RECORDS CACHE
========================================================= */

/*
 * These caches live in memory while the website is open.
 *
 * This is faster than localStorage because React does not
 * need to repeatedly read and parse stored JSON.
 */

let recordsMemoryCache = null;

let playersMemoryCache = null;


/*
 * These promises prevent duplicate requests.
 *
 * If multiple pages request records at the same time,
 * they can share the same network request.
 */

let recordsRequestPromise = null;

let playersRequestPromise = null;


/* =========================================================
   RECORDS
========================================================= */

export const Records = {

  /* -------------------------------------------------------
     GET RECORDS
  ------------------------------------------------------- */

  get: () => {

    /*
     * Reuse an existing request if one is already running.
     */

    if (recordsRequestPromise) {

      return recordsRequestPromise;

    }


    recordsRequestPromise =
      api
        .get('/records')
        .then(r => {

          recordsMemoryCache =
            r.data;

          return r.data;

        })
        .finally(() => {

          recordsRequestPromise =
            null;

        });


    return recordsRequestPromise;

  },


  /* -------------------------------------------------------
     GET MEMORY CACHE
  ------------------------------------------------------- */

  getMemoryCache: () =>
    recordsMemoryCache,


  /* -------------------------------------------------------
     PRELOAD RECORDS
  ------------------------------------------------------- */

  preload: () => {

    /*
     * If records already exist in memory,
     * return them immediately.
     */

    if (
      recordsMemoryCache !== null
    ) {

      return Promise.resolve(
        recordsMemoryCache
      );

    }


    return Records.get();

  },

};


/* =========================================================
   PLAYER CACHE
========================================================= */

export const CachedPlayers = {

  /* -------------------------------------------------------
     GET ALL PLAYERS
  ------------------------------------------------------- */

  listAll: () => {

    /*
     * Return cached players immediately.
     */

    if (
      playersMemoryCache !== null
    ) {

      return Promise.resolve(
        playersMemoryCache
      );

    }


    /*
     * Reuse an existing request.
     */

    if (playersRequestPromise) {

      return playersRequestPromise;

    }


    playersRequestPromise =
      api
        .get('/players/all/with-teams')
        .then(r => {

          playersMemoryCache =
            r.data;

          return r.data;

        })
        .finally(() => {

          playersRequestPromise =
            null;

        });


    return playersRequestPromise;

  },


  /* -------------------------------------------------------
     GET MEMORY CACHE
  ------------------------------------------------------- */

  getMemoryCache: () =>
    playersMemoryCache,

};


/* =========================================================
   NOTIFICATIONS
========================================================= */

export const Notifications = {

  /* -------------------------------------------------------
     REGISTER DEVICE
  ------------------------------------------------------- */

  register: (data) =>
    api
      .post(
        '/notifications/register',
        data
      )
      .then(r => r.data),


  /* -------------------------------------------------------
     GET USER
  ------------------------------------------------------- */

  getUser: (id) =>
    api
      .get(`/notifications/${id}`)
      .then(r => r.data),


  /* -------------------------------------------------------
     UNREGISTER DEVICE
  ------------------------------------------------------- */

  unregister: (data) =>
    api
      .post(
        '/notifications/unregister',
        data
      )
      .then(r => r.data),

};


/* =========================================================
   ERROR MESSAGE
========================================================= */

export function getApiErrorMessage(
  error,
  fallback = 'Something went wrong'
) {

  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  );

}


/* =========================================================
   DEFAULT API
========================================================= */

export default api;
