
require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

/* =========================================================
   APP CONFIGURATION
========================================================= */

const app = express();
const server = http.createServer(app);

let db = null;

const PORT = Number(process.env.PORT) || 10000;

app.disable('x-powered-by');
app.set('trust proxy', 1);

/* =========================================================
   SECURITY HEADERS
========================================================= */

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

/* =========================================================
   CORS
========================================================= */

const allowedOrigins = new Set([
  'https://gcc-cricket.netlify.app',
  'http://localhost:5173',
  'http://localhost:3000',
  ...(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

const corsOptions = {
  origin(origin, callback) {
    // Allow requests without an Origin header, such as server-to-server calls.
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
};

app.use(cors(corsOptions));

/* =========================================================
   RATE LIMITING
========================================================= */

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const requestCounts = new Map();

app.use((req, res, next) => {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  let entry = requestCounts.get(key);

  if (!entry || now - entry.start >= RATE_LIMIT_WINDOW_MS) {
    entry = { start: now, count: 0 };
  }

  entry.count += 1;
  requestCounts.set(key, entry);

  res.setHeader(
    'X-RateLimit-Limit',
    String(RATE_LIMIT_MAX_REQUESTS)
  );
  res.setHeader(
    'X-RateLimit-Remaining',
    String(Math.max(0, RATE_LIMIT_MAX_REQUESTS - entry.count))
  );

  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Too many requests. Please try again shortly.',
    });
  }

  next();
});

// Periodically remove expired rate-limit entries.
const rateLimitCleanup = setInterval(() => {
  const now = Date.now();

  for (const [key, entry] of requestCounts.entries()) {
    if (now - entry.start >= RATE_LIMIT_WINDOW_MS) {
      requestCounts.delete(key);
    }
  }
}, RATE_LIMIT_WINDOW_MS);

rateLimitCleanup.unref();

/* =========================================================
   BODY PARSING
========================================================= */

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));

/* =========================================================
   REQUEST LOGGING
========================================================= */

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`
    );
  });

  next();
});

/* =========================================================
   HEALTH CHECK — SERVER + TURSO
========================================================= */

app.get('/api/health', async (req, res) => {
  const startedAt = Date.now();
  let timeout;

  try {
    if (!db || typeof db.healthCheck !== 'function') {
      return res.status(503).json({
        status: 'error',
        server: 'running',
        database: 'unavailable',
        time: new Date().toISOString(),
      });
    }

    const healthy = await Promise.race([
      db.healthCheck(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('Turso health check timed out'));
        }, 5000);
      }),
    ]);

    if (!healthy) {
      throw new Error('Turso health check failed');
    }

    return res.status(200).json({
      status: 'ok',
      server: 'running',
      database: 'connected',
      uptime: Math.floor(process.uptime()),
      responseTimeMs: Date.now() - startedAt,
      time: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check failed:', error.message);

    return res.status(503).json({
      status: 'error',
      server: 'running',
      database: 'unavailable',
      time: new Date().toISOString(),
    });
  } finally {
    clearTimeout(timeout);
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
app.use('/api/notifications', require('./routes/notifications'));

/* =========================================================
   SOCKET.IO
========================================================= */

const io = new Server(server, {
  cors: corsOptions,
  transports: ['polling', 'websocket'],
  maxHttpBufferSize: 1e6,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  
socket.on('register-notification-user', (payload) => {
  try {
    // Support both the raw ID and { userId: ID } formats.
    const userId =
      payload && typeof payload === 'object'
        ? payload.userId
        : payload;

    if (
      userId === undefined ||
      userId === null ||
      String(userId).trim() === ''
    ) {
      console.warn('Invalid notification user ID received.');
      return;
    }

    const room = `notification-user-${String(userId)}`;

    socket.join(room);

    console.log(
      `Notification user ${String(userId)} joined room ${room}`
    );
  } catch (error) {
    console.error(
      'Notification registration error:',
      error.message
    );
  }
});


  socket.on('join-match', (matchId) => {
    try {
      if (matchId === undefined || matchId === null || String(matchId).trim() === '') {
        return;
      }

      socket.join(`match-${String(matchId)}`);
    } catch (error) {
      console.error('Join-match error:', error.message);
    }
  });

  socket.on('leave-match', (matchId) => {
    try {
      if (matchId === undefined || matchId === null || String(matchId).trim() === '') {
        return;
      }

      socket.leave(`match-${String(matchId)}`);
    } catch (error) {
      console.error('Leave-match error:', error.message);
    }
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', socket.id, reason);
  });
});

/* =========================================================
   FRONTEND STATIC FILES
========================================================= */

const frontendDist = path.resolve(__dirname, '../frontend/dist');

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));

  // React single-page application fallback.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }

    return res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

/* =========================================================
   404 HANDLER
========================================================= */

app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
  });
});

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use((error, req, res, next) => {
  console.error('Request error:', error.stack || error.message);

  if (res.headersSent) {
    return next(error);
  }

  if (error.message === 'Origin not allowed by CORS') {
    return res.status(403).json({
      error: 'Origin not allowed',
    });
  }

  return res.status(500).json({
    error: 'Internal server error',
  });
});

/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received. Shutting down gracefully...`);

  clearInterval(rateLimitCleanup);

  const forceExit = setTimeout(() => {
    console.error('Graceful shutdown timed out.');
    process.exit(1);
  }, 10000);

  forceExit.unref();

  io.close(() => {
    server.close(() => {
      clearTimeout(forceExit);
      console.log('Server shut down successfully.');
      process.exit(0);
    });
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException');
});

/* =========================================================
   START SERVER + INITIALIZE TURSO
========================================================= */

async function startServer() {
  try {
    if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
      throw new Error(
        'Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables.'
      );
    }

    db = require('./db/database');

    const schemaPath = path.join(__dirname, 'db', 'schema.sql');

    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Database schema file not found: ${schemaPath}`);
    }

    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('Initializing Turso database schema...');
    await db.initSchema(schema);
    console.log('Turso database schema initialized.');

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server listening on port ${PORT}`);
      console.log('Turso database initialization completed.');
    });
  } catch (error) {
    console.error('Server startup failed:', error.stack || error.message);
    process.exit(1);
  }
}

startServer();
