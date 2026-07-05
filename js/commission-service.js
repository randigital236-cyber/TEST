/**
 * Commission Service - 5 Level Referral Commission (Atomic)
 */

import { db } from './firebase-init.js';
import { ref, get, runTransaction } from "firebase/database";
import { roundTo8 } from './utils.js';

// ============================================================
// COMMISSION RATES
// ============================================================

const COMMISSION_RATES = [0.08, 0.04, 0.02, 0.01, 0.01];
const LEVEL_NAMES = ['Level 1 (8%)', 'Level 2 (4%)', 'Level 3 (2%)', 'Level 4 (1%)', 'Level 5 (1%)'];

// ============================================================
// DISTRIBUTE REFERRAL COMMISSION (Atomic)
// ============================================================

export async function distributeReferralCommission(userUid, amount, rndPriceAtTime, packageId) {
    try {
        const timestamp = Date.now();
        const date = new Date().toDateString();
        
        // Get all users
        const usersSnap = await get(ref(db, 'users'));
        if (!usersSnap.exists()) {
            return { totalCommission: 0, commissionCount: 0 };
        }
        const users = usersSnap.val();
        const currentUser = users[userUid];
        if (!currentUser) {
            return { totalCommission: 0, commissionCount: 0 };
        }
        
        let currentRefCode = currentUser.referredBy || '';
        let totalCommission = 0;
        let commissionCount = 0;
        let sponsors = [];
        
        // Collect all sponsors up to 5 levels
        for (let level = 0; level < 5; level++) {
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
            
            if (!sponsorUid || !sponsor) break;
            
            const commissionUSDT = roundTo8(amount * COMMISSION_RATES[level]);
            totalCommission = roundTo8(totalCommission + commissionUSDT);
            commissionCount++;
            
            sponsors.push({
                uid: sponsorUid,
                data: sponsor,
                level: level + 1,
                commission: commissionUSDT,
                levelName: LEVEL_NAMES[level]
            });
            
            // Move to next level
            currentRefCode = sponsor.referredBy || '';
        }
        
        if (sponsors.length === 0) {
            return { totalCommission: 0, commissionCount: 0 };
        }
        
        // Credit each sponsor atomically
        let successCount = 0;
        let failedSponsors = [];
        
        for (const sponsor of sponsors) {
            try {
                const sponsorRef = ref(db, 'users/' + sponsor.uid);
                const result = await runTransaction(sponsorRef, (currentData) => {
                    if (!currentData) return { ...currentData };
                    
                    // Update wallet and earnings
                    const newReferralEarnings = roundTo8((currentData.referralEarnings || 0) + sponsor.commission);
                    const newReferralWallet = roundTo8((currentData.referralWallet || 0) + sponsor.commission);
                    const newTeamBusiness = roundTo8((currentData.teamBusiness || 0) + amount);
                    const newTotalReferralCommission = roundTo8((currentData.totalReferralCommission || 0) + sponsor.commission);
                    const newLevelEarnings = roundTo8((currentData[`level${sponsor.level}Earnings`] || 0) + sponsor.commission);
                    
                    // Create transaction
                    const transactions = currentData.transactions || {};
                    const txId = 'tx_' + timestamp + '_' + Math.random().toString(36).substr(2, 8);
                    transactions[txId] = {
                        type: 'referral_commission',
                        level: sponsor.level,
                        amount: sponsor.commission,
                        currency: 'USDT',
                        fromUser: currentUser.username || userUid,
                        packageId: packageId,
                        rate: rndPriceAtTime,
                        timestamp: timestamp,
                        date: date,
                        status: 'completed',
                        description: `${sponsor.levelName} commission from package purchase`
                    };
                    
                    return {
                        ...currentData,
                        referralEarnings: newReferralEarnings,
                        referralWallet: newReferralWallet,
                        teamBusiness: newTeamBusiness,
                        totalReferralCommission: newTotalReferralCommission,
                        [`level${sponsor.level}Earnings`]: newLevelEarnings,
                        transactions: transactions
                    };
                });
                
                if (result.committed) {
                    successCount++;
                } else {
                    failedSponsors.push(sponsor.level);
                }
            } catch (err) {
                console.error(`Error in level ${sponsor.level} commission:`, err);
                failedSponsors.push(sponsor.level);
            }
        }
        
        return {
            totalCommission: roundTo8(totalCommission),
            commissionCount: commissionCount,
            successCount: successCount,
            failedCount: sponsors.length - successCount,
            failedSponsors: failedSponsors
        };
        
    } catch (error) {
        console.error('Error distributing referral commission:', error);
        return { 
            totalCommission: 0, 
            commissionCount: 0, 
            error: error.message 
        };
    }
}

// ============================================================
// GET COMMISSION TOTALS
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
