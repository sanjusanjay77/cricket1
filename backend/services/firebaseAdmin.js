const admin = require('firebase-admin');

let firebaseAdmin = null;

function getFirebaseAdmin() {
  if (firebaseAdmin) {
    return firebaseAdmin;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.warn(
      '⚠️ Firebase Admin credentials are not configured. FCM notifications are disabled.'
    );

    return null;
  }

  try {
    firebaseAdmin = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n')
      })
    });

    console.log('🔥 Firebase Admin initialized successfully');

    return firebaseAdmin;
  } catch (error) {
    console.error(
      '❌ Firebase Admin initialization failed:',
      error
    );

    return null;
  }
}

module.exports = {
  getFirebaseAdmin
};
