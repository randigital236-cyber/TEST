/**
 * Utility Functions
 * 
 * ⚠️ CRITICAL: This file contains all common utility functions.
 * All services and pages import their utilities from here.
 * 
 * ✅ Common formatting functions
 * ✅ Caching utilities
 * ✅ Clipboard operations
 * ✅ Date/time handling
 * ✅ Number operations
 * ✅ Validation functions
 * ✅ Constants
 * 
 * Integration with:
 * - All services (wallet, package, release, commission, transaction)
 * - All pages (dashboard, buy-package, deposit, withdrawal, etc.)
 * 
 * ⚠️ IMPORTANT: This file has NO database writes.
 * Safe for all users - existing data is NOT affected.
 */

// ============================================================
// CONSTANTS
// ============================================================

export const DOMAIN = "https://staking.randigital.in";
export const REGISTER_URL = `${DOMAIN}/register.html`;

// ✅ FIX 5: Separate cache keys for different pages
export const CACHE_KEYS = {
    DASHBOARD: 'rnd_dashboard_cache',
    PROFILE: 'rnd_profile_cache',
    TRANSACTIONS: 'rnd_transactions_cache',
    REFERRALS: 'rnd_referrals_cache'
};

export const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

// ============================================================
// NUMBER UTILITIES
// ============================================================

/**
 * Round number to specified decimal places
 * ✅ Used by all services for consistent rounding
 * 
 * @param {number} num - Number to round
 * @param {number} decimals - Number of decimal places (default: 8)
 * @returns {number} Rounded number
 */
export function roundTo8(num, decimals = 8) {
    if (num === undefined || num === null || isNaN(num)) {
        return 0;
    }
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
}

/**
 * Format currency (USDT)
 * 
 * @param {number} amount - Amount to format
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount, decimals = 2) {
    if (amount === undefined || amount === null || isNaN(amount)) {
        return '0.00';
    }
    return amount.toFixed(decimals);
}

/**
 * Format RND amount
 * 
 * @param {number} amount - Amount to format
 * @param {number} decimals - Number of decimal places (default: 4)
 * @returns {string} Formatted RND string
 */
export function formatRND(amount, decimals = 4) {
    if (amount === undefined || amount === null || isNaN(amount)) {
        return '0.0000';
    }
    return amount.toFixed(decimals);
}

/**
 * Format large numbers with commas
 * 
 * @param {number} num - Number to format
 * @returns {string} Formatted number with commas
 */
export function formatNumber(num) {
    if (num === undefined || num === null || isNaN(num)) {
        return '0';
    }
    return num.toLocaleString('en-US');
}

/**
 * Format percentage
 * 
 * @param {number} value - Value to format as percentage
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted percentage
 */
export function formatPercentage(value, decimals = 2) {
    if (value === undefined || value === null || isNaN(value)) {
        return '0.00%';
    }
    return value.toFixed(decimals) + '%';
}

// ============================================================
// DATE/TIME UTILITIES
// ============================================================

/**
 * Format timestamp to readable date string
 * 
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted date string
 */
export function formatDate(timestamp) {
    if (!timestamp || isNaN(timestamp)) {
        return 'N/A';
    }
    return new Date(timestamp).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Format timestamp to short date (DD MMM YYYY)
 * 
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Short date string
 */
export function formatDateShort(timestamp) {
    if (!timestamp || isNaN(timestamp)) {
        return 'N/A';
    }
    return new Date(timestamp).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

/**
 * Format timestamp to time only (HH:MM AM/PM)
 * 
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Time string
 */
export function formatTime(timestamp) {
    if (!timestamp || isNaN(timestamp)) {
        return 'N/A';
    }
    return new Date(timestamp).toLocaleString('en-IN', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Get relative time (e.g., "2 hours ago")
 * 
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Relative time string
 */
export function timeAgo(timestamp) {
    if (!timestamp || isNaN(timestamp)) {
        return 'N/A';
    }
    
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return seconds + 's ago';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    if (days < 30) return days + 'd ago';
    const months = Math.floor(days / 30);
    if (months < 12) return months + 'mo ago';
    return Math.floor(months / 12) + 'y ago';
}

/**
 * Get today's date in YYYY-MM-DD format (timezone safe - IST)
 * ✅ Used by release-service for consistent date calculation
 * 
 * @returns {string} Today's date in YYYY-MM-DD format
 */
export function getTodayDateIST() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + istOffset);
    return istTime.toISOString().split('T')[0];
}

/**
 * Parse date string to Date object
 * 
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Date|null} Date object or null if invalid
 */
export function parseDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') {
        return null;
    }
    
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
        return null;
    }
    
    const [year, month, day] = parts;
    if (month < 1 || month > 12 || day < 1 || day > 31) {
        return null;
    }
    
    const date = new Date(year, month - 1, day);
    if (isNaN(date.getTime())) {
        return null;
    }
    
    return date;
}

/**
 * Get days difference between two dates (timezone safe)
 * 
 * @param {string} date1 - Date in YYYY-MM-DD format
 * @param {string} date2 - Date in YYYY-MM-DD format
 * @returns {number} Days difference
 */
export function getDaysDifference(date1, date2) {
    const d1 = parseDate(date1);
    const d2 = parseDate(date2);
    
    if (!d1 || !d2) {
        return 0;
    }
    
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    return Math.floor(diffTime / (24 * 60 * 60 * 1000));
}

// ============================================================
// GREETING
// ============================================================

/**
 * Get greeting based on time of day
 * 
 * @returns {string} Greeting (Morning/Afternoon/Evening)
 */
export function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Morning';
    if (hour < 17) return 'Afternoon';
    return 'Evening';
}

// ============================================================
// CACHE MANAGEMENT
// ============================================================

/**
 * Save data to cache with specific key
 * ✅ FIX 5: Parameterized cache key
 * 
 * @param {object} data - Data to cache
 * @param {string} key - Cache key (default: DASHBOARD)
 */
export function saveToCache(data, key = CACHE_KEYS.DASHBOARD) {
    try {
        const cacheData = {
            data: data,
            timestamp: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(cacheData));
    } catch (e) {
        console.warn('Failed to save cache:', e);
    }
}

/**
 * Load data from cache with specific key
 * ✅ FIX 5: Parameterized cache key
 * 
 * @param {string} key - Cache key (default: DASHBOARD)
 * @returns {object|null} Cached data or null if expired/invalid
 */
export function loadFromCache(key = CACHE_KEYS.DASHBOARD) {
    try {
        const cached = localStorage.getItem(key);
        if (!cached) return null;
        
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp > CACHE_EXPIRY) {
            localStorage.removeItem(key);
            return null;
        }
        return parsed.data;
    } catch (e) {
        console.warn('Failed to load cache:', e);
        return null;
    }
}

/**
 * Clear specific cache
 * 
 * @param {string} key - Cache key to clear (default: DASHBOARD)
 */
export function clearCache(key = CACHE_KEYS.DASHBOARD) {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        console.warn('Failed to clear cache:', e);
    }
}

/**
 * Clear all caches
 */
export function clearAllCaches() {
    try {
        for (let key of Object.values(CACHE_KEYS)) {
            localStorage.removeItem(key);
        }
    } catch (e) {
        console.warn('Failed to clear all caches:', e);
    }
}

// ============================================================
// CLIPBOARD UTILITIES
// ============================================================

/**
 * Copy text to clipboard
 * 
 * @param {string} text - Text to copy
 * @param {function} onSuccess - Success callback
 * @param {function} onError - Error callback
 */
export function copyToClipboard(text, onSuccess, onError) {
    if (!text) {
        if (onError) onError('No text to copy');
        return;
    }
    
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

/**
 * Fallback copy method using textarea
 */
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
// STRING UTILITIES
// ============================================================

/**
 * Truncate string with ellipsis
 * 
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length (default: 20)
 * @returns {string} Truncated string
 */
export function truncateString(str, maxLength = 20) {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
}

/**
 * Capitalize first letter of each word
 * 
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
export function capitalizeWords(str) {
    if (!str) return '';
    return str.replace(/\b\w/g, char => char.toUpperCase());
}

/**
 * Generate random string
 * 
 * @param {number} length - Length of string (default: 8)
 * @param {string} chars - Characters to use (default: alphanumeric)
 * @returns {string} Random string
 */
export function randomString(length = 8, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// ============================================================
// VALIDATION UTILITIES
// ============================================================

/**
 * Validate email address
 * 
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
export function isValidEmail(email) {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * ✅ FIX 1: Password validation matching auth.js
 * Only minimum 6 characters check (matching auth.js)
 * 
 * @param {string} password - Password to validate
 * @returns {object} { valid, errors }
 */
export function validatePassword(password) {
    const errors = [];
    
    if (!password) {
        errors.push('Password is required');
    } else if (password.length < 6) {
        errors.push('Password must be at least 6 characters');
    }
    
    return {
        valid: errors.length === 0,
        errors: errors
    };
}

/**
 * Validate password strength (for registration)
 * ✅ Strong validation for signup
 * 
 * @param {string} password - Password to validate
 * @returns {object} { valid, errors }
 */
export function validatePasswordStrength(password) {
    const errors = [];
    
    if (!password || password.length < 6) {
        errors.push('Password must be at least 6 characters');
    }
    if (password && !/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    if (password && !/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }
    if (password && !/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }
    
    return {
        valid: errors.length === 0,
        errors: errors
    };
}

/**
 * Validate amount
 * 
 * @param {number} amount - Amount to validate
 * @param {number} min - Minimum value (default: 0)
 * @param {number} max - Maximum value (default: Infinity)
 * @returns {boolean} True if valid
 */
export function isValidAmount(amount, min = 0, max = Infinity) {
    if (amount === undefined || amount === null || isNaN(amount)) {
        return false;
    }
    return amount >= min && amount <= max;
}

/**
 * Validate referral code format
 * 
 * @param {string} code - Referral code to validate
 * @returns {boolean} True if valid
 */
export function isValidReferralCode(code) {
    if (!code) return false;
    const codeRegex = /^[A-Z0-9]{8}$/;
    return codeRegex.test(code);
}

// ============================================================
// OBJECT UTILITIES
// ============================================================

/**
 * Deep clone an object
 * 
 * @param {object} obj - Object to clone
 * @returns {object} Cloned object
 */
export function deepClone(obj) {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if object is empty
 * 
 * @param {object} obj - Object to check
 * @returns {boolean} True if empty
 */
export function isEmptyObject(obj) {
    if (!obj) return true;
    if (typeof obj !== 'object') return true;
    return Object.keys(obj).length === 0;
}

/**
 * Safe get nested property
 * 
 * @param {object} obj - Object to traverse
 * @param {string} path - Dot notation path (e.g., 'user.profile.name')
 * @param {*} defaultValue - Default value if path doesn't exist
 * @returns {*} Value at path or default
 */
export function safeGet(obj, path, defaultValue = undefined) {
    if (!obj || !path) return defaultValue;
    
    const keys = path.split('.');
    let current = obj;
    
    for (let key of keys) {
        if (current === undefined || current === null) {
            return defaultValue;
        }
        current = current[key];
    }
    
    return current !== undefined ? current : defaultValue;
}

// ============================================================
// ✅ FIX 2 & 3: REMOVED generateKey() and generateId()
// These are not needed - use Firebase push().key instead
// ============================================================

// ============================================================
// DEVICE/BROWSER UTILITIES
// ============================================================

/**
 * Check if running on mobile device
 * 
 * @returns {boolean} True if mobile
 */
export function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    );
}

/**
 * Check if running in iframe
 * 
 * @returns {boolean} True if in iframe
 */
export function isInIframe() {
    try {
        return window.self !== window.top;
    } catch (e) {
        return true;
    }
}

/**
 * Get URL parameters as object
 * 
 * @returns {object} URL parameters
 */
export function getURLParams() {
    const params = new URLSearchParams(window.location.search);
    const result = {};
    for (let [key, value] of params) {
        result[key] = value;
    }
    return result;
}

// ============================================================
// ✅ FIX 4: EXPOSE ONLY WHAT'S NEEDED FOR INLINE HTML
// ============================================================

if (typeof window !== 'undefined') {
    // Only expose functions that might be used in inline HTML
    window.roundTo8 = roundTo8;
    window.formatCurrency = formatCurrency;
    window.formatRND = formatRND;
    window.formatDate = formatDate;
    window.formatDateShort = formatDateShort;
    window.formatNumber = formatNumber;
    window.timeAgo = timeAgo;
    window.getGreeting = getGreeting;
    window.copyToClipboard = copyToClipboard;
    window.truncateString = truncateString;
    window.isValidEmail = isValidEmail;
    window.validatePassword = validatePassword;
    window.DOMAIN = DOMAIN;
    window.REGISTER_URL = REGISTER_URL;
}