
import { getToken } from 'firebase/messaging';
import messaging from './firebase-messaging';

const VAPID_KEY =
  'BJfwYY-LLBWTlSEhkTAThE9D8PNFyxbP1PSAwozcNfYw4fi2jy7E35FWDM72YHhBlAM47hdjyFYyRUgl-RlHjzk';

const API_URL =
  import.meta.env.VITE_API_URL ||
  'https://cricket1-mvsi.onrender.com/api';


// =====================================================
// SAVE FCM TOKEN TO BACKEND
// =====================================================
async function saveFcmToken(userId, token) {
  if (!userId) {
    console.error(
      '❌ FCM registration stopped: notification user ID is missing.'
    );

    return false;
  }

  if (!token) {
    console.error(
      '❌ FCM registration stopped: FCM token is missing.'
    );

    return false;
  }

  try {
    console.log(
      '📤 Saving FCM token to backend...'
    );

    const response = await fetch(
      `${API_URL}/notifications/${userId}/fcm-token`,
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

    console.log(
      '📱 Backend response:',
      data
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
// GET / CREATE FIREBASE SERVICE WORKER
// =====================================================
async function registerFirebaseServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    throw new Error(
      'This browser does not support Service Workers.'
    );
  }

  console.log(
    '🔧 Registering Firebase messaging service worker...'
  );

  const registration =
    await navigator.serviceWorker.register(
      '/firebase-messaging-sw.js',
      {
        scope: '/'
      }
    );

  console.log(
    '✅ Firebase messaging service worker registered.',
    registration
  );

  await navigator.serviceWorker.ready;

  console.log(
    '✅ Firebase messaging service worker is ready.'
  );

  return registration;
}


// =====================================================
// REQUEST PUSH NOTIFICATION PERMISSION
// =====================================================
export async function requestPushPermission(userId) {
  try {
    console.log(
      '🔔 Starting Firebase push notification setup...'
    );

    // =================================================
    // CHECK NOTIFICATION SUPPORT
    // =================================================

    if (!('Notification' in window)) {
      throw new Error(
        'This browser does not support notifications.'
      );
    }

    console.log(
      '📢 Current notification permission:',
      Notification.permission
    );


    // =================================================
    // CHECK SERVICE WORKER SUPPORT
    // =================================================

    if (!('serviceWorker' in navigator)) {
      throw new Error(
        'This browser does not support Service Workers.'
      );
    }


    // =================================================
    // CHECK USER ID
    // =================================================

    if (!userId) {
      throw new Error(
        'Notification user ID is missing.'
      );
    }

    console.log(
      '👤 Notification user ID:',
      userId
    );


    // =================================================
    // NOTIFICATION PERMISSION
    // =================================================

    let permission =
      Notification.permission;

    /*
     * Only request permission when it is not already
     * granted.
     *
     * This avoids repeatedly requesting permission
     * on every page load.
     */
    if (permission !== 'granted') {

      console.log(
        '🔔 Requesting notification permission...'
      );

      permission =
        await Notification.requestPermission();
    }

    console.log(
      '📢 Notification permission result:',
      permission
    );

    if (permission !== 'granted') {

      if (permission === 'denied') {
        throw new Error(
          'Notification permission is blocked. Enable notifications for GCC Cricket in browser settings.'
        );
      }

      throw new Error(
        `Notification permission is "${permission}".`
      );
    }

    console.log(
      '✅ Browser notification permission granted.'
    );


    // =================================================
    // REGISTER FIREBASE SERVICE WORKER
    // =================================================

    const registration =
      await registerFirebaseServiceWorker();


    // =================================================
    // CHECK SERVICE WORKER CONTROL
    // =================================================

    console.log(
      '🔎 Active service worker:',
      registration.active
    );


    // =================================================
    // GENERATE FCM TOKEN
    // =================================================

    console.log(
      '🔥 Requesting Firebase FCM token...'
    );

    const token =
      await getToken(
        messaging,
        {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration:
            registration
        }
      );

    if (!token) {
      throw new Error(
        'Firebase did not return an FCM token.'
      );
    }

    console.log(
      '✅ FCM token generated successfully.'
    );

    /*
     * Do NOT print the complete token.
     * Only print a small safe preview.
     */
    console.log(
      '🔑 FCM token preview:',
      `${token.substring(0, 20)}...`
    );


    // =================================================
    // SAVE TOKEN TO BACKEND
    // =================================================

    const saved =
      await saveFcmToken(
        userId,
        token
      );

    if (!saved) {
      throw new Error(
        'FCM token was generated but could not be saved to the backend.'
      );
    }


    // =================================================
    // SUCCESS
    // =================================================

    console.log(
      '🎉 Firebase push notification setup completed successfully.'
    );

    return token;

  } catch (error) {

    console.error(
      '❌ Firebase notification setup failed:',
      error
    );

    return null;
  }
}

