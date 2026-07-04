// ============================================================
// 🔥 FIREBASE CONFIGURATION - NEW PROJECT (myapp-ee226)
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
export const DOMAIN = "https://randigital236-cyber.github.io/TEST/";
export const LOGIN_URL = `${DOMAIN}login.html`;
export const REGISTER_URL = `${DOMAIN}register.html`;
export const DASHBOARD_URL = `${DOMAIN}dashboard.html`;

// ============================================================
// 🔥 RANK SYSTEM CONFIGURATION
// ============================================================
export const RANK_LEVELS = [
    { 
        id: 'executive', 
        name: 'Executive', 
        business: 3000, 
        reward: 50, 
        direct: 0,
        requiredRank: null
    },
    { 
        id: 'senior_executive', 
        name: 'Senior Executive', 
        business: 10000, 
        reward: 150, 
        direct: 2,
        requiredRank: 'Executive'
    },
    { 
        id: 'manager', 
        name: 'Manager', 
        business: 30000, 
        reward: 500, 
        direct: 2,
        requiredRank: 'Senior Executive'
    },
    { 
        id: 'senior_manager', 
        name: 'Senior Manager', 
        business: 75000, 
        reward: 1000, 
        direct: 2,
        requiredRank: 'Manager'
    },
    { 
        id: 'director', 
        name: 'Director', 
        business: 150000, 
        reward: 2500, 
        direct: 2,
        requiredRank: 'Senior Manager'
    },
    { 
        id: 'senior_director', 
        name: 'Senior Director', 
        business: 300000, 
        reward: 5000, 
        direct: 2,
        requiredRank: 'Director'
    },
    { 
        id: 'diamond', 
        name: 'Diamond', 
        business: 750000, 
        reward: 10000, 
        direct: 2,
        requiredRank: 'Senior Director'
    }
];
