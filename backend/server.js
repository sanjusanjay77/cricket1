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

/* Remove duplicate origins */
const uniqueOrigins = [...new Set(allowedOrigins)];

/* =========================================================
   CORS
========================================================= */

const corsOptions = {
  origin: function (origin, callback) {
    /*
     * Requests without Origin are allowed.
     *
     * Examples:
     * - Render health checks
     * - server-to-server requests
     * - curl requests
     */
    if (!origin) {
      return callback(null, true);
    }

    if (uniqueOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn('⚠️ CORS blocked origin:', origin);

    /*
     * Do not throw an exception.
     * Simply reject this origin.
     */
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
  ]
};

app.use(cors(corsOptions));

/* =========================================================
   SOCKET.IO
========================================================= */

const io = new Server(server, {
  cors: {
    origin: uniqueOrigins,
    credentials: true,
    methods: ['GET', 'POST']
  },

  /*
   * Polling is useful as a fallback if WebSocket
   * temporarily cannot connect.
   */
  transports: ['polling', 'websocket'],

  /*
   * Allows temporary connection recovery.
   */
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  },

  /*
   * Prevent extremely large Socket.IO packets.
   */
  maxHttpBufferSize: 1e6
});

app.set('io', io);

/* =========================================================
   BODY PARSER
========================================================= */

app.use(
  express.json({
    limit: '2mb'
  })
);

/* =========================================================
   REQUEST LOGGER
========================================================= */

app.use((req, res, next) => {
  const started = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - started;

    console.log(
      `${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`
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
    console.error('❌ Health check error:', err);

    return res.status(503).json({
      status: 'error',
      server: 'unhealthy'
    });
  }
});

/* =========================================================
   API ROUTES
========================================================= */

app.use('/api/teams', require('./routes/teams'));
app.use('/api/players', require('./routes/players'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/innings', require('./routes/innings'));
app.use('/api/records', require('./routes/records'));

/* =========================================================
   SOCKET.IO CONNECTION
========================================================= */

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  /* -------------------------------------------------------
     JOIN MATCH
  ------------------------------------------------------- */

  socket.on('join-match', (matchId) => {
    try {
      if (!matchId) {
        console.warn(
          `⚠️ join-match called without matchId (${socket.id})`
        );
        return;
      }

      const room = `match-${String(matchId)}`;

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
      if (!matchId) {
        return;
      }

      const room = `match-${String(matchId)}`;

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
      err
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
    express.static(frontendDist)
  );

  /*
   * React SPA fallback.
   */
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
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
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      error: 'API endpoint not found',
      path: req.originalUrl
    });
  }

  return res.status(404).json({
    error: 'Not found'
  });
});

/* =========================================================
   GLOBAL EXPRESS ERROR HANDLER
========================================================= */

app.use((err, req, res, next) => {
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

  console.error(
    'Stack:',
    err?.stack
  );

  console.error(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  );

  /*
   * If headers were already sent, Express must
   * handle the error itself.
   */
  if (res.headersSent) {
    return next(err);
  }

  return res.status(500).json({
    error: 'Internal server error',

    message:
      process.env.NODE_ENV === 'production'
        ? 'Something went wrong on the server.'
        : err?.message || 'Unknown server error'
  });
});

/* =========================================================
   SERVER SHUTDOWN PROTECTION
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
   * Stop accepting new HTTP requests.
   */
  server.close(() => {
    console.log(
      '✅ HTTP server closed.'
    );

    process.exit(0);
  });

  /*
   * Close Socket.IO connections.
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
   *
   * If something refuses to close, don't keep
   * the Render instance hanging forever.
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
  () => gracefulShutdown('SIGTERM')
);

process.on(
  'SIGINT',
  () => gracefulShutdown('SIGINT')
);

/* =========================================================
   UNHANDLED PROMISE REJECTION
========================================================= */

/*
 * Example:
 *
 * async function something() {
 *   throw new Error('Database failed');
 * }
 *
 * If nobody catches that Promise rejection,
 * this handler catches it.
 *
 * We intentionally exit so Render can restart
 * the service from a clean Node.js process.
 */
process.on('unhandledRejection', (reason) => {
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

  /*
   * Give logs a moment to flush.
   */
  setTimeout(() => {
    process.exit(1);
  }, 100);
});

/* =========================================================
   UNCAUGHT EXCEPTION
========================================================= */

/*
 * A truly unexpected synchronous exception
 * can leave Node.js in an unsafe state.
 *
 * Do NOT continue running a corrupted process.
 */
process.on('uncaughtException', (err) => {
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

  /*
   * Allow logs to flush, then exit.
   * Render can start a fresh instance.
   */
  setTimeout(() => {
    process.exit(1);
  }, 100);
});

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

    if (!process.env.TURSO_DATABASE_URL) {
      throw new Error(
        'TURSO_DATABASE_URL is missing.'
      );
    }

    if (!process.env.TURSO_AUTH_TOKEN) {
      throw new Error(
        'TURSO_AUTH_TOKEN is missing.'
      );
    }

    const db = require('./db/database');

    /* -----------------------------------------------------
       CHECK SCHEMA
    ----------------------------------------------------- */

    if (!fs.existsSync(schemaPath)) {
      throw new Error(
        `Schema file not found: ${schemaPath}`
      );
    }

    /* -----------------------------------------------------
       LOAD SCHEMA
    ----------------------------------------------------- */

    const schema = fs
      .readFileSync(
        schemaPath,
        'utf8'
      )
      .replace(
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
          process.env.NODE_ENV || 'production'
        }`
      );

      console.log(
        `🔗 Health: /api/health`
      );

      console.log(
        `🔌 Socket.IO: enabled`
      );

      console.log(
        `💾 Database: Turso`
      );

      console.log(
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
      );
    });

    /*
     * Catch HTTP server-level errors.
     */
    server.on('error', (err) => {
      console.error(
        '❌ HTTP server error:',
        err
      );

      /*
       * A server binding/network error means
       * the process cannot operate correctly.
       */
      process.exit(1);
    });

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

    /*
     * Startup failure means the application
     * cannot safely operate.
     *
     * Render will restart the service.
     */
    process.exit(1);
  }
}

/* =========================================================
   START APPLICATION
========================================================= */

startServer();
