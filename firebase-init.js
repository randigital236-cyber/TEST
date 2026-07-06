/**
 * Firebase Initialization
 * 
 * ⚠️ CRITICAL: This file initializes Firebase and exports all services.
 * 
 * ✅ Single source of truth for Firebase instances
 * ✅ All services import from this file
 * ✅ Prevents multiple Firebase initializations
 * ✅ Lazy loading for better performance
 * ✅ DEBUG mode for development logs
 * ✅ Production safe - no unnecessary exports
 * 
 * Integration with:
 * - auth.js: Uses getAuthInstance()
 * - All other services: Uses getDatabaseInstance()
 */

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import firebaseConfig from "./firebase-config.js";

// ============================================================
// CONSTANTS
// ============================================================

const DEBUG = false; // ✅ Set to true only for development

// ============================================================
// PRIVATE STATE (No naming conflicts)
// ============================================================

let firebaseApp = null;
let authInstance = null;
let databaseInstance = null;
let isInitialized = false;

// ============================================================
// INITIALIZE FIREBASE
// ============================================================

/**
 * Initialize Firebase app (only once)
 * ✅ Safe initialization with error handling
 */
function initializeFirebase() {
    if (isInitialized && firebaseApp) {
        return firebaseApp;
    }

    try {
        firebaseApp = initializeApp(firebaseConfig);
        isInitialized = true;
        
        if (DEBUG) {
            console.log('✅ Firebase initialized successfully');
        }
        
        return firebaseApp;
    } catch (error) {
        console.error('❌ Firebase initialization failed:', error);
        throw error;
    }
}

// ============================================================
// GET FIREBASE SERVICES
// ============================================================

/**
 * Get Firebase App instance
 * @returns {object} Firebase App
 */
export function getApp() {
    if (!firebaseApp) {
        initializeFirebase();
    }
    return firebaseApp;
}

/**
 * Get Firebase Auth instance
 * @returns {object} Firebase Auth
 */
export function getAuthInstance() {
    if (!firebaseApp) {
        initializeFirebase();
    }
    if (!authInstance) {
        authInstance = getAuth(firebaseApp);
    }
    return authInstance;
}

/**
 * Get Firebase Realtime Database instance
 * @returns {object} Firebase Database
 */
export function getDatabaseInstance() {
    if (!firebaseApp) {
        initializeFirebase();
    }
    if (!databaseInstance) {
        databaseInstance = getDatabase(firebaseApp);
    }
    return databaseInstance;
}

// ============================================================
// EXPORT INSTANCES (for backward compatibility)
// ============================================================

// ✅ Initialize and export with clear names
export const app = getApp();
export const auth = getAuthInstance();
export const db = getDatabaseInstance();

// ============================================================
// VERIFY INITIALIZATION (DEBUG ONLY)
// ============================================================

/**
 * Verify Firebase initialization
 * ✅ Used for debugging - safe check
 * ✅ No direct property access that might fail
 */
export function verifyFirebase() {
    try {
        const status = {
            app: !!firebaseApp,
            auth: !!authInstance,
            db: !!databaseInstance,
            isInitialized: isInitialized,
            appName: firebaseApp?.name || 'Not initialized'
        };
        
        if (DEBUG) {
            console.log('📊 Firebase Status:', status);
        }
        
        return status;
    } catch (error) {
        console.error('❌ Firebase verification failed:', error);
        return { error: error.message };
    }
}

// ============================================================
// DEVELOPMENT ONLY - EXPOSE GLOBALLY
// ============================================================

// ✅ Only expose in development mode
if (DEBUG && typeof window !== 'undefined') {
    window.__firebase = {
        app: firebaseApp,
        auth: authInstance,
        db: databaseInstance,
        verify: verifyFirebase
    };
}

// ============================================================
// EXPORTS (No default export to avoid confusion)
// ============================================================

export { firebaseConfig };