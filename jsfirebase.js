// ============================================================
// 🔥 FIREBASE CONFIGURATION - NEW PROJECT
// ============================================================
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
    apiKey: "AIzaSyCzHmIimieea8H9KzYFDSqD0lGOCZjxHYw",
    authDomain: "myapp-ee226.firebaseapp.com",
    databaseURL: "https://myapp-ee226-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "myapp-ee226",
    storageBucket: "myapp-ee226.firebasestorage.app",
    messagingSenderId: "272405753135",
    appId: "1:272405753135:web:598ec27c28bcf6b04105da",
    measurementId: "G-D5KYTMJ5WK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

// Constants
export const DOMAIN = "https://test.randigital.in"; // या v2.randigital.in
export const LOGIN_URL = `${DOMAIN}/login.html`;
export const REGISTER_URL = `${DOMAIN}/register.html`;
export const DASHBOARD_URL = `${DOMAIN}/dashboard.html`;