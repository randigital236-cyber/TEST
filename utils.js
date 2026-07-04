/**
 * Utility Functions
 * Common functions used across the application
 */

import { db } from './firebase-init.js';
import { ref, get } from "firebase/database";

// ============================================================
// CONSTANTS
// ============================================================

export const DOMAIN = "https://staking.randigital.in";
export const REGISTER_URL = `${DOMAIN}/register.html`;
export const CACHE_KEY = 'rnd_dashboard_cache';
export const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

// ============================================================
// GREETING
// ============================================================

export function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Morning';
    if (hour < 17) return 'Afternoon';
    return 'Evening';
}

// ============================================================
// FORMATTING
// ============================================================

export function formatCurrency(amount, decimals = 2) {
    return Number(amount).toFixed(decimals);
}

export function formatRND(amount, decimals = 4) {
    return Number(amount).toFixed(decimals);
}

export function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function formatDateShort(timestamp) {
    return new Date(timestamp).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

// ============================================================
// CACHE MANAGEMENT
// ============================================================

export function saveToCache(data) {
    try {
        const cacheData = {
            data: data,
            timestamp: Date.now()
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch (e) {
        console.warn('Failed to save cache:', e);
    }
}

export function loadFromCache() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return null;
        
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp > CACHE_EXPIRY) {
            localStorage.removeItem(CACHE_KEY);
            return null;
        }
        return parsed.data;
    } catch (e) {
        console.warn('Failed to load cache:', e);
        return null;
    }
}

export function clearCache() {
    try {
        localStorage.removeItem(CACHE_KEY);
    } catch (e) {
        console.warn('Failed to clear cache:', e);
    }
}

// ============================================================
// USER LOOKUP
// ============================================================

export async function getUserByUsername(username) {
    try {
        const usersSnap = await get(ref(db, 'users'));
        if (!usersSnap.exists()) return null;
        const users = usersSnap.val();
        for (let uid in users) {
            if (users[uid].username === username || users[uid].referralCode === username) {
                return { uid: uid, data: users[uid] };
            }
        }
        return null;
    } catch (error) {
        console.error('Error getting user:', error);
        return null;
    }
}

// ============================================================
// CLIPBOARD
// ============================================================

export function copyToClipboard(text, onSuccess, onError) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => {
                if (onSuccess) onSuccess();
            })
            .catch((err) => {
                console.warn('Clipboard API failed:', err);
                fallbackCopy(text, onSuccess);
            });
    } else {
        fallbackCopy(text, onSuccess);
    }
}

function fallbackCopy(text, onSuccess) {
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        if (onSuccess) onSuccess();
    } catch (e) {
        console.error('Fallback copy failed:', e);
    }
}

// ============================================================
// RND PRICE
// ============================================================

let cachedRndPrice = 1.00;

export async function fetchRNDPrice() {
    try {
        const settingsRef = ref(db, 'settings/rate');
        const snapshot = await get(settingsRef);
        if (snapshot.exists()) {
            cachedRndPrice = snapshot.val();
        }
    } catch (error) {
        console.error('Error fetching RND price:', error);
    }
    return cachedRndPrice;
}

export function getRNDPrice() {
    return cachedRndPrice;
}