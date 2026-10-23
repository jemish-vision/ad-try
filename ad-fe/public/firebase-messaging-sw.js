/* eslint-disable no-undef */

importScripts("https://www.gstatic.com/firebasejs/9.6.10/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.6.10/firebase-messaging-compat.js");

firebase.initializeApp({
    apiKey: "AIzaSyCvZudvVfDlCEMQ1o593cmT8Tdp19cvqdk",
    authDomain: "advertise-iq.firebaseapp.com",
    projectId: "advertise-iq",
    storageBucket: "advertise-iq.firebasestorage.app",
    messagingSenderId: "760347076422",
    appId: "1:760347076422:web:0052c7d580166cf6c8a747",
    measurementId: "G-98C77RMW1X"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
    const notificationTitle = payload.notification.title;
    const notificationOptions = { body: payload.notification.body, icon: "https://app.advertiseiq.co/advertise%20IQ.png" };
    self.registration.showNotification(notificationTitle, notificationOptions);
});
