importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB2v8JUjvEGUi_KAdry5Y_qjGgVnWtiJrU",
  authDomain: "gcc-cricket-web.firebaseapp.com",
  projectId: "gcc-cricket-web",
  storageBucket: "gcc-cricket-web.firebasestorage.app",
  messagingSenderId: "679901976050",
  appId: "1:679901976050:web:46fc8308eb3f834eb2c76b",
  measurementId: "G-912VSYJ0H7"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('🔔 Background FCM notification received:', payload);

  const title =
    payload.notification?.title ||
    '🏏 GCC Cricket - Live Match';

  const body =
    payload.notification?.body ||
    'A match is now live!';

  const data = payload.data || {};

  const matchId = data.matchId || data.match_id;

  const liveUrl =
    data.url ||
    (matchId ? `/match/${matchId}/live` : '/');

  self.registration.showNotification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: {
      ...data,
      url: liveUrl
    }
  });
});

self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notification clicked');

  event.notification.close();

  const urlToOpen =
    event.notification?.data?.url || '/';

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {

      for (const client of clientList) {
        if (
          client.url.includes(urlToOpen) &&
          'focus' in client
        ) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }

      return undefined;
    })
  );
});
