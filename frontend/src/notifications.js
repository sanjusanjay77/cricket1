import { getToken } from 'firebase/messaging';
import messaging from './firebase-messaging';

const VAPID_KEY =
  'BJfwYY-LLBWTlSEhkTAThE9D8PNFyxbP1PSAwozcNfYw4fi2jy7E35FWDM72YHhBlAM47hdjyFYyRUgl-RlHjzk';

export async function requestPushPermission() {
  try {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications.');
      return null;
    }

    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      console.warn('Notification permission was not granted.');
      return null;
    }

    const registration = await navigator.serviceWorker.register(
      '/firebase-messaging-sw.js'
    );

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (!token) {
      console.warn('FCM token was not generated.');
      return null;
    }

    console.log('✅ FCM token generated:', token);

    return token;

  } catch (error) {
    console.error(
      '❌ FCM notification setup failed:',
      error
    );

    return null;
  }
}
