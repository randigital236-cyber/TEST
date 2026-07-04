import { db, RANK_LEVELS } from "./firebase.js";
import { ref, get, update, runTransaction } from "firebase/database";

// ============================================================
// 🔥 GET RANK DETAILS
// ============================================================
export function getRankDetails(rankName) {
    return RANK_LEVELS.find(r => r.name === rankName) || null;
}

// ============================================================
// 🔥 GET NEXT RANK
// ============================================================
export function getNextRank(currentRankName) {
    const currentIndex = RANK_LEVELS.findIndex(r => r.name === currentRankName);
    if (currentIndex === -1 || currentIndex >= RANK_LEVELS.length - 1) {
        return null;
    }
    return RANK_LEVELS[currentIndex + 1];
}

// ============================================================
// 🔥 GET RANK BY BUSINESS
// ============================================================
export function getRankByBusiness(teamBusiness, qualifiedDirects) {
    let achievedRank = null;
    
    for (let i = RANK_LEVELS.length - 1; i >= 0; i--) {
        const rank = RANK_LEVELS[i];
        // Check if user qualifies for this rank
        if (teamBusiness >= rank.business && qualifiedDirects >= rank.direct) {
            achievedRank = rank;
            break;
        }
    }
    
    return achievedRank;
}

// ============================================================
// 🔥 GET RANK PROGRESS
// ============================================================
export function getRankProgress(teamBusiness, qualifiedDirects, currentRankName) {
    const currentIndex = RANK_LEVELS.findIndex(r => r.name === currentRankName);
    
    // If no rank yet or at last rank
    if (currentIndex === -1 || currentIndex >= RANK_LEVELS.length - 1) {
        // If at last rank, return 100% complete
        if (currentIndex === RANK_LEVELS.length - 1) {
            return {
                currentRank: currentRankName,
                nextRank: null,
                businessProgress: 100,
                directProgress: 100,
                businessNeeded: 0,
                directNeeded: 0,
                reward: 0
            };
        }
        
        // If no rank, next is first rank
        const nextRank = RANK_LEVELS[0];
        return {
            currentRank: 'Member',
            nextRank: nextRank,
            businessProgress: Math.min((teamBusiness / nextRank.business) * 100, 100),
            directProgress: Math.min((qualifiedDirects / nextRank.direct) * 100, 100),
            businessNeeded: Math.max(nextRank.business - teamBusiness, 0),
            directNeeded: Math.max(nextRank.direct - qualifiedDirects, 0),
            reward: nextRank.reward
        };
    }
    
    // Has a rank, show next rank progress
    const nextRank = RANK_LEVELS[currentIndex + 1];
    return {
        currentRank: currentRankName,
        nextRank: nextRank,
        businessProgress: Math.min((teamBusiness / nextRank.business) * 100, 100),
        directProgress: Math.min((qualifiedDirects / nextRank.direct) * 100, 100),
        businessNeeded: Math.max(nextRank.business - teamBusiness, 0),
        directNeeded: Math.max(nextRank.direct - qualifiedDirects, 0),
        reward: nextRank.reward
    };
}

// ============================================================
// 🔥 CHECK AND UPDATE RANK (AUTO PROMOTION)
// ============================================================
export async function checkAndUpdateRank(userId) {
    try {
        const userRef = ref(db, 'users/' + userId);
        const result = await runTransaction(userRef, (currentData) => {
            if (!currentData) return { ...currentData };
            
            const teamBusiness = currentData.teamBusiness || 0;
            const qualifiedDirects = currentData.qualifiedDirects || 0;
            const currentRank = currentData.rank || 'Member';
            const rankRewardPaid = currentData.rankRewardPaid || {};
            
            // Find the highest achievable rank
            let achievedRank = null;
            let rankUpgraded = false;
            
            for (let i = RANK_LEVELS.length - 1; i >= 0; i--) {
                const rank = RANK_LEVELS[i];
                if (teamBusiness >= rank.business && qualifiedDirects >= rank.direct) {
                    // Check if this rank is higher than current
                    const currentIndex = RANK_LEVELS.findIndex(r => r.name === currentRank);
                    if (i > currentIndex || currentRank === 'Member') {
                        achievedRank = rank;
                        rankUpgraded = true;
                        break;
                    }
                }
            }
            
            // If no upgrade, return unchanged
            if (!rankUpgraded || !achievedRank) {
                return { ...currentData };
            }
            
            // Check if reward already paid for this rank
            if (rankRewardPaid[achievedRank.id]) {
                // Rank achieved but reward already paid (shouldn't happen but safe)
                return { 
                    ...currentData, 
                    rank: achievedRank.name,
                    teamBusiness: teamBusiness,
                    qualifiedDirects: qualifiedDirects
                };
            }
            
            // 🔥 CREDIT REWARD TO DEPOSIT WALLET
            const depositWallet = currentData.depositWallet || 0;
            const newDepositWallet = depositWallet + achievedRank.reward;
            
            // Mark reward as paid
            rankRewardPaid[achievedRank.id] = {
                paidAt: Date.now(),
                amount: achievedRank.reward,
                teamBusiness: teamBusiness,
                qualifiedDirects: qualifiedDirects
            };
            
            // Add transaction record
            const transactions = currentData.transactions || {};
            const txId = 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            transactions[txId] = {
                type: 'rank_reward',
                rank: achievedRank.name,
                reward: achievedRank.reward,
                currency: 'USDT',
                timestamp: Date.now(),
                date: new Date().toDateString(),
                status: 'completed',
                description: `🏆 Rank Achieved: ${achievedRank.name} - Reward $${achievedRank.reward} credited to Deposit Wallet`
            };
            
            // Add notification
            const notifications = currentData.notifications || {};
            const notifId = 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            notifications[notifId] = {
                title: '🎉 Rank Achieved!',
                message: `Congratulations! You achieved ${achievedRank.name} rank and earned $${achievedRank.reward} USDT credited to Deposit Wallet.`,
                rank: achievedRank.name,
                reward: achievedRank.reward,
                read: false,
                timestamp: Date.now(),
                date: new Date().toDateString(),
                type: 'rank_reward'
            };
            
            // Return updated data
            return {
                ...currentData,
                rank: achievedRank.name,
                depositWallet: newDepositWallet,
                rankRewardPaid: rankRewardPaid,
                teamBusiness: teamBusiness,
                qualifiedDirects: qualifiedDirects,
                transactions: transactions,
                notifications: notifications
            };
        });
        
        if (result.committed && result.snapshot.exists()) {
            const updatedData = result.snapshot.val();
            console.log('✅ Rank check completed for user:', userId);
            console.log('📊 New Rank:', updatedData.rank);
            console.log('💰 Reward:', updatedData.depositWallet);
            return updatedData;
        }
        return null;
    } catch (error) {
        console.error('Error checking rank:', error);
        return null;
    }
}

// ============================================================
// 🔥 UPDATE TEAM BUSINESS (Call this when business changes)
// ============================================================
export async function updateTeamBusiness(userId, additionalBusiness) {
    try {
        const userRef = ref(db, 'users/' + userId);
        const result = await runTransaction(userRef, (currentData) => {
            if (!currentData) return { ...currentData };
            
            const currentBusiness = currentData.teamBusiness || 0;
            const newBusiness = currentBusiness + additionalBusiness;
            
            return {
                ...currentData,
                teamBusiness: newBusiness
            };
        });
        
        if (result.committed && result.snapshot.exists()) {
            // After updating business, check rank
            await checkAndUpdateRank(userId);
            return result.snapshot.val();
        }
        return null;
    } catch (error) {
        console.error('Error updating team business:', error);
        return null;
    }
}

// ============================================================
// 🔥 UPDATE QUALIFIED DIRECTS
// ============================================================
export async function updateQualifiedDirects(userId, count) {
    try {
        const userRef = ref(db, 'users/' + userId);
        const result = await runTransaction(userRef, (currentData) => {
            if (!currentData) return { ...currentData };
            
            return {
                ...currentData,
                qualifiedDirects: count
            };
        });
        
        if (result.committed && result.snapshot.exists()) {
            // After updating qualified directs, check rank
            await checkAndUpdateRank(userId);
            return result.snapshot.val();
        }
        return null;
    } catch (error) {
        console.error('Error updating qualified directs:', error);
        return null;
    }
}

// ============================================================
// 🔥 GET QUALIFIED DIRECT MEMBERS
// ============================================================
export async function getQualifiedDirectMembers(userId) {
    try {
        const usersSnap = await get(ref(db, 'users'));
        if (!usersSnap.exists()) return [];
        
        const currentUser = usersSnap.val()[userId];
        if (!currentUser) return [];
        
        const userRefCode = currentUser.referralCode;
        const qualifiedDirects = [];
        
        const allUsers = usersSnap.val();
        for (let uid in allUsers) {
            const u = allUsers[uid];
            if (u.referredBy === userRefCode) {
                // Check if this direct member qualifies (has rank at least Executive)
                const hasRank = u.rank && u.rank !== 'Member' && u.rank !== 'member';
                if (hasRank) {
                    qualifiedDirects.push({
                        uid: uid,
                        name: u.name,
                        rank: u.rank,
                        teamBusiness: u.teamBusiness || 0
                    });
                }
            }
        }
        
        return qualifiedDirects;
    } catch (error) {
        console.error('Error getting qualified directs:', error);
        return [];
    }
}

// ============================================================
// 🔥 CALCULATE QUALIFIED DIRECTS COUNT
// ============================================================
export async function calculateQualifiedDirects(userId) {
    try {
        const qualified = await getQualifiedDirectMembers(userId);
        const count = qualified.length;
        
        // Update the count in database
        await updateQualifiedDirects(userId, count);
        
        return count;
    } catch (error) {
        console.error('Error calculating qualified directs:', error);
        return 0;
    }
}
