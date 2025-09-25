importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyBahhVWxtoWTV6Zwo7Bh5ucmivJdBIKp0g',
  authDomain: 'stop-midnight.firebaseapp.com',
  projectId: 'stop-midnight',
  storageBucket: 'stop-midnight.firebasestorage.app',
  messagingSenderId: '372275431449',
  appId: '1:372275431449:web:aa9314f106b32a4df74288',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {}
  if (!title) {
    return
  }
self.registration.showNotification(title, {
    body,
    data: payload.data,
  })
})
