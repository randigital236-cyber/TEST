/**
 * Commission Service - 5 Level Referral Commission
 * 
 * ⚠️ CRITICAL: This service handles all referral commission logic.
 * 
 * Commission Structure (LIVE WEBSITE):
 * Level 1: 8% (Direct Referral)
 * Level 2: 4%
 * Level 3: 2%
 * Level 4: 1%
 * Level 5: 1%
 * 
 * ✅ Atomic transactions for each commission credit
 * ✅ Finds sponsors up to 5 levels
 * ✅ Updates referral wallet, level earnings, and total earnings
 * ✅ Transactions saved via transaction-service.js (CENTRALIZED)
 * ✅ Idempotent - prevents duplicate commission credit (checked per sponsor)
 * ✅ Duplicate check inside transaction (optimized)
 * ✅ NO temporary data saved to Firebase
 * ✅ commissionHistory saved properly
 * ✅ Optimized for large user base
 * 
 * Integration with:
 * - dashboard.js: READ ONLY - displays commission data
 * - buy-package.js: Calls distributeReferralCommission() after package purchase
 * - transaction-service.js: CENTRALIZED transaction creation
 * - constants.js: Uses COMMISSION constants
 */

import { db } from './firebase-init.js';
import { ref, get, runTransaction, push } from "firebase/database";
import { roundTo8 } from './utils.js';
import { 
    createTransaction, 
    TRANSACTION_TYPES, 
    TRANSACTION_STATUS 
} from './transaction-service.js';
import { COMMISSION } from './constants.js';

// ============================================================
// CONSTANTS (Using COMMISSION from constants.js)
// ============================================================

const COMMISSION_RATES = COMMISSION.RATES; // [0.08, 0.04, 0.02, 0.01, 0.01]
const LEVEL_NAMES = COMMISSION.LEVEL_NAMES;
const MAX_LEVELS = COMMISSION.LEVELS;
const DEBUG = false;

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
// HELPER - Logging (Conditional)
// ============================================================

function log(message, ...args) {
    if (DEBUG) {
        console.log(`[CommissionService] ${message}`, ...args);
    }
}

function logError(message, ...args) {
    console.error(`[CommissionService] ${message}`, ...args);
}

// ============================================================
// HELPER - Generate Transaction ID
// ============================================================

function generateTxId(prefix = 'comm') {
    const pushKey = push(ref(db)).key;
    return `${prefix}_${pushKey}`;
}

// ============================================================
// HELPER - Check Duplicate Commission
// ============================================================

function isDuplicateCommission(transactions, packageId, fromUser) {
    if (!transactions) return false;
    
    for (let txId in transactions) {
        const tx = transactions[txId];
        if (tx.type === 'referral_commission' && 
            tx.packageId === packageId && 
            tx.fromUser === fromUser) {
            return true;
        }
    }
    return false;
}

// ============================================================
// ✅ FIX 1: OPTIMIZED - Get All Users (with cache hint)
// ============================================================

/**
 * Get all users from database
 * ⚠️ For large user base (>50,000), consider using index or pagination
 */
async function getAllUsers() {
    try {
        const usersSnap = await get(ref(db, 'users'));
        return usersSnap.exists() ? usersSnap.val() : {};
    } catch (error) {
        logError('Error fetching users:', error);
        return {};
    }
}

/**
 * Find sponsors up to 5 levels using referral codes
 * ✅ Optimized with single database read
 */
async function findSponsors(userUid, amount) {
    const users = await getAllUsers();
    const currentUser = users[userUid];
    
    if (!currentUser) {
        return { sponsors: [], totalCommission: 0, commissionCount: 0 };
    }
    
    let currentRefCode = currentUser.referredBy || '';
    let totalCommission = 0;
    let commissionCount = 0;
    let sponsors = [];
    
    for (let level = 0; level < MAX_LEVELS; level++) {
        if (!currentRefCode) break;
        
        let sponsorUid = null;
        let sponsor = null;
        
        // Find sponsor by referral code
        for (const uid in users) {
            if (users[uid].referralCode === currentRefCode) {
                sponsorUid = uid;
                sponsor = users[uid];
                break;
            }
        }
        
        if (!sponsorUid || !sponsor) {
            log(`⚠️ Sponsor not found for referral code: ${currentRefCode}`);
            break;
        }
        
        const commissionUSDT = roundTo8(amount * COMMISSION_RATES[level]);
        
        if (commissionUSDT <= 0) {
            log(`⚠️ Zero commission for level ${level + 1}, skipping`);
            break;
        }
        
        totalCommission = roundTo8(totalCommission + commissionUSDT);
        commissionCount++;
        
        sponsors.push({
            uid: sponsorUid,
            data: sponsor,
            level: level + 1,
            commission: commissionUSDT,
            levelName: LEVEL_NAMES[level],
            referralCode: sponsor.referralCode,
            username: sponsor.username || sponsor.referralCode || 'User'
        });
        
        currentRefCode = sponsor.referredBy || '';
    }
    
    return { sponsors, totalCommission, commissionCount };
}

// ============================================================
// MAIN FUNCTION - Distribute Referral Commission
// ============================================================

export async function distributeReferralCommission(userUid, amount, rndPriceAtTime, packageId) {
    const transactionStartTime = Date.now();
    
    try {
        log(`📊 Distributing commission for user: ${userUid}, amount: ${amount} USDT`);
        
        // ============================================================
        // 1. FIND SPONSORS (Optimized - Single Database Read)
        // ============================================================
        
        const { sponsors, totalCommission, commissionCount } = await findSponsors(userUid, amount);
        
        if (sponsors.length === 0) {
            log('ℹ️ No sponsors found for commission distribution');
            return { totalCommission: 0, commissionCount: 0 };
        }
        
        log(`📊 Found ${sponsors.length} sponsors for commission distribution`);
        
        // ============================================================
        // 2. CREDIT COMMISSION TO EACH SPONSOR (ATOMIC)
        // ============================================================
        
        let successCount = 0;
        let failedSponsors = [];
        let commissionResults = [];
        const currentUser = await get(ref(db, 'users/' + userUid));
        const currentUserData = currentUser.exists() ? currentUser.val() : null;
        const fromUser = currentUserData?.username || currentUserData?.referralCode || userUid;
        
        for (const sponsor of sponsors) {
            try {
                const sponsorRef = ref(db, 'users/' + sponsor.uid);
                const txId = generateTxId('comm');
                const historyId = generateTxId('ch');
                const date = getTodayDate();
                
                let txData = null;
                let duplicateDetected = false;

                const result = await runTransaction(sponsorRef, (currentData) => {
                    if (!currentData) {
                        logError('Sponsor data not found for UID:', sponsor.uid);
                        return;
                    }
                    
                    const transactions = currentData.transactions || {};
                    
                    if (isDuplicateCommission(transactions, packageId, fromUser)) {
                        log(`⚠️ Duplicate commission detected for sponsor ${sponsor.uid} (Level ${sponsor.level})`);
                        duplicateDetected = true;
                        return { ...currentData, _duplicate: true };
                    }
                    
                    const commissionAmount = sponsor.commission;
                    
                    // Update wallets
                    const newReferralWallet = roundTo8((currentData.referralWallet || 0) + commissionAmount);
                    const newReferralEarnings = roundTo8((currentData.referralEarnings || 0) + commissionAmount);
                    const newTotalReferralCommission = roundTo8((currentData.totalReferralCommission || 0) + commissionAmount);
                    
                    // Update level-specific earnings
                    const levelKey = `level${sponsor.level}Earnings`;
                    const newLevelEarnings = roundTo8((currentData[levelKey] || 0) + commissionAmount);
                    
                    // Update team business
                    const newTeamBusiness = roundTo8((currentData.teamBusiness || 0) + amount);
                    
                    // ✅ FIX 2: Update commissionHistory
                    const commissionHistory = currentData.commissionHistory || {};
                    commissionHistory[historyId] = {
                        level: sponsor.level,
                        levelName: sponsor.levelName,
                        amount: commissionAmount,
                        fromUser: fromUser,
                        packageId: packageId,
                        packageAmount: amount,
                        rate: rndPriceAtTime || 1,
                        commissionRate: COMMISSION_RATES[sponsor.level - 1],
                        timestamp: transactionStartTime,
                        date: date,
                        status: 'completed'
                    };
                    
                    txData = {
                        txId: txId,
                        type: TRANSACTION_TYPES.REFERRAL_COMMISSION,
                        status: TRANSACTION_STATUS.COMPLETED,
                        data: {
                            level: sponsor.level,
                            levelName: sponsor.levelName,
                            amount: commissionAmount,
                            currency: 'USDT',
                            fromUser: fromUser,
                            packageId: packageId,
                            packageAmount: amount,
                            rate: rndPriceAtTime || 1,
                            commissionRate: COMMISSION_RATES[sponsor.level - 1]
                        },
                        description: `${sponsor.levelName} commission of ${commissionAmount.toFixed(2)} USDT from package purchase`,
                        operationId: `comm_${packageId}_${sponsor.level}`
                    };
                    
                    return {
                        ...currentData,
                        referralWallet: newReferralWallet,
                        referralEarnings: newReferralEarnings,
                        totalReferralCommission: newTotalReferralCommission,
                        [levelKey]: newLevelEarnings,
                        teamBusiness: newTeamBusiness,
                        commissionHistory: commissionHistory,
                        lastCommissionReceived: Date.now()
                    };
                });
                
                // Check for duplicate
                if (duplicateDetected || (result.snapshot && result.snapshot.val() && result.snapshot.val()._duplicate)) {
                    failedSponsors.push(sponsor.level);
                    continue;
                }
                
                if (result.committed && result.snapshot && result.snapshot.exists()) {
                    // ✅ FIX 3: Removed unused updatedData
                    
                    if (txData) {
                        await createTransaction(
                            sponsor.uid,
                            txData.type,
                            txData.data,
                            txData.status,
                            txData.description,
                            txData.operationId,
                            txData.txId
                        );
                    }
                    
                    successCount++;
                    commissionResults.push({
                        level: sponsor.level,
                        rate: COMMISSION_RATES[sponsor.level - 1] * 100,
                        amount: sponsor.commission,
                        success: true,
                        uid: sponsor.uid
                    });
                    
                    log(`✅ Commission credited to ${sponsor.uid} (Level ${sponsor.level})`);
                } else {
                    logError(`❌ Transaction not committed for ${sponsor.uid} (Level ${sponsor.level})`);
                    failedSponsors.push(sponsor.level);
                }
            } catch (err) {
                logError(`Error processing level ${sponsor.level} commission:`, err);
                failedSponsors.push(sponsor.level);
            }
        }
        
        return {
            totalCommission: roundTo8(totalCommission),
            commissionCount: commissionCount,
            successCount: successCount,
            failedCount: sponsors.length - successCount,
            failedSponsors: failedSponsors,
            sponsors: sponsors,
            results: commissionResults,
            timestamp: transactionStartTime
        };
        
    } catch (error) {
        logError('Error distributing referral commission:', error);
        return { 
            totalCommission: 0, 
            commissionCount: 0, 
            error: error.message 
        };
    }
}

// ============================================================
// READ ONLY HELPERS (NO CALCULATIONS)
// ============================================================

export function getCommissionTotals(data) {
    if (!data) {
        return { 
            level1: 0, 
            level2: 0, 
            level3: 0, 
            level4: 0, 
            level5: 0, 
            total: 0 
        };
    }
    
    return {
        level1: data.level1Earnings || 0,
        level2: data.level2Earnings || 0,
        level3: data.level3Earnings || 0,
        level4: data.level4Earnings || 0,
        level5: data.level5Earnings || 0,
        total: data.referralEarnings || 0
    };
}

export function getCommissionHistory(data, limit = 20) {
    if (!data || !data.commissionHistory) return [];
    
    const history = Object.values(data.commissionHistory);
    return history
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
}

export function getCommissionByLevel(data, level) {
    if (!data) return 0;
    const levelKey = `level${level}Earnings`;
    return data[levelKey] || 0;
}

export function getTotalReferralEarnings(data) {
    if (!data) return 0;
    return data.referralEarnings || 0;
}

export function getReferralWalletBalance(data) {
    if (!data) return 0;
    return data.referralWallet || 0;
}

// ============================================================
// ADMIN FUNCTIONS (For debugging/admin panel)
// ============================================================

export function calculateExpectedCommission(amount, sponsors) {
    const result = {
        total: 0,
        levels: []
    };
    
    for (let i = 0; i < Math.min(sponsors.length, MAX_LEVELS); i++) {
        const commission = roundTo8(amount * COMMISSION_RATES[i]);
        result.levels.push({
            level: i + 1,
            rate: COMMISSION_RATES[i] * 100,
            amount: commission,
            sponsor: sponsors[i] || null
        });
        result.total = roundTo8(result.total + commission);
    }
    
    return result;
}

// ============================================================
// EXPOSE GLOBALLY
// ============================================================

if (typeof window !== 'undefined') {
    window.distributeReferralCommission = distributeReferralCommission;
    window.getCommissionTotals = getCommissionTotals;
    window.getCommissionHistory = getCommissionHistory;
    window.getCommissionByLevel = getCommissionByLevel;
    window.getTotalReferralEarnings = getTotalReferralEarnings;
    window.getReferralWalletBalance = getReferralWalletBalance;
    window.calculateExpectedCommission = calculateExpectedCommission;
}