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
   CORS
========================================================= */

const allowedOrigins = [
  'https://gcc-cricket.netlify.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(process.env.CORS_ORIGIN);
}

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests without an Origin header
    // such as health checks and server-to-server requests.
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn('⚠️ CORS blocked origin:', origin);

    // Do not throw an exception.
    // Just reject the origin safely.
    return callback(null, false);
  },

  credentials: true,

  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

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
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST']
  },

  transports: ['polling', 'websocket'],

  // Helps the client recover from temporary
  // connection interruptions.
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  }
});

app.set('io', io);

/* =========================================================
   BODY PARSER
========================================================= */

app.use(express.json({
  limit: '2mb'
}));

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

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    time: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    server: 'running',
    database: 'turso'
  });
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
        '❌ join-match error:',
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
        '❌ leave-match error:',
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

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({
        error: 'API route not found'
      });
    }

    res.sendFile(
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

  res.status(404).json({
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
    err?.stack
  );

  console.error(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  );

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error: 'Internal server error',
    message:
      process.env.NODE_ENV === 'production'
        ? 'Something went wrong on the server.'
        : err?.message || 'Unknown server error'
  });
});

/* =========================================================
   PROCESS ERROR PROTECTION
========================================================= */

/*
 * An unhandled Promise rejection means some async
 * operation failed without being caught.
 *
 * We log it and allow Render to restart the service.
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
   * Let Render restart the Node process.
   */
  process.exit(1);
});

/*
 * A truly unexpected synchronous exception is fatal.
 *
 * Render will automatically restart the service after
 * the process exits.
 */
process.on('uncaughtException', (err) => {
  console.error(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  );

  console.error(
    '❌ UNCAUGHT EXCEPTION'
  );

  console.error(
    err
  );

  console.error(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  );

  /*
   * Do NOT keep a corrupted Node process alive.
   * Render will restart it automatically.
   */
  process.exit(1);
});

/* =========================================================
   START SERVER
========================================================= */

const PORT = process.env.PORT || 4000;

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
       START SERVER
    ----------------------------------------------------- */

    server.listen(PORT, () => {
      console.log(
        `🏏 Cricket Scoreboard API running on port ${PORT}`
      );

      console.log(
        `🌐 Environment: ${
          process.env.NODE_ENV || 'production'
        }`
      );

      console.log(
        `🔗 Port: ${PORT}`
      );
    });

  } catch (err) {
    console.error(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    );

    console.error(
      '❌ FAILED TO START SERVER'
    );

    console.error(
      err
    );

    console.error(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    );

    /*
     * Startup failure means the application cannot
     * safely operate.
     *
     * Render will restart the service automatically.
     */
    process.exit(1);
  }
}

/* =========================================================
   START
========================================================= */

startServer();
