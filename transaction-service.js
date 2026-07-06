/**
 * Transaction Service - Centralized Transaction Management
 * 
 * ⚠️ CRITICAL: This is the SINGLE SOURCE OF TRUTH for all transactions.
 * 
 * Architecture:
 * wallet-service ──┐
 * package-service ──┼──► transaction-service ──► Firebase
 * release-service ──┤
 * commission-service┘
 * 
 * ✅ SINGLE SOURCE OF TRUTH - All transactions go through this service
 * ✅ Atomic transactions using runTransaction
 * ✅ Read-only helpers for dashboard
 * ✅ Type-safe transaction records
 * ✅ Audit trail for all operations
 * ✅ Soft delete support
 * ✅ Support for custom transaction ID (7th parameter)
 * 
 * Integration with:
 * - wallet-service.js: Creates transaction records for wallet operations
 * - package-service.js: Creates transaction records for packages
 * - release-service.js: Creates transaction records for releases
 * - commission-service.js: Creates transaction records for commissions
 * - dashboard.js: READ ONLY - displays recent transactions
 */

import { db } from './firebase-init.js';
import { ref, push, set, get, runTransaction, remove, update } from "firebase/database";
import { roundTo8 } from './utils.js';

// ============================================================
// CONSTANTS
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
    DELETED: 'deleted'  // Soft delete
};

const DEBUG = false;

// ============================================================
// HELPER - Logging
// ============================================================

function log(message, ...args) {
    if (DEBUG) {
        console.log(`[TransactionService] ${message}`, ...args);
    }
}

function logError(message, ...args) {
    console.error(`[TransactionService] ${message}`, ...args);
}

// ============================================================
// HELPER - Generate Transaction ID
// ============================================================

/**
 * Generate a unique transaction ID using Firebase push key
 * 
 * @param {string} prefix - Prefix for the ID
 * @returns {string} Unique transaction ID
 */
export function generateTransactionId(prefix = 'tx') {
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
// CORE: CREATE TRANSACTION (CENTRALIZED)
// ============================================================

/**
 * Create a transaction record (CENTRALIZED)
 * ✅ This is the ONLY function that writes transactions to Firebase
 * ✅ Atomic using runTransaction to prevent conflicts
 * ✅ Supports custom transaction ID via 7th parameter
 * 
 * @param {string} userId - Firebase User UID
 * @param {string} type - Transaction type (from TRANSACTION_TYPES)
 * @param {object} data - Transaction data
 * @param {string} status - Transaction status (default: COMPLETED)
 * @param {string} description - Transaction description
 * @param {string} operationId - Operation ID for idempotency
 * @param {string} transactionId - Optional custom transaction ID
 * @returns {object} { success, transactionId, transaction, error }
 */
export async function createTransaction(
    userId, 
    type, 
    data, 
    status = TRANSACTION_STATUS.COMPLETED, 
    description = '', 
    operationId = null, 
    transactionId = null
) {
    try {
        // Validate inputs
        if (!userId) {
            return { success: false, error: 'User ID is required' };
        }
        if (!type || !Object.values(TRANSACTION_TYPES).includes(type)) {
            return { success: false, error: 'Invalid transaction type' };
        }
        if (!data || typeof data !== 'object') {
            return { success: false, error: 'Transaction data is required' };
        }

        // ✅ Use provided transactionId or generate new one
        const txId = transactionId || generateTransactionId('tx');
        const timestamp = Date.now();
        const date = getTodayDate();
        const opId = operationId || generateTransactionId('op');

        const transaction = {
            id: txId,
            type: type,
            status: status,
            timestamp: timestamp,
            date: date,
            operationId: opId,
            description: description || `${type} transaction`,
            data: {
                ...data,
                userId: userId
            },
            createdAt: timestamp,
            updatedAt: timestamp,
            deleted: false  // Soft delete flag
        };

        // ✅ Atomic write using runTransaction to prevent conflicts
        const userRef = ref(db, 'users/' + userId);
        
        const result = await runTransaction(userRef, (currentData) => {
            if (!currentData) {
                logError('User data not found:', userId);
                return;
            }

            // Initialize transactions if not exists
            const transactions = currentData.transactions || {};
            
            // ✅ Check for duplicate operationId
            if (opId) {
                for (let key in transactions) {
                    if (transactions[key].operationId === opId) {
                        log(`⚠️ Duplicate operationId detected: ${opId}`);
                        return { ...currentData, _duplicate: true };
                    }
                }
            }

            // ✅ Check for duplicate transactionId
            if (transactions[txId]) {
                log(`⚠️ Duplicate transactionId detected: ${txId}`);
                return { ...currentData, _duplicate: true };
            }

            // Add transaction
            transactions[txId] = transaction;

            return {
                ...currentData,
                transactions: transactions,
                lastTransactionUpdate: timestamp
            };
        });

        // Check for duplicate
        if (result.snapshot && result.snapshot.val() && result.snapshot.val()._duplicate) {
            return { 
                success: true, 
                duplicate: true,
                transactionId: txId,
                transaction: transaction,
                message: 'Duplicate operationId or transactionId, transaction already exists'
            };
        }

        if (result.committed && result.snapshot && result.snapshot.exists()) {
            log(`✅ Transaction created: ${txId} for user: ${userId}`);
            return {
                success: true,
                transactionId: txId,
                transaction: transaction
            };
        }

        return { success: false, error: 'Transaction not committed' };

    } catch (error) {
        logError('Error creating transaction:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// READ: GET TRANSACTION HISTORY
// ============================================================

/**
 * Get transaction history for a user
 * ⚠️ READ ONLY - Just reads from Firebase
 * 
 * @param {object} userData - User data from Firebase
 * @param {number} limit - Number of transactions to return (0 = all)
 * @param {string} type - Filter by transaction type (optional)
 * @param {boolean} includeDeleted - Include soft-deleted transactions
 * @returns {array} Transaction history array
 */
export function getTransactionHistory(userData, limit = 20, type = null, includeDeleted = false) {
    if (!userData || !userData.transactions) return [];

    const transactions = userData.transactions || {};
    let history = Object.values(transactions);

    // Filter out deleted transactions
    if (!includeDeleted) {
        history = history.filter(tx => tx.deleted !== true);
    }

    // Filter by type if specified
    if (type && Object.values(TRANSACTION_TYPES).includes(type)) {
        history = history.filter(tx => tx.type === type);
    }

    // Sort by timestamp (newest first)
    history.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (limit > 0) {
        return history.slice(0, limit);
    }
    return history;
}

// ============================================================
// READ: GET RECENT TRANSACTIONS (For Dashboard)
// ============================================================

/**
 * Get recent transactions for dashboard display
 * ⚠️ READ ONLY - Just reads from Firebase
 * 
 * @param {object} userData - User data from Firebase
 * @param {number} limit - Number of transactions to return
 * @returns {array} Recent transactions array
 */
export function getRecentTransactions(userData, limit = 5) {
    if (!userData || !userData.transactions) return [];

    const transactions = userData.transactions || {};
    let history = Object.values(transactions);

    // Filter out deleted and non-completed transactions
    history = history.filter(tx => 
        tx.deleted !== true && 
        tx.status === TRANSACTION_STATUS.COMPLETED
    );

    // Sort by timestamp (newest first)
    history.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    return history.slice(0, limit);
}

// ============================================================
// READ: GET TRANSACTIONS BY TYPE
// ============================================================

export function getTransactionsByType(userData, type, limit = 20) {
    if (!userData || !userData.transactions) return [];
    if (!Object.values(TRANSACTION_TYPES).includes(type)) return [];

    const transactions = userData.transactions || {};
    let history = Object.values(transactions)
        .filter(tx => tx.deleted !== true && tx.type === type)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (limit > 0) {
        return history.slice(0, limit);
    }
    return history;
}

// ============================================================
// READ: GET TRANSACTIONS BY DATE RANGE
// ============================================================

export function getTransactionsByDateRange(userData, startDate, endDate, includeDeleted = false) {
    if (!userData || !userData.transactions) return [];

    const transactions = userData.transactions || {};
    let history = Object.values(transactions)
        .filter(tx => {
            if (!includeDeleted && tx.deleted === true) return false;
            return tx.timestamp >= startDate && tx.timestamp <= endDate;
        })
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    return history;
}

// ============================================================
// READ: GET TRANSACTION SUMMARY
// ============================================================

export function getTransactionSummary(userData, days = 30) {
    if (!userData || !userData.transactions) {
        return {
            total: 0,
            completed: 0,
            failed: 0,
            pending: 0,
            deleted: 0,
            byType: {}
        };
    }

    const transactions = userData.transactions || {};
    const now = Date.now();
    const cutoff = days > 0 ? now - (days * 24 * 60 * 60 * 1000) : 0;

    let total = 0;
    let completed = 0;
    let failed = 0;
    let pending = 0;
    let deleted = 0;
    const byType = {};

    for (let key in transactions) {
        const tx = transactions[key];
        if (days > 0 && tx.timestamp < cutoff) continue;

        total++;
        if (tx.deleted === true) {
            deleted++;
            continue;
        }
        
        if (tx.status === TRANSACTION_STATUS.COMPLETED) completed++;
        else if (tx.status === TRANSACTION_STATUS.FAILED) failed++;
        else if (tx.status === TRANSACTION_STATUS.PENDING) pending++;

        if (tx.type) {
            byType[tx.type] = (byType[tx.type] || 0) + 1;
        }
    }

    return {
        total,
        completed,
        failed,
        pending,
        deleted,
        byType
    };
}

// ============================================================
// READ: GET TRANSACTION BY ID
// ============================================================

export function getTransactionById(userData, transactionId) {
    if (!userData || !userData.transactions) return null;

    const transactions = userData.transactions || {};
    if (transactions[transactionId]) {
        const tx = transactions[transactionId];
        // Return null if soft deleted
        if (tx.deleted === true) return null;
        return tx;
    }
    return null;
}

// ============================================================
// WRITE: UPDATE TRANSACTION STATUS
// ============================================================

/**
 * Update transaction status
 * 
 * @param {string} userId - Firebase User UID
 * @param {string} transactionId - Transaction ID
 * @param {string} status - New status
 * @param {string} description - Optional description update
 * @returns {object} { success, error }
 */
export async function updateTransactionStatus(userId, transactionId, status, description = null) {
    try {
        if (!userId || !transactionId || !status) {
            return { success: false, error: 'Missing required parameters' };
        }
        if (!Object.values(TRANSACTION_STATUS).includes(status)) {
            return { success: false, error: 'Invalid status' };
        }

        const userRef = ref(db, 'users/' + userId);
        let transactionFound = false;

        const result = await runTransaction(userRef, (currentData) => {
            if (!currentData) {
                logError('User data not found:', userId);
                return;
            }

            const transactions = currentData.transactions || {};
            if (!transactions[transactionId]) {
                logError('Transaction not found:', transactionId);
                return { ...currentData, _notFound: true };
            }

            transactionFound = true;

            const updates = {
                status: status,
                updatedAt: Date.now()
            };

            if (description) {
                updates.description = description;
            }

            transactions[transactionId] = {
                ...transactions[transactionId],
                ...updates
            };

            return {
                ...currentData,
                transactions: transactions,
                lastTransactionUpdate: Date.now()
            };
        });

        // Check if transaction not found
        if (result.snapshot && result.snapshot.val() && result.snapshot.val()._notFound) {
            return { success: false, error: 'Transaction not found' };
        }

        if (result.committed && result.snapshot.exists()) {
            log(`✅ Transaction status updated: ${transactionId} → ${status}`);
            return { success: true };
        }

        return { success: false, error: 'Transaction not committed' };

    } catch (error) {
        logError('Error updating transaction status:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// WRITE: SOFT DELETE TRANSACTION
// ============================================================

/**
 * Soft delete a transaction (set deleted=true)
 * ✅ Safe alternative to hard delete
 * 
 * @param {string} userId - Firebase User UID
 * @param {string} transactionId - Transaction ID
 * @param {string} reason - Reason for deletion
 * @param {string} adminUid - Admin user ID (for audit)
 * @returns {object} { success, error }
 */
export async function softDeleteTransaction(userId, transactionId, reason = '', adminUid = null) {
    try {
        if (!userId || !transactionId) {
            return { success: false, error: 'Missing required parameters' };
        }

        const userRef = ref(db, 'users/' + userId);
        let transactionFound = false;

        const result = await runTransaction(userRef, (currentData) => {
            if (!currentData) {
                logError('User data not found:', userId);
                return;
            }

            const transactions = currentData.transactions || {};
            if (!transactions[transactionId]) {
                logError('Transaction not found:', transactionId);
                return { ...currentData, _notFound: true };
            }

            transactionFound = true;

            // Soft delete
            transactions[transactionId] = {
                ...transactions[transactionId],
                deleted: true,
                deletedAt: Date.now(),
                deletedBy: adminUid || 'system',
                deletedReason: reason || 'No reason provided'
            };

            return {
                ...currentData,
                transactions: transactions,
                lastTransactionUpdate: Date.now()
            };
        });

        if (result.snapshot && result.snapshot.val() && result.snapshot.val()._notFound) {
            return { success: false, error: 'Transaction not found' };
        }

        if (result.committed && result.snapshot.exists()) {
            log(`✅ Transaction soft deleted: ${transactionId}`);
            return { success: true };
        }

        return { success: false, error: 'Transaction not committed' };

    } catch (error) {
        logError('Error soft deleting transaction:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// WRITE: RESTORE SOFT DELETED TRANSACTION
// ============================================================

/**
 * Restore a soft deleted transaction
 * 
 * @param {string} userId - Firebase User UID
 * @param {string} transactionId - Transaction ID
 * @param {string} adminUid - Admin user ID (for audit)
 * @returns {object} { success, error }
 */
export async function restoreTransaction(userId, transactionId, adminUid = null) {
    try {
        if (!userId || !transactionId) {
            return { success: false, error: 'Missing required parameters' };
        }

        const userRef = ref(db, 'users/' + userId);
        let transactionFound = false;

        const result = await runTransaction(userRef, (currentData) => {
            if (!currentData) {
                logError('User data not found:', userId);
                return;
            }

            const transactions = currentData.transactions || {};
            if (!transactions[transactionId]) {
                logError('Transaction not found:', transactionId);
                return { ...currentData, _notFound: true };
            }

            // Only restore if soft deleted
            if (transactions[transactionId].deleted !== true) {
                return { ...currentData, _notDeleted: true };
            }

            transactionFound = true;

            // Restore
            const restoredTx = { ...transactions[transactionId] };
            delete restoredTx.deleted;
            delete restoredTx.deletedAt;
            delete restoredTx.deletedBy;
            delete restoredTx.deletedReason;
            restoredTx.restoredAt = Date.now();
            restoredTx.restoredBy = adminUid || 'system';

            transactions[transactionId] = restoredTx;

            return {
                ...currentData,
                transactions: transactions,
                lastTransactionUpdate: Date.now()
            };
        });

        if (result.snapshot && result.snapshot.val() && result.snapshot.val()._notFound) {
            return { success: false, error: 'Transaction not found' };
        }
        if (result.snapshot && result.snapshot.val() && result.snapshot.val()._notDeleted) {
            return { success: false, error: 'Transaction is not deleted' };
        }

        if (result.committed && result.snapshot.exists()) {
            log(`✅ Transaction restored: ${transactionId}`);
            return { success: true };
        }

        return { success: false, error: 'Transaction not committed' };

    } catch (error) {
        logError('Error restoring transaction:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// VALIDATION
// ============================================================

export function validateTransaction(transaction) {
    if (!transaction) {
        return { valid: false, errors: ['Transaction is null'] };
    }

    const errors = [];

    const required = ['id', 'type', 'status', 'timestamp', 'data'];
    for (let field of required) {
        if (transaction[field] === undefined || transaction[field] === null) {
            errors.push(`Missing required field: ${field}`);
        }
    }

    if (transaction.type && !Object.values(TRANSACTION_TYPES).includes(transaction.type)) {
        errors.push(`Invalid transaction type: ${transaction.type}`);
    }

    if (transaction.status && !Object.values(TRANSACTION_STATUS).includes(transaction.status)) {
        errors.push(`Invalid transaction status: ${transaction.status}`);
    }

    if (transaction.timestamp && isNaN(transaction.timestamp)) {
        errors.push('Invalid timestamp');
    }

    if (transaction.data && typeof transaction.data !== 'object') {
        errors.push('Data must be an object');
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

// ============================================================
// HELPER: FORMAT TRANSACTION FOR DISPLAY
// ============================================================

export function formatTransactionForDisplay(transaction) {
    if (!transaction) return null;

    // Use constants for type checking
    const creditTypes = [
        TRANSACTION_TYPES.WALLET_CREDIT,
        TRANSACTION_TYPES.REFERRAL_COMMISSION,
        TRANSACTION_TYPES.DAILY_RELEASE,
        TRANSACTION_TYPES.ADMIN_BONUS
    ];
    
    const debitTypes = [
        TRANSACTION_TYPES.WALLET_DEBIT,
        TRANSACTION_TYPES.PACKAGE_PURCHASE
    ];

    const formatted = {
        ...transaction,
        formattedDate: transaction.date || getTodayDate(),
        formattedTime: transaction.timestamp ? new Date(transaction.timestamp).toLocaleString('en-IN') : 'N/A',
        isCredit: creditTypes.includes(transaction.type),
        isDebit: debitTypes.includes(transaction.type),
        amount: transaction.data?.amount || transaction.amount || 0,
        currency: transaction.data?.currency || transaction.currency || 'USDT'
    };

    // Add friendly type name
    const typeNames = {
        wallet_credit: 'Wallet Credit',
        wallet_debit: 'Wallet Debit',
        wallet_transfer: 'Wallet Transfer',
        package_purchase: 'Package Purchase',
        package_status_update: 'Package Status Update',
        daily_release: 'Daily Release',
        referral_commission: 'Referral Commission',
        user_registration: 'User Registration',
        user_login: 'User Login',
        user_logout: 'User Logout',
        admin_adjustment: 'Admin Adjustment',
        admin_bonus: 'Admin Bonus'
    };
    formatted.friendlyType = typeNames[transaction.type] || transaction.type;

    // Add status color
    const statusColors = {
        completed: 'success',
        pending: 'warning',
        failed: 'danger',
        rolled_back: 'secondary',
        deleted: 'secondary'
    };
    formatted.statusColor = statusColors[transaction.status] || 'secondary';

    return formatted;
}

// ============================================================
// EXPOSE GLOBALLY
// ============================================================

if (typeof window !== 'undefined') {
    window.TRANSACTION_TYPES = TRANSACTION_TYPES;
    window.TRANSACTION_STATUS = TRANSACTION_STATUS;
    window.generateTransactionId = generateTransactionId;
    window.createTransaction = createTransaction;
    window.getTransactionHistory = getTransactionHistory;
    window.getRecentTransactions = getRecentTransactions;
    window.getTransactionsByType = getTransactionsByType;
    window.getTransactionsByDateRange = getTransactionsByDateRange;
    window.getTransactionSummary = getTransactionSummary;
    window.getTransactionById = getTransactionById;
    window.updateTransactionStatus = updateTransactionStatus;
    window.softDeleteTransaction = softDeleteTransaction;
    window.restoreTransaction = restoreTransaction;
    window.validateTransaction = validateTransaction;
    window.formatTransactionForDisplay = formatTransactionForDisplay;
}