import axios from 'axios';

/* =========================================================
   API CONFIGURATION
========================================================= */

const API_URL = (
  import.meta.env.VITE_API_URL || '/api'
).replace(/\/$/, '');

/*
 * How many times a failed request should be retried.
 *
 * Example:
 * Attempt 1 → fails
 * Wait 1 second
 * Attempt 2 → fails
 * Wait 2 seconds
 * Attempt 3 → fails
 * Wait 4 seconds
 * Attempt 4 → final attempt
 */
const MAX_RETRIES = 3;

/*
 * Maximum time one request is allowed to wait.
 *
 * Render free services can sometimes take a little time
 * to wake up, so 30 seconds is used here.
 */
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
   RETRY HELPER
========================================================= */

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

/*
 * Decide whether a failed request should be retried.
 *
 * We retry:
 * - Network errors
 * - 408 Request Timeout
 * - 429 Too Many Requests
 * - 500 Internal Server Error
 * - 502 Bad Gateway
 * - 503 Service Unavailable
 * - 504 Gateway Timeout
 *
 * We DO NOT retry normal client errors such as:
 * - 400
 * - 401
 * - 403
 * - 404
 * - 409
 *
 * Those usually indicate a real application/input problem.
 */
function shouldRetry(error) {
  if (!error) {
    return false;
  }

  /*
   * No response usually means:
   * - network problem
   * - Render sleeping/unavailable
   * - connection failed
   * - CORS/network interruption
   * - timeout
   */
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
   REQUEST FUNCTION WITH AUTOMATIC RETRY
========================================================= */

async function requestWithRetry(config) {
  let lastError;

  for (
    let attempt = 0;
    attempt <= MAX_RETRIES;
    attempt++
  ) {
    try {
      /*
       * If this is a retry, show useful information
       * in the browser console.
       */
      if (attempt > 0) {
        console.log(
          `🔄 API retry ${attempt}/${MAX_RETRIES}: ${config.method?.toUpperCase() || 'GET'} ${config.url}`
        );
      }

      const response = await api.request(config);

      /*
       * Successful response.
       */
      return response;

    } catch (error) {
      lastError = error;

      /*
       * Don't retry errors that should not be retried.
       */
      if (!shouldRetry(error)) {
        throw error;
      }

      /*
       * If this was the final attempt, stop.
       */
      if (attempt >= MAX_RETRIES) {
        break;
      }

      /*
       * Exponential backoff:
       *
       * Retry 1 → 1 second
       * Retry 2 → 2 seconds
       * Retry 3 → 4 seconds
       */
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

  /*
   * All retries failed.
   */
  throw lastError;
}

/* =========================================================
   FRIENDLY ERROR HELPER
========================================================= */

export function getApiErrorMessage(error) {
  /*
   * No response means the browser could not receive
   * a proper response from the backend.
   */
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
      params: team_id ? { team_id } : undefined
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
      url: `/matches/${id`
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

  swapStrike: (id) =>
    requestWithRetry({
      method: 'POST',
      url: `/innings/${id}/swap-batsmen`
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
