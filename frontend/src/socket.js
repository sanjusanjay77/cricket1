import { io } from 'socket.io-client';

const socketUrl =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL ||
  window.location.origin;

const socket = io(socketUrl, {
  autoConnect: true,

  // Use polling only.
  // This prevents the failed WebSocket upgrade on Render.
  transports: ['polling'],

  // Do not attempt to upgrade polling to WebSocket.
  upgrade: false,

  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 1000,

  withCredentials: true
});

socket.on('connect', () => {
  console.log(
    '🔌 Socket connected:',
    socket.id
  );
});

socket.on('disconnect', (reason) => {
  console.log(
    '🔌 Socket disconnected:',
    reason
  );
});

socket.on('connect_error', (error) => {
  console.error(
    '❌ Socket connection error:',
    error?.message || error
  );
});

export function registerNotificationUser(userId) {
  if (!userId) {
    return;
  }

  if (!socket.connected) {
    socket.connect();
  }

  socket.emit('register-notification-user', {
    userId
  });

  console.log(
    '🔔 Notification user registered with socket:',
    userId
  );
}

export default socket;
