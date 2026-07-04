/**
 * Commission Management
 * Atomic commission credit for all 5 levels
 */

import { db } from './firebase-init.js';
import { ref, runTransaction } from "firebase/database";

const COMMISSION_RATES = {
    level1: 0.08, // 8%
    level2: 0.04, // 4%
    level3: 0.02, // 2%
    level4: 0.01, // 1%
    level5: 0.01  // 1%
};

/**
 * Credit commission to all levels
 * Uses atomic transactions to prevent race conditions
 */
export async function creditCommission(userId, packageAmount, packageId) {
    try {
        // Get user's referral chain
        const userSnap = await get(ref(db, 'users/' + userId));
        if (!userSnap.exists()) return;
        const userData = userSnap.val();
        
        // Get referrer chain
        const referrers = await getReferrerChain(userData.referralCode);
        
        // Credit each level
        const results = [];
        for (let i = 0; i < Math.min(referrers.length, 5); i++) {
            const level = i + 1;
            const rate = COMMISSION_RATES[`level${level}`] || 0;
            const amount = packageAmount * rate;
            
            if (amount <= 0) continue;
            
            const result = await creditSingleCommission(
                referrers[i].uid,
                amount,
                level,
                userId,
                packageId,
                packageAmount
            );
            results.push({ level, amount, success: result.committed });
        }
        
        return results;
    } catch (error) {
        console.error('Error crediting commission:', error);
        throw error;
    }
}

/**
 * Get referrer chain (upto 5 levels)
 */
async function getReferrerChain(referralCode) {
    const chain = [];
    let currentCode = referralCode;
    let maxLevel = 5;
    
    try {
        const usersSnap = await get(ref(db, 'users'));
        if (!usersSnap.exists()) return chain;
        const users = usersSnap.val();
        
        for (let i = 0; i < maxLevel; i++) {
            let found = false;
            for (let uid in users) {
                const user = users[uid];
                if (user.referralCode === currentCode && user.referredBy) {
                    // Find the referrer
                    for (let refUid in users) {
                        if (users[refUid].referralCode === user.referredBy) {
                            chain.push({
                                uid: refUid,
                                data: users[refUid],
                                level: i + 1
                            });
                            currentCode = user.referredBy;
                            found = true;
                            break;
                        }
                    }
                    break;
                }
            }
            if (!found) break;
        }
    } catch (error) {
        console.error('Error getting referrer chain:', error);
    }
    
    return chain;
}

/**
 * Credit single commission with atomic transaction
 */
async function creditSingleCommission(uid, amount, level, fromUserId, packageId, packageAmount) {
    const userRef = ref(db, 'users/' + uid);
    
    return await runTransaction(userRef, (currentData) => {
        if (!currentData) return { ...currentData };
        
        // Update commission wallet
        const referralWallet = (currentData.referralWallet || 0) + amount;
        
        // Update level earnings
        const levelKey = `level${level}Earnings`;
        const levelEarnings = (currentData[levelKey] || 0) + amount;
        
        // Update total referral earnings
        const referralEarnings = (currentData.referralEarnings || 0) + amount;
        
        // Add to commission history
        const commissionHistory = currentData.commissionHistory || {};
        const txId = 'comm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        commissionHistory[txId] = {
            level: level,
            amount: amount,
            from: fromUserId,
            packageId: packageId,
            packageAmount: packageAmount,
            timestamp: Date.now(),
            date: new Date().toDateString(),
            status: 'completed'
        };
        
        // Add to transactions
        const transactions = currentData.transactions || {};
        const txId2 = 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        transactions[txId2] = {
            type: 'commission',
            level: level,
            amount: amount,
            currency: 'RND',
            from: fromUserId,
            timestamp: Date.now(),
            date: new Date().toDateString(),
            status: 'completed',
            description: `Level ${level} commission of ${amount.toFixed(4)} RND from package purchase`
        };
        
        return {
            ...currentData,
            referralWallet: referralWallet,
            [levelKey]: levelEarnings,
            referralEarnings: referralEarnings,
            commissionHistory: commissionHistory,
            transactions: transactions
        };
    });
}

/**
 * Get commission totals by level
 */
export function getCommissionTotals(data) {
    if (!data) return { level1: 0, level2: 0, level3: 0, level4: 0, level5: 0, total: 0 };
    
    const totals = {
        level1: data.level1Earnings || 0,
        level2: data.level2Earnings || 0,
        level3: data.level3Earnings || 0,
        level4: data.level4Earnings || 0,
        level5: data.level5Earnings || 0,
        total: data.referralEarnings || 0
    };
    
    return totals;
}