import { initializeApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: "AIzaSyB2v8JUjvEGUi_KAdry5Y_qjGgVnWtiJrU",
  authDomain: "gcc-cricket-web.firebaseapp.com",
  projectId: "gcc-cricket-web",
  storageBucket: "gcc-cricket-web.firebasestorage.app",
  messagingSenderId: "679901976050",
  appId: "1:679901976050:web:46fc8308eb3f834eb2c76b",
  measurementId: "G-912VSYJ0H7"
};

const app = initializeApp(firebaseConfig);

export default app;
