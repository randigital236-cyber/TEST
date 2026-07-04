/**
 * Authentication Management
 */

import { auth } from './firebase-init.js';
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";

export function onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
}

export async function signOut() {
    try {
        await firebaseSignOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Sign out error:', error);
        window.showToast('❌ Error signing out. Please try again.', 'error');
    }
}

export function getCurrentUser() {
    return auth.currentUser;
}

// Expose signOut globally for inline use
window.logout = signOut;