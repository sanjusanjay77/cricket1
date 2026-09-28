import axios from 'axios';

const API_URL =
  import.meta.env.VITE_API_URL ||
  'https://cricket1-mvsi.onrender.com/api';


/* =========================================================
   API CONFIGURATION
========================================================= */

const REQUEST_TIMEOUT = 30000;

const MAX_RETRIES = 3;

const RETRY_DELAYS = [
  800,
  1600,
  3200,
];


/* =========================================================
   AXIOS
========================================================= */

const api = axios.create({
  baseURL: API_URL,

  timeout:
    REQUEST_TIMEOUT,

  headers: {
    'Content-Type':
      'application/json',
  },
});


/* =========================================================
   RETRY HELPERS
========================================================= */

/*
 * Wait before retrying.
 */

function wait(ms) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );

}


/*
 * Determine whether a request
 * is safe/useful to retry.
 *
 * We retry:
 *
 * - Network errors
 * - Timeout
 * - 408
 * - 429
 * - 500
 * - 502
 * - 503
 * - 504
 *
 * We do NOT retry normal 400-level
 * validation/authentication errors.
 */

function shouldRetry(
  error
) {

  const status =
    error?.response?.status;

  /*
   * No response normally means:
   *
   * - network failure
   * - Render waking up
   * - connection timeout
   * - browser connection problem
   */

  if (!error?.response) {

    return true;

  }


  /*
   * Temporary server errors.
   */

  if (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {

    return true;

  }


  return false;

}


/*
 * Prevent dangerous automatic retries
 * for operations where repeating the request
 * could create duplicate database records.
 *
 * GET requests are always safe to retry.
 *
 * POST requests are retried only when there
 * was no server response.
 *
 * This is especially important for:
 *
 * /innings/:id/ball
 *
 * because we don't want to accidentally
 * record the same cricket ball twice.
 */

function isSafeToRetry(
  error,
  method
) {

  const normalizedMethod =
    String(
      method || 'get'
    ).toLowerCase();


  /*
   * GET is safe.
   */

  if (
    normalizedMethod ===
    'get'
  ) {

    return true;

  }


  /*
   * HEAD/OPTIONS are safe.
   */

  if (
    normalizedMethod ===
      'head' ||
    normalizedMethod ===
      'options'
  ) {

    return true;

  }


  /*
   * For POST/PUT/PATCH/DELETE:
   *
   * only retry when the browser did not
   * receive a server response.
   *
   * This avoids duplicate writes when the
   * server already processed the request
   * but the response was lost.
   */

  if (
    !error?.response
  ) {

    return true;

  }


  return false;

}


/* =========================================================
   REQUEST INTERCEPTOR
========================================================= */

/*
 * Add a retry counter to every request.
 */

api.interceptors.request.use(
  config => {

    if (
      typeof config._retryCount !==
      'number'
    ) {

      config._retryCount = 0;

    }

    return config;

  },

  error =>
    Promise.reject(error)
);


/* =========================================================
   RESPONSE INTERCEPTOR
========================================================= */

api.interceptors.response.use(

  /*
   * Successful request.
   */

  response =>
    response,

  /*
   * Failed request.
   */

  async error => {

    const config =
      error?.config;


    /*
     * If Axios does not have request
     * configuration, return the error.
     */

    if (!config) {

      return Promise.reject(
        error
      );

    }


    /*
     * Current retry count.
     */

    const retryCount =
      Number(
        config._retryCount || 0
      );


    /*
     * HTTP method.
     */

    const method =
      String(
        config.method || 'get'
      ).toLowerCase();


    /*
     * Check retry conditions.
     */

    const retryAllowed =
      shouldRetry(
        error
      );

    const methodSafe =
      isSafeToRetry(
        error,
        method
      );


    /*
     * Stop after maximum retries.
     */

    if (
      retryCount >=
        MAX_RETRIES ||
      !retryAllowed ||
      !methodSafe
    ) {

      return Promise.reject(
        error
      );

    }


    /*
     * Increase retry counter.
     */

    config._retryCount =
      retryCount + 1;


    /*
     * Progressive delay.
     */

    const delay =
      RETRY_DELAYS[
        retryCount
      ] ||
      RETRY_DELAYS[
        RETRY_DELAYS.length - 1
      ];


    console.warn(
      `⚠️ API request failed. Retrying ${config._retryCount}/${MAX_RETRIES} in ${delay}ms...`,
      {
        method:
          method.toUpperCase(),

        url:
          config.url,

        status:
          error?.response?.status,

        message:
          error?.message,
      }
    );


    await wait(
      delay
    );


    /*
     * Try the exact same request again.
     */

    return api(
      config
    );

  }

);


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
      .post(
        '/teams',
        data
      )
      .then(r => r.data),


  /* -------------------------------------------------------
     UPDATE TEAM
  ------------------------------------------------------- */

  update: (id, data) =>
    api
      .put(
        `/teams/${id}`,
        data
      )
      .then(r => r.data),


  /* -------------------------------------------------------
     DELETE TEAM
  ------------------------------------------------------- */

  remove: (id) =>
    api
      .delete(
        `/teams/${id}`
      )
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
      .get(
        '/players',
        {
          params: {
            team_id,
          },
        }
      )
      .then(r => r.data),


  /* -------------------------------------------------------
     GET ALL PLAYERS WITH TEAMS
  ------------------------------------------------------- */

  listAll: () =>
    api
      .get(
        '/players/all/with-teams'
      )
      .then(r => r.data),


  /* -------------------------------------------------------
     GET ALL CAREER STATS
  ------------------------------------------------------- */

  allCareerStats: () =>
    api
      .get(
        '/players/all/career-stats'
      )
      .then(r => r.data),


  /* -------------------------------------------------------
     GET PLAYER STATS
  ------------------------------------------------------- */

  stats: (id) =>
    api
      .get(
        `/players/${id}/stats`
      )
      .then(r => r.data),


  /* -------------------------------------------------------
     CREATE PLAYER
  ------------------------------------------------------- */

  create: (data) =>
    api
      .post(
        '/players',
        data
      )
      .then(r => r.data),


  /* -------------------------------------------------------
     UPDATE PLAYER
  ------------------------------------------------------- */

  update: (id, data) =>
    api
      .put(
        `/players/${id}`,
        data
      )
      .then(r => r.data),


  /* -------------------------------------------------------
     DELETE PLAYER
  ------------------------------------------------------- */

  remove: (id) =>
    api
      .delete(
        `/players/${id}`
      )
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
      .get(
        `/matches/${id}`
      )
      .then(r => r.data),


  /* -------------------------------------------------------
     CREATE MATCH
  ------------------------------------------------------- */

  create: (data) =>
    api
      .post(
        '/matches',
        data
      )
      .then(r => r.data),


  /* -------------------------------------------------------
     SET TOSS
  ------------------------------------------------------- */

  setToss: (id, data) =>
    api
      .post(
        `/matches/${id}/toss`,
        data
      )
      .then(r => r.data),


  /* -------------------------------------------------------
     START SECOND INNINGS
  ------------------------------------------------------- */

  startSecondInnings: (id) =>
    api
      .post(
        `/matches/${id}/second-innings`
      )
      .then(r => r.data),


  /* -------------------------------------------------------
     DELETE MATCH
  ------------------------------------------------------- */

  remove: (id) =>
    api
      .delete(
        `/matches/${id}`
      )
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
      .get(
        `/innings/${id}/scoreboard`
      )
      .then(r => r.data),


  /* -------------------------------------------------------
     SET BATSMEN
  ------------------------------------------------------- */

  setBatsmen: (id, data) =>
    api
      .post(
        `/innings/${id}/set-batsmen`,
        data
      )
      .then(r => r.data),


  /* -------------------------------------------------------
     SWAP STRIKE
  ------------------------------------------------------- */

  swapStrike: (id) =>
    api
      .post(
        `/innings/${id}/swap-batsmen`
      )
      .then(r => r.data),


  /* -------------------------------------------------------
     SET BOWLER
  ------------------------------------------------------- */

  setBowler: (id, data) =>
    api
      .post(
        `/innings/${id}/set-bowler`,
        data
      )
      .then(r => r.data),


  /* -------------------------------------------------------
     RECORD BALL
  ------------------------------------------------------- */

  ball: (id, data) =>
    api
      .post(
        `/innings/${id}/ball`,
        data
      )
      .then(r => r.data),


  /* -------------------------------------------------------
     UNDO LAST BALL
  ------------------------------------------------------- */

  undo: (id) =>
    api
      .post(
        `/innings/${id}/undo`
      )
      .then(r => r.data),

};


/* =========================================================
   RECORDS CACHE
========================================================= */

let recordsMemoryCache =
  null;

let playersMemoryCache =
  null;


/*
 * Prevent duplicate requests.
 */

let recordsRequestPromise =
  null;

let playersRequestPromise =
  null;


/* =========================================================
   RECORDS
========================================================= */

export const Records = {

  /* -------------------------------------------------------
     GET RECORDS
  ------------------------------------------------------- */

  get: () => {

    /*
     * Reuse an existing request.
     */

    if (
      recordsRequestPromise
    ) {

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

    if (
      recordsMemoryCache !==
      null
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
      playersMemoryCache !==
      null
    ) {

      return Promise.resolve(
        playersMemoryCache
      );

    }


    /*
     * Reuse existing request.
     */

    if (
      playersRequestPromise
    ) {

      return playersRequestPromise;

    }


    playersRequestPromise =
      api
        .get(
          '/players/all/with-teams'
        )
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
      .get(
        `/notifications/${id}`
      )
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
   HEALTH CHECK
========================================================= */

/*
 * This does NOT modify the database.
 *
 * It simply checks whether the backend is reachable.
 *
 * NOTE:
 * Your backend must have:
 *
 * GET /api/health
 *
 * for this function to return successfully.
 */

export async function healthCheck() {

  try {

    const response =
      await api.get(
        '/health',
        {
          timeout: 10000,
        }
      );

    return {
      online:
        true,

      status:
        response.status,

      data:
        response.data,
    };

  } catch (error) {

    return {
      online:
        false,

      status:
        error?.response?.status ||
        null,

      message:
        getApiErrorMessage(
          error,
          'Server is currently unavailable'
        ),
    };

  }

}


/* =========================================================
   ERROR MESSAGE
========================================================= */

export function getApiErrorMessage(
  error,
  fallback = 'Something went wrong'
) {

  /*
   * Server returned an explicit message.
   */

  if (
    error?.response?.data?.message
  ) {

    return String(
      error.response.data.message
    );

  }


  if (
    error?.response?.data?.error
  ) {

    return String(
      error.response.data.error
    );

  }


  /*
   * Network error.
   */

  if (
    error?.code ===
      'ERR_NETWORK'
  ) {

    return 'Unable to connect to the server. Retrying automatically...';

  }


  /*
   * Timeout.
   */

  if (
    error?.code ===
      'ECONNABORTED' ||
    error?.code ===
      'ETIMEDOUT'
  ) {

    return 'Server is taking too long to respond. Please wait a moment and try again.';

  }


  /*
   * 502 / 503 / 504.
   */

  const status =
    error?.response?.status;

  if (
    status === 502 ||
    status === 503 ||
    status === 504
  ) {

    return 'Server is temporarily unavailable. Please wait a moment and try again.';

  }


  /*
   * Axios message.
   */

  if (
    error?.message
  ) {

    return String(
      error.message
    );

  }


  return fallback;

}


/* =========================================================
   DEFAULT API
========================================================= */

export default api;
