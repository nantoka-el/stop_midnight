import { initializeApp } from 'firebase/app'
import { getMessaging, isSupported } from 'firebase/messaging'
import type { Messaging } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: 'AIzaSyBahhVWxtoWTV6Zwo7Bh5ucmivJdBIKp0g',
  authDomain: 'stop-midnight.firebaseapp.com',
  projectId: 'stop-midnight',
  storageBucket: 'stop-midnight.firebasestorage.app',
  messagingSenderId: '372275431449',
  appId: '1:372275431449:web:aa9314f106b32a4df74288',
}

const app = initializeApp(firebaseConfig)

let messagingInstance: Messaging | null = null

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

export { app, getMessagingIfSupported }
