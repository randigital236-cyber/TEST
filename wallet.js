/**
 * Wallet Management
 * Updates wallet displays and handles wallet operations
 */

import { db } from './firebase-init.js';
import { ref, update, runTransaction } from "firebase/database";

// DOM References
const elements = {
    depositWallet: document.getElementById('depositWallet'),
    referralWallet: document.getElementById('referralWallet'),
    rndWallet: document.getElementById('rndWallet'),
    lockedRND: document.getElementById('lockedRND'),
    dailyRelease: document.getElementById('dailyRelease'),
    totalReleased: document.getElementById('totalReleased'),
    activePackages: document.getElementById('activePackages'),
    totalStake: document.getElementById('totalStake'),
    totalReferrals: document.getElementById('totalReferrals'),
    teamBusiness: document.getElementById('teamBusiness'),
    totalReleasedBadge: document.getElementById('totalReleasedBadge'),
};

/**
 * Update all wallet displays
 */
export function updateWallets(data) {
    if (!data) return;
    
    // Update DOM elements with formatted values
    if (elements.depositWallet) {
        elements.depositWallet.textContent = (data.depositWallet || 0).toFixed(2);
    }
    if (elements.referralWallet) {
        elements.referralWallet.textContent = (data.referralWallet || 0).toFixed(2);
    }
    if (elements.rndWallet) {
        elements.rndWallet.textContent = (data.rndWallet || 0).toFixed(4);
    }
    if (elements.lockedRND) {
        elements.lockedRND.textContent = (data.lockedRND || 0).toFixed(2);
    }
    if (elements.dailyRelease) {
        elements.dailyRelease.textContent = (data.releaseWallet || 0).toFixed(4);
    }
    if (elements.totalReleased) {
        elements.totalReleased.textContent = (data.totalReleased || 0).toFixed(4);
    }
    if (elements.totalReleasedBadge) {
        elements.totalReleasedBadge.textContent = (data.totalReleased || 0).toFixed(4);
    }
    if (elements.activePackages) {
        elements.activePackages.textContent = data.activePackages || 0;
    }
    if (elements.totalStake) {
        elements.totalStake.textContent = (data.totalStake || 0).toFixed(2);
    }
    if (elements.totalReferrals) {
        elements.totalReferrals.textContent = data.totalReferrals || 0;
    }
    if (elements.teamBusiness) {
        elements.teamBusiness.textContent = (data.teamBusiness || 0).toFixed(2);
    }
}

/**
 * Get wallet balance by type
 */
export function getWalletBalance(data, walletType) {
    const balances = {
        depositWallet: data.depositWallet || 0,
        referralWallet: data.referralWallet || 0,
        rndWallet: data.rndWallet || 0,
        lockedRND: data.lockedRND || 0
    };
    return balances[walletType] || 0;
}

/**
 * Update wallet balance (atomic transaction)
 */
export async function updateWalletBalance(uid, walletType, amount, operation = 'add') {
    try {
        const userRef = ref(db, 'users/' + uid);
        const result = await runTransaction(userRef, (currentData) => {
            if (!currentData) return { ...currentData };
            const currentBalance = currentData[walletType] || 0;
            let newBalance;
            if (operation === 'add') {
                newBalance = currentBalance + amount;
            } else if (operation === 'subtract') {
                if (currentBalance < amount) {
                    return { ...currentData };
                }
                newBalance = currentBalance - amount;
            } else {
                newBalance = amount;
            }
            return {
                ...currentData,
                [walletType]: newBalance
            };
        });
        return result;
    } catch (error) {
        console.error('Error updating wallet:', error);
        throw error;
    }
}