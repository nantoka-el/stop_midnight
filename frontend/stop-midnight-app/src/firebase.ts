import { initializeApp } from 'firebase/app'
import { getMessaging, isSupported } from 'firebase/messaging'
import { getAuth, signInAnonymously } from 'firebase/auth'
import type { Messaging } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const missingKey = Object.entries(firebaseConfig).find(([, value]) => !value)
if (missingKey) {
  console.warn(`Firebase config is missing value for ${missingKey[0]}`)
}

const app = initializeApp(firebaseConfig)

let messagingInstance: Messaging | null = null
const auth = getAuth(app)
let authPromise: Promise<string> | null = null

async function getMessagingIfSupported(): Promise<Messaging | null> {
  if (messagingInstance) {
    return messagingInstance
  }
  if (!(await isSupported())) {
    return null
  }
  messagingInstance = getMessaging(app)
  return messagingInstance
}

async function ensureAuth(): Promise<string> {
  if (auth.currentUser?.uid) {
    return auth.currentUser.uid
  }
  if (!authPromise) {
    authPromise = signInAnonymously(auth)
      .then((cred) => cred.user.uid)
      .catch((error) => {
        authPromise = null
        throw error
      })
  }
  return authPromise
}

export { app, getMessagingIfSupported, ensureAuth }
