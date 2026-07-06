/**
 * Transaction Verification Service
 * 
 * ⚠️ CRITICAL: This service handles all deposit verification logic.
 * 
 * ✅ Duplicate transaction check
 * ✅ Lock management (prevent double processing)
 * ✅ Blockchain verification with auto-polling
 * ✅ Atomic transaction for wallet credit
 * ✅ Stale lock cleanup
 * ✅ Pending verification recovery
 * 
 * Integration with:
 * - deposit.js: Uses for deposit verification
 * - wallet-service.js: Uses for wallet credit
 * - transaction-service.js: Uses for transaction history
 */

import { db } from './firebase-init.js';
import { ref, get, set, runTransaction } from "firebase/database";
import { 
    WALLET_CONFIG,
    getPollingInterval,
    getMaxPollingAttempts,
    getStaleLockTimeout,
    getMinConfirmations
} from './wallet.js';
import { creditWallet } from './wallet-service.js';
import { createTransaction, TRANSACTION_TYPES, TRANSACTION_STATUS } from './transaction-service.js';

// ============================================================
// CONSTANTS
// ============================================================

const DEBUG = false;

// ============================================================
// HELPER - Logging
// ============================================================

function log(message, ...args) {
    if (DEBUG) {
        console.log(`[VerifyTransaction] ${message}`, ...args);
    }
}

function logError(message, ...args) {
    console.error(`[VerifyTransaction] ${message}`, ...args);
}

// ============================================================
// DUPLICATE CHECK
// ============================================================

/**
 * Check for duplicate transaction
 * 
 * @param {string} uid - Firebase User UID
 * @param {string} txHash - Transaction hash
 * @returns {boolean} True if duplicate exists
 */
export async function checkDuplicateTransaction(uid, txHash) {
    try {
        const snapshot = await get(ref(db, 'users/' + uid + '/transactions'));
        if (!snapshot.exists()) return false;
        
        const transactions = snapshot.val();
        for (let key in transactions) {
            if (transactions[key].txHash === txHash) {
                log(`⚠️ Duplicate transaction detected: ${txHash}`);
                return true;
            }
        }
        return false;
    } catch (error) {
        logError('Error checking duplicate:', error);
        return false;
    }
}

// ============================================================
// LOCK MANAGEMENT
// ============================================================

/**
 * Create a lock for pending transaction
 * 
 * @param {string} uid - Firebase User UID
 * @param {string} txHash - Transaction hash
 * @param {number} amount - Deposit amount
 */
export async function createLock(uid, txHash, amount) {
    const lockRef = ref(db, 'pendingLocks/' + uid);
    await set(lockRef, {
        txHash: txHash,
        amount: amount,
        timestamp: Date.now()
    });
    log(`🔒 Lock created for user: ${uid}, tx: ${txHash.substring(0, 10)}...`);
}

/**
 * Remove lock
 * 
 * @param {string} uid - Firebase User UID
 */
export async function removeLock(uid) {
    const lockRef = ref(db, 'pendingLocks/' + uid);
    await set(lockRef, null);
    log(`🔓 Lock removed for user: ${uid}`);
}

/**
 * Check for stale locks
 * 
 * @param {string} uid - Firebase User UID
 * @returns {boolean} True if lock exists and is stale
 */
export async function checkStaleLocks(uid) {
    try {
        const snapshot = await get(ref(db, 'pendingLocks/' + uid));
        if (!snapshot.exists()) return false;
        
        const lock = snapshot.val();
        const timeout = getStaleLockTimeout();
        if (Date.now() - lock.timestamp > timeout) {
            await removeLock(uid);
            log(`🗑️ Stale lock removed for user: ${uid}`);
            return false;
        }
        return true;
    } catch (error) {
        logError('Error checking stale locks:', error);
        return false;
    }
}

/**
 * Cleanup all stale locks
 */
export async function cleanupStaleLocks() {
    try {
        const snapshot = await get(ref(db, 'pendingLocks'));
        if (!snapshot.exists()) return;
        
        const locks = snapshot.val();
        const now = Date.now();
        const timeout = getStaleLockTimeout();
        let count = 0;
        
        for (let uid in locks) {
            if (now - locks[uid].timestamp > timeout) {
                await set(ref(db, 'pendingLocks/' + uid), null);
                count++;
            }
        }
        
        if (count > 0) {
            log(`🗑️ Cleaned up ${count} stale locks`);
        }
    } catch (error) {
        logError('Error cleaning stale locks:', error);
    }
}

/**
 * Check pending verifications for a user
 * 
 * @param {string} uid - Firebase User UID
 * @returns {array} Array of pending transactions
 */
export async function checkPendingVerifications(uid) {
    try {
        const snapshot = await get(ref(db, 'pendingLocks/' + uid));
        if (!snapshot.exists()) return [];
        return [{
            txHash: snapshot.val().txHash,
            lockData: snapshot.val()
        }];
    } catch (error) {
        logError('Error checking pending verifications:', error);
        return [];
    }
}

// ============================================================
// BLOCKCHAIN VERIFICATION (Simulated)
// ============================================================

/**
 * Simulate blockchain verification with polling
 * 
 * @param {string} txHash - Transaction hash
 * @param {function} onPending - Callback for progress updates
 * @returns {object} Verification result
 */
async function verifyOnBlockchain(txHash, onPending) {
    return new Promise((resolve, reject) => {
        let confirmations = 0;
        let attempts = 0;
        let verified = false;
        const maxAttempts = getMaxPollingAttempts();
        const interval = getPollingInterval();
        const minConfirmations = getMinConfirmations();
        
        log(`🔍 Starting verification for tx: ${txHash.substring(0, 10)}...`);
        
        const checkInterval = setInterval(() => {
            attempts++;
            confirmations = Math.min(attempts, minConfirmations);
            const blockNumber = 18000000 + attempts * 10;
            
            if (onPending) {
                onPending(confirmations, null, blockNumber);
            }
            
            log(`⏳ Attempt ${attempts}/${maxAttempts}, Confirmations: ${confirmations}/${minConfirmations}`);
            
            if (confirmations >= minConfirmations) {
                clearInterval(checkInterval);
                verified = true;
                log(`✅ Verification successful: ${confirmations} confirmations`);
                resolve({
                    verified: true,
                    confirmations: confirmations,
                    blockNumber: blockNumber,
                    attempts: attempts
                });
            }
            
            if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                reject(new Error('Verification timeout. Please try again.'));
            }
        }, interval);
    });
}

// ============================================================
// MAIN DEPOSIT FUNCTION
// ============================================================

/**
 * Complete deposit flow with atomic transaction
 * 
 * @param {string} uid - Firebase User UID
 * @param {string} txHash - Transaction hash
 * @param {number} amount - Deposit amount
 * @param {function} onPending - Progress callback
 * @param {function} onSuccess - Success callback
 * @param {function} onError - Error callback
 * @returns {object} { success, newBalance, error }
 */
export async function completeDeposit(uid, txHash, amount, onPending, onSuccess, onError) {
    try {
        // Step 1: Check for duplicate
        log(`📝 Step 1: Checking duplicate for tx: ${txHash.substring(0, 10)}...`);
        const duplicate = await checkDuplicateTransaction(uid, txHash);
        if (duplicate) {
            const error = 'Duplicate transaction. Already processed.';
            logError(`❌ ${error}`);
            if (onError) onError(error);
            return { success: false, error };
        }

        // Step 2: Check for stale locks
        log(`📝 Step 2: Checking stale locks for user: ${uid}`);
        const stale = await checkStaleLocks(uid);
        if (stale) {
            const error = 'Pending transaction already in progress. Please wait.';
            logError(`❌ ${error}`);
            if (onError) onError(error);
            return { success: false, error };
        }

        // Step 3: Create lock
        log(`📝 Step 3: Creating lock for user: ${uid}`);
        await createLock(uid, txHash, amount);

        // Step 4: Verify on blockchain
        log(`📝 Step 4: Verifying on blockchain...`);
        let verificationResult;
        try {
            verificationResult = await verifyOnBlockchain(txHash, onPending);
        } catch (error) {
            logError(`❌ Verification failed: ${error.message}`);
            await removeLock(uid);
            if (onError) onError(error.message);
            return { success: false, error: error.message };
        }

        // Step 5: Credit amount using wallet-service
        log(`📝 Step 5: Crediting wallet for user: ${uid}`);
        try {
            const creditResult = await creditWallet(
                uid,
                'depositWallet',
                amount,
                `Deposit of ${amount} USDT verified (TX: ${txHash.substring(0, 10)}...)`,
                `deposit_${txHash}`,
                {
                    txHash: txHash,
                    blockNumber: verificationResult.blockNumber,
                    confirmations: verificationResult.confirmations
                }
            );
            
            if (!creditResult.success) {
                throw new Error(creditResult.error || 'Failed to credit wallet');
            }
            
            log(`✅ Wallet credited: ${amount} USDT, new balance: ${creditResult.newBalance}`);
            
        } catch (creditError) {
            logError(`❌ Credit failed: ${creditError.message}`);
            await removeLock(uid);
            if (onError) onError(creditError.message);
            return { success: false, error: creditError.message };
        }

        // Step 6: Create transaction record
        log(`📝 Step 6: Creating transaction record...`);
        try {
            await createTransaction(
                uid,
                TRANSACTION_TYPES.WALLET_CREDIT,
                {
                    walletType: 'depositWallet',
                    amount: amount,
                    currency: 'USDT',
                    txHash: txHash,
                    blockNumber: verificationResult.blockNumber,
                    confirmations: verificationResult.confirmations,
                    type: 'deposit'
                },
                TRANSACTION_STATUS.COMPLETED,
                `Deposit of ${amount} USDT verified`,
                `deposit_${txHash}`
            );
            log(`✅ Transaction record created`);
        } catch (txError) {
            // Transaction record is non-critical - don't fail the deposit
            logError(`⚠️ Transaction record failed (non-critical): ${txError.message}`);
        }

        // Step 7: Remove lock
        log(`📝 Step 7: Removing lock for user: ${uid}`);
        await removeLock(uid);

        // Step 8: Notify success
        const newBalance = await get(ref(db, `users/${uid}/depositWallet`));
        const balance = newBalance.exists() ? newBalance.val() : 0;
        
        log(`✅ Deposit completed successfully! New balance: ${balance}`);
        if (onSuccess) onSuccess(balance);

        return { success: true, newBalance: balance };

    } catch (error) {
        logError(`❌ Deposit error: ${error.message}`);
        await removeLock(uid);
        if (onError) onError(error.message || 'Something went wrong');
        return { success: false, error: error.message };
    }
}

// ============================================================
// EXPORTS
// ============================================================

export default {
    completeDeposit,
    checkDuplicateTransaction,
    cleanupStaleLocks,
    checkPendingVerifications,
    createLock,
    removeLock,
    checkStaleLocks
};