/**
 * Wallet Service - All Wallet Operations
 * 
 * ⚠️ CRITICAL: This service handles ONLY generic wallet operations.
 * 
 * Wallet Types:
 * - depositWallet (USDT) - User's deposit wallet
 * - referralWallet (USDT) - Referral commission wallet
 * - rndWallet (RND) - RND token wallet
 * - lockedRND (RND) - Locked RND from packages
 * 
 * ⚠️ IMPORTANT: releaseWallet is NOT a wallet.
 * It is a display value calculated by release-service.js
 * 
 * ✅ Atomic transactions for all wallet operations
 * ✅ Balance validation before debit
 * ✅ Transactions saved via transaction-service.js (CENTRALIZED)
 * ✅ Idempotent operations with operationId
 * ✅ Read-only helpers for dashboard display
 * ✅ NO temporary data saved to Firebase
 * 
 * Integration with:
 * - dashboard.js: READ ONLY - displays wallet balances
 * - release-service.js: Directly updates rndWallet, lockedRND (NOT via this service)
 * - commission-service.js: Directly updates referralWallet (NOT via this service)
 * - buy-package.js: Debits depositWallet or referralWallet
 * - transfer.js: Debits one wallet, credits another
 * - transaction-service.js: CENTRALIZED transaction creation
 */

import { db } from './firebase-init.js';
import { ref, runTransaction, push } from "firebase/database";
import { roundTo8 } from './utils.js';
import { 
    createTransaction, 
    TRANSACTION_TYPES, 
    TRANSACTION_STATUS 
} from './transaction-service.js';

// ============================================================
// CONSTANTS
// ============================================================

const WALLET_TYPES = {
    DEPOSIT: 'depositWallet',
    REFERRAL: 'referralWallet',
    RND: 'rndWallet',
    LOCKED: 'lockedRND'
};

const CURRENCIES = {
    [WALLET_TYPES.DEPOSIT]: 'USDT',
    [WALLET_TYPES.REFERRAL]: 'USDT',
    [WALLET_TYPES.RND]: 'RND',
    [WALLET_TYPES.LOCKED]: 'RND'
};

const DEBUG = false;

// ============================================================
// HELPER - Logging (Conditional)
// ============================================================

function log(message, ...args) {
    if (DEBUG) {
        console.log(`[WalletService] ${message}`, ...args);
    }
}

function logError(message, ...args) {
    console.error(`[WalletService] ${message}`, ...args);
}

// ============================================================
// HELPER - Generate Transaction ID
// ============================================================

function generateTxId(prefix = 'wallet') {
    const pushKey = push(ref(db)).key;
    return `${prefix}_${pushKey}`;
}

// ============================================================
// HELPER - Get Today's Date (Timezone Safe)
// ============================================================

function getTodayDate() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + istOffset);
    return istTime.toISOString().split('T')[0];
}

// ============================================================
// HELPER - Validate Wallet Type
// ============================================================

function isValidWalletType(walletType) {
    return Object.values(WALLET_TYPES).includes(walletType);
}

function getCurrency(walletType) {
    return CURRENCIES[walletType] || 'Unknown';
}

// ============================================================
// HELPER - Check Duplicate Operation
// ============================================================

function isDuplicateOperation(data, operationId) {
    if (!data || !data.transactions) return false;
    
    for (let txId in data.transactions) {
        const tx = data.transactions[txId];
        if (tx.operationId === operationId) {
            return true;
        }
    }
    return false;
}

// ============================================================
// CORE WALLET OPERATIONS
// ============================================================

/**
 * Credit a wallet (Atomic)
 * ✅ Transactions saved via transaction-service.js
 * ✅ NO temporary data saved to Firebase
 * 
 * @param {string} userId - Firebase User UID
 * @param {string} walletType - Wallet type
 * @param {number} amount - Amount to credit
 * @param {string} description - Description for transaction history
 * @param {string} operationId - Unique operation ID for idempotency
 * @param {object} metadata - Additional metadata for transaction
 * @returns {object} { success, newBalance, transactionId }
 */
export async function creditWallet(userId, walletType, amount, description, operationId = null, metadata = {}) {
    try {
        // Validate inputs
        if (!userId) {
            return { success: false, error: 'User ID is required' };
        }
        if (!isValidWalletType(walletType)) {
            return { success: false, error: `Invalid wallet type: ${walletType}` };
        }
        if (!amount || amount <= 0) {
            return { success: false, error: 'Amount must be greater than 0' };
        }

        const opId = operationId || generateTxId('op');
        const userRef = ref(db, 'users/' + userId);
        const txId = generateTxId('credit');
        const timestamp = Date.now();
        const currency = getCurrency(walletType);

        log(`💰 Crediting ${amount} ${currency} to ${walletType} for user: ${userId}`);

        // ✅ Store in memory ONLY - NEVER saved to Firebase
        let txData = null;

        const result = await runTransaction(userRef, (currentData) => {
            if (!currentData) {
                logError('User data not found:', userId);
                return;
            }

            // Check for duplicate operation
            if (isDuplicateOperation(currentData, opId)) {
                log(`⚠️ Duplicate operation detected: ${opId}`);
                return { ...currentData, _duplicate: true };
            }

            const currentBalance = currentData[walletType] || 0;
            const newBalance = roundTo8(currentBalance + amount);

            // ✅ Store in memory ONLY - NOT in Firebase
            txData = {
                txId: txId,
                type: TRANSACTION_TYPES.WALLET_CREDIT,
                status: TRANSACTION_STATUS.COMPLETED,
                data: {
                    walletType: walletType,
                    amount: amount,
                    currency: currency,
                    beforeBalance: currentBalance,
                    afterBalance: newBalance,
                    ...metadata
                },
                description: description || `${walletType} credited with ${amount} ${currency}`,
                operationId: opId
            };

            // ✅ Return ONLY user data - NO _transactionData
            return {
                ...currentData,
                [walletType]: newBalance,
                lastWalletUpdate: timestamp
            };
        });

        // Check for duplicate
        if (result.snapshot && result.snapshot.val() && result.snapshot.val()._duplicate) {
            return { 
                success: true, 
                duplicate: true,
                message: 'Operation already processed',
                newBalance: result.snapshot.val()[walletType] || 0
            };
        }

        if (result.committed && result.snapshot.exists()) {
            const updatedData = result.snapshot.val();
            
            // ✅ Save transaction via transaction-service.js
            if (txData) {
                await createTransaction(
                    userId,
                    txData.type,
                    txData.data,
                    txData.status,
                    txData.description,
                    txData.operationId,
                    txData.txId
                );
            }

            log(`✅ Wallet credited: ${amount} ${currency} to ${walletType}`);
            return {
                success: true,
                newBalance: updatedData[walletType] || 0,
                transactionId: txId,
                timestamp: timestamp,
                operationId: opId
            };
        }

        return { success: false, error: 'Transaction not committed' };

    } catch (error) {
        logError('Error crediting wallet:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Debit a wallet (Atomic) with balance validation
 * ✅ Transactions saved via transaction-service.js
 * ✅ NO temporary data saved to Firebase
 * 
 * @param {string} userId - Firebase User UID
 * @param {string} walletType - Wallet type
 * @param {number} amount - Amount to debit
 * @param {string} description - Description for transaction history
 * @param {string} operationId - Unique operation ID for idempotency
 * @param {object} metadata - Additional metadata for transaction
 * @returns {object} { success, newBalance, transactionId, error }
 */
export async function debitWallet(userId, walletType, amount, description, operationId = null, metadata = {}) {
    try {
        // Validate inputs
        if (!userId) {
            return { success: false, error: 'User ID is required' };
        }
        if (!isValidWalletType(walletType)) {
            return { success: false, error: `Invalid wallet type: ${walletType}` };
        }
        if (!amount || amount <= 0) {
            return { success: false, error: 'Amount must be greater than 0' };
        }

        const opId = operationId || generateTxId('op');
        const userRef = ref(db, 'users/' + userId);
        const txId = generateTxId('debit');
        const timestamp = Date.now();
        const currency = getCurrency(walletType);

        log(`💰 Debiting ${amount} ${currency} from ${walletType} for user: ${userId}`);

        let insufficientBalance = false;
        
        // ✅ Store in memory ONLY - NEVER saved to Firebase
        let txData = null;

        const result = await runTransaction(userRef, (currentData) => {
            if (!currentData) {
                logError('User data not found:', userId);
                return;
            }

            // Check for duplicate operation
            if (isDuplicateOperation(currentData, opId)) {
                log(`⚠️ Duplicate operation detected: ${opId}`);
                return { ...currentData, _duplicate: true };
            }

            const currentBalance = currentData[walletType] || 0;

            // ✅ Validate sufficient balance - abort transaction
            if (currentBalance < amount) {
                logError(`Insufficient balance: ${currentBalance} < ${amount}`);
                insufficientBalance = true;
                return; // Abort transaction
            }

            const newBalance = roundTo8(currentBalance - amount);

            // ✅ Store in memory ONLY - NOT in Firebase
            txData = {
                txId: txId,
                type: TRANSACTION_TYPES.WALLET_DEBIT,
                status: TRANSACTION_STATUS.COMPLETED,
                data: {
                    walletType: walletType,
                    amount: amount,
                    currency: currency,
                    beforeBalance: currentBalance,
                    afterBalance: newBalance,
                    ...metadata
                },
                description: description || `${walletType} debited with ${amount} ${currency}`,
                operationId: opId
            };

            // ✅ Return ONLY user data - NO _transactionData
            return {
                ...currentData,
                [walletType]: newBalance,
                lastWalletUpdate: timestamp
            };
        });

        // Check for insufficient balance
        if (insufficientBalance) {
            let currentBalance = 0;
            if (result.snapshot && result.snapshot.exists()) {
                currentBalance = result.snapshot.val()[walletType] || 0;
            }
            return { 
                success: false, 
                error: 'Insufficient balance',
                currentBalance: currentBalance,
                needed: amount
            };
        }

        // Check for duplicate response
        if (result.snapshot && result.snapshot.val() && result.snapshot.val()._duplicate) {
            return { 
                success: true, 
                duplicate: true,
                message: 'Operation already processed',
                newBalance: result.snapshot.val()[walletType] || 0
            };
        }

        if (result.committed && result.snapshot.exists()) {
            const updatedData = result.snapshot.val();
            
            // ✅ Save transaction via transaction-service.js
            if (txData) {
                await createTransaction(
                    userId,
                    txData.type,
                    txData.data,
                    txData.status,
                    txData.description,
                    txData.operationId,
                    txData.txId
                );
            }

            log(`✅ Wallet debited: ${amount} ${currency} from ${walletType}`);
            return {
                success: true,
                newBalance: updatedData[walletType] || 0,
                transactionId: txId,
                timestamp: timestamp,
                operationId: opId
            };
        }

        return { success: false, error: 'Transaction not committed' };

    } catch (error) {
        logError('Error debiting wallet:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Transfer between wallets of the same user (Atomic)
 * ✅ Transactions saved via transaction-service.js
 * ✅ NO temporary data saved to Firebase
 * 
 * @param {string} userId - Firebase User UID
 * @param {string} fromWallet - Source wallet type
 * @param {string} toWallet - Destination wallet type
 * @param {number} amount - Amount to transfer
 * @param {string} description - Description for transaction history
 * @param {string} operationId - Unique operation ID for idempotency
 * @returns {object} { success, fromBalance, toBalance, transactionId }
 */
export async function transferBetweenWallets(userId, fromWallet, toWallet, amount, description, operationId = null) {
    try {
        // Validate inputs
        if (!userId) {
            return { success: false, error: 'User ID is required' };
        }
        if (!isValidWalletType(fromWallet)) {
            return { success: false, error: `Invalid source wallet: ${fromWallet}` };
        }
        if (!isValidWalletType(toWallet)) {
            return { success: false, error: `Invalid destination wallet: ${toWallet}` };
        }
        if (fromWallet === toWallet) {
            return { success: false, error: 'Cannot transfer to the same wallet' };
        }
        if (!amount || amount <= 0) {
            return { success: false, error: 'Amount must be greater than 0' };
        }

        const opId = operationId || generateTxId('op');
        const userRef = ref(db, 'users/' + userId);
        const txId = generateTxId('transfer');
        const timestamp = Date.now();
        const fromCurrency = getCurrency(fromWallet);
        const toCurrency = getCurrency(toWallet);

        log(`💰 Transferring ${amount} from ${fromWallet} to ${toWallet} for user: ${userId}`);

        let insufficientBalance = false;
        
        // ✅ Store in memory ONLY - NEVER saved to Firebase
        let txData = null;

        const result = await runTransaction(userRef, (currentData) => {
            if (!currentData) {
                logError('User data not found:', userId);
                return;
            }

            // Check for duplicate operation
            if (isDuplicateOperation(currentData, opId)) {
                log(`⚠️ Duplicate operation detected: ${opId}`);
                return { ...currentData, _duplicate: true };
            }

            const fromBalance = currentData[fromWallet] || 0;

            // Validate sufficient balance - abort transaction
            if (fromBalance < amount) {
                logError(`Insufficient balance in ${fromWallet}: ${fromBalance} < ${amount}`);
                insufficientBalance = true;
                return; // Abort transaction
            }

            const toBalance = currentData[toWallet] || 0;
            const newFromBalance = roundTo8(fromBalance - amount);
            const newToBalance = roundTo8(toBalance + amount);

            // ✅ Store in memory ONLY - NOT in Firebase
            txData = {
                txId: txId,
                type: TRANSACTION_TYPES.WALLET_TRANSFER,
                status: TRANSACTION_STATUS.COMPLETED,
                data: {
                    fromWallet: fromWallet,
                    toWallet: toWallet,
                    amount: amount,
                    fromCurrency: fromCurrency,
                    toCurrency: toCurrency,
                    fromBalance: fromBalance,
                    toBalance: toBalance,
                    newFromBalance: newFromBalance,
                    newToBalance: newToBalance
                },
                description: description || `Transferred ${amount} from ${fromWallet} to ${toWallet}`,
                operationId: opId
            };

            // ✅ Return ONLY user data - NO _transactionData
            return {
                ...currentData,
                [fromWallet]: newFromBalance,
                [toWallet]: newToBalance,
                lastWalletUpdate: timestamp
            };
        });

        // Check for insufficient balance
        if (insufficientBalance) {
            let currentBalance = 0;
            if (result.snapshot && result.snapshot.exists()) {
                currentBalance = result.snapshot.val()[fromWallet] || 0;
            }
            return { 
                success: false, 
                error: 'Insufficient balance',
                currentBalance: currentBalance,
                needed: amount
            };
        }

        // Check for duplicate response
        if (result.snapshot && result.snapshot.val() && result.snapshot.val()._duplicate) {
            return { 
                success: true, 
                duplicate: true,
                message: 'Operation already processed',
                fromBalance: result.snapshot.val()[fromWallet] || 0,
                toBalance: result.snapshot.val()[toWallet] || 0
            };
        }

        if (result.committed && result.snapshot.exists()) {
            const updatedData = result.snapshot.val();
            
            // ✅ Save transaction via transaction-service.js
            if (txData) {
                await createTransaction(
                    userId,
                    txData.type,
                    txData.data,
                    txData.status,
                    txData.description,
                    txData.operationId,
                    txData.txId
                );
            }

            log(`✅ Transfer completed: ${amount} from ${fromWallet} to ${toWallet}`);
            return {
                success: true,
                fromBalance: updatedData[fromWallet] || 0,
                toBalance: updatedData[toWallet] || 0,
                transactionId: txId,
                timestamp: timestamp,
                operationId: opId
            };
        }

        return { success: false, error: 'Transaction not committed' };

    } catch (error) {
        logError('Error transferring between wallets:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// READ ONLY HELPERS (NO CALCULATIONS)
// ============================================================

export function getWalletBalance(data, walletType) {
    if (!data) return 0;
    if (!isValidWalletType(walletType)) return 0;
    return data[walletType] || 0;
}

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

export function hasSufficientBalance(data, walletType, amount) {
    if (!data) return false;
    if (!isValidWalletType(walletType)) return false;
    const balance = data[walletType] || 0;
    return balance >= amount;
}

export function getTotalWalletValue(data, rndPrice = 1) {
    if (!data) return 0;

    const usdtWallets = (data.depositWallet || 0) + (data.referralWallet || 0);
    const rndValue = ((data.rndWallet || 0) + (data.lockedRND || 0)) * rndPrice;

    return roundTo8(usdtWallets + rndValue);
}

// ============================================================
// WALLET VALIDATION
// ============================================================

export function validateWalletData(data) {
    if (!data) {
        return { valid: false, errors: ['User data is null'] };
    }

    const errors = [];
    const wallets = ['depositWallet', 'referralWallet', 'rndWallet', 'lockedRND'];

    for (let wallet of wallets) {
        const value = data[wallet] ?? 0;
        if (typeof value !== 'number') {
            errors.push(`${wallet} is not a number: ${value}`);
        } else if (value < 0) {
            errors.push(`${wallet} is negative: ${value}`);
        } else if (isNaN(value)) {
            errors.push(`${wallet} is NaN: ${value}`);
        }
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

// ============================================================
// EXPOSE GLOBALLY
// ============================================================

if (typeof window !== 'undefined') {
    window.creditWallet = creditWallet;
    window.debitWallet = debitWallet;
    window.transferBetweenWallets = transferBetweenWallets;
    window.getWalletBalance = getWalletBalance;
    window.getAllWalletBalances = getAllWalletBalances;
    window.hasSufficientBalance = hasSufficientBalance;
    window.getTotalWalletValue = getTotalWalletValue;
    window.validateWalletData = validateWalletData;
    window.WALLET_TYPES = WALLET_TYPES;
}