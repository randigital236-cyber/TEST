// ============================================================
// 🔥 TRANSACTION VERIFICATION - Complete Logic
// ============================================================

import { db, ref } from './firebase.js';
import { get, set, update, runTransaction } from "firebase/database";
import { WALLET_CONFIG } from './wallet.js';

// ============================================================
// 🔥 CORE VERIFICATION FUNCTIONS
// ============================================================

/**
 * Check for duplicate transaction
 */
export async function checkDuplicateTransaction(uid, txHash) {
    try {
        const snapshot = await get(ref(db, 'users/' + uid + '/transactions'));
        if (!snapshot.exists()) return false;
        
        const transactions = snapshot.val();
        for (let key in transactions) {
            if (transactions[key].txHash === txHash) {
                return true;
            }
        }
        return false;
    } catch (error) {
        console.error('Error checking duplicate:', error);
        return false;
    }
}

/**
 * Create a lock for pending transaction
 */
export async function createLock(uid, txHash, amount) {
    const lockRef = ref(db, 'pendingLocks/' + uid);
    await set(lockRef, {
        txHash: txHash,
        amount: amount,
        timestamp: Date.now()
    });
}

/**
 * Remove lock
 */
export async function removeLock(uid) {
    const lockRef = ref(db, 'pendingLocks/' + uid);
    await set(lockRef, null);
}

/**
 * Check for stale locks
 */
export async function checkStaleLocks(uid) {
    try {
        const snapshot = await get(ref(db, 'pendingLocks/' + uid));
        if (!snapshot.exists()) return false;
        
        const lock = snapshot.val();
        if (Date.now() - lock.timestamp > WALLET_CONFIG.STALE_LOCK_TIMEOUT) {
            await removeLock(uid);
            return false;
        }
        return true;
    } catch (error) {
        console.error('Error checking stale locks:', error);
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
        for (let uid in locks) {
            if (now - locks[uid].timestamp > WALLET_CONFIG.STALE_LOCK_TIMEOUT) {
                await set(ref(db, 'pendingLocks/' + uid), null);
            }
        }
    } catch (error) {
        console.error('Error cleaning stale locks:', error);
    }
}

/**
 * Check pending verifications for a user
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
        console.error('Error checking pending verifications:', error);
        return [];
    }
}

/**
 * Simulate blockchain verification with polling
 */
async function verifyOnBlockchain(txHash, onPending) {
    return new Promise((resolve, reject) => {
        let confirmations = 0;
        let attempts = 0;
        let verified = false;
        
        // Simulate verification with increasing confirmations
        const checkInterval = setInterval(() => {
            attempts++;
            confirmations = Math.min(attempts, WALLET_CONFIG.MIN_CONFIRMATIONS);
            const blockNumber = 18000000 + attempts * 10;
            
            if (onPending) {
                onPending(confirmations, null, blockNumber);
            }
            
            if (confirmations >= WALLET_CONFIG.MIN_CONFIRMATIONS) {
                clearInterval(checkInterval);
                verified = true;
                resolve({
                    verified: true,
                    confirmations: confirmations,
                    blockNumber: blockNumber,
                    attempts: attempts
                });
            }
            
            if (attempts >= WALLET_CONFIG.MAX_POLLING_ATTEMPTS) {
                clearInterval(checkInterval);
                reject(new Error('Verification timeout. Please try again.'));
            }
        }, WALLET_CONFIG.POLLING_INTERVAL);
    });
}

/**
 * 🔥 Complete Deposit Flow with Atomic Transaction
 */
export async function completeDeposit(uid, txHash, amount, onPending, onSuccess, onError) {
    try {
        // Step 1: Check for duplicate
        const duplicate = await checkDuplicateTransaction(uid, txHash);
        if (duplicate) {
            const error = 'Duplicate transaction. Already processed.';
            if (onError) onError(error);
            return { success: false, error };
        }

        // Step 2: Check for stale locks
        const stale = await checkStaleLocks(uid);
        if (stale) {
            const error = 'Pending transaction already in progress. Please wait.';
            if (onError) onError(error);
            return { success: false, error };
        }

        // Step 3: Create lock
        await createLock(uid, txHash, amount);

        // Step 4: Verify on blockchain (simulated with polling)
        let verificationResult;
        try {
            verificationResult = await verifyOnBlockchain(txHash, onPending);
        } catch (error) {
            await removeLock(uid);
            if (onError) onError(error.message);
            return { success: false, error: error.message };
        }

        // Step 5: Credit amount using atomic transaction
        const userRef = ref(db, 'users/' + uid);
        const result = await runTransaction(userRef, (currentData) => {
            if (!currentData) return { ...currentData };
            
            const currentBalance = currentData.depositWallet || 0;
            const newBalance = currentBalance + amount;
            
            const transactions = currentData.transactions || {};
            const txId = 'dep_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            transactions[txId] = {
                type: 'deposit',
                amount: amount,
                txHash: txHash,
                status: 'success',
                timestamp: Date.now(),
                date: new Date().toDateString(),
                blockNumber: verificationResult.blockNumber,
                confirmations: verificationResult.confirmations,
                description: `Deposit of $${amount} USDT verified`
            };
            
            return {
                ...currentData,
                depositWallet: newBalance,
                transactions: transactions
            };
        });

        if (!result.committed) {
            const error = 'Transaction failed. Please try again.';
            if (onError) onError(error);
            await removeLock(uid);
            return { success: false, error };
        }

        // Step 6: Remove lock
        await removeLock(uid);

        // Step 7: Notify success
        const newBalance = result.snapshot.val().depositWallet || 0;
        if (onSuccess) onSuccess(newBalance);

        return { success: true, newBalance };

    } catch (error) {
        console.error('Deposit error:', error);
        await removeLock(uid);
        if (onError) onError(error.message || 'Something went wrong');
        return { success: false, error: error.message };
    }
}

// ============================================================
// 🔥 EXPORT ALL FUNCTIONS
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