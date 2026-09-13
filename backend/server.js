
require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

/* =========================================================
   CONFIGURATION
========================================================= */

const PORT = process.env.PORT || 4000;

const allowedOrigins = [
  'https://gcc-cricket.netlify.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(process.env.CORS_ORIGIN);
}

const uniqueOrigins = [...new Set(allowedOrigins)];

/* =========================================================
   SECURITY CONFIGURATION
========================================================= */

/*
 * Maximum JSON request size.
 *
 * Your cricket scorer does not need multi-megabyte
 * request bodies.
 */
const JSON_LIMIT = '256kb';

/*
 * Basic in-memory rate limiter.
 *
 * This protects the Node.js process from excessive
 * requests from the same IP.
 *
 * IMPORTANT:
 * This is NOT a replacement for Render/Cloudflare
 * DDoS protection.
 */
const rateLimitStore = new Map();

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 120;          // 120 requests/min/IP

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];

  if (forwarded) {
    return String(forwarded)
      .split(',')[0]
      .trim();
  }

  return (
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function rateLimit(req, res, next) {
  try {
    const ip = getClientIp(req);
    const now = Date.now();

    let record = rateLimitStore.get(ip);

    if (!record || now - record.start > RATE_LIMIT_WINDOW) {
      record = {
        start: now,
        count: 0
      };
    }

    record.count += 1;

    rateLimitStore.set(ip, record);

    /*
     * Cleanup old records periodically.
     */
    if (rateLimitStore.size > 5000) {
      for (const [key, value] of rateLimitStore.entries()) {
        if (now - value.start > RATE_LIMIT_WINDOW) {
          rateLimitStore.delete(key);
        }
      }
    }

    if (record.count > RATE_LIMIT_MAX) {
      console.warn(
        `🚨 Rate limit exceeded: ${ip}`
      );

      return res.status(429).json({
        error: 'Too many requests. Please try again later.'
      });
    }

    return next();
  } catch (err) {
    console.error(
      '❌ Rate limiter error:',
      err
    );

    /*
     * Never crash the server because of the
     * security middleware.
     */
    return next();
  }
}

/* =========================================================
   BASIC SECURITY HEADERS
========================================================= */

app.disable('x-powered-by');

/*
 * Trust Render's reverse proxy.
 *
 * This allows req.ip to correctly use the forwarded
 * client IP address.
 */
app.set('trust proxy', 1);

app.use((req, res, next) => {
  /*
   * Prevent MIME sniffing.
   */
  res.setHeader(
    'X-Content-Type-Options',
    'nosniff'
  );

  /*
   * Prevent the page from being embedded in an iframe
   * by another site.
   */
  res.setHeader(
    'X-Frame-Options',
    'DENY'
  );

  /*
   * Prevent browsers from sending the full URL as
   * referrer information to other origins.
   */
  res.setHeader(
    'Referrer-Policy',
    'strict-origin-when-cross-origin'
  );

  /*
   * Disable browser features that your cricket API
   * does not need.
   */
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );

  /*
   * Prevent browsers from attempting to guess
   * different content types.
   */
  res.setHeader(
    'X-XSS-Protection',
    '0'
  );

  /*
   * Basic Content Security Policy.
   *
   * This mainly applies when Express serves the
   * frontend itself.
   *
   * Netlify may provide its own frontend headers.
   */
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "connect-src 'self' https://gcc-cricket.netlify.app https://cricket1-mvsi.onrender.com wss://cricket1-mvsi.onrender.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  );

  /*
   * HTTPS-only protection.
   *
   * Only enable this in production.
   */
  if (
    process.env.NODE_ENV === 'production'
  ) {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }

  next();
});

/* =========================================================
   CORS
========================================================= */

const corsOptions = {
  origin: function (origin, callback) {
    /*
     * Requests without Origin can come from:
     * - Render health checks
     * - server-to-server requests
     * - command line tools
     *
     * Authentication will later protect sensitive
     * write operations.
     */
    if (!origin) {
      return callback(null, true);
    }

    if (uniqueOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn(
      `🚫 CORS blocked origin: ${origin}`
    );

    return callback(null, false);
  },

  credentials: true,

  methods: [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS'
  ],

  allowedHeaders: [
    'Content-Type',
    'Authorization'
  ],

  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

/* =========================================================
   GLOBAL RATE LIMIT
========================================================= */

app.use(rateLimit);

/* =========================================================
   BODY PARSER
========================================================= */

app.use(
  express.json({
    limit: JSON_LIMIT,
    strict: true
  })
);

/*
 * Reject URL-encoded bodies larger than necessary.
 */
app.use(
  express.urlencoded({
    extended: false,
    limit: '64kb'
  })
);

/* =========================================================
   REQUEST LOGGER
========================================================= */

app.use((req, res, next) => {
  const started = Date.now();

  const ip = getClientIp(req);

  res.on('finish', () => {
    const duration = Date.now() - started;

    console.log(
      `${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms) [${ip}]`
    );
  });

  next();
});

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get('/api/health', async (req, res) => {
  try {
    return res.status(200).json({
      status: 'ok',
      time: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      server: 'running',
      database: 'turso'
    });
  } catch (err) {
    console.error(
      '❌ Health check error:',
      err
    );

    return res.status(503).json({
      status: 'error',
      server: 'unhealthy'
    });
  }
});

/* =========================================================
   API ROUTES
========================================================= */

app.use(
  '/api/teams',
  require('./routes/teams')
);

app.use(
  '/api/players',
  require('./routes/players')
);

app.use(
  '/api/matches',
  require('./routes/matches')
);

app.use(
  '/api/innings',
  require('./routes/innings')
);

app.use(
  '/api/records',
  require('./routes/records')
);

/* =========================================================
   SOCKET.IO
========================================================= */

const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (uniqueOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(
        `🚫 Socket.IO CORS blocked: ${origin}`
      );

      return callback(
        new Error('Origin not allowed')
      );
    },

    credentials: true,

    methods: [
      'GET',
      'POST'
    ]
  },

  /*
   * Polling + WebSocket fallback.
   */
  transports: [
    'polling',
    'websocket'
  ],

  /*
   * Recover short network interruptions.
   */
  connectionStateRecovery: {
    maxDisconnectionDuration:
      2 * 60 * 1000,

    skipMiddlewares: true
  },

  /*
   * Prevent huge Socket.IO messages.
   */
  maxHttpBufferSize: 256 * 1024,

  /*
   * Prevent excessive ping traffic.
   */
  pingInterval: 25000,
  pingTimeout: 20000
});

app.set('io', io);

/* =========================================================
   SOCKET.IO CONNECTION
========================================================= */

io.on('connection', (socket) => {
  console.log(
    `🔌 Socket connected: ${socket.id}`
  );

  /* -------------------------------------------------------
     JOIN MATCH
  ------------------------------------------------------- */

  socket.on('join-match', (matchId) => {
    try {
      if (
        typeof matchId !== 'string' &&
        typeof matchId !== 'number'
      ) {
        console.warn(
          `⚠️ Invalid matchId from ${socket.id}`
        );

        return;
      }

      const cleanedId =
        String(matchId).trim();

      /*
       * UUIDs should not be enormous.
       */
      if (
        !cleanedId ||
        cleanedId.length > 100
      ) {
        console.warn(
          `⚠️ Invalid matchId length from ${socket.id}`
        );

        return;
      }

      const room =
        `match-${cleanedId}`;

      socket.join(room);

      console.log(
        `🏏 ${socket.id} joined ${room}`
      );
    } catch (err) {
      console.error(
        `❌ join-match error (${socket.id}):`,
        err
      );
    }
  });

  /* -------------------------------------------------------
     LEAVE MATCH
  ------------------------------------------------------- */

  socket.on('leave-match', (matchId) => {
    try {
      if (
        typeof matchId !== 'string' &&
        typeof matchId !== 'number'
      ) {
        return;
      }

      const cleanedId =
        String(matchId).trim();

      if (
        !cleanedId ||
        cleanedId.length > 100
      ) {
        return;
      }

      const room =
        `match-${cleanedId}`;

      socket.leave(room);

      console.log(
        `🚪 ${socket.id} left ${room}`
      );
    } catch (err) {
      console.error(
        `❌ leave-match error (${socket.id}):`,
        err
      );
    }
  });

  /* -------------------------------------------------------
     DISCONNECT
  ------------------------------------------------------- */

  socket.on('disconnect', (reason) => {
    console.log(
      `🔌 Socket disconnected: ${socket.id} - ${reason}`
    );
  });

  /* -------------------------------------------------------
     SOCKET ERROR
  ------------------------------------------------------- */

  socket.on('error', (err) => {
    console.error(
      `❌ Socket error ${socket.id}:`,
      err?.message || err
    );
  });
});

/* =========================================================
   FRONTEND STATIC FILES
========================================================= */

const frontendDist = path.join(
  __dirname,
  '..',
  'frontend',
  'dist'
);

if (fs.existsSync(frontendDist)) {
  console.log(
    `📦 Frontend found: ${frontendDist}`
  );

  app.use(
    express.static(frontendDist, {
      maxAge: '1d',

      /*
       * Do not expose hidden files.
       */
      dotfiles: 'deny',

      /*
       * Disable directory listings.
       */
      index: false
    })
  );

  /*
   * React SPA fallback.
   */
  app.get('*', (req, res) => {
    if (
      req.path.startsWith('/api')
    ) {
      return res.status(404).json({
        error: 'API route not found'
      });
    }

    return res.sendFile(
      path.join(
        frontendDist,
        'index.html'
      )
    );
  });
} else {
  console.log(
    `ℹ️ Frontend dist not found: ${frontendDist}`
  );
}

/* =========================================================
   404 HANDLER
========================================================= */

app.use((req, res) => {
  if (
    req.path.startsWith('/api')
  ) {
    return res.status(404).json({
      error: 'API endpoint not found'
    });
  }

  return res.status(404).json({
    error: 'Not found'
  });
});

/* =========================================================
   GLOBAL EXPRESS ERROR HANDLER
========================================================= */

app.use(
  (err, req, res, next) => {
    console.error(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    );

    console.error(
      '❌ EXPRESS ERROR'
    );

    console.error(
      'URL:',
      req.method,
      req.originalUrl
    );

    console.error(
      'Message:',
      err?.message
    );

    /*
     * Do not expose stack traces to users.
     */
    if (
      process.env.NODE_ENV !==
      'production'
    ) {
      console.error(
        'Stack:',
        err?.stack
      );
    }

    console.error(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    );

    if (res.headersSent) {
      return next(err);
    }

    /*
     * Malformed JSON.
     */
    if (
      err?.type ===
      'entity.parse.failed'
    ) {
      return res.status(400).json({
        error: 'Invalid JSON request.'
      });
    }

    /*
     * Request body too large.
     */
    if (
      err?.type ===
      'entity.too.large'
    ) {
      return res.status(413).json({
        error: 'Request body is too large.'
      });
    }

    /*
     * CORS rejection.
     */
    if (
      err?.message ===
      'Not allowed by CORS'
    ) {
      return res.status(403).json({
        error: 'Origin not allowed.'
      });
    }

    return res.status(500).json({
      error:
        'Internal server error'
    });
  }
);

/* =========================================================
   SERVER SHUTDOWN
========================================================= */

let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log(
      `⚠️ Shutdown already in progress (${signal})`
    );

    return;
  }

  isShuttingDown = true;

  console.log(
    `🛑 Received ${signal}. Shutting down safely...`
  );

  /*
   * Stop accepting new HTTP connections.
   */
  server.close(() => {
    console.log(
      '✅ HTTP server closed.'
    );

    process.exit(0);
  });

  /*
   * Close Socket.IO.
   */
  try {
    io.close();

    console.log(
      '✅ Socket.IO closed.'
    );
  } catch (err) {
    console.error(
      '⚠️ Socket.IO shutdown error:',
      err
    );
  }

  /*
   * Safety timeout.
   */
  setTimeout(() => {
    console.error(
      '⏰ Graceful shutdown timed out.'
    );

    process.exit(1);
  }, 10000).unref();
}

process.on(
  'SIGTERM',
  () =>
    gracefulShutdown('SIGTERM')
);

process.on(
  'SIGINT',
  () =>
    gracefulShutdown('SIGINT')
);

/* =========================================================
   UNHANDLED PROMISE REJECTION
========================================================= */

process.on(
  'unhandledRejection',
  (reason) => {
    console.error(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    );

    console.error(
      '❌ UNHANDLED PROMISE REJECTION'
    );

    console.error(
      reason
    );

    console.error(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    );

    setTimeout(() => {
      process.exit(1);
    }, 100);
  }
);

/* =========================================================
   UNCAUGHT EXCEPTION
========================================================= */

process.on(
  'uncaughtException',
  (err) => {
    console.error(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    );

    console.error(
      '❌ UNCAUGHT EXCEPTION'
    );

    console.error(
      'Message:',
      err?.message
    );

    console.error(
      'Stack:',
      err?.stack
    );

    console.error(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    );

    setTimeout(() => {
      process.exit(1);
    }, 100);
  }
);

/* =========================================================
   START SERVER
========================================================= */

const schemaPath = path.join(
  __dirname,
  'db',
  'schema.sql'
);

async function startServer() {
  try {
    console.log(
      '🔄 Initializing Turso database...'
    );

    /* -----------------------------------------------------
       CHECK TURSO ENVIRONMENT
    ----------------------------------------------------- */

    if (
      !process.env.TURSO_DATABASE_URL
    ) {
      throw new Error(
        'TURSO_DATABASE_URL is missing.'
      );
    }

    if (
      !process.env.TURSO_AUTH_TOKEN
    ) {
      throw new Error(
        'TURSO_AUTH_TOKEN is missing.'
      );
    }

    const db =
      require('./db/database');

    /* -----------------------------------------------------
       CHECK SCHEMA
    ----------------------------------------------------- */

    if (
      !fs.existsSync(schemaPath)
    ) {
      throw new Error(
        `Schema file not found: ${schemaPath}`
      );
    }

    /* -----------------------------------------------------
       LOAD SCHEMA
    ----------------------------------------------------- */

    const schema =
      fs.readFileSync(
        schemaPath,
        'utf8'
      ).replace(
        /^\s*PRAGMA foreign_keys = ON;\s*/i,
        ''
      );

    /* -----------------------------------------------------
       INITIALIZE TURSO
    ----------------------------------------------------- */

    await db.initSchema(schema);

    console.log(
      '✅ Turso database initialized'
    );

    /* -----------------------------------------------------
       START HTTP SERVER
    ----------------------------------------------------- */

    server.listen(PORT, () => {
      console.log(
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
      );

      console.log(
        `🏏 Cricket Scoreboard API running on port ${PORT}`
      );

      console.log(
        `🌐 Environment: ${
          process.env.NODE_ENV ||
          'production'
        }`
      );

      console.log(
        '🔗 Health: /api/health'
      );

      console.log(
        '🔌 Socket.IO: enabled'
      );

      console.log(
        '💾 Database: Turso'
      );

      console.log(
        '🛡️ Security middleware: enabled'
      );

      console.log(
        `🚦 Rate limit: ${RATE_LIMIT_MAX} requests/min/IP`
      );

      console.log(
        `📦 JSON limit: ${JSON_LIMIT}`
      );

      console.log(
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
      );
    });

    /*
     * HTTP server-level errors.
     */
    server.on(
      'error',
      (err) => {
        console.error(
          '❌ HTTP server error:',
          err
        );

        process.exit(1);
      }
    );
  } catch (err) {
    console.error(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    );

    console.error(
      '❌ FAILED TO START SERVER'
    );

    console.error(
      'Message:',
      err?.message
    );

    console.error(
      'Stack:',
      err?.stack
    );

    console.error(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    );

    process.exit(1);
  }
}

/* =========================================================
   START APPLICATION
========================================================= */

startServer();

