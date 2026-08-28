import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
};

let services: FirebaseServices | null | undefined;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return Object.values(firebaseConfig).every((value) => typeof value === 'string' && value.length > 0);
}

export function getFirebaseServices(): FirebaseServices | null {
  if (services !== undefined) return services;
  if (!isFirebaseConfigured()) {
    services = null;
    return services;
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  let db: Firestore;
  try {
    db = initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    db = getFirestore(app);
  }

  services = {
    app,
    auth: getAuth(app),
    db,
  };
  return services;
}
