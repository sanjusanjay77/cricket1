
import { io } from 'socket.io-client';

const socketUrl =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL ||
  window.location.origin;

/*
====================================================
SOCKET.IO CONNECTION
====================================================
*/

const socket = io(socketUrl, {
  /*
   * Only ONE connection is created by this module.
   */
  autoConnect: true,

  /*
   * Render currently works more reliably with polling.
   */
  transports: ['polling'],
  upgrade: false,

  /*
   * Reconnect automatically if Render temporarily
   * closes the connection.
   */
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,

  /*
   * Keep cookies/CORS behavior enabled.
   */
  withCredentials: true,

  /*
   * Prevent unnecessary connection timeout.
   */
  timeout: 10000
});

/*
====================================================
STATE
====================================================
*/

let registeredNotificationUserId = null;

/*
====================================================
CONNECT
====================================================
*/

socket.on('connect', () => {
  console.log(
    '🔌 Socket connected:',
    socket.id
  );

  /*
   * If the notification user was registered before
   * a reconnect happened, register it again.
   */
  if (registeredNotificationUserId) {
    socket.emit(
      'register-notification-user',
      {
        userId: registeredNotificationUserId
      }
    );

    console.log(
      '🔔 Notification user re-registered:',
      registeredNotificationUserId
    );
  }
});

/*
====================================================
DISCONNECT
====================================================
*/

socket.on('disconnect', (reason) => {
  console.log(
    '🔌 Socket disconnected:',
    reason
  );
});

/*
====================================================
CONNECTION ERROR
====================================================
*/

socket.on('connect_error', (error) => {
  console.error(
    '❌ Socket connection error:',
    error?.message || error
  );
});

/*
====================================================
REGISTER NOTIFICATION USER
====================================================
*/

export function registerNotificationUser(userId) {
  if (!userId) {
    return;
  }

  /*
   * Remember the user so it can automatically be
   * registered again after a reconnect.
   */
  registeredNotificationUserId = userId;

  /*
   * If already connected, register immediately.
   */
  if (socket.connected) {
    socket.emit(
      'register-notification-user',
      {
        userId
      }
    );

    console.log(
      '🔔 Notification user registered with socket:',
      userId
    );

    return;
  }

  /*
   * DO NOT blindly call socket.connect().
   *
   * autoConnect/reconnection already manages the
   * connection lifecycle.
   *
   * Wait for the normal connect event instead.
   */
  console.log(
    '⏳ Socket not connected yet. User registration will happen after connect:',
    userId
  );
}

/*
====================================================
EXPORT
====================================================
*/

export default socket;

