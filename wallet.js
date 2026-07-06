/**
 * Wallet Management & Configuration
 * 
 * ⚠️ CRITICAL: This file handles ALL wallet-related operations.
 * 
 * ✅ Wallet display (PURE DISPLAY ONLY)
 * ✅ Wallet balance operations (Atomic transactions)
 * ✅ Wallet configuration (Deposit/Withdrawal addresses)
 * ✅ RPC endpoints for blockchain verification
 * ✅ Polling configuration for deposit verification
 * 
 * Integration with:
 * - dashboard.js: Displays wallet balances
 * - deposit.js: Uses config for deposit address
 * - verifyTransaction.js: Uses RPC endpoints
 * - wallet-service.js: Uses for balance operations
 * 
 * ⚠️ IMPORTANT: Display functions are READ ONLY.
 * Write operations use atomic transactions.
 */

import { db } from './firebase-init.js';
import { ref, update, runTransaction } from "firebase/database";

// ============================================================
// ============================================================
// PART 1: WALLET CONFIGURATION
// ============================================================
// ============================================================

export const WALLET_CONFIG = {
    // Official USDT (BEP20) Contract Address
    USDT_CONTRACT: "0x55d398326f99059fF775485246999027B3197955",
    
    // Company Deposit Wallet Address
    DEPOSIT_WALLET: "0xe757c330D267784F190e79e0Ec0dC5d30ad6eFA4",
    
    // Minimum confirmations required (1 for testing, 3 for production)
    MIN_CONFIRMATIONS: 1,
    
    // RPC timeout in milliseconds
    RPC_TIMEOUT: 10000,
    
    // Auto-polling interval in milliseconds (15 seconds)
    POLLING_INTERVAL: 15000,
    
    // Maximum polling attempts (60 attempts = 15 minutes)
    MAX_POLLING_ATTEMPTS: 60,
    
    // Stale lock cleanup timeout (10 minutes)
    STALE_LOCK_TIMEOUT: 10 * 60 * 1000,
    
    // BSC RPC Endpoints with Failover
    RPC_ENDPOINTS: [
        "https://bsc-dataseed.binance.org",
        "https://bsc.publicnode.com",
        "https://rpc.ankr.com/bsc",
        "https://bsc-dataseed1.defibit.io",
        "https://bsc-dataseed1.ninicoin.io"
    ]
};

// ============================================================
// WALLET CONFIG HELPERS
// ============================================================

/**
 * Get deposit wallet address
 * @returns {string} Deposit wallet address
 */
export function getDepositWallet() {
    return WALLET_CONFIG.DEPOSIT_WALLET;
}

/**
 * Get USDT contract address
 * @returns {string} USDT contract address
 */
export function getUSDTContract() {
    return WALLET_CONFIG.USDT_CONTRACT;
}

/**
 * Get RPC endpoint (with failover support)
 * @param {number} index - Endpoint index (default: 0)
 * @returns {string} RPC endpoint URL
 */
export function getRPCEndpoint(index = 0) {
    const endpoints = WALLET_CONFIG.RPC_ENDPOINTS;
    return endpoints[index % endpoints.length] || endpoints[0];
}

/**
 * Get minimum confirmations required
 * @returns {number} Minimum confirmations
 */
export function getMinConfirmations() {
    return WALLET_CONFIG.MIN_CONFIRMATIONS;
}

/**
 * Get polling interval
 * @returns {number} Polling interval in milliseconds
 */
export function getPollingInterval() {
    return WALLET_CONFIG.POLLING_INTERVAL;
}

/**
 * Get max polling attempts
 * @returns {number} Maximum polling attempts
 */
export function getMaxPollingAttempts() {
    return WALLET_CONFIG.MAX_POLLING_ATTEMPTS;
}

/**
 * Get stale lock timeout
 * @returns {number} Stale lock timeout in milliseconds
 */
export function getStaleLockTimeout() {
    return WALLET_CONFIG.STALE_LOCK_TIMEOUT;
}

// ============================================================
// ============================================================
// PART 2: WALLET DISPLAY (PURE DISPLAY ONLY)
// ============================================================
// ============================================================

// DOM References
const elements = {
    depositWallet: document.getElementById('depositWallet'),
    referralWallet: document.getElementById('referralWallet'),
    rndWallet: document.getElementById('rndWallet'),
    lockedRND: document.getElementById('lockedRND'),
    lockedRNDWallet: document.getElementById('lockedRNDWallet'),
    dailyRelease: document.getElementById('dailyRelease'),
    totalReleased: document.getElementById('totalReleased'),
    activePackages: document.getElementById('activePackages'),
    totalStake: document.getElementById('totalStake'),
    totalReferrals: document.getElementById('totalReferrals'),
    teamBusiness: document.getElementById('teamBusiness'),
    totalReleasedBadge: document.getElementById('totalReleasedBadge'),
};

/**
 * Update all wallet displays
 * ⚠️ READ ONLY - Just displays data from Firebase
 */
export function updateWallets(data) {
    if (!data) return;
    
    if (elements.depositWallet) {
        elements.depositWallet.textContent = (data.depositWallet || 0).toFixed(2);
    }
    if (elements.referralWallet) {
        elements.referralWallet.textContent = (data.referralWallet || 0).toFixed(2);
    }
    if (elements.rndWallet) {
        elements.rndWallet.textContent = (data.rndWallet || 0).toFixed(4);
    }
    if (elements.lockedRND) {
        elements.lockedRND.textContent = (data.lockedRND || 0).toFixed(2);
    }
    if (elements.lockedRNDWallet) {
        elements.lockedRNDWallet.textContent = (data.lockedRND || 0).toFixed(2) + ' RND';
    }
    if (elements.dailyRelease) {
        elements.dailyRelease.textContent = (data.releaseWallet || 0).toFixed(4);
    }
    if (elements.totalReleased) {
        elements.totalReleased.textContent = (data.totalReleased || 0).toFixed(4);
    }
    if (elements.totalReleasedBadge) {
        elements.totalReleasedBadge.textContent = (data.totalReleased || 0).toFixed(4);
    }
    if (elements.activePackages) {
        elements.activePackages.textContent = data.activePackages || 0;
    }
    if (elements.totalStake) {
        elements.totalStake.textContent = (data.totalStake || 0).toFixed(2);
    }
    if (elements.totalReferrals) {
        elements.totalReferrals.textContent = data.totalReferrals || 0;
    }
    if (elements.teamBusiness) {
        elements.teamBusiness.textContent = (data.teamBusiness || 0).toFixed(2);
    }
}

/**
 * Get wallet balance by type
 * ⚠️ READ ONLY
 */
export function getWalletBalance(data, walletType) {
    if (!data) return 0;
    const balances = {
        depositWallet: data.depositWallet || 0,
        referralWallet: data.referralWallet || 0,
        rndWallet: data.rndWallet || 0,
        lockedRND: data.lockedRND || 0
    };
    return balances[walletType] || 0;
}

/**
 * Get all wallet balances
 * ⚠️ READ ONLY
 */
export function getAllWalletBalances(data) {
    if (!data) {
        return {
            depositWallet: 0,
            referralWallet: 0,
            rndWallet: 0,
            lockedRND: 0
        };
    }
    return {
        depositWallet: data.depositWallet || 0,
        referralWallet: data.referralWallet || 0,
        rndWallet: data.rndWallet || 0,
        lockedRND: data.lockedRND || 0
    };
}

/**
 * Check if user has sufficient balance
 * ⚠️ READ ONLY
 */
export function hasSufficientBalance(data, walletType, amount) {
    if (!data) return false;
    const balance = data[walletType] || 0;
    return balance >= amount;
}

/**
 * Update wallet balance (atomic transaction)
 * ⚠️ WRITE OPERATION - Use with caution
 */
export async function updateWalletBalance(uid, walletType, amount, operation = 'add') {
    try {
        const userRef = ref(db, 'users/' + uid);
        const result = await runTransaction(userRef, (currentData) => {
            if (!currentData) return { ...currentData };
            const currentBalance = currentData[walletType] || 0;
            let newBalance;
            if (operation === 'add') {
                newBalance = currentBalance + amount;
            } else if (operation === 'subtract') {
                if (currentBalance < amount) {
                    return { ...currentData };
                }
                newBalance = currentBalance - amount;
            } else {
                newBalance = amount;
            }
            return {
                ...currentData,
                [walletType]: newBalance
            };
        });
        return result;
    } catch (error) {
        console.error('Error updating wallet:', error);
        throw error;
    }
}

// ============================================================
// EXPORTS
// ============================================================

export default {
    WALLET_CONFIG,
    getDepositWallet,
    getUSDTContract,
    getRPCEndpoint,
    getMinConfirmations,
    getPollingInterval,
    getMaxPollingAttempts,
    getStaleLockTimeout,
    updateWallets,
    getWalletBalance,
    getAllWalletBalances,
    hasSufficientBalance,
    updateWalletBalance
};