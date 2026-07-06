/**
 * Constants
 * 
 * ⚠️ CRITICAL: This file contains all shared constants.
 * Single source of truth for the entire project.
 * 
 * ✅ App constants
 * ✅ Wallet types
 * ✅ Commission rates (Level 1: 8%, Level 2: 4%, Level 3: 2%, Level 4: 1%, Level 5: 1%)
 * ✅ Package plans
 * ✅ Storage keys
 * ✅ Route paths
 * ✅ Error messages
 * ✅ Regex patterns
 * 
 * Integration with:
 * - All services (wallet, package, release, commission, transaction)
 * - All pages (dashboard, buy-package, deposit, withdrawal, etc.)
 * - auth.js for authentication
 * - utils.js for helper functions
 * 
 * ⚠️ IMPORTANT: This file has NO database writes.
 * Safe for all users - existing data is NOT affected.
 */

// ============================================================
// APP CONSTANTS
// ============================================================

export const APP = {
    NAME: 'RND Staking',
    VERSION: '1.0.0',
    DOMAIN: 'https://staking.randigital.in',
    SUPPORT_EMAIL: 'support@randigital.in',
    SUPPORT_PHONE: '+91-XXXXXXXXXX', // ✅ Update with your official number
    COMPANY: 'RanDigital',
    COPYRIGHT: '© 2026 RanDigital. All rights reserved.' // ✅ Updated to 2026
};

// ============================================================
// ROUTES / URLS
// ============================================================

export const ROUTES = {
    HOME: '/',
    DASHBOARD: '/dashboard.html',
    BUY_PACKAGE: '/buy-package.html',
    DEPOSIT: '/deposit.html',
    WITHDRAWAL: '/withdrawal.html',
    TRANSACTIONS: '/transactions.html',
    REFERRALS: '/referrals.html',
    PROFILE: '/profile.html',
    SUPPORT: '/support.html',
    LOGIN: '/login.html',
    SIGNUP: '/signup.html',
    REGISTER: '/register.html',
    FORGOT_PASSWORD: '/forgot-password.html'
};

export const REGISTER_URL = `${APP.DOMAIN}${ROUTES.REGISTER}`;

// ============================================================
// WALLET TYPES
// ============================================================

export const WALLET_TYPES = {
    DEPOSIT: 'depositWallet',
    REFERRAL: 'referralWallet',
    RND: 'rndWallet',
    LOCKED: 'lockedRND',
    RELEASE: 'releaseWallet'
};

export const WALLET_CURRENCIES = {
    [WALLET_TYPES.DEPOSIT]: 'USDT',
    [WALLET_TYPES.REFERRAL]: 'USDT',
    [WALLET_TYPES.RND]: 'RND',
    [WALLET_TYPES.LOCKED]: 'RND',
    [WALLET_TYPES.RELEASE]: 'RND'
};

export const WALLET_LABELS = {
    [WALLET_TYPES.DEPOSIT]: 'Deposit Wallet',
    [WALLET_TYPES.REFERRAL]: 'Referral Wallet',
    [WALLET_TYPES.RND]: 'RND Wallet',
    [WALLET_TYPES.LOCKED]: 'Locked RND',
    [WALLET_TYPES.RELEASE]: 'Release Wallet'
};

export const WALLET_ICONS = {
    [WALLET_TYPES.DEPOSIT]: '💰',
    [WALLET_TYPES.REFERRAL]: '💳',
    [WALLET_TYPES.RND]: '📦',
    [WALLET_TYPES.LOCKED]: '🔒',
    [WALLET_TYPES.RELEASE]: '📈'
};

// ============================================================
// ✅ COMMISSION RATES (5 Levels) - LIVE WEBSITE
// Level 1: 8% | Level 2: 4% | Level 3: 2% | Level 4: 1% | Level 5: 1%
// ============================================================

export const COMMISSION = {
    LEVELS: 5,
    RATES: [0.08, 0.04, 0.02, 0.01, 0.01],
    LEVEL_NAMES: [
        'Level 1 (8%)',
        'Level 2 (4%)',
        'Level 3 (2%)',
        'Level 4 (1%)',
        'Level 5 (1%)'
    ],
    LEVEL_SHORT_NAMES: [
        'L1 (8%)',
        'L2 (4%)',
        'L3 (2%)',
        'L4 (1%)',
        'L5 (1%)'
    ],
    LEVEL_PERCENTAGES: [8, 4, 2, 1, 1]
};

// ============================================================
// COMMISSION HELPERS
// ============================================================

/**
 * Get commission rate for a specific level
 * @param {number} level - Level number (1-5)
 * @returns {number} Commission rate
 */
export function getCommissionRate(level) {
    if (level < 1 || level > COMMISSION.LEVELS) {
        return 0;
    }
    return COMMISSION.RATES[level - 1] || 0;
}

/**
 * Get commission percentage for a specific level
 * @param {number} level - Level number (1-5)
 * @returns {number} Commission percentage
 */
export function getCommissionPercentage(level) {
    if (level < 1 || level > COMMISSION.LEVELS) {
        return 0;
    }
    return COMMISSION.LEVEL_PERCENTAGES[level - 1] || 0;
}

/**
 * Get commission name for a specific level
 * @param {number} level - Level number (1-5)
 * @returns {string} Commission level name
 */
export function getCommissionLevelName(level) {
    if (level < 1 || level > COMMISSION.LEVELS) {
        return 'Level ' + level;
    }
    return COMMISSION.LEVEL_NAMES[level - 1] || 'Level ' + level;
}

// ============================================================
// PACKAGE PLANS
// ============================================================

export const PLANS = [
    {
        id: '6months',
        name: '6 Months Plan',
        days: 180,
        bonus: 25,
        color: '#22c55e',
        bonusText: '+25% Bonus',
        minAmount: 10
    },
    {
        id: '12months',
        name: '12 Months Plan',
        days: 365,
        bonus: 60,
        color: '#fbbf24',
        bonusText: '+60% Bonus',
        minAmount: 100
    },
    {
        id: '18months',
        name: '18 Months Plan',
        days: 540,
        bonus: 100,
        color: '#ec4899',
        bonusText: '+100% Bonus',
        minAmount: 200
    }
];

export const PACKAGE_STATUS = {
    ACTIVE: 'active',
    COMPLETED: 'completed',
    PENDING: 'pending',
    CANCELLED: 'cancelled'
};

// ============================================================
// STORAGE KEYS (localStorage)
// ============================================================

export const STORAGE_KEYS = {
    // Auth
    AUTH_SESSION: 'rnd_auth_session',
    REMEMBER_ME: 'rnd_remember_me',
    LAST_ACTIVITY: 'rnd_last_activity',
    
    // Cache
    DASHBOARD_CACHE: 'rnd_dashboard_cache',
    PROFILE_CACHE: 'rnd_profile_cache',
    TRANSACTIONS_CACHE: 'rnd_transactions_cache',
    REFERRALS_CACHE: 'rnd_referrals_cache',
    
    // User
    USER_DATA: 'rnd_user_data',
    USER_PREFERENCES: 'rnd_user_preferences',
    
    // Settings
    THEME: 'rnd_theme',
    LANGUAGE: 'rnd_language'
};

// ============================================================
// SESSION CONSTANTS
// ============================================================

export const SESSION = {
    TIMEOUT: 30 * 60 * 1000, // 30 minutes
    TOKEN_REFRESH_INTERVAL: 55 * 60 * 1000, // 55 minutes
    CACHE_DURATION: 5 * 60 * 1000 // 5 minutes
};

// ============================================================
// LIMITS & MINIMUMS
// ============================================================

export const LIMITS = {
    // Package
    MIN_PACKAGE_AMOUNT: 10,
    MAX_PACKAGE_AMOUNT: 100000,
    
    // Deposit
    MIN_DEPOSIT: 1,
    MAX_DEPOSIT: 100000,
    
    // Withdrawal
    MIN_WITHDRAWAL: 10,
    MAX_WITHDRAWAL: 100000,
    
    // Transfer
    MIN_TRANSFER: 0.0001,
    MAX_TRANSFER: 100000,
    
    // Referral
    MIN_REFERRAL_COMMISSION: 0.01,
    
    // History
    MAX_HISTORY_DAYS: 365,
    MAX_HISTORY_ENTRIES: 100
};

// ============================================================
// TRANSACTION TYPES
// ============================================================

export const TRANSACTION_TYPES = {
    // Wallet Operations
    WALLET_CREDIT: 'wallet_credit',
    WALLET_DEBIT: 'wallet_debit',
    WALLET_TRANSFER: 'wallet_transfer',
    
    // Package Operations
    PACKAGE_PURCHASE: 'package_purchase',
    PACKAGE_STATUS_UPDATE: 'package_status_update',
    
    // Release Operations
    DAILY_RELEASE: 'daily_release',
    
    // Commission Operations
    REFERRAL_COMMISSION: 'referral_commission',
    
    // User Operations
    USER_REGISTRATION: 'user_registration',
    USER_LOGIN: 'user_login',
    USER_LOGOUT: 'user_logout',
    
    // Admin Operations
    ADMIN_ADJUSTMENT: 'admin_adjustment',
    ADMIN_BONUS: 'admin_bonus'
};

export const TRANSACTION_STATUS = {
    PENDING: 'pending',
    COMPLETED: 'completed',
    FAILED: 'failed',
    ROLLED_BACK: 'rolled_back',
    DELETED: 'deleted'
};

// ============================================================
// USER CONSTANTS
// ============================================================

export const USER = {
    ROLES: {
        USER: 'user',
        ADMIN: 'admin',
        SUPPORT: 'support'
    },
    STATUS: {
        ACTIVE: 'active',
        INACTIVE: 'inactive',
        BANNED: 'banned',
        SUSPENDED: 'suspended'
    },
    RANKS: {
        MEMBER: 'Member',
        BRONZE: 'Bronze',
        SILVER: 'Silver',
        GOLD: 'Gold',
        PLATINUM: 'Platinum',
        DIAMOND: 'Diamond'
    }
};

// ============================================================
// ERROR MESSAGES
// ============================================================

export const ERRORS = {
    // Auth
    AUTH_INVALID_CREDENTIALS: 'Invalid credentials. Please try again.',
    AUTH_USER_NOT_FOUND: 'No account found with this email.',
    AUTH_WRONG_PASSWORD: 'Incorrect password. Please try again.',
    AUTH_EMAIL_IN_USE: 'This email is already registered.',
    AUTH_WEAK_PASSWORD: 'Password must be at least 6 characters.',
    AUTH_TOO_MANY_REQUESTS: 'Too many attempts. Please try again later.',
    AUTH_NETWORK_ERROR: 'Network error. Please check your connection.',
    AUTH_UNAUTHORIZED: 'Please login to continue.',
    AUTH_SESSION_EXPIRED: 'Your session has expired. Please login again.',
    
    // Wallet
    WALLET_INSUFFICIENT: 'Insufficient balance.',
    WALLET_INVALID_TYPE: 'Invalid wallet type.',
    WALLET_MIN_AMOUNT: 'Amount is below minimum limit.',
    WALLET_MAX_AMOUNT: 'Amount exceeds maximum limit.',
    WALLET_NOT_FOUND: 'Wallet not found.',
    
    // Package
    PACKAGE_NOT_FOUND: 'Package not found.',
    PACKAGE_INACTIVE: 'Package is inactive.',
    PACKAGE_COMPLETED: 'Package is already completed.',
    PACKAGE_DUPLICATE: 'Duplicate purchase detected.',
    PACKAGE_INVALID_PLAN: 'Invalid package plan.',
    
    // Commission
    COMMISSION_NO_SPONSORS: 'No sponsors found.',
    COMMISSION_DUPLICATE: 'Commission already credited.',
    
    // Release
    RELEASE_NO_ACTIVE_PACKAGES: 'No active packages found.',
    RELEASE_ALREADY_PROCESSED: 'Release already processed today.',
    
    // General
    GENERAL_SOMETHING_WRONG: 'Something went wrong. Please try again.',
    GENERAL_INVALID_INPUT: 'Invalid input. Please check and try again.',
    GENERAL_NETWORK_ERROR: 'Network error. Please check your connection.',
    GENERAL_PERMISSION_DENIED: 'Permission denied.',
    GENERAL_NOT_FOUND: 'Not found.'
};

// ============================================================
// REGEX PATTERNS
// ============================================================

export const REGEX = {
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    NAME: /^[a-zA-Z\s\-']+$/,
    PHONE: /^[0-9+\-\s()]{10,15}$/,
    REFERRAL_CODE: /^[A-Z0-9]+$/,
    DATE: /^\d{4}-\d{2}-\d{2}$/,
    PASSWORD: /^.{6,}$/,
    USERNAME: /^[a-zA-Z0-9_]{3,20}$/,
    URL: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/
};

// ============================================================
// DEFAULT VALUES
// ============================================================

export const DEFAULTS = {
    USER: {
        name: 'User',
        username: 'user',
        rank: 'Member',
        status: 'active',
        depositWallet: 0,
        referralWallet: 0,
        rndWallet: 0,
        lockedRND: 0,
        releaseWallet: 0,
        totalStake: 0,
        totalReleased: 0,
        totalReferrals: 0,
        activePackages: 0,
        level1Earnings: 0,
        level2Earnings: 0,
        level3Earnings: 0,
        level4Earnings: 0,
        level5Earnings: 0,
        referralEarnings: 0,
        totalReferralCommission: 0,
        teamBusiness: 0,
        teamStructure: { level1: 0, level2: 0, level3: 0, level4: 0, level5: 0 },
        packages: {},
        transactions: {},
        releaseHistory: {},
        transferHistory: [],
        commissionHistory: {},
        isVerified: false,
        banned: false,
        lastReleaseDate: null,
        todayRelease: 0,
        referrerChain: []
    },
    
    PACKAGE: {
        status: 'active',
        remainingRND: 0,
        releasedRND: 0
    },
    
    TRANSACTION: {
        status: 'completed'
    }
};

// ============================================================
// FEATURE FLAGS
// ============================================================

export const FEATURES = {
    ENABLE_REFERRAL: true,
    ENABLE_GOOGLE_LOGIN: false, // ✅ Set to false if Google Login not implemented
    ENABLE_EMAIL_LOGIN: true,
    ENABLE_DEPOSIT: true,
    ENABLE_WITHDRAWAL: true,
    ENABLE_TRANSFER: true,
    ENABLE_PROFILE: true,
    ENABLE_SUPPORT: true,
    ENABLE_EMAIL_VERIFICATION: false,
    ENABLE_TWO_FACTOR: false,
    ENABLE_KYC: false,
    ENABLE_MAINTENANCE_MODE: false
};

// ============================================================
// EXPOSE GLOBALLY
// ============================================================

if (typeof window !== 'undefined') {
    window.APP = APP;
    window.ROUTES = ROUTES;
    window.REGISTER_URL = REGISTER_URL;
    window.WALLET_TYPES = WALLET_TYPES;
    window.WALLET_CURRENCIES = WALLET_CURRENCIES;
    window.WALLET_LABELS = WALLET_LABELS;
    window.WALLET_ICONS = WALLET_ICONS;
    window.COMMISSION = COMMISSION;
    window.getCommissionRate = getCommissionRate;
    window.getCommissionPercentage = getCommissionPercentage;
    window.getCommissionLevelName = getCommissionLevelName;
    window.PLANS = PLANS;
    window.PACKAGE_STATUS = PACKAGE_STATUS;
    window.STORAGE_KEYS = STORAGE_KEYS;
    window.SESSION = SESSION;
    window.LIMITS = LIMITS;
    window.TRANSACTION_TYPES = TRANSACTION_TYPES;
    window.TRANSACTION_STATUS = TRANSACTION_STATUS;
    window.USER = USER;
    window.ERRORS = ERRORS;
    window.REGEX = REGEX;
    window.DEFAULTS = DEFAULTS;
    window.FEATURES = FEATURES;
}

// ============================================================
// EXPORTS
// ============================================================

export {
    APP,
    ROUTES,
    REGISTER_URL,
    WALLET_TYPES,
    WALLET_CURRENCIES,
    WALLET_LABELS,
    WALLET_ICONS,
    COMMISSION,
    getCommissionRate,
    getCommissionPercentage,
    getCommissionLevelName,
    PLANS,
    PACKAGE_STATUS,
    STORAGE_KEYS,
    SESSION,
    LIMITS,
    TRANSACTION_TYPES,
    TRANSACTION_STATUS,
    USER,
    ERRORS,
    REGEX,
    DEFAULTS,
    FEATURES
};