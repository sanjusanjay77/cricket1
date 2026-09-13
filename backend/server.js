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
    // such as health checks/server-to-server requests.
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn('⚠️ CORS blocked origin:', origin);

    // Don't throw an error here.
    // Simply deny the origin.
    return callback(null, false);
  },
  credentials: true
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
  transports: ['polling', 'websocket']
});

app.set('io', io);

/* =========================================================
   BODY PARSER
========================================================= */

app.use(express.json({ limit: '2mb' }));

/* =========================================================
   BASIC REQUEST LOG
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
    database: 'connected'
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
   SOCKET.IO EVENTS
========================================================= */

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  socket.on('join-match', (matchId) => {
    try {
      if (!matchId) {
        console.warn('⚠️ join-match called without matchId');
        return;
      }

      const room = `match-${String(matchId)}`;

      socket.join(room);

      console.log(
        `🏏 Socket ${socket.id} joined ${room}`
      );
    } catch (err) {
      console.error('❌ join-match error:', err);
    }
  });

  socket.on('leave-match', (matchId) => {
    try {
      if (!matchId) return;

      const room = `match-${String(matchId)}`;

      socket.leave(room);

      console.log(
        `🚪 Socket ${socket.id} left ${room}`
      );
    } catch (err) {
      console.error('❌ leave-match error:', err);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(
      `🔌 Socket disconnected: ${socket.id} - ${reason}`
    );
  });

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

  app.use(express.static(frontendDist));

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({
        error: 'API route not found'
      });
    }

    res.sendFile(
      path.join(frontendDist, 'index.html')
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
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('❌ EXPRESS ERROR');
  console.error('URL:', req.method, req.originalUrl);
  console.error('Message:', err.message);
  console.error(err.stack);
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error: 'Internal server error',
    message:
      process.env.NODE_ENV === 'production'
        ? 'Something went wrong on the server.'
        : err.message
  });
});

/* =========================================================
   PROCESS ERROR PROTECTION
========================================================= */

/*
 * Database/API functions can sometimes produce an
 * unhandled Promise rejection.
 *
 * Log it so we can identify the actual problem instead
 * of losing the error information.
 */
process.on('unhandledRejection', (reason) => {
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('❌ UNHANDLED PROMISE REJECTION');
  console.error(reason);
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

/*
 * Log unexpected synchronous exceptions.
 */
process.on('uncaughtException', (err) => {
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('❌ UNCAUGHT EXCEPTION');
  console.error(err);
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  /*
   * We deliberately don't call process.exit() here.
   * This keeps the server alive long enough to expose
   * the real error in Render logs.
   *
   * The actual source of the exception should still
   * be fixed rather than ignored.
   */
});

/* =========================================================
   START SERVER + TURSO SCHEMA
========================================================= */

const PORT = process.env.PORT || 4000;
const schemaPath = path.join(
  __dirname,
  'db',
  'schema.sql'
);

async function startServer() {
  try {
    console.log('🔄 Initializing Turso database...');

    const db = require('./db/database');

    if (!fs.existsSync(schemaPath)) {
      throw new Error(
        `Schema file not found: ${schemaPath}`
      );
    }

    const schema = fs
      .readFileSync(schemaPath, 'utf8')
      .replace(
        /^\s*PRAGMA foreign_keys = ON;\s*/i,
        ''
      );

    await db.initSchema(schema);

    console.log('✅ Turso database initialized');

    server.listen(PORT, () => {
      console.log(
        `🏏 Cricket Scoreboard API running on port ${PORT}`
      );
      console.log(
        `🌐 Environment: ${process.env.NODE_ENV || 'production'}`
      );
    });

  } catch (err) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ FAILED TO START SERVER');
    console.error(err);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    /*
     * A database/schema failure during startup means the
     * application cannot safely operate, so exiting here
     * allows Render to restart the service.
     */
    process.exit(1);
  }
}

startServer();
