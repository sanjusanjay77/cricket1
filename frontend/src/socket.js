
import { io } from 'socket.io-client';

/* =====================================================
   SOCKET.IO SERVER URL
===================================================== */

const configuredUrl =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL ||
  'https://cricket1-mvsi.onrender.com';

/*
 * REST API URLs may end in /api.
 * Socket.IO must connect to the server root instead.
 */
const socketUrl = configuredUrl
  .trim()
  .replace(/\/api\/?$/i, '')
  .replace(/\/+$/, '');

console.log('🔌 Socket server URL:', socketUrl);

/* =====================================================
   SOCKET.IO CONNECTION
===================================================== */

const socket = io(socketUrl, {
  autoConnect: true,

  /*
   * Start with polling and allow WebSocket upgrade.
   * Socket.IO manages the transport upgrade automatically.
   */
  transports: ['polling', 'websocket'],
  upgrade: true,

  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  randomizationFactor: 0.5,

  /*
   * Keep this enabled if your backend CORS configuration
   * allows credentials for the Netlify frontend origin.
   */
  withCredentials: true,

  timeout: 20000
});

/* =====================================================
   NOTIFICATION USER STATE
===================================================== */

let registeredNotificationUserId = null;

/* =====================================================
   CONNECT
===================================================== */

socket.on('connect', () => {
  console.log('✅ Socket connected:', socket.id);
  console.log('🔌 Socket transport:', socket.io.engine.transport.name);

  if (registeredNotificationUserId) {
    socket.emit('register-notification-user', {
      userId: registeredNotificationUserId
    });

    console.log(
      '🔔 Notification user re-registered:',
      registeredNotificationUserId
    );
  }
});

/* =====================================================
   TRANSPORT UPGRADE
===================================================== */

socket.io.on('upgrade', (transport) => {
  console.log(
    '🚀 Socket transport upgraded:',
    transport.name
  );
});

/* =====================================================
   DISCONNECT
===================================================== */

socket.on('disconnect', (reason) => {
  console.warn('🔌 Socket disconnected:', reason);
});

/* =====================================================
   CONNECTION ERROR
===================================================== */

socket.on('connect_error', (error) => {
  console.error(
    '❌ Socket connection error:',
    error.message
  );

  if (error.description) {
    console.error(
      'Socket error details:',
      error.description
    );
  }

  if (error.context) {
    console.error(
      'Socket error context:',
      error.context
    );
  }
});

/* =====================================================
   REGISTER NOTIFICATION USER
===================================================== */

export function registerNotificationUser(userId) {
  if (!userId) {
    return;
  }

  registeredNotificationUserId = userId;

  if (socket.connected) {
    socket.emit('register-notification-user', {
      userId
    });

    console.log(
      '🔔 Notification user registered:',
      userId
    );
  } else {
    console.log(
      '⏳ Waiting for Socket.IO connection before registering user:',
      userId
    );
  }
}

/* =====================================================
   EXPORT
===================================================== */

export default socket;
