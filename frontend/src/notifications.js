
import { getToken } from 'firebase/messaging';
import messaging from './firebase-messaging';

const VAPID_KEY =
  'BJfwYY-LLBWTlSEhkTAThE9D8PNFyxbP1PSAwozcNfYw4fi2jy7E35FWDM72YHhBlAM47hdjyFYyRUgl-RlHjzk';

const API_URL =
  import.meta.env.VITE_API_URL ||
  'https://cricket1-mvsi.onrender.com';


// =====================================================
// SAVE FCM TOKEN TO BACKEND
// =====================================================
async function saveFcmToken(userId, token) {
  if (!userId) {
    console.warn(
      '⚠️ Cannot save FCM token: notification user ID is missing.'
    );

    return false;
  }

  if (!token) {
    console.warn(
      '⚠️ Cannot save FCM token: token is missing.'
    );

    return false;
  }

  try {
    const response = await fetch(
      `${API_URL}/api/notifications/${userId}/fcm-token`,
      {
        method: 'PUT',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({
          fcm_token: token
        })
      }
    );


    const data = await response.json();


    if (!response.ok) {
      console.error(
        '❌ Backend rejected FCM token:',
        data
      );

      return false;
    }


    console.log(
      '✅ FCM token saved to backend.'
    );

    return true;

  } catch (error) {
    console.error(
      '❌ Failed to save FCM token:',
      error
    );

    return false;
  }
}


// =====================================================
// REQUEST PUSH NOTIFICATION PERMISSION
// =====================================================
export async function requestPushPermission(userId) {
  try {
    // ---------------------------------------------
    // Check browser notification support
    // ---------------------------------------------
    if (!('Notification' in window)) {
      console.warn(
        'This browser does not support notifications.'
      );

      return null;
    }


    // ---------------------------------------------
    // Check service worker support
    // ---------------------------------------------
    if (!('serviceWorker' in navigator)) {
      console.warn(
        'This browser does not support service workers.'
      );

      return null;
    }


    // ---------------------------------------------
    // User ID is required
    // ---------------------------------------------
    if (!userId) {
      console.warn(
        '⚠️ Notification user ID is missing.'
      );

      return null;
    }


    // ---------------------------------------------
    // Request browser permission
    // ---------------------------------------------
    const permission =
      await Notification.requestPermission();


    if (permission !== 'granted') {
      console.warn(
        'Notification permission was not granted.'
      );

      return null;
    }


    console.log(
      '✅ Browser notification permission granted.'
    );


    // ---------------------------------------------
    // Register Firebase service worker
    // ---------------------------------------------
    const registration =
      await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js'
      );


    console.log(
      '✅ Firebase messaging service worker registered.'
    );


    // ---------------------------------------------
    // Generate FCM token
    // ---------------------------------------------
    const token = await getToken(
      messaging,
      {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration
      }
    );


    if (!token) {
      console.warn(
        '⚠️ FCM token was not generated.'
      );

      return null;
    }


    console.log(
      '✅ FCM token generated successfully.'
    );


    // ---------------------------------------------
    // Save token in Turso through backend
    // ---------------------------------------------
    const saved = await saveFcmToken(
      userId,
      token
    );


    if (!saved) {
      console.warn(
        '⚠️ FCM token was generated but could not be saved.'
      );

      return null;
    }


    console.log(
      '🎉 FCM push notification setup completed.'
    );


    return token;

  } catch (error) {
    console.error(
      '❌ FCM notification setup failed:',
      error
    );

    return null;
  }
}

