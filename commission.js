/**
 * Commission Management
 * 
 * ⚠️ IMPORTANT: This is PURE DISPLAY ONLY.
 * ❌ No database writes
 * ❌ No calculations
 * ✅ Only reads from Firebase and updates DOM
 * 
 * Commission rates are defined in constants.js
 */

import { COMMISSION } from './constants.js';

/**
 * Get commission totals by level
 * ⚠️ READ ONLY - Just reads from Firebase
 * 
 * @param {object} data - User data from Firebase
 * @returns {object} { level1, level2, level3, level4, level5, total }
 */
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

/**
 * Get commission by level
 * ⚠️ READ ONLY
 */
export function getCommissionByLevel(data, level) {
    if (!data) return 0;
    const levelKey = `level${level}Earnings`;
    return data[levelKey] || 0;
}

/**
 * Get total referral earnings
 * ⚠️ READ ONLY
 */
export function getTotalReferralEarnings(data) {
    if (!data) return 0;
    return data.referralEarnings || 0;
}

/**
 * Get referral wallet balance
 * ⚠️ READ ONLY
 */
export function getReferralWalletBalance(data) {
    if (!data) return 0;
    return data.referralWallet || 0;
}

/**
 * Update commission display in DOM
 * ⚠️ READ ONLY - Just displays data
 */
export function updateCommissionDisplay(data) {
    if (!data) return;
    
    const totals = getCommissionTotals(data);
    
    const elements = {
        level1: document.getElementById('level1Earn'),
        level2: document.getElementById('level2Earn'),
        level3: document.getElementById('level3Earn'),
        level4: document.getElementById('level4Earn'),
        level5: document.getElementById('level5Earn'),
        total: document.getElementById('totalReferralEarnings')
    };
    
    if (elements.level1) elements.level1.textContent = totals.level1.toFixed(2);
    if (elements.level2) elements.level2.textContent = totals.level2.toFixed(2);
    if (elements.level3) elements.level3.textContent = totals.level3.toFixed(2);
    if (elements.level4) elements.level4.textContent = totals.level4.toFixed(2);
    if (elements.level5) elements.level5.textContent = totals.level5.toFixed(2);
    if (elements.total) elements.total.textContent = totals.total.toFixed(2) + ' USDT';
}

/**
 * Get commission rate for a specific level
 * ✅ Uses constants.js
 */
export function getCommissionRate(level) {
    if (level < 1 || level > COMMISSION.LEVELS) {
        return 0;
    }
    return COMMISSION.RATES[level - 1] || 0;
}

/**
 * Get commission percentage for a specific level
 */
export function getCommissionPercentage(level) {
    if (level < 1 || level > COMMISSION.LEVELS) {
        return 0;
    }
    return COMMISSION.LEVEL_PERCENTAGES[level - 1] || 0;
}