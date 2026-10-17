```javascript
import axios from 'axios';

/* =========================================================
   API CONFIGURATION
========================================================= */

const API_URL =
  import.meta.env.VITE_API_URL ||
  'https://cricket1-mvsi.onrender.com/api';

const REQUEST_TIMEOUT = 30000;
const MAX_RETRIES = 3;

const RETRY_DELAYS = [
  800,
  1600,
  3200,
];

/* =========================================================
   AXIOS INSTANCE
========================================================= */

const api = axios.create({
  baseURL: API_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

/* =========================================================
   RETRY HELPERS
========================================================= */

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function shouldRetry(error) {
  const status = error?.response?.status;

  if (!error?.response) {
    return true;
  }

  return [
    408,
    429,
    500,
    502,
    503,
    504,
  ].includes(status);
}

function isSafeToRetry(error, method) {
  const normalizedMethod =
    String(method || 'get').toLowerCase();

  // Read-only requests are safe to retry.
  if (
    normalizedMethod === 'get' ||
    normalizedMethod === 'head' ||
    normalizedMethod === 'options'
  ) {
    return true;
  }

  /*
   * Do not automatically retry a write request.
   *
   * The server may have completed the operation even
   * when the browser did not receive the response.
   *
   * This prevents accidental duplicate scoring actions.
   */
  return false;
}

/* =========================================================
   REQUEST INTERCEPTOR
========================================================= */

api.interceptors.request.use(
  config => {
    if (typeof config._retryCount !== 'number') {
      config._retryCount = 0;
    }

    return config;
  },
  error => Promise.reject(error)
);

/* =========================================================
   RESPONSE INTERCEPTOR
========================================================= */

api.interceptors.response.use(
  response => response,

  async error => {
    const config = error?.config;

    if (!config) {
      return Promise.reject(error);
    }

    const retryCount =
      Number(config._retryCount || 0);

    const method =
      String(config.method || 'get').toLowerCase();

    if (
      retryCount >= MAX_RETRIES ||
      !shouldRetry(error) ||
      !isSafeToRetry(error, method)
    ) {
      return Promise.reject(error);
    }

    config._retryCount = retryCount + 1;

    const delay =
      RETRY_DELAYS[retryCount] ??
      RETRY_DELAYS[RETRY_DELAYS.length - 1];

    console.warn(
      `API retry ${config._retryCount}/${MAX_RETRIES}`,
      {
        method: method.toUpperCase(),
        url: config.url,
        status: error?.response?.status,
        delay,
      }
    );

    await wait(delay);

    return api(config);
  }
);

/* =========================================================
   TEAMS
========================================================= */

export const Teams = {
  list: () =>
    api.get('/teams').then(r => r.data),

  get: id =>
    api.get(`/teams/${id}`).then(r => r.data),

  create: data =>
    api.post('/teams', data).then(r => r.data),

  update: (id, data) =>
    api.put(`/teams/${id}`, data).then(r => r.data),

  remove: id =>
    api.delete(`/teams/${id}`).then(r => r.data),
};

/* =========================================================
   PLAYERS
========================================================= */

export const Players = {
  list: team_id =>
    api.get('/players', {
      params: { team_id },
    }).then(r => r.data),

  listAll: () =>
    api.get('/players/all/with-teams')
      .then(r => r.data),

  allCareerStats: () =>
    api.get('/players/all/career-stats')
      .then(r => r.data),

  stats: id =>
    api.get(`/players/${id}/stats`)
      .then(r => r.data),

  create: data =>
    api.post('/players', data)
      .then(r => r.data),

  /*
   * Rename an existing player.
   *
   * The backend must update the existing player record
   * using the same ID. It must not delete and recreate
   * the player or reset historical statistics.
   */
  update: (id, data) =>
    api.put(`/players/${id}`, data)
      .then(r => r.data),

  remove: id =>
    api.delete(`/players/${id}`)
      .then(r => r.data),
};

/* =========================================================
   MATCHES
========================================================= */

export const Matches = {
  list: () =>
    api.get('/matches').then(r => r.data),

  get: id =>
    api.get(`/matches/${id}`).then(r => r.data),

  create: data =>
    api.post('/matches', data).then(r => r.data),

  setToss: (id, data) =>
    api.post(`/matches/${id}/toss`, data)
      .then(r => r.data),

  startSecondInnings: id =>
    api.post(`/matches/${id}/second-innings`)
      .then(r => r.data),

  remove: id =>
    api.delete(`/matches/${id}`).then(r => r.data),
};

/* =========================================================
   INNINGS
========================================================= */

export const Innings = {
  scoreboard: id =>
    api.get(`/innings/${id}/scoreboard`)
      .then(r => r.data),

  setBatsmen: (id, data) =>
    api.post(`/innings/${id}/set-batsmen`, data)
      .then(r => r.data),

  swapStrike: id =>
    api.post(`/innings/${id}/swap-batsmen`)
      .then(r => r.data),

  setBowler: (id, data) =>
    api.post(`/innings/${id}/set-bowler`, data)
      .then(r => r.data),

  /*
   * Record exactly one ball action.
   * Do not automatically repeat failed scoring writes.
   */
  ball: (id, data) =>
    api.post(`/innings/${id}/ball`, data)
      .then(r => r.data),

  /*
   * Undo the most recent recorded ball action.
   * The backend must reverse only that action and
   * restore its previous player and innings state.
   */
  undo: id =>
    api.post(`/innings/${id}/undo`)
      .then(r => r.data),
};

/* =========================================================
   RECORDS CACHE
========================================================= */

let recordsMemoryCache = null;
let recordsRequestPromise = null;

export const Records = {
  get: () => {
    if (recordsRequestPromise) {
      return recordsRequestPromise;
    }

    recordsRequestPromise = api
      .get('/records')
      .then(r => {
        recordsMemoryCache = r.data;
        return r.data;
      })
      .finally(() => {
        recordsRequestPromise = null;
      });

    return recordsRequestPromise;
  },

  getMemoryCache: () => recordsMemoryCache,

  preload: () => {
    if (recordsMemoryCache !== null) {
      return Promise.resolve(recordsMemoryCache);
    }

    return Records.get();
  },
};

/* =========================================================
   PLAYER CACHE
========================================================= */

let playersMemoryCache = null;
let playersRequestPromise = null;

export const CachedPlayers = {
  listAll: () => {
    if (playersMemoryCache !== null) {
      return Promise.resolve(playersMemoryCache);
    }

    if (playersRequestPromise) {
      return playersRequestPromise;
    }

    playersRequestPromise = api
      .get('/players/all/with-teams')
      .then(r => {
        playersMemoryCache = r.data;
        return r.data;
      })
      .finally(() => {
        playersRequestPromise = null;
      });

    return playersRequestPromise;
  },

  getMemoryCache: () => playersMemoryCache,
};

/* =========================================================
   CACHE INVALIDATION
========================================================= */

/*
 * Call after updating players if another screen uses
 * CachedPlayers.listAll().
 */
export function invalidatePlayerCache() {
  playersMemoryCache = null;
}

/*
 * Call after changing match records when a screen needs
 * fresh records rather than previously cached records.
 */
export function invalidateRecordsCache() {
  recordsMemoryCache = null;
}

/* =========================================================
   NOTIFICATIONS
========================================================= */

export const Notifications = {
  register: data =>
    api.post('/notifications/register', data)
      .then(r => r.data),

  getUser: id =>
    api.get(`/notifications/${id}`)
      .then(r => r.data),

  unregister: data =>
    api.post('/notifications/unregister', data)
      .then(r => r.data),
};

/* =========================================================
   HEALTH CHECK
========================================================= */

export async function healthCheck() {
  try {
    const response = await api.get('/health', {
      timeout: 10000,
    });

    return {
      online: true,
      status: response.status,
      data: response.data,
    };
  } catch (error) {
    return {
      online: false,
      status: error?.response?.status || null,
      message: getApiErrorMessage(
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
  if (error?.response?.data?.message) {
    return String(error.response.data.message);
  }

  if (error?.response?.data?.error) {
    return String(error.response.data.error);
  }

  if (error?.code === 'ERR_NETWORK') {
    return 'Unable to connect to the server. Check your connection and try again.';
  }

  if (
    error?.code === 'ECONNABORTED' ||
    error?.code === 'ETIMEDOUT'
  ) {
    return 'Server is taking too long to respond. Please check the scoreboard before retrying.';
  }

  const status = error?.response?.status;

  if ([502, 503, 504].includes(status)) {
    return 'Server is temporarily unavailable. Please wait and try again.';
  }

  if (status === 429) {
    return 'Too many requests. Wait a moment before trying again.';
  }

  if (error?.message) {
    return String(error.message);
  }

  return fallback;
}

/* =========================================================
   DEFAULT API
========================================================= */

export default api;
```
