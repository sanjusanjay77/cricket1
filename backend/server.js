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

const JSON_LIMIT = '256kb';

const rateLimitStore = new Map();

const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 120;

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

    if (
      !record ||
      now - record.start > RATE_LIMIT_WINDOW
    ) {
      record = {
        start: now,
        count: 0
      };
    }

    record.count += 1;

    rateLimitStore.set(ip, record);

    if (rateLimitStore.size > 5000) {
      for (const [key, value] of rateLimitStore.entries()) {
        if (
          now - value.start >
          RATE_LIMIT_WINDOW
        ) {
          rateLimitStore.delete(key);
        }
      }
    }

    if (record.count > RATE_LIMIT_MAX) {
      console.warn(
        `🚨 Rate limit exceeded: ${ip}`
      );

      return res.status(429).json({
        error:
          'Too many requests. Please try again later.'
      });
    }

    return next();

  } catch (err) {
    console.error(
      '❌ Rate limiter error:',
      err
    );

    return next();
  }
}

/* =========================================================
   BASIC SECURITY HEADERS
========================================================= */

app.disable('x-powered-by');

app.set(
  'trust proxy',
  1
);

app.use((req, res, next) => {

  res.setHeader(
    'X-Content-Type-Options',
    'nosniff'
  );

  res.setHeader(
    'X-Frame-Options',
    'DENY'
  );

  res.setHeader(
    'Referrer-Policy',
    'strict-origin-when-cross-origin'
  );

  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );

  res.setHeader(
    'X-XSS-Protection',
    '0'
  );

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

  if (
    process.env.NODE_ENV ===
    'production'
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

  origin: function (
    origin,
    callback
  ) {

    if (!origin) {
      return callback(
        null,
        true
      );
    }

    if (
      uniqueOrigins.includes(
        origin
      )
    ) {
      return callback(
        null,
        true
      );
    }

    console.warn(
      `🚫 CORS blocked origin: ${origin}`
    );

    return callback(
      null,
      false
    );
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

app.use(
  cors(corsOptions)
);

/* =========================================================
   GLOBAL RATE LIMIT
========================================================= */

app.use(
  rateLimit
);

/* =========================================================
   BODY PARSER
========================================================= */

app.use(
  express.json({
    limit: JSON_LIMIT,
    strict: true
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: '64kb'
  })
);

/* =========================================================
   REQUEST LOGGER
========================================================= */

app.use(
  (req, res, next) => {

    const started =
      Date.now();

    const ip =
      getClientIp(req);

    res.on(
      'finish',
      () => {

        const duration =
          Date.now() -
          started;

        console.log(
          `${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms) [${ip}]`
        );
      }
    );

    next();
  }
);

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
  '/api/health',
  async (req, res) => {

    try {

      return res.status(200).json({
        status: 'ok',
        time:
          new Date().toISOString(),
        uptime:
          Math.round(
            process.uptime()
          ),
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
  }
);

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

app.use(
  '/api/notifications',
  require('./routes/notifications')
);

/* =========================================================
   SOCKET.IO
========================================================= */

const io = new Server(
  server,
  {
    cors: {

      origin:
        function (
          origin,
          callback
        ) {

          if (!origin) {
            return callback(
              null,
              true
            );
          }

          if (
            uniqueOrigins.includes(
              origin
            )
          ) {
            return callback(
              null,
              true
            );
          }

          console.warn(
            `🚫 Socket.IO CORS blocked: ${origin}`
          );

          return callback(
            new Error(
              'Origin not allowed'
            )
          );
        },

      credentials: true,

      methods: [
        'GET',
        'POST'
      ]
    },

    transports: [
      'polling',
      'websocket'
    ],

    connectionStateRecovery: {
      maxDisconnectionDuration:
        2 * 60 * 1000,

      skipMiddlewares: true
    },

    maxHttpBufferSize:
      256 * 1024,

    pingInterval:
      25000,

    pingTimeout:
      20000
  }
);

app.set(
  'io',
  io
);

/* =========================================================
   SOCKET.IO CONNECTION
========================================================= */

io.on(
  'connection',
  (socket) => {

    console.log(
      `🔌 Socket connected: ${socket.id}`
    );

    /* =====================================================
       REGISTER NOTIFICATION USER
    ===================================================== */

    socket.on(
      'register-notification-user',
      ({ userId } = {}) => {

        try {

          if (
            userId === undefined ||
            userId === null ||
            userId === ''
          ) {

            console.warn(
              `⚠️ Invalid notification user ID from ${socket.id}`
            );

            return;
          }

          const cleanedUserId =
            String(userId).trim();

          /*
           * UUIDs should not be excessively long.
           */
          if (
            !cleanedUserId ||
            cleanedUserId.length > 100
          ) {

            console.warn(
              `⚠️ Invalid notification user ID length from ${socket.id}`
            );

            return;
          }

          /*
           * Each registered user gets a
           * private Socket.IO room.
           *
           * Example:
           *
           * notification-user-abc123
           */
          const room =
            `notification-user-${cleanedUserId}`;

          socket.join(room);

          console.log(
            `🔔 ${socket.id} joined notification room ${room}`
          );

          /*
           * Optional acknowledgement.
           */
          socket.emit(
            'notification-user-registered',
            {
              success: true,
              userId:
                cleanedUserId
            }
          );

        } catch (err) {

          console.error(
            `❌ register-notification-user error (${socket.id}):`,
            err
          );
        }
      }
    );

    /* =====================================================
       JOIN MATCH
    ===================================================== */

    socket.on(
      'join-match',
      (matchId) => {

        try {

          if (
            typeof matchId !==
              'string' &&
            typeof matchId !==
              'number'
          ) {

            console.warn(
              `⚠️ Invalid matchId from ${socket.id}`
            );

            return;
          }

          const cleanedId =
            String(matchId).trim();

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
      }
    );

    /* =====================================================
       LEAVE MATCH
    ===================================================== */

    socket.on(
      'leave-match',
      (matchId) => {

        try {

          if (
            typeof matchId !==
              'string' &&
            typeof matchId !==
              'number'
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
      }
    );

    /* =====================================================
       DISCONNECT
    ===================================================== */

    socket.on(
      'disconnect',
      (reason) => {

        console.log(
          `🔌 Socket disconnected: ${socket.id} - ${reason}`
        );
      }
    );

    /* =====================================================
       SOCKET ERROR
    ===================================================== */

    socket.on(
      'error',
      (err) => {

        console.error(
          `❌ Socket error ${socket.id}:`,
          err?.message ||
          err
        );
      }
    );
  }
);

/* =========================================================
   FRONTEND STATIC FILES
========================================================= */

const frontendDist =
  path.join(
    __dirname,
    '..',
    'frontend',
    'dist'
  );

if (
  fs.existsSync(
    frontendDist
  )
) {

  console.log(
    `📦 Frontend found: ${frontendDist}`
  );

  app.use(
    express.static(
      frontendDist,
      {
        maxAge: '1d',

        dotfiles: 'deny',

        index: false
      }
    )
  );

  /*
   * React SPA fallback.
   */
  app.get(
    '*',
    (req, res) => {

      if (
        req.path.startsWith(
          '/api'
        )
      ) {

        return res
          .status(404)
          .json({
            error:
              'API route not found'
          });
      }

      return res.sendFile(
        path.join(
          frontendDist,
          'index.html'
        )
      );
    }
  );

} else {

  console.log(
    `ℹ️ Frontend dist not found: ${frontendDist}`
  );
}

/* =========================================================
   404 HANDLER
========================================================= */

app.use(
  (req, res) => {

    if (
      req.path.startsWith(
        '/api'
      )
    ) {

      return res
        .status(404)
        .json({
          error:
            'API endpoint not found'
        });
    }

    return res
      .status(404)
      .json({
        error:
          'Not found'
      });
  }
);

/* =========================================================
   GLOBAL EXPRESS ERROR HANDLER
========================================================= */

app.use(
  (
    err,
    req,
    res,
    next
  ) => {

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

    if (
      res.headersSent
    ) {
      return next(err);
    }

    if (
      err?.type ===
      'entity.parse.failed'
    ) {

      return res
        .status(400)
        .json({
          error:
            'Invalid JSON request.'
        });
    }

    if (
      err?.type ===
      'entity.too.large'
    ) {

      return res
        .status(413)
        .json({
          error:
            'Request body is too large.'
        });
    }

    if (
      err?.message ===
      'Not allowed by CORS'
    ) {

      return res
        .status(403)
        .json({
          error:
            'Origin not allowed.'
        });
    }

    return res
      .status(500)
      .json({
        error:
          'Internal server error'
      });
  }
);

/* =========================================================
   SERVER SHUTDOWN
========================================================= */

let isShuttingDown =
  false;

async function gracefulShutdown(
  signal
) {

  if (
    isShuttingDown
  ) {

    console.log(
      `⚠️ Shutdown already in progress (${signal})`
    );

    return;
  }

  isShuttingDown =
    true;

  console.log(
    `🛑 Received ${signal}. Shutting down safely...`
  );

  server.close(
    () => {

      console.log(
        '✅ HTTP server closed.'
      );

      process.exit(0);
    }
  );

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

  setTimeout(
    () => {

      console.error(
        '⏰ Graceful shutdown timed out.'
      );

      process.exit(1);

    },
    10000
  ).unref();
}

process.on(
  'SIGTERM',
  () =>
    gracefulShutdown(
      'SIGTERM'
    )
);

process.on(
  'SIGINT',
  () =>
    gracefulShutdown(
      'SIGINT'
    )
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

    setTimeout(
      () => {
        process.exit(1);
      },
      100
    );
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

    setTimeout(
      () => {
        process.exit(1);
      },
      100
    );
  }
);

/* =========================================================
   START SERVER
========================================================= */

const schemaPath =
  path.join(
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
      !fs.existsSync(
        schemaPath
      )
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

    await db.initSchema(
      schema
    );

    console.log(
      '✅ Turso database initialized'
    );

    /* -----------------------------------------------------
       START HTTP SERVER
    ----------------------------------------------------- */

    server.listen(
      PORT,
      () => {

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
          '🔔 User notifications: enabled'
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
      }
    );

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
