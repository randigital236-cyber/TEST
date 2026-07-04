/**
 * Daily Release Management
 * Handles pending releases with day calculation
 */

import { db } from './firebase-init.js';
import { ref, runTransaction } from "firebase/database";

/**
 * Process Daily Releases with Pending Days Calculation
 * 
 * This function calculates how many days have passed since last release
 * and credits all pending releases at once.
 * 
 * @param {string} userId - Firebase User UID
 * @returns {object} Updated user data or null
 */
export async function processDailyReleases(userId) {
    try {
        const userRef = ref(db, 'users/' + userId);
        
        const result = await runTransaction(userRef, (currentData) => {
            if (!currentData) return { ...currentData };
            
            const packages = currentData.packages || {};
            let lastReleaseDate = currentData.lastReleaseDate || '';
            const today = new Date().toDateString();
            
            // Initialize lastReleaseDate if not set
            if (!lastReleaseDate) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                lastReleaseDate = yesterday.toDateString();
            }
            
            // Check if already processed today
            if (lastReleaseDate === today) {
                return { ...currentData };
            }
            
            // Calculate pending days
            const lastDate = new Date(lastReleaseDate);
            const currentDate = new Date(today);
            const diffTime = Math.abs(currentDate - lastDate);
            const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
            
            let totalReleaseToday = 0;
            let updatedPackages = {};
            let rndWallet = currentData.rndWallet || 0;
            let lockedRND = currentData.lockedRND || 0;
            let totalReleased = currentData.totalReleased || 0;
            let releaseTransactions = [];
            let releaseHistoryEntries = [];
            
            // Process each package
            for (let key in packages) {
                const pkg = packages[key];
                if (pkg.status !== 'active') {
                    updatedPackages[key] = pkg;
                    continue;
                }
                
                const remainingRND = pkg.remainingRND || 0;
                const dailyRelease = pkg.dailyRelease || 0;
                
                if (dailyRelease <= 0 || remainingRND <= 0) {
                    if (remainingRND <= 0 && pkg.status === 'active') {
                        pkg.status = 'completed';
                        pkg.completedAt = Date.now();
                    }
                    updatedPackages[key] = pkg;
                    continue;
                }
                
                // Calculate total release for pending days
                let totalReleaseAmount = dailyRelease * diffDays;
                
                // Cap at remaining RND
                if (totalReleaseAmount > remainingRND) {
                    totalReleaseAmount = remainingRND;
                }
                
                // Update package
                pkg.remainingRND = remainingRND - totalReleaseAmount;
                pkg.releasedRND = (pkg.releasedRND || 0) + totalReleaseAmount;
                
                if (pkg.remainingRND <= 0) {
                    pkg.remainingRND = 0;
                    pkg.status = 'completed';
                    pkg.completedAt = Date.now();
                }
                
                updatedPackages[key] = pkg;
                
                // Update totals
                totalReleaseToday += totalReleaseAmount;
                rndWallet += totalReleaseAmount;
                lockedRND -= totalReleaseAmount;
                totalReleased += totalReleaseAmount;
                
                // Create daily release entries
                const daysToProcess = Math.min(diffDays, Math.ceil(totalReleaseAmount / dailyRelease));
                let processedAmount = 0;
                
                for (let i = 0; i < daysToProcess; i++) {
                    const releaseDate = new Date(lastDate);
                    releaseDate.setDate(releaseDate.getDate() + i + 1);
                    const dateStr = releaseDate.toDateString();
                    
                    const remainingForDay = totalReleaseAmount - processedAmount;
                    const amountForDay = Math.min(dailyRelease, remainingForDay);
                    
                    if (amountForDay > 0) {
                        const beforeBalance = currentData.rndWallet || 0 + processedAmount;
                        
                        releaseHistoryEntries.push({
                            date: dateStr,
                            timestamp: releaseDate.getTime(),
                            amount: amountForDay,
                            packageId: key,
                            planName: pkg.planName || 'Package',
                            beforeBalance: beforeBalance,
                            afterBalance: beforeBalance + amountForDay
                        });
                        
                        releaseTransactions.push({
                            type: 'daily_release',
                            amount: amountForDay,
                            currency: 'RND',
                            packageId: key,
                            planName: pkg.planName || 'Package',
                            timestamp: releaseDate.getTime(),
                            date: dateStr,
                            status: 'completed',
                            day: i + 1,
                            description: `Daily release of ${amountForDay.toFixed(4)} RND from ${pkg.planName || 'Package'} (Day ${i + 1})`
                        });
                        
                        processedAmount += amountForDay;
                    }
                }
            }
            
            // If no release happened, return
            if (totalReleaseToday === 0) {
                return { ...currentData };
            }
            
            // Save transactions
            const transactions = currentData.transactions || {};
            for (let tx of releaseTransactions) {
                const txId = 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                transactions[txId] = tx;
            }
            
            // Save release history
            const releaseHistory = currentData.releaseHistory || {};
            for (let entry of releaseHistoryEntries) {
                const key = entry.date.replace(/\s/g, '_');
                if (!releaseHistory[key]) {
                    releaseHistory[key] = entry;
                }
            }
            
            return {
                ...currentData,
                packages: updatedPackages,
                rndWallet: rndWallet,
                lockedRND: lockedRND,
                totalReleased: totalReleased,
                releaseWallet: totalReleaseToday,
                lastReleaseDate: today,
                transactions: transactions,
                releaseHistory: releaseHistory
            };
        });
        
        if (result.committed && result.snapshot.exists()) {
            return result.snapshot.val();
        }
        return null;
        
    } catch (error) {
        console.error('Error processing daily releases:', error);
        throw error;
    }
}

/**
 * Get today's release amount from history
 */
export function getTodayRelease(data) {
    if (!data || !data.releaseHistory) return 0;
    const today = new Date().toDateString();
    const history = Object.values(data.releaseHistory);
    return history
        .filter(h => h.date === today)
        .reduce((sum, h) => sum + h.amount, 0);
}

/**
 * Get recent release history
 */
export function getRecentReleases(data, limit = 7) {
    if (!data || !data.releaseHistory) return [];
    const history = Object.values(data.releaseHistory);
    return history
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
}

/**
 * Calculate days passed since first release
 */
export function getDaysPassed(data) {
    if (!data || !data.releaseHistory) return 0;
    const history = Object.values(data.releaseHistory);
    if (history.length === 0) return 0;
    const sorted = history.sort((a, b) => a.timestamp - b.timestamp);
    const first = sorted[0];
    const today = new Date();
    const firstDate = new Date(first.timestamp);
    const diff = Math.floor((today - firstDate) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
}