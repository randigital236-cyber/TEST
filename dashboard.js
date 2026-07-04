/**
 * Dashboard Main Controller
 * Orchestrates all dashboard functionality
 */

import { auth } from './firebase-init.js';
import { db } from './firebase-init.js';
import { ref, get, update } from "firebase/database";
import { onAuthChange, signOut, getCurrentUser } from './auth.js';
import { 
    getGreeting, 
    saveToCache, 
    loadFromCache, 
    clearCache,
    fetchRNDPrice,
    getRNDPrice,
    copyToClipboard
} from './utils.js';
import { showToast } from './toast.js';
import { updateWallets } from './wallet.js';
import { processDailyReleases, getTodayRelease, getDaysPassed, getRecentReleases } from './release.js';
import { updateReleaseHistory, updateTransferHistory, updateReleaseInfo } from './history.js';
import { handleTransfer } from './transfer.js';
import { getCommissionTotals } from './commission.js';
import { openSidebar, closeSidebar } from './sidebar.js';

// ============================================================
// DOM REFERENCES
// ============================================================

const elements = {
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    dashboardLayout: document.getElementById('dashboardLayout'),
    errorMessage: document.getElementById('errorMessage'),
    loadingStatus: document.getElementById('loadingStatus'),
    
    // User Info
    userNameDisplay: document.getElementById('userNameDisplay'),
    userIdDisplay: document.getElementById('userIdDisplay'),
    greetingTime: document.getElementById('greetingTime'),
    rankDisplay: document.getElementById('rankText'),
    rndPriceDisplay: document.getElementById('rndPriceDisplay'),
    packageCount: document.getElementById('packageCount'),
    daysPassed: document.getElementById('daysPassed'),
    dayCountDisplay: document.getElementById('dayCountDisplay'),
    
    // Referral
    referralLinkDisplay: document.getElementById('referralLinkDisplay'),
    referralCodeDisplay: document.getElementById('referralCodeDisplay'),
    referralCountDisplay: document.getElementById('referralCountDisplay'),
    copyReferralBtn: document.getElementById('copyReferralBtn'),
    copyUserIdBtn: document.getElementById('copyUserIdBtn'),
    
    // Sidebar
    sidebarName: document.getElementById('sidebarName'),
    sidebarUserId: document.getElementById('sidebarUserId'),
    sidebarAvatar: document.getElementById('sidebarAvatar'),
    referralBadge: document.getElementById('referralBadge'),
};

// ============================================================
// CONSTANTS
// ============================================================

const DOMAIN = "https://staking.randigital.in";
const REGISTER_URL = `${DOMAIN}/register.html`;

// ============================================================
// DASHBOARD LOADER
// ============================================================

export async function loadDashboard(userId) {
    try {
        // Show loading state
        showLoading('Fetching your data...');
        
        // Fetch RND price
        await fetchRNDPrice();
        if (elements.rndPriceDisplay) {
            elements.rndPriceDisplay.textContent = getRNDPrice().toFixed(4);
        }
        
        // Check cache first for quick display
        const cachedData = loadFromCache();
        if (cachedData) {
            renderDashboard(cachedData, true);
            showLoading('Refreshing from server...');
        }
        
        // Get fresh data from Firebase
        const userSnap = await get(ref(db, 'users/' + userId));
        
        if (!userSnap.exists()) {
            showError('User profile not found. Please register first.');
            return;
        }
        
        const userData = userSnap.val();
        
        // Check if banned
        if (userData.banned === true) {
            await signOut();
            showError('Your account has been banned.');
            return;
        }
        
        // Process daily releases (with pending days)
        showLoading('Processing daily releases...');
        await processDailyReleases(userId);
        
        // Recalculate user data
        showLoading('Updating your data...');
        await recalculateUserData(userId);
        
        // Get updated data
        const updatedSnap = await get(ref(db, 'users/' + userId));
        if (updatedSnap.exists()) {
            const freshData = updatedSnap.val();
            
            // Save to cache
            saveToCache(freshData);
            
            // Render dashboard
            renderDashboard(freshData, false);
            
            // Hide loading, show dashboard
            showDashboard();
        }
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        
        // Try to show cached data if available
        const cachedData = loadFromCache();
        if (cachedData) {
            renderDashboard(cachedData, true);
            showToast('⚠️ Showing cached data. Some information may be outdated.', 'error', 6000);
            showDashboard();
        } else {
            showError(error.message || 'Failed to load dashboard. Please check your internet connection.');
        }
    }
}

// ============================================================
// RECALCULATE USER DATA
// ============================================================

async function recalculateUserData(userId) {
    try {
        const userSnap = await get(ref(db, 'users/' + userId));
        if (!userSnap.exists()) return null;
        
        const userData = userSnap.val();
        const packages = userData.packages || {};
        
        let totalLockedRND = 0;
        let totalDailyRelease = 0;
        let activePackages = 0;
        let totalStake = 0;
        
        for (let key in packages) {
            const pkg = packages[key];
            if (pkg.status === 'active') {
                totalLockedRND += (pkg.remainingRND || 0);
                totalDailyRelease += (pkg.dailyRelease || 0);
                activePackages++;
                totalStake += (pkg.usdtAmount || 0);
            }
        }
        
        await update(ref(db, 'users/' + userId), {
            lockedRND: totalLockedRND,
            releaseWallet: totalDailyRelease,
            activePackages: activePackages,
            totalStake: totalStake
        });
        
        return { totalLockedRND, totalDailyRelease, activePackages, totalStake };
    } catch (error) {
        console.error('Error recalculating user data:', error);
        return null;
    }
}

// ============================================================
// RENDER DASHBOARD
// ============================================================

function renderDashboard(data, isCached = false) {
    if (!data) return;
    
    const u = data;
    const username = u.username || u.referralCode || 'USER';
    const name = u.name || 'User';
    const rank = u.rank || 'Member';
    const isMember = rank === 'Member' || rank === 'member' || !rank;
    const directReferrals = u.totalReferrals || 0;
    const packages = u.packages || {};
    const totalPackages = Object.keys(packages).length;
    const daysPassed = getDaysPassed(u);
    const todayRelease = getTodayRelease(u);
    
    // Update user info
    if (elements.userNameDisplay) elements.userNameDisplay.textContent = name;
    if (elements.greetingTime) elements.greetingTime.textContent = getGreeting();
    if (elements.userIdDisplay) elements.userIdDisplay.textContent = username.substring(0, 20) + (username.length > 20 ? '...' : '');
    if (elements.rankDisplay) elements.rankDisplay.textContent = rank;
    if (elements.packageCount) elements.packageCount.textContent = totalPackages;
    if (elements.daysPassed) {
        elements.daysPassed.textContent = daysPassed;
        if (elements.dayCountDisplay) {
            elements.dayCountDisplay.style.display = daysPassed > 0 ? 'inline-flex' : 'none';
        }
    }
    
    // Update sidebar
    if (elements.sidebarName) elements.sidebarName.textContent = name;
    if (elements.sidebarUserId) elements.sidebarUserId.textContent = 'ID: ' + username.substring(0, 20) + '...';
    if (elements.sidebarAvatar) elements.sidebarAvatar.textContent = name.charAt(0).toUpperCase();
    
    // Update referral badge
    if (elements.referralBadge) {
        elements.referralBadge.textContent = directReferrals;
        elements.referralBadge.style.display = directReferrals > 0 ? 'inline' : 'none';
    }
    
    // Update referral link
    const referralLink = `${REGISTER_URL}?ref=${u.referralCode}`;
    if (elements.referralLinkDisplay) elements.referralLinkDisplay.textContent = referralLink;
    if (elements.referralCodeDisplay) elements.referralCodeDisplay.textContent = u.referralCode || '---';
    if (elements.referralCountDisplay) elements.referralCountDisplay.textContent = directReferrals;
    
    // Update rank badge class
    const rankBadge = document.querySelector('.rank-badge');
    if (rankBadge) {
        rankBadge.className = `rank-badge ${isMember ? 'member' : ''}`;
    }
    
    // Update wallets
    updateWallets(u);
    
    // Update release info
    updateReleaseInfo(u);
    
    // Update release history
    updateReleaseHistory(u);
    
    // Update transfer history
    updateTransferHistory(u);
    
    // Update commissions
    const commissions = getCommissionTotals(u);
    const commissionElements = {
        level1Earn: document.getElementById('level1Earn'),
        level2Earn: document.getElementById('level2Earn'),
        level3Earn: document.getElementById('level3Earn'),
        level4Earn: document.getElementById('level4Earn'),
        level5Earn: document.getElementById('level5Earn'),
        totalReferralEarnings: document.getElementById('totalReferralEarnings')
    };
    
    if (commissionElements.level1Earn) commissionElements.level1Earn.textContent = commissions.level1.toFixed(2);
    if (commissionElements.level2Earn) commissionElements.level2Earn.textContent = commissions.level2.toFixed(2);
    if (commissionElements.level3Earn) commissionElements.level3Earn.textContent = commissions.level3.toFixed(2);
    if (commissionElements.level4Earn) commissionElements.level4Earn.textContent = commissions.level4.toFixed(2);
    if (commissionElements.level5Earn) commissionElements.level5Earn.textContent = commissions.level5.toFixed(2);
    if (commissionElements.totalReferralEarnings) commissionElements.totalReferralEarnings.textContent = commissions.total.toFixed(2);
    
    // Update team levels
    const teamLevels = u.teamStructure || { level1: 0, level2: 0, level3: 0, level4: 0, level5: 0 };
    const teamElements = {
        teamLevel1: document.getElementById('teamLevel1'),
        teamLevel2: document.getElementById('teamLevel2'),
        teamLevel3: document.getElementById('teamLevel3'),
        teamLevel4: document.getElementById('teamLevel4'),
        teamLevel5: document.getElementById('teamLevel5')
    };
    
    if (teamElements.teamLevel1) teamElements.teamLevel1.textContent = teamLevels.level1 || 0;
    if (teamElements.teamLevel2) teamElements.teamLevel2.textContent = teamLevels.level2 || 0;
    if (teamElements.teamLevel3) teamElements.teamLevel3.textContent = teamLevels.level3 || 0;
    if (teamElements.teamLevel4) teamElements.teamLevel4.textContent = teamLevels.level4 || 0;
    if (teamElements.teamLevel5) teamElements.teamLevel5.textContent = teamLevels.level5 || 0;
    
    // Show cached indicator if needed
    if (isCached) {
        const cachedIndicator = document.createElement('div');
        cachedIndicator.className = 'text-warning text-center small mt-2';
        cachedIndicator.id = 'cachedIndicator';
        cachedIndicator.innerHTML = '<i class="bi bi-clock-history me-1"></i> Showing cached data. Refreshing...';
        const existing = document.getElementById('cachedIndicator');
        if (existing) existing.remove();
        document.getElementById('dashboardLayout')?.appendChild(cachedIndicator);
    } else {
        const existing = document.getElementById('cachedIndicator');
        if (existing) existing.remove();
    }
}

// ============================================================
// UI STATE MANAGEMENT
// ============================================================

function showLoading(message) {
    if (elements.loadingStatus) {
        elements.loadingStatus.textContent = message || 'Loading...';
    }
    if (elements.loadingState) {
        elements.loadingState.style.display = 'block';
    }
    if (elements.errorState) {
        elements.errorState.style.display = 'none';
    }
    if (elements.dashboardLayout) {
        elements.dashboardLayout.style.display = 'none';
    }
}

function showDashboard() {
    if (elements.loadingState) {
        elements.loadingState.style.display = 'none';
    }
    if (elements.errorState) {
        elements.errorState.style.display = 'none';
    }
    if (elements.dashboardLayout) {
        elements.dashboardLayout.style.display = 'block';
    }
}

function showError(message) {
    if (elements.errorMessage) {
        elements.errorMessage.textContent = message || 'An error occurred. Please try again.';
    }
    if (elements.errorState) {
        elements.errorState.style.display = 'block';
    }
    if (elements.loadingState) {
        elements.loadingState.style.display = 'none';
    }
    if (elements.dashboardLayout) {
        elements.dashboardLayout.style.display = 'none';
    }
}

// ============================================================
// EVENT LISTENERS
// ============================================================

// Copy User ID
if (elements.copyUserIdBtn) {
    elements.copyUserIdBtn.addEventListener('click', () => {
        const userId = elements.userIdDisplay?.textContent || '';
        copyToClipboard(userId, () => {
            showToast('✅ User ID copied to clipboard!', 'success');
        });
    });
}

// Copy Referral Link
if (elements.copyReferralBtn) {
    elements.copyReferralBtn.addEventListener('click', () => {
        const link = elements.referralLinkDisplay?.textContent || '';
        copyToClipboard(link, () => {
            elements.copyReferralBtn.innerHTML = '<i class="bi bi-check-circle me-1" aria-hidden="true"></i>Copied!';
            setTimeout(() => {
                elements.copyReferralBtn.innerHTML = '<i class="bi bi-clipboard me-1" aria-hidden="true"></i>Copy';
            }, 2000);
        });
    });
}

// Support Link - opens in new tab
const supportLink = document.getElementById('supportLink');
if (supportLink) {
    supportLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.open('support.html', '_blank', 'noopener,noreferrer');
    });
}

// Transfer Form
const transferForm = document.getElementById('transferForm');
if (transferForm) {
    transferForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = getCurrentUser();
        if (!user) {
            showToast('❌ Please login first', 'error');
            return;
        }
        const userSnap = await get(ref(db, 'users/' + user.uid));
        if (userSnap.exists()) {
            await handleTransfer(user.uid, userSnap.val());
        }
    });
}

// ============================================================
// AUTH STATE OBSERVER
// ============================================================

onAuthChange(async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    
    await loadDashboard(user.uid);
});

// ============================================================
// EXPOSE GLOBALLY
// ============================================================

window.loadDashboard = loadDashboard;
window.showToast = showToast;
window.getGreeting = getGreeting;