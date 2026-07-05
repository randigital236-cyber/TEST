/**
 * Package Service - Core Business Logic for Buy Package
 */

import { db } from './firebase-init.js';
import { ref, get, runTransaction } from "firebase/database";
import { roundTo8 } from './utils.js';

// ============================================================
// PLANS CONFIGURATION
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

// ============================================================
// CALCULATE STAKING
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
// ATOMIC PURCHASE
// ============================================================

export async function processAtomicPurchase(uid, plan, payAmount, payFrom, result, rndPrice) {
    const userRef = ref(db, 'users/' + uid);
    const packageId = 'pkg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    const timestamp = Date.now();
    const date = new Date().toDateString();
    
    try {
        // Pre-check balance
        const userSnap = await get(ref(db, 'users/' + uid));
        if (!userSnap.exists()) {
            return { success: false, error: 'User not found' };
        }
        
        const userData = userSnap.val();
        const currentBalance = userData[payFrom] || 0;
        
        if (currentBalance < payAmount) {
            return { 
                success: false, 
                error: 'Insufficient balance',
                balance: currentBalance,
                needed: payAmount
            };
        }
        
        // Run atomic transaction
        const txResult = await runTransaction(userRef, (currentData) => {
            if (!currentData) {
                return { ...currentData };
            }
            
            const balance = currentData[payFrom] || 0;
            
            // Abort if insufficient balance
            if (balance < payAmount) {
                return null;
            }
            
            // Create package
            const packages = currentData.packages || {};
            packages[packageId] = {
                planId: plan.id,
                planName: plan.name,
                usdtAmount: payAmount,
                totalRND: result.totalRND,
                remainingRND: result.totalRND,
                releasedRND: 0,
                dailyRelease: result.dailyRelease,
                planDays: plan.days,
                bonusPercent: plan.bonus,
                status: 'active',
                purchaseDate: timestamp,
                rndPriceAtTime: rndPrice || 1,
                timestamp: timestamp
            };
            
            // Update balances
            const newBalance = roundTo8(balance - payAmount);
            const currentLocked = currentData.lockedRND || 0;
            const newLocked = roundTo8(currentLocked + result.totalRND);
            const totalStake = roundTo8((currentData.totalStake || 0) + payAmount);
            
            // Create transaction
            const transactions = currentData.transactions || {};
            const txId = 'tx_' + timestamp + '_' + Math.random().toString(36).substr(2, 8);
            transactions[txId] = {
                type: 'package',
                packageId: packageId,
                amount: payAmount,
                currency: 'USDT',
                rndReceived: result.totalRND,
                planName: plan.name,
                dailyRelease: result.dailyRelease,
                planDays: plan.days,
                bonusPercent: plan.bonus,
                timestamp: timestamp,
                date: date,
                status: 'completed',
                description: `Purchased ${plan.name} - ${result.totalRND.toFixed(2)} RND locked`
            };
            
            return {
                ...currentData,
                [payFrom]: newBalance,
                packages: packages,
                lockedRND: newLocked,
                totalStake: totalStake,
                transactions: transactions
            };
        });
        
        if (txResult.committed && txResult.snapshot && txResult.snapshot.exists()) {
            console.log('✅ Atomic purchase completed:', packageId);
            return { success: true, packageId: packageId };
        } else {
            return { 
                success: false, 
                error: txResult.error || 'Transaction aborted - insufficient balance'
            };
        }
    } catch (error) {
        console.error('Atomic purchase error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// GET PACKAGE HISTORY
// ============================================================

export function getPackageHistory(userData) {
    if (!userData || !userData.packages) return [];
    const packages = userData.packages || {};
    return Object.keys(packages).map(key => ({ id: key, ...packages[key] }))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

// ============================================================
// CHECK DUPLICATE PURCHASE
// ============================================================

export function checkDuplicatePurchase(userData, planId, amount, timestamp) {
    if (!userData || !userData.packages) return false;
    const packages = userData.packages || {};
    const windowMs = 10000; // 10 seconds
    
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
