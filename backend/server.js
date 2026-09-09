require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN || '*' } });

app.set('io', io);
app.use(cors());
app.use(express.json());

app.use('/api/teams', require('./routes/teams'));
app.use('/api/players', require('./routes/players'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/innings', require('./routes/innings'));
app.use('/api/records', require('./routes/records'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Serve the built frontend in production (after `npm run build` in /frontend, copy dist here or adjust path)
const path = require('path');
const fs = require('fs');
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

io.on('connection', (socket) => {
  socket.on('join-match', (matchId) => {
    socket.join(`match-${matchId}`);
  });
  socket.on('leave-match', (matchId) => {
    socket.leave(`match-${matchId}`);
  });
});

const PORT = process.env.PORT || 4000;
const schemaPath = path.join(__dirname, 'db', 'schema.sql');

(async () => {
  try {
    const db = require('./db/database');
    const schema = fs.readFileSync(schemaPath, 'utf8').replace(/^\s*PRAGMA foreign_keys = ON;\s*/i, '');
    await db.initSchema(schema);
    server.listen(PORT, () => {
      console.log(`🏏 Cricket Scoreboard API running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to initialize Turso database:', err);
    process.exit(1);
  }
})();
