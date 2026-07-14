// ============================================================
// RND STAKING PLATFORM V2 - CONFIG.JS
// ============================================================
// 📌 All Constants in One Place
// 📌 No Hard Coding Anywhere Else
// ============================================================

// ============================================================
// 🔥 PLATFORM CONFIGURATION
// ============================================================
export const CONFIG = {
    // ============================================================
    // PLATFORM SETTINGS
    // ============================================================
    PLATFORM: {
        NAME: 'RND Staking',
        VERSION: '2.0.0',
        DOMAIN: 'https://staking.randigital.in',
        REGISTER_URL: 'https://staking.randigital.in/register.html',
        SUPPORT_EMAIL: 'support@randigital.in',
        SUPPORT_PHONE: '+91-XXXXXXXXXX'
    },

    // ============================================================
    // WALLET SETTINGS
    // ============================================================
    WALLET: {
        MIN_DEPOSIT: 10,
        MIN_WITHDRAWAL: 10,
        MIN_TRANSFER: 1,
        MAX_TRANSFER: 10000,
        WALLET_TYPES: ['depositWallet', 'referralWallet', 'rndWallet'],
        CURRENCY: {
            USDT: 'USDT',
            RND: 'RND'
        }
    },

    // ============================================================
    // PACKAGE PLANS
    // ============================================================
    PACKAGES: {
        PLANS: [
            {
                id: 'basic',
                name: 'Basic Plan',
                usdtAmount: 10,
                totalRND: 100,
                dailyRelease: 0.5,
                releaseDays: 200,
                bonusPercent: 0
            },
            {
                id: 'silver',
                name: 'Silver Plan',
                usdtAmount: 50,
                totalRND: 600,
                dailyRelease: 3,
                releaseDays: 200,
                bonusPercent: 20
            },
            {
                id: 'gold',
                name: 'Gold Plan',
                usdtAmount: 100,
                totalRND: 1400,
                dailyRelease: 7,
                releaseDays: 200,
                bonusPercent: 40
            },
            {
                id: 'platinum',
                name: 'Platinum Plan',
                usdtAmount: 200,
                totalRND: 3200,
                dailyRelease: 16,
                releaseDays: 200,
                bonusPercent: 60
            },
            {
                id: 'diamond',
                name: 'Diamond Plan',
                usdtAmount: 500,
                totalRND: 9000,
                dailyRelease: 45,
                releaseDays: 200,
                bonusPercent: 80
            },
            {
                id: 'elite',
                name: 'Elite Plan',
                usdtAmount: 1000,
                totalRND: 20000,
                dailyRelease: 100,
                releaseDays: 200,
                bonusPercent: 100
            }
        ],
        MIN_PACKAGE: 10,
        MAX_PACKAGE: 1000
    },

    // ============================================================
    // COMMISSION SETTINGS
    // ============================================================
    COMMISSION: {
        LEVELS: {
            LEVEL1: 0.08,   // 8%
            LEVEL2: 0.04,   // 4%
            LEVEL3: 0.02,   // 2%
            LEVEL4: 0.01,   // 1%
            LEVEL5: 0.01    // 1%
        },
        TOTAL: 0.16,        // 16% Total
        PAIRING: false      // Pairing Commission (future)
    },

    // ============================================================
    // RANK SETTINGS
    // ============================================================
    RANKS: {
        MEMBER: 'Member',
        SILVER: 'Silver',
        GOLD: 'Gold',
        PLATINUM: 'Platinum',
        DIAMOND: 'Diamond'
    },

    // ============================================================
    // RANK REQUIREMENTS
    // ============================================================
    RANK_REQUIREMENTS: {
        [RANKS.MEMBER]: { direct: 0, team: 0, stake: 0 },
        [RANKS.SILVER]: { direct: 5, team: 20, stake: 100 },
        [RANKS.GOLD]: { direct: 15, team: 50, stake: 500 },
        [RANKS.PLATINUM]: { direct: 30, team: 100, stake: 1000 },
        [RANKS.DIAMOND]: { direct: 50, team: 200, stake: 5000 }
    },

    // ============================================================
    // NETWORK SETTINGS
    // ============================================================
    NETWORK: {
        MAIN_NETWORK: 'BSC',
        TOKEN_ADDRESS: '0x...', // Add your token address
        USDT_ADDRESS: '0x...',  // Add USDT address
        NETWORK_ID: 56,          // BSC Mainnet
        RPC_URL: 'https://bsc-dataseed.binance.org/'
    },

    // ============================================================
    // WITHDRAWAL SETTINGS
    // ============================================================
    WITHDRAWAL: {
        PROCESSING_TIME: '24-48 hours',
        MIN_AMOUNT: 10,
        MAX_AMOUNT: 10000,
        DAILY_LIMIT: 1000,
        MONTHLY_LIMIT: 10000,
        FEE_PERCENT: 0.02     // 2% withdrawal fee
    },

    // ============================================================
    // DAILY RELEASE SETTINGS
    // ============================================================
    RELEASE: {
        AUTO_RELEASE: true,
        TIME: '00:00:00',     // UTC Time
        MIN_RELEASE: 0.01,
        MAX_RELEASE: 1000,
        PENDING_DAYS_LIMIT: 30
    },

    // ============================================================
    // TRANSFER SETTINGS
    // ============================================================
    TRANSFER: {
        MIN_AMOUNT: 1,
        MAX_AMOUNT: 10000,
        FEE_PERCENT: 0.001,   // 0.1% transfer fee
        SELF_TRANSFER: false
    },

    // ============================================================
    // DEPOSIT SETTINGS
    // ============================================================
    DEPOSIT: {
        MIN_AMOUNT: 10,
        MAX_AMOUNT: 100000,
        CONFIRMATIONS: 3,
        AUTO_APPROVE: false
    },

    // ============================================================
    // REFERRAL SETTINGS
    // ============================================================
    REFERRAL: {
        MAX_LEVELS: 5,
        DIRECT_BONUS: 0.08,   // 8%
        INDIRECT_BONUS: 0.04, // 4%, 2%, 1%, 1%
        MIN_STAKE_FOR_COMMISSION: 10
    },

    // ============================================================
    // BACKUP SETTINGS
    // ============================================================
    BACKUP: {
        CRITICAL_ACTIONS: [
            'registration',
            'deposit',
            'buy_package',
            'withdrawal',
            'transfer',
            'admin_update'
        ],
        MAX_BACKUPS: 50,
        BACKUP_INTERVAL: 86400000 // 24 hours
    },

    // ============================================================
    // LOCK SETTINGS
    // ============================================================
    LOCK: {
        TIMEOUT: 30000,      // 30 seconds
        MAX_RETRIES: 3,
        RETRY_DELAY: 1000    // 1 second
    },

    // ============================================================
    // SECURITY SETTINGS
    // ============================================================
    SECURITY: {
        MAX_LOGIN_ATTEMPTS: 5,
        LOCKOUT_DURATION: 900, // 15 minutes (in seconds)
        SESSION_TIMEOUT: 3600, // 1 hour (in seconds)
        TWO_FACTOR: false,     // 2FA (future)
        KYC_REQUIRED: false    // KYC (future)
    },

    // ============================================================
    // UI SETTINGS
    // ============================================================
    UI: {
        THEME: 'dark',
        PRIMARY_COLOR: '#2ecc71',
        SECONDARY_COLOR: '#27ae60',
        TOAST_DURATION: 5000,
        LOADING_DELAY: 500,
        PAGINATION_LIMIT: 20
    },

    // ============================================================
    // FIREBASE SETTINGS
    // ============================================================
    FIREBASE: {
        PROJECT_ID: 'mywebsite-600d3',
        DATABASE_URL: 'https://mywebsite-600d3-default-rtdb.asia-southeast1.firebasedatabase.app',
        STORAGE_BUCKET: 'mywebsite-600d3.firebasestorage.app'
    },

    // ============================================================
    // ADMIN SETTINGS
    // ============================================================
    ADMIN: {
        SUPER_ADMIN_UID: 'K5qioVYmqHPqnMjgGd9fu0u5EaU2', // Change this
        ADMIN_EMAILS: ['admin@randigital.in'],
        MODERATOR_EMAILS: ['moderator@randigital.in']
    },

    // ============================================================
    // DEVELOPMENT SETTINGS
    // ============================================================
    DEVELOPMENT: {
        MODE: 'development', // 'development' | 'production'
        DEBUG: true,
        LOG_LEVEL: 'info',   // 'debug' | 'info' | 'warn' | 'error'
        MOCK_DATA: false
    }
};

// ============================================================
// 🔥 GETTER FUNCTIONS
// ============================================================

// ============================================================
// Get Package Plan by ID
// ============================================================
export function getPackagePlan(packageId) {
    return CONFIG.PACKAGES.PLANS.find(plan => plan.id === packageId);
}

// ============================================================
// Get Commission Rate by Level
// ============================================================
export function getCommissionRate(level) {
    const levelKey = 'LEVEL' + level;
    return CONFIG.COMMISSION.LEVELS[levelKey] || 0;
}

// ============================================================
// Get Rank Requirements
// ============================================================
export function getRankRequirements(rank) {
    return CONFIG.RANK_REQUIREMENTS[rank] || CONFIG.RANK_REQUIREMENTS.MEMBER;
}

// ============================================================
// Check if Admin
// ============================================================
export function isAdmin(uid) {
    return uid === CONFIG.ADMIN.SUPER_ADMIN_UID;
}

// ============================================================
// Check if Development Mode
// ============================================================
export function isDevelopment() {
    return CONFIG.DEVELOPMENT.MODE === 'development';
}

// ============================================================
// Check if Production Mode
// ============================================================
export function isProduction() {
    return CONFIG.DEVELOPMENT.MODE === 'production';
}

// ============================================================
// Get Min Amount by Type
// ============================================================
export function getMinAmount(type) {
    const types = {
        'deposit': CONFIG.DEPOSIT.MIN_AMOUNT,
        'withdrawal': CONFIG.WITHDRAWAL.MIN_AMOUNT,
        'transfer': CONFIG.TRANSFER.MIN_AMOUNT,
        'package': CONFIG.PACKAGES.MIN_PACKAGE
    };
    return types[type] || 0;
}

// ============================================================
// Get Max Amount by Type
// ============================================================
export function getMaxAmount(type) {
    const types = {
        'deposit': CONFIG.DEPOSIT.MAX_AMOUNT,
        'withdrawal': CONFIG.WITHDRAWAL.MAX_AMOUNT,
        'transfer': CONFIG.TRANSFER.MAX_AMOUNT,
        'package': CONFIG.PACKAGES.MAX_PACKAGE
    };
    return types[type] || 0;
}

// ============================================================
// 🔥 EXPORT ALL
// ============================================================
export default CONFIG;

console.log('✅ config.js loaded successfully');
console.log('📌 Platform:', CONFIG.PLATFORM.NAME);
console.log('📌 Version:', CONFIG.PLATFORM.VERSION);
console.log('📌 Mode:', CONFIG.DEVELOPMENT.MODE);