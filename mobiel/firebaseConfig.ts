import { initializeApp, getApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export const firebaseConfig = {
  projectId: "studio-221732430-65ae3",
  appId: "1:330309266486:web:6a8cf99a4fc093393afc97",
  apiKey: "AIzaSyDOGFc0V0Gjewxc4gV5ZW3Pu4bG6nYEAI0",
  authDomain: "studio-221732430-65ae3.firebaseapp.com",
  storageBucket: "studio-221732430-65ae3.firebasestorage.app",
  measurementId: "",
  messagingSenderId: "330309266486"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize standard auth
const auth = getAuth(app);

const firestore = getFirestore(app);

export { app, auth, firestore };
