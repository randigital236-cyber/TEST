/**
 * Package Service - All Package Operations
 * 
 * ⚠️ CRITICAL: This service handles ALL package-related operations.
 * 
 * Responsibilities:
 * - Calculate staking (RND, bonus, daily release)
 * - Create package with atomic transaction (NO wallet debit, NO balance check)
 * - Get package history
 * - Get active packages
 * - Calculate total locked RND
 * - Check for duplicate purchases
 * - Update package status
 * 
 * ✅ Atomic transactions for package creation
 * ✅ NO wallet debit - handled by wallet-service.js
 * ✅ NO balance validation - wallet-service.js handles this
 * ✅ Duplicate check inside transaction with proper flag
 * ✅ Transactions saved via transaction-service.js (CENTRALIZED)
 * ✅ _transactionData NEVER saved to Firebase
 * ✅ Error handling for transaction creation failure
 * ✅ Proper return values with transaction status
 * 
 * Integration with:
 * - wallet-service.js: Called separately for debit/credit
 * - dashboard.js: READ ONLY - displays package data
 * - buy-package.js: Calls createPackage() after wallet debit
 * - release-service.js: Updates package status during release
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

export const PLANS = [
    { 
        id: '6months', 
        name: '6 Months Plan', 
        days: 180, 
        bonus: 25, 
        color: '#2ecc71',
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
        color: '#f472b6',
        bonusText: '+100% Bonus',
        minAmount: 200
    }
];

const DEBUG = false;

// ============================================================
// HELPER - Logging
// ============================================================

function log(message, ...args) {
    if (DEBUG) {
        console.log(`[PackageService] ${message}`, ...args);
    }
}

function logError(message, ...args) {
    console.error(`[PackageService] ${message}`, ...args);
}

// ============================================================
// HELPER - Generate ID
// ============================================================

function generateId(prefix = 'pkg') {
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
// CORE: CALCULATE STAKING
// ============================================================

export function calculateStaking(usdtAmount, rndPrice, plan) {
    if (!usdtAmount || usdtAmount <= 0 || !rndPrice || rndPrice <= 0 || !plan) {
        return {
            baseRND: 0,
            bonusRND: 0,
            totalRND: 0,
            dailyRelease: 0,
            bonusPercent: plan ? plan.bonus : 0,
            planDays: plan ? plan.days : 0
        };
    }
    
    const baseRND = roundTo8(usdtAmount / rndPrice);
    const bonusRND = roundTo8(baseRND * (plan.bonus / 100));
    const totalRND = roundTo8(baseRND + bonusRND);
    const dailyRelease = roundTo8(totalRND / plan.days);
    
    return {
        baseRND,
        bonusRND,
        totalRND,
        dailyRelease,
        bonusPercent: plan.bonus,
        planDays: plan.days
    };
}

// ============================================================
// CORE: CREATE PACKAGE (ATOMIC TRANSACTION)
// ✅ NO wallet debit - handled by wallet-service.js
// ✅ NO balance validation - wallet-service.js handles this
// ✅ _transactionData NEVER saved to Firebase
// ✅ Proper duplicate detection with flag
// ✅ Error handling for transaction creation
// ✅ Proper return with transaction status
// ============================================================

export async function createPackage(userId, plan, amount, stakingResult, rndPrice, walletType, operationId = null, transactionId = null) {
    try {
        // Validate inputs
        if (!userId) {
            return { success: false, error: 'User ID is required' };
        }
        if (!plan || !plan.id) {
            return { success: false, error: 'Invalid plan' };
        }
        if (!amount || amount <= 0) {
            return { success: false, error: 'Amount must be greater than 0' };
        }
        if (!stakingResult || stakingResult.totalRND <= 0) {
            return { success: false, error: 'Invalid staking calculation' };
        }
        if (!walletType || !['depositWallet', 'referralWallet'].includes(walletType)) {
            return { success: false, error: 'Invalid wallet type' };
        }

        const opId = operationId || generateId('op');
        const userRef = ref(db, 'users/' + userId);
        const packageId = generateId('pkg');
        const txId = generateId('tx');
        const timestamp = Date.now();
        const date = getTodayDate();

        log(`📦 Creating package for user: ${userId}, amount: ${amount} USDT`);

        // ✅ Flags for transaction status
        let duplicateDetected = false;
        let txData = null;

        const result = await runTransaction(userRef, (currentData) => {
            if (!currentData) {
                logError('User data not found:', userId);
                return;
            }

            // ============================================================
            // ✅ DUPLICATE CHECK (Inside Transaction)
            // ============================================================
            
            const packages = currentData.packages || {};
            const windowMs = 10000;
            
            for (let key in packages) {
                const pkg = packages[key];
                if (pkg.planId === plan.id && 
                    Math.abs((pkg.timestamp || 0) - timestamp) < windowMs &&
                    Math.abs((pkg.usdtAmount || 0) - amount) < 0.01) {
                    logError(`Duplicate purchase detected: ${key}`);
                    // ✅ Set flag and abort transaction
                    duplicateDetected = true;
                    return null;
                }
            }

            // ============================================================
            // ✅ CREATE PACKAGE
            // ============================================================
            
            const newPackages = { ...packages };
            newPackages[packageId] = {
                planId: plan.id,
                planName: plan.name,
                usdtAmount: amount,
                totalRND: stakingResult.totalRND,
                remainingRND: stakingResult.totalRND,
                releasedRND: 0,
                dailyRelease: stakingResult.dailyRelease,
                planDays: plan.days,
                bonusPercent: plan.bonus,
                status: 'active',
                purchaseDate: timestamp,
                rndPriceAtTime: rndPrice || 1,
                timestamp: timestamp,
                walletType: walletType,
                walletTransactionId: transactionId || null,
                operationId: opId
            };

            // ============================================================
            // ✅ UPDATE USER DATA
            // ============================================================
            
            const newLockedRND = roundTo8((currentData.lockedRND || 0) + stakingResult.totalRND);
            const newTotalStake = roundTo8((currentData.totalStake || 0) + amount);
            const newActivePackages = (currentData.activePackages || 0) + 1;

            // ============================================================
            // ✅ Store txData in memory, NOT in Firebase
            // ============================================================
            
            txData = {
                txId: txId,
                type: TRANSACTION_TYPES.PACKAGE_PURCHASE,
                status: TRANSACTION_STATUS.COMPLETED,
                data: {
                    packageId: packageId,
                    amount: amount,
                    currency: 'USDT',
                    walletType: walletType,
                    walletTransactionId: transactionId || null,
                    rndReceived: stakingResult.totalRND,
                    planName: plan.name,
                    planId: plan.id,
                    dailyRelease: stakingResult.dailyRelease,
                    planDays: plan.days,
                    bonusPercent: plan.bonus,
                    rndPriceAtTime: rndPrice || 1
                },
                description: `Purchased ${plan.name} - ${stakingResult.totalRND.toFixed(2)} RND locked`,
                operationId: opId
            };

            // ✅ Return ONLY user data - NO _transactionData
            return {
                ...currentData,
                packages: newPackages,
                lockedRND: newLockedRND,
                totalStake: newTotalStake,
                activePackages: newActivePackages,
                lastPackagePurchase: timestamp
            };
        });

        // ============================================================
        // ✅ Check duplicate flag - no extra Firebase read
        // ============================================================
        
        if (duplicateDetected) {
            return {
                success: false,
                error: 'Duplicate purchase detected. Please wait a moment.',
                duplicate: true
            };
        }

        // Check if transaction was aborted for other reason
        if (result.snapshot === null || result.committed === false) {
            return { 
                success: false, 
                error: 'Transaction aborted' 
            };
        }

        if (result.committed && result.snapshot && result.snapshot.exists()) {
            // ============================================================
            // ✅ Save transaction with error handling
            // ✅ Track if transaction was saved successfully
            // ============================================================
            
            let transactionSaved = false;
            
            if (txData) {
                try {
                    await createTransaction(
                        userId,
                        txData.type,
                        txData.data,
                        txData.status,
                        txData.description,
                        txData.operationId,
                        txData.txId
                    );
                    transactionSaved = true;
                    log(`✅ Transaction saved: ${txId}`);
                } catch (txError) {
                    // ✅ Transaction creation failed, but package is already created
                    // Log error for admin review
                    logError('❌ Failed to save transaction, but package was created:', txError);
                    transactionSaved = false;
                }
            }

            log(`✅ Package created: ${packageId} for user: ${userId}`);
            
            // ✅ FIX 2: Return proper transaction status
            return {
                success: true,
                packageId: packageId,
                timestamp: timestamp,
                operationId: opId,
                transactionId: txId,
                transactionSaved: transactionSaved
            };
        }

        return { 
            success: false, 
            error: 'Transaction not committed' 
        };

    } catch (error) {
        logError('Error creating package:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// READ: GET PACKAGE HISTORY
// ============================================================

export function getPackageHistory(userData, limit = 0) {
    if (!userData || !userData.packages) return [];
    
    const packages = userData.packages || {};
    const history = Object.keys(packages).map(key => ({ id: key, ...packages[key] }));
    
    history.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    if (limit > 0) {
        return history.slice(0, limit);
    }
    return history;
}

// ============================================================
// READ: GET ACTIVE PACKAGES
// ============================================================

export function getActivePackages(userData) {
    if (!userData || !userData.packages) return [];
    
    const packages = userData.packages || {};
    const active = [];
    
    for (let key in packages) {
        if (packages[key].status === 'active') {
            active.push({ id: key, ...packages[key] });
        }
    }
    
    return active.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

// ============================================================
// READ: GET COMPLETED PACKAGES
// ============================================================

export function getCompletedPackages(userData) {
    if (!userData || !userData.packages) return [];
    
    const packages = userData.packages || {};
    const completed = [];
    
    for (let key in packages) {
        if (packages[key].status === 'completed') {
            completed.push({ id: key, ...packages[key] });
        }
    }
    
    return completed.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
}

// ============================================================
// READ: GET PACKAGE BY ID
// ============================================================

export function getPackageById(userData, packageId) {
    if (!userData || !userData.packages) return null;
    
    const packages = userData.packages || {};
    if (packages[packageId]) {
        return { id: packageId, ...packages[packageId] };
    }
    return null;
}

// ============================================================
// READ: CALCULATE TOTAL LOCKED RND
// ============================================================

export function calculateTotalLockedRND(userData) {
    if (!userData || !userData.packages) return 0;
    
    const packages = userData.packages || {};
    let total = 0;
    
    for (let key in packages) {
        const pkg = packages[key];
        if (pkg.status === 'active') {
            total = roundTo8(total + (pkg.remainingRND || 0));
        }
    }
    
    return total;
}

// ============================================================
// READ: CALCULATE TOTAL RELEASED RND
// ============================================================

export function calculateTotalReleasedRND(userData) {
    if (!userData || !userData.packages) return 0;
    
    const packages = userData.packages || {};
    let total = 0;
    
    for (let key in packages) {
        total = roundTo8(total + (packages[key].releasedRND || 0));
    }
    
    return total;
}

// ============================================================
// READ: CHECK DUPLICATE PURCHASE (UI Helper)
// ============================================================

export function checkDuplicatePurchase(userData, planId, amount, timestamp, windowMs = 10000) {
    if (!userData || !userData.packages) return false;
    
    const packages = userData.packages || {};
    
    for (let key in packages) {
        const pkg = packages[key];
        if (pkg.planId === planId && 
            Math.abs((pkg.timestamp || 0) - timestamp) < windowMs &&
            Math.abs((pkg.usdtAmount || 0) - amount) < 0.01) {
            return true;
        }
    }
    return false;
}

// ============================================================
// WRITE: UPDATE PACKAGE STATUS
// ============================================================

export async function updatePackageStatus(userId, packageId, status, operationId = null) {
    try {
        if (!userId || !packageId || !status) {
            return { success: false, error: 'Missing required parameters' };
        }
        
        if (!['active', 'completed'].includes(status)) {
            return { success: false, error: 'Invalid status' };
        }

        const opId = operationId || generateId('op');
        const userRef = ref(db, 'users/' + userId);
        const txId = generateId('tx');
        const timestamp = Date.now();

        let txData = null;

        const result = await runTransaction(userRef, (currentData) => {
            if (!currentData) {
                logError('User data not found:', userId);
                return;
            }

            const packages = currentData.packages || {};
            if (!packages[packageId]) {
                logError('Package not found:', packageId);
                return;
            }

            const oldStatus = packages[packageId].status;

            if (oldStatus === status) {
                return { ...currentData };
            }

            packages[packageId].status = status;
            if (status === 'completed') {
                packages[packageId].completedAt = timestamp;
            }

            let activeCount = 0;
            for (let key in packages) {
                if (packages[key].status === 'active') {
                    activeCount++;
                }
            }

            txData = {
                txId: txId,
                type: TRANSACTION_TYPES.PACKAGE_STATUS_UPDATE,
                status: TRANSACTION_STATUS.COMPLETED,
                data: {
                    packageId: packageId,
                    oldStatus: oldStatus,
                    newStatus: status
                },
                description: `Package ${packageId} status updated from ${oldStatus} to ${status}`,
                operationId: opId
            };

            return {
                ...currentData,
                packages: packages,
                activePackages: activeCount,
                lastPackageUpdate: timestamp
            };
        });

        if (result.committed && result.snapshot && result.snapshot.exists()) {
            let transactionSaved = false;
            
            if (txData) {
                try {
                    await createTransaction(
                        userId,
                        txData.type,
                        txData.data,
                        txData.status,
                        txData.description,
                        txData.operationId,
                        txData.txId
                    );
                    transactionSaved = true;
                } catch (txError) {
                    logError('❌ Failed to save transaction, but status was updated:', txError);
                    transactionSaved = false;
                }
            }

            log(`✅ Package status updated: ${packageId} → ${status}`);
            return { 
                success: true,
                transactionSaved: transactionSaved 
            };
        }

        return { success: false, error: 'Transaction not committed' };

    } catch (error) {
        logError('Error updating package status:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// READ: GET PACKAGE STATS
// ============================================================

export function getPackageStats(userData) {
    if (!userData) {
        return { total: 0, active: 0, completed: 0, totalStake: 0, lockedRND: 0, releasedRND: 0 };
    }

    const packages = userData.packages || {};
    const packageKeys = Object.keys(packages);
    const total = packageKeys.length;
    
    let active = 0;
    let completed = 0;
    let totalStake = 0;
    let lockedRND = 0;
    let releasedRND = 0;

    for (let key in packages) {
        const pkg = packages[key];
        if (pkg.status === 'active') {
            active++;
            lockedRND = roundTo8(lockedRND + (pkg.remainingRND || 0));
        } else if (pkg.status === 'completed') {
            completed++;
        }
        totalStake = roundTo8(totalStake + (pkg.usdtAmount || 0));
        releasedRND = roundTo8(releasedRND + (pkg.releasedRND || 0));
    }

    return {
        total,
        active,
        completed,
        totalStake,
        lockedRND: lockedRND || userData.lockedRND || 0,
        releasedRND: releasedRND || userData.totalReleased || 0
    };
}

// ============================================================
// READ: VALIDATE PACKAGE DATA
// ============================================================

export function validatePackage(pkg) {
    if (!pkg) {
        return { valid: false, errors: ['Package is null'] };
    }

    const errors = [];

    const required = ['planId', 'planName', 'usdtAmount', 'totalRND', 'remainingRND', 'dailyRelease', 'planDays', 'status'];
    for (let field of required) {
        if (pkg[field] === undefined || pkg[field] === null) {
            errors.push(`Missing required field: ${field}`);
        }
    }

    if (pkg.usdtAmount < 0) errors.push('usdtAmount cannot be negative');
    if (pkg.totalRND < 0) errors.push('totalRND cannot be negative');
    if (pkg.remainingRND < 0) errors.push('remainingRND cannot be negative');
    if (pkg.remainingRND > pkg.totalRND) errors.push('remainingRND cannot exceed totalRND');
    if (pkg.dailyRelease < 0) errors.push('dailyRelease cannot be negative');

    if (!['active', 'completed'].includes(pkg.status)) {
        errors.push(`Invalid status: ${pkg.status}`);
    }

    if (pkg.purchaseDate && isNaN(pkg.purchaseDate)) {
        errors.push('Invalid purchaseDate');
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
    window.PLANS = PLANS;
    window.calculateStaking = calculateStaking;
    window.createPackage = createPackage;
    window.getPackageHistory = getPackageHistory;
    window.getActivePackages = getActivePackages;
    window.getCompletedPackages = getCompletedPackages;
    window.getPackageById = getPackageById;
    window.calculateTotalLockedRND = calculateTotalLockedRND;
    window.calculateTotalReleasedRND = calculateTotalReleasedRND;
    window.checkDuplicatePurchase = checkDuplicatePurchase;
    window.updatePackageStatus = updatePackageStatus;
    window.getPackageStats = getPackageStats;
    window.validatePackage = validatePackage;
}