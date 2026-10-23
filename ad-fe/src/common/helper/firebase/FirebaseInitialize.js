import { initializeApp } from "firebase/app";
import { getMessaging } from "firebase/messaging";

const firebaseConfig = {
    apiKey: "AIzaSyCvZudvVfDlCEMQ1o593cmT8Tdp19cvqdk",
    authDomain: "advertise-iq.firebaseapp.com",
    projectId: "advertise-iq",
    storageBucket: "advertise-iq.firebasestorage.app",
    messagingSenderId: "760347076422",
    appId: "1:760347076422:web:0052c7d580166cf6c8a747",
    measurementId: "G-98C77RMW1X"
};

const app = initializeApp(firebaseConfig);
export const messaging = getMessaging(app);

