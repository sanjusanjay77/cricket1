import axios from 'axios';

/* =========================================================
   API CONFIGURATION
========================================================= */

const API_URL = (
  import.meta.env.VITE_API_URL ||
  'https://cricket1-mvsi.onrender.com/api'
).replace(/\/+$/, '');

const REQUEST_TIMEOUT = 30000;
const HEALTH_TIMEOUT = 10000;

const MAX_RETRIES = 3;

const RETRY_DELAYS = [
  800,
  1600,
  3200,
];

const RETRYABLE_STATUSES = new Set([
  408,
  429,
  500,
  502,
  503,
  504,
]);

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

function isCanceled(error) {
  return (
    axios.isCancel(error) ||
    error?.code === 'ERR_CANCELED'
  );
}

function isSafeMethod(method) {
  return [
    'get',
    'head',
    'options',
  ].includes(
    String(method || 'get').toLowerCase()
  );
}

function shouldRetry(error) {
  if (!error || isCanceled(error)) {
    return false;
  }

  const status = error.response?.status;

  // Network errors, connection resets and timeouts.
  if (!error.response) {
    return [
      'ERR_NETWORK',
      'ECONNABORTED',
      'ETIMEDOUT',
    ].includes(error.code);
  }

  return RETRYABLE_STATUSES.has(status);
}

function getRetryDelay(error, retryIndex) {
  const retryAfter =
    error?.response?.headers?.['retry-after'];

  if (retryAfter) {
    const seconds = Number(retryAfter);

    if (Number.isFinite(seconds) && seconds >= 0) {
      // Respect Retry-After, with a maximum wait of 30 sec.
      return Math.min(seconds * 1000, 30000);
    }

    const retryDate = Date.parse(retryAfter);

    if (!Number.isNaN(retryDate)) {
      return Math.min(
        Math.max(0, retryDate - Date.now()),
        30000
      );
    }
  }

  return RETRY_DELAYS[retryIndex] ??
    RETRY_DELAYS[RETRY_DELAYS.length - 1];
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

    if (!config || isCanceled(error)) {
      return Promise.reject(error);
    }

    const method = String(
      config.method || 'get'
    ).toLowerCase();

    // Never retry writes automatically.
    // A failed response does not prove the server
    // failed to complete the operation.
    if (!isSafeMethod(method)) {
      return Promise.reject(error);
    }

    const retryCount = Number(
      config._retryCount || 0
    );

    if (
      retryCount >= MAX_RETRIES ||
      !shouldRetry(error)
    ) {
      return Promise.reject(error);
    }

    const delay = getRetryDelay(
      error,
      retryCount
    );

    config._retryCount = retryCount + 1;

    console.warn(
      `[API] Retrying request ${config._retryCount}/${MAX_RETRIES}`,
      {
        method: method.toUpperCase(),
        url: config.url,
        status: error.response?.status ?? null,
        code: error.code ?? null,
        delay,
      }
    );

    await wait(delay);

    // If the original request was canceled during
    // the delay, do not start another request.
    if (config.signal?.aborted) {
      return Promise.reject(
        new axios.CanceledError(
          'Request canceled'
        )
      );
    }

    return api.request(config);
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

let playersMemoryCache = null;
let playersRequestPromise = null;

export function invalidatePlayerCache() {
  playersMemoryCache = null;
}

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
      .then(r => {
        invalidatePlayerCache();
        return r.data;
      }),

  update: (id, data) =>
    api.put(`/players/${id}`, data)
      .then(r => {
        invalidatePlayerCache();
        return r.data;
      }),

  remove: id =>
    api.delete(`/players/${id}`)
      .then(r => {
        invalidatePlayerCache();
        return r.data;
      }),
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
    api.delete(`/matches/${id}`)
      .then(r => r.data),
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

  correctBatsmanHistory: (inningsId, data) =>
    api.put(
      `/innings/${inningsId}/correct-batsman-history`,
      data
    ).then(r => r.data),

  // Records one ball action.
  // Do not blindly retry if the response is lost.
  ball: (id, data) =>
    api.post(`/innings/${id}/ball`, data)
      .then(r => r.data),

  undo: id =>
    api.post(`/innings/${id}/undo`)
      .then(r => r.data),
};

/* =========================================================
   RECORDS CACHE
========================================================= */

let recordsMemoryCache = null;
let recordsRequestPromise = null;

export function invalidateRecordsCache() {
  recordsMemoryCache = null;
}

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
   CACHED PLAYERS
========================================================= */

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
      timeout: HEALTH_TIMEOUT,
    });

    return {
      online: true,
      status: response.status,
      data: response.data,
    };
  } catch (error) {
    return {
      online: false,
      status: error?.response?.status ?? null,
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
  if (isCanceled(error)) {
    return 'Request canceled.';
  }

  const responseData = error?.response?.data;

  if (typeof responseData?.message === 'string') {
    return responseData.message;
  }

  if (typeof responseData?.error === 'string') {
    return responseData.error;
  }

  const status = error?.response?.status;

  if (status === 400) {
    return 'Invalid request. Please check the entered information.';
  }

  if (status === 401) {
    return 'Authentication required. Please sign in again.';
  }

  if (status === 403) {
    return 'You do not have permission to perform this action.';
  }

  if (status === 404) {
    return 'The requested resource was not found.';
  }

  if (status === 409) {
    return 'This action conflicts with the current match state. Refresh the scoreboard.';
  }

  if (status === 429) {
    return 'Too many requests. Wait a moment before trying again.';
  }

  if (status === 408) {
    return 'The server timed out. Refresh the scoreboard before retrying a scoring action.';
  }

  if ([500, 502, 503, 504].includes(status)) {
    return 'The server is temporarily unavailable. Refresh the scoreboard and try again.';
  }

  if (error?.code === 'ERR_NETWORK') {
    return 'Cannot reach the server. Check your internet connection or the server status.';
  }

  if (
    error?.code === 'ECONNABORTED' ||
    error?.code === 'ETIMEDOUT'
  ) {
    return 'The request timed out. Check the latest scoreboard before retrying.';
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
