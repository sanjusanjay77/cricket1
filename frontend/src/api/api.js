import axios from 'axios';

/* =========================================================
   API CONFIGURATION
========================================================= */

const API_URL = (
  import.meta.env.VITE_API_URL || '/api'
).replace(/\/$/, '');

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT = 30000;

/* =========================================================
   AXIOS INSTANCE
========================================================= */

const api = axios.create({
  baseURL: API_URL,
  timeout: REQUEST_TIMEOUT,

  headers: {
    'Content-Type': 'application/json'
  }
});

/* =========================================================
   SLEEP
========================================================= */

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

/* =========================================================
   RETRY CHECK
========================================================= */

function shouldRetry(error) {
  if (!error) {
    return false;
  }

  // Network error / timeout / server unavailable
  if (!error.response) {
    return true;
  }

  const status = error.response.status;

  return [
    408,
    429,
    500,
    502,
    503,
    504
  ].includes(status);
}

/* =========================================================
   REQUEST WITH RETRY
========================================================= */

async function requestWithRetry(config) {
  let lastError;

  for (
    let attempt = 0;
    attempt <= MAX_RETRIES;
    attempt++
  ) {
    try {
      if (attempt > 0) {
        console.log(
          `🔄 API retry ${attempt}/${MAX_RETRIES}: ` +
          `${config.method?.toUpperCase() || 'GET'} ${config.url}`
        );
      }

      const response = await api.request(config);

      return response;

    } catch (error) {
      lastError = error;

      if (!shouldRetry(error)) {
        throw error;
      }

      if (attempt >= MAX_RETRIES) {
        break;
      }

      const delay = Math.pow(2, attempt) * 1000;

      console.warn(
        `⚠️ API request failed. Retrying in ${delay / 1000}s...`,
        {
          url: config.url,
          status: error.response?.status,
          message: error.message
        }
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

/* =========================================================
   FRIENDLY ERROR MESSAGE
========================================================= */

export function getApiErrorMessage(error) {
  if (!error?.response) {
    return 'Unable to connect to the server. Please try again.';
  }

  const status = error.response.status;

  if (status === 400) {
    return (
      error.response.data?.error ||
      'Invalid request.'
    );
  }

  if (status === 401) {
    return 'You are not authorized to perform this action.';
  }

  if (status === 403) {
    return 'You do not have permission to perform this action.';
  }

  if (status === 404) {
    return (
      error.response.data?.error ||
      'The requested data was not found.'
    );
  }

  if (status === 409) {
    return (
      error.response.data?.error ||
      'This data already exists or conflicts with another record.'
    );
  }

  if (status === 429) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  if (status >= 500) {
    return 'Server temporarily unavailable. Please try again.';
  }

  return (
    error.response.data?.error ||
    error.message ||
    'Something went wrong.'
  );
}

/* =========================================================
   RESPONSE DATA HELPER
========================================================= */

function getData(response) {
  return response.data;
}

/* =========================================================
   TEAMS
========================================================= */

export const Teams = {
  list: () =>
    requestWithRetry({
      method: 'GET',
      url: '/teams'
    }).then(getData),

  get: (id) =>
    requestWithRetry({
      method: 'GET',
      url: `/teams/${id}`
    }).then(getData),

  create: (data) =>
    requestWithRetry({
      method: 'POST',
      url: '/teams',
      data
    }).then(getData),

  update: (id, data) =>
    requestWithRetry({
      method: 'PUT',
      url: `/teams/${id}`,
      data
    }).then(getData),

  remove: (id) =>
    requestWithRetry({
      method: 'DELETE',
      url: `/teams/${id}`
    })
};

/* =========================================================
   PLAYERS
========================================================= */

export const Players = {
  list: (team_id) =>
    requestWithRetry({
      method: 'GET',
      url: '/players',
      params: team_id
        ? { team_id }
        : undefined
    }).then(getData),

  listAll: () =>
    requestWithRetry({
      method: 'GET',
      url: '/players/all/with-teams'
    }).then(getData),

  stats: (id) =>
    requestWithRetry({
      method: 'GET',
      url: `/players/${id}/stats`
    }).then(getData),

  create: (data) =>
    requestWithRetry({
      method: 'POST',
      url: '/players',
      data
    }).then(getData),

  update: (id, data) =>
    requestWithRetry({
      method: 'PUT',
      url: `/players/${id}`,
      data
    }).then(getData),

  remove: (id) =>
    requestWithRetry({
      method: 'DELETE',
      url: `/players/${id}`
    })
};

/* =========================================================
   MATCHES
========================================================= */

export const Matches = {
  list: () =>
    requestWithRetry({
      method: 'GET',
      url: '/matches'
    }).then(getData),

  get: (id) =>
    requestWithRetry({
      method: 'GET',
      url: `/matches/${id}`
    }).then(getData),

  create: (data) =>
    requestWithRetry({
      method: 'POST',
      url: '/matches',
      data
    }).then(getData),

  setToss: (id, data) =>
    requestWithRetry({
      method: 'POST',
      url: `/matches/${id}/toss`,
      data
    }).then(getData),

  startSecondInnings: (id) =>
    requestWithRetry({
      method: 'POST',
      url: `/matches/${id}/second-innings`
    }).then(getData),

  remove: (id) =>
    requestWithRetry({
      method: 'DELETE',
      url: `/matches/${id}`
    })
};

/* =========================================================
   INNINGS
========================================================= */

export const Innings = {
  scoreboard: (id) =>
    requestWithRetry({
      method: 'GET',
      url: `/innings/${id}/scoreboard`
    }).then(getData),

  setBatsmen: (id, data) =>
    requestWithRetry({
      method: 'POST',
      url: `/innings/${id}/set-batsmen`,
      data
    }).then(getData),

  swapBatsmen: (id) =>
    requestWithRetry({
      method: 'POST',
      url: `/innings/${id}/swap-batsmen`
    }).then(getData),

  swapStrike: (id) =>
    requestWithRetry({
      method: 'POST',
      url: `/innings/${id}/swap-strike`
    }).then(getData),

  setBowler: (id, data) =>
    requestWithRetry({
      method: 'POST',
      url: `/innings/${id}/set-bowler`,
      data
    }).then(getData),

  ball: (id, data) =>
    requestWithRetry({
      method: 'POST',
      url: `/innings/${id}/ball`,
      data
    }).then(getData),

  undo: (id) =>
    requestWithRetry({
      method: 'POST',
      url: `/innings/${id}/undo`
    }).then(getData)
};

/* =========================================================
   RECORDS
========================================================= */

export const Records = {
  get: () =>
    requestWithRetry({
      method: 'GET',
      url: '/records'
    }).then(getData)
};

/* =========================================================
   NOTIFICATIONS
========================================================= */

export const Notifications = {
  register: (data) =>
    requestWithRetry({
      method: 'POST',
      url: '/notifications/register',
      data
    }).then(getData),

  getUser: (id) =>
    requestWithRetry({
      method: 'GET',
      url: `/notifications/${id}`
    }).then(getData),

  updatePreferences: (id, data) =>
    requestWithRetry({
      method: 'PUT',
      url: `/notifications/${id}/preferences`,
      data
    }).then(getData)
};

/* =========================================================
   HEALTH CHECK
========================================================= */

export const Health = {
  check: () =>
    requestWithRetry({
      method: 'GET',
      url: '/health'
    }).then(getData)
};

/* =========================================================
   DEFAULT API
========================================================= */

export default api;
