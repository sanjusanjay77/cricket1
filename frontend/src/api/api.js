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

  list: () =>
    api
      .get('/teams')
      .then(r => r.data),

  get: (id) =>
    api
      .get(`/teams/${id}`)
      .then(r => r.data),

  create: (data) =>
    api
      .post('/teams', data)
      .then(r => r.data),

  update: (id, data) =>
    api
      .put(`/teams/${id}`, data)
      .then(r => r.data),

  remove: (id) =>
    api.delete(`/teams/${id}`),

};


/* =========================================================
   PLAYERS
========================================================= */

export const Players = {

  list: (team_id) =>
    api
      .get('/players', {
        params: { team_id },
      })
      .then(r => r.data),


  listAll: () =>
    api
      .get('/players/all/with-teams')
      .then(r => r.data),


  allCareerStats: () =>
    api
      .get('/players/all/career-stats')
      .then(r => r.data),


  stats: (id) =>
    api
      .get(`/players/${id}/stats`)
      .then(r => r.data),


  create: (data) =>
    api
      .post('/players', data)
      .then(r => r.data),


  update: (id, data) =>
    api
      .put(`/players/${id}`, data)
      .then(r => r.data),


  remove: (id) =>
    api.delete(`/players/${id}`),

};


/* =========================================================
   MATCHES
========================================================= */

export const Matches = {

  list: () =>
    api
      .get('/matches')
      .then(r => r.data),


  get: (id) =>
    api
      .get(`/matches/${id}`)
      .then(r => r.data),


  create: (data) =>
    api
      .post('/matches', data)
      .then(r => r.data),


  setToss: (id, data) =>
    api
      .post(`/matches/${id}/toss`, data)
      .then(r => r.data),


  startSecondInnings: (id) =>
    api
      .post(`/matches/${id}/second-innings`)
      .then(r => r.data),


  remove: (id) =>
    api.delete(`/matches/${id}`),

};


/* =========================================================
   INNINGS
========================================================= */

export const Innings = {

  scoreboard: (id) =>
    api
      .get(`/innings/${id}/scoreboard`)
      .then(r => r.data),


  setBatsmen: (id, data) =>
    api
      .post(`/innings/${id}/set-batsmen`, data)
      .then(r => r.data),


  swapStrike: (id) =>
    api
      .post(`/innings/${id}/swap-batsmen`)
      .then(r => r.data),


  setBowler: (id, data) =>
    api
      .post(`/innings/${id}/set-bowler`, data)
      .then(r => r.data),


  ball: (id, data) =>
    api
      .post(`/innings/${id}/ball`, data)
      .then(r => r.data),


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
 * This is much faster than localStorage because React does not
 * need to read and parse the stored JSON every time.
 */

let recordsMemoryCache = null;

let playersMemoryCache = null;


/*
 * These promises prevent duplicate requests.
 *
 * Example:
 *
 * Records page opens
 *       ↓
 * request starts
 *       ↓
 * user leaves page
 *       ↓
 * user comes back
 *       ↓
 * second request will reuse the first request
 * instead of creating another request.
 */

let recordsRequestPromise = null;

let playersRequestPromise = null;


/* =========================================================
   RECORDS
========================================================= */

export const Records = {

  /*
   * Normal request.
   *
   * Existing behavior is preserved:
   * every call gets fresh server data.
   */

  get: () => {

    /*
     * If a request is already running,
     * reuse it instead of sending another request.
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


  /*
   * Return already-loaded records immediately.
   */

  getMemoryCache: () =>
    recordsMemoryCache,


  /*
   * Background preload.
   *
   * Does NOT affect the returned UI.
   */

  preload: () => {

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

  /*
   * Fresh player list.
   *
   * Duplicate requests are prevented.
   */

  listAll: () => {

    if (
      playersMemoryCache !== null
    ) {

      return Promise.resolve(
        playersMemoryCache
      );

    }


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


  /*
   * Existing cache.
   */

  getMemoryCache: () =>
    playersMemoryCache,

};


/* =========================================================
   NOTIFICATIONS
========================================================= */

export const Notifications = {

  register: (data) =>
    api
      .post('/notifications/register', data)
      .then(r => r.data),


  getUser: (id) =>
    api
      .get(`/notifications/${id}`)
      .then(r => r.data),


  unregister: (data) =>
    api
      .post('/notifications/unregister', data)
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
