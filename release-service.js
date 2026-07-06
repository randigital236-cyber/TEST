/**
 * Release Service - Daily Release Management
 * 
 * ⚠️ CRITICAL: This is the most important service file.
 * 
 * This service handles:
 * - Calculating missed days when user is offline
 * - Processing all pending releases at once
 * - Updating wallets atomically
 * - Tracking package completions (status updated via package-service.js)
 * - Saving release history
 * - Creating transactions via transaction-service.js (centralized)
 * 
 * ✅ User logs in after 1 day → Gets 1 day release
 * ✅ User logs in after 5 days → Gets 5 days release
 * ✅ User logs in after 20 days → Gets 20 days release
 * 
 * ✅ Atomic transactions for all updates
 * ✅ Package status updates via package-service.js (centralized)
 * ✅ Transactions saved via transaction-service.js (centralized)
 * ✅ Idempotent - will only process once per day
 * ✅ releaseHistory is the SOURCE OF TRUTH for releases
 * ✅ NO temporary data saved to Firebase
 * 
 * Integration with:
 * - dashboard.js: READ ONLY - displays release data
 * - package-service.js: Updates package status when completed
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
import { updatePackageStatus } from './package-service.js';

// ============================================================
// CONSTANTS
// ============================================================

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY_DAYS = 365;
const DEBUG = false;

// ============================================================
// HELPER - Logging (Conditional)
// ============================================================

function log(message, ...args) {
    if (DEBUG) {
        console.log(`[ReleaseService] ${message}`, ...args);
    }
}

function logError(message, ...args) {
    console.error(`[ReleaseService] ${message}`, ...args);
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
// HELPER - Parse Date (With Validation)
// ============================================================

function parseDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') {
        return null;
    }
    
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
        return null;
    }
    
    const [year, month, day] = parts;
    
    if (month < 1 || month > 12 || day < 1 || day > 31) {
        return null;
    }
    
    const date = new Date(year, month - 1, day);
    
    if (isNaN(date.getTime())) {
        return null;
    }
    
    return date;
}

// ============================================================
// HELPER - Calculate Days Difference (With Validation)
// ============================================================

function getDaysDifference(date1, date2) {
    const d1 = parseDate(date1);
    const d2 = parseDate(date2);
    
    if (!d1 || !d2) {
        return 0;
    }
    
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    return Math.floor(diffTime / ONE_DAY_MS);
}

// ============================================================
// HELPER - Validate Package Data
// ============================================================

function isValidPackage(pkg) {
    if (!pkg) return false;
    
    const remainingRND = pkg.remainingRND || 0;
    const dailyRelease = pkg.dailyRelease || 0;
    
    if (remainingRND < 0 || dailyRelease < 0) {
        logError('Invalid package data - negative values:', { remainingRND, dailyRelease });
        return false;
    }
    
    if (isNaN(remainingRND) || isNaN(dailyRelease)) {
        logError('Invalid package data - NaN values:', { remainingRND, dailyRelease });
        return false;
    }
    
    return true;
}

// ============================================================
// MAIN FUNCTION - Process Pending Releases
// ============================================================

export async function processPendingReleases(userId) {
    const transactionStartTime = Date.now();
    let daysMissed = 0;
    
    try {
        const userRef = ref(db, 'users/' + userId);
        
        // ✅ Store in memory ONLY - NEVER saved to Firebase
        let releaseEntries = [];
        let completedPackageIds = [];
        let totalReleaseAmount = 0;

        const result = await runTransaction(userRef, (currentData) => {
            if (!currentData) {
                logError('User data not found for userId:', userId);
                return;
            }
            
            const today = getTodayDate();
            const lastReleaseDate = currentData.lastReleaseDate || '';
            
            // ✅ Idempotent check - skip if already processed today
            if (lastReleaseDate === today) {
                log('✅ Release already processed today for:', userId);
                return { ...currentData };
            }
            
            daysMissed = 1;
            
            if (lastReleaseDate) {
                daysMissed = getDaysDifference(lastReleaseDate, today);
                daysMissed = Math.max(1, daysMissed);
            }
            
            log(`📅 Days missed for ${userId}: ${daysMissed} days`);
            
            const packages = currentData.packages || {};
            let totalReleaseToday = 0;
            let updatedPackages = {};
            let entries = [];
            
            let runningRndBalance = currentData.rndWallet || 0;
            
            for (let packageId in packages) {
                const pkg = packages[packageId];
                
                if (!isValidPackage(pkg)) {
                    logError('Skipping invalid package:', packageId);
                    updatedPackages[packageId] = pkg;
                    continue;
                }
                
                // ✅ Skip non-active packages
                if (pkg.status !== 'active') {
                    updatedPackages[packageId] = pkg;
                    continue;
                }
                
                const remainingRND = pkg.remainingRND || 0;
                const dailyRelease = pkg.dailyRelease || 0;
                
                // ✅ Check if package should be completed
                if (dailyRelease <= 0 || remainingRND <= 0) {
                    // ✅ Only track for status update - don't update status here
                    if (remainingRND <= 0) {
                        completedPackageIds.push(packageId);
                    }
                    updatedPackages[packageId] = pkg;
                    continue;
                }
                
                let totalReleaseAmountForPackage = dailyRelease * daysMissed;
                
                // ✅ Cap at remaining RND
                if (totalReleaseAmountForPackage > remainingRND) {
                    totalReleaseAmountForPackage = remainingRND;
                }
                
                if (totalReleaseAmountForPackage <= 0) {
                    updatedPackages[packageId] = pkg;
                    continue;
                }
                
                // ✅ Update package
                pkg.remainingRND = roundTo8(remainingRND - totalReleaseAmountForPackage);
                pkg.releasedRND = roundTo8((pkg.releasedRND || 0) + totalReleaseAmountForPackage);
                pkg.lastReleaseDate = today;
                
                // ✅ Check if package is now completed
                if (pkg.remainingRND <= 0) {
                    pkg.remainingRND = 0;
                    pkg.status = 'completed';
                    pkg.completedAt = transactionStartTime;
                    completedPackageIds.push(packageId);
                }
                
                updatedPackages[packageId] = pkg;
                
                totalReleaseToday = roundTo8(totalReleaseToday + totalReleaseAmountForPackage);
                
                // ✅ Create release entries for each day
                const daysToProcess = Math.min(daysMissed, Math.ceil(totalReleaseAmountForPackage / dailyRelease));
                let processedAmount = 0;
                
                let lastDateObj = lastReleaseDate ? parseDate(lastReleaseDate) : new Date();
                if (!lastDateObj) {
                    logError('Invalid lastReleaseDate, using today');
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = String(now.getMonth() + 1).padStart(2, '0');
                    const day = String(now.getDate()).padStart(2, '0');
                    lastDateObj = new Date(`${year}-${month}-${day}`);
                }
                
                for (let i = 0; i < daysToProcess; i++) {
                    const releaseDate = new Date(lastDateObj);
                    releaseDate.setDate(releaseDate.getDate() + i + 1);
                    
                    const year = releaseDate.getFullYear();
                    const month = String(releaseDate.getMonth() + 1).padStart(2, '0');
                    const day = String(releaseDate.getDate()).padStart(2, '0');
                    const dateStr = `${year}-${month}-${day}`;
                    
                    const remainingForDay = totalReleaseAmountForPackage - processedAmount;
                    const amountForDay = Math.min(dailyRelease, remainingForDay);
                    
                    if (amountForDay > 0) {
                        const beforeBalance = runningRndBalance;
                        const afterBalance = roundTo8(runningRndBalance + amountForDay);
                        runningRndBalance = afterBalance;
                        
                        const timestamp = releaseDate.getTime();
                        
                        entries.push({
                            date: dateStr,
                            timestamp: timestamp,
                            amount: roundTo8(amountForDay),
                            packageId: packageId,
                            planName: pkg.planName || 'Package',
                            beforeBalance: beforeBalance,
                            afterBalance: afterBalance,
                            dayNumber: i + 1,
                            totalDays: daysToProcess
                        });
                        
                        processedAmount = roundTo8(processedAmount + amountForDay);
                    }
                }
            }
            
            // ✅ If no release, just update lastReleaseDate
            if (totalReleaseToday === 0) {
                return {
                    ...currentData,
                    lastReleaseDate: today,
                    todayRelease: 0,
                    daysPassed: 0
                };
            }
            
            // ✅ Update wallets
            const newRndWallet = roundTo8((currentData.rndWallet || 0) + totalReleaseToday);
            const newLockedRND = roundTo8(Math.max(0, (currentData.lockedRND || 0) - totalReleaseToday));
            const newTotalReleased = roundTo8((currentData.totalReleased || 0) + totalReleaseToday);
            
            // ✅ Calculate daily release total from active packages only
            let dailyReleaseTotal = 0;
            for (let pkgId in updatedPackages) {
                const pkg = updatedPackages[pkgId];
                if (pkg.status === 'active') {
                    dailyReleaseTotal = roundTo8(dailyReleaseTotal + (pkg.dailyRelease || 0));
                }
            }
            
            // ✅ Store entries in memory for later use
            releaseEntries = entries;
            totalReleaseAmount = totalReleaseToday;
            
            // ✅ Save release history (THIS is the SOURCE OF TRUTH)
            const releaseHistory = currentData.releaseHistory || {};
            
            // ✅ Keep only last MAX_HISTORY_DAYS days
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - MAX_HISTORY_DAYS);
            const cutoffTimestamp = cutoffDate.getTime();
            
            for (let key in releaseHistory) {
                if (releaseHistory[key].timestamp < cutoffTimestamp) {
                    delete releaseHistory[key];
                }
            }
            
            // ✅ Add new entries
            for (let entry of entries) {
                const key = `release_${entry.timestamp}_${entry.packageId.substring(0, 8)}`;
                releaseHistory[key] = {
                    date: entry.date,
                    timestamp: entry.timestamp,
                    amount: entry.amount,
                    packageId: entry.packageId,
                    planName: entry.planName,
                    beforeBalance: entry.beforeBalance,
                    afterBalance: entry.afterBalance,
                    dayNumber: entry.dayNumber,
                    totalDays: entry.totalDays
                };
            }
            
            let activePackageCount = 0;
            for (let pkgId in updatedPackages) {
                if (updatedPackages[pkgId].status === 'active') {
                    activePackageCount++;
                }
            }
            
            // ✅ Return ONLY user data - NO temporary data
            return {
                ...currentData,
                packages: updatedPackages,
                rndWallet: newRndWallet,
                lockedRND: newLockedRND,
                totalReleased: newTotalReleased,
                releaseWallet: dailyReleaseTotal,
                activePackages: activePackageCount,
                todayRelease: totalReleaseToday,
                daysPassed: daysMissed,
                lastReleaseDate: today,
                releaseHistory: releaseHistory,
                lastReleaseProcessed: transactionStartTime
            };
        });
        
        // ✅ Check transaction result
        if (result.snapshot === null || result.committed === false) {
            return {
                processed: false,
                userId: userId,
                error: 'Transaction aborted'
            };
        }

        if (result.committed && result.snapshot && result.snapshot.exists()) {
            const updatedData = result.snapshot.val();
            
            // ============================================================
            // ✅ SAVE TRANSACTIONS via transaction-service.js (parallel)
            // ============================================================
            
            let transactionSaved = false;
            
            if (releaseEntries.length > 0) {
                const transactionPromises = [];
                
                for (let entry of releaseEntries) {
                    transactionPromises.push(
                        createTransaction(
                            userId,
                            TRANSACTION_TYPES.DAILY_RELEASE,
                            {
                                amount: entry.amount,
                                currency: 'RND',
                                packageId: entry.packageId,
                                planName: entry.planName,
                                dayNumber: entry.dayNumber,
                                totalDays: entry.totalDays,
                                beforeBalance: entry.beforeBalance,
                                afterBalance: entry.afterBalance,
                                date: entry.date
                            },
                            TRANSACTION_STATUS.COMPLETED,
                            `Daily release of ${entry.amount.toFixed(4)} RND from ${entry.planName || 'Package'} (Day ${entry.dayNumber} of ${entry.totalDays})`,
                            `release_${entry.timestamp}_${entry.packageId.substring(0, 8)}`
                        )
                    );
                }
                
                const results = await Promise.allSettled(transactionPromises);
                
                for (let result of results) {
                    if (result.status === 'fulfilled' && result.value && result.value.success) {
                        transactionSaved = true;
                    }
                }
            }
            
            // ============================================================
            // ✅ UPDATE PACKAGE STATUS via package-service.js (parallel)
            // ============================================================
            
            let statusUpdated = false;
            
            if (completedPackageIds.length > 0) {
                const statusPromises = [];
                
                for (let packageId of completedPackageIds) {
                    statusPromises.push(
                        updatePackageStatus(
                            userId,
                            packageId,
                            'completed',
                            `release_complete_${packageId}_${Date.now()}`
                        )
                    );
                }
                
                const statusResults = await Promise.allSettled(statusPromises);
                
                for (let result of statusResults) {
                    if (result.status === 'fulfilled' && result.value && result.value.success) {
                        statusUpdated = true;
                    }
                }
            }
            
            log(`✅ Release processed for user: ${userId}, days missed: ${daysMissed}, releases: ${releaseEntries.length}`);
            
            return {
                processed: true,
                userId: userId,
                totalReleased: updatedData.todayRelease || 0,
                daysMissed: daysMissed,
                newRndWallet: updatedData.rndWallet || 0,
                newLockedRND: updatedData.lockedRND || 0,
                releaseWallet: updatedData.releaseWallet || 0,
                activePackages: updatedData.activePackages || 0,
                transactionSaved: transactionSaved,
                statusUpdated: statusUpdated,
                completedPackages: completedPackageIds,
                releaseCount: releaseEntries.length,
                timestamp: Date.now()
            };
        }
        
        return {
            processed: false,
            userId: userId,
            error: 'Transaction not committed'
        };
        
    } catch (error) {
        logError('Error processing pending releases:', error);
        return {
            processed: false,
            userId: userId,
            error: error.message
        };
    }
}

// ============================================================
// READ ONLY HELPERS (NO CALCULATIONS)
// ============================================================

export function getTodayRelease(data) {
    if (!data || typeof data.todayRelease !== 'number') return 0;
    return data.todayRelease;
}

export function getDaysPassed(data) {
    if (!data || !data.lastReleaseDate) return 0;
    const today = getTodayDate();
    return getDaysDifference(data.lastReleaseDate, today);
}

export function getRecentReleases(data, limit = 7) {
    if (!data || !data.releaseHistory) return [];
    
    const history = Object.values(data.releaseHistory);
    return history
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
}

export function needsReleaseProcessing(data) {
    if (!data) return true;
    
    const today = getTodayDate();
    const lastReleaseDate = data.lastReleaseDate || '';
    
    if (!lastReleaseDate) return true;
    return lastReleaseDate !== today;
}

export function calculateDailyReleaseTotal(data) {
    if (!data || !data.packages) return 0;
    
    let total = 0;
    const packages = data.packages;
    
    for (let pkgId in packages) {
        const pkg = packages[pkgId];
        if (pkg.status === 'active') {
            total = roundTo8(total + (pkg.dailyRelease || 0));
        }
    }
    
    return total;
}

// ============================================================
// EXPOSE GLOBALLY (Keep API consistent)
// ============================================================

if (typeof window !== 'undefined') {
    window.processPendingReleases = processPendingReleases;
    window.getTodayRelease = getTodayRelease;
    window.getDaysPassed = getDaysPassed;
    window.getRecentReleases = getRecentReleases;
    window.needsReleaseProcessing = needsReleaseProcessing;
    window.calculateDailyReleaseTotal = calculateDailyReleaseTotal;
}