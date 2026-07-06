/**
 * Dashboard Main Controller
 * 
 * ⚠️ IMPORTANT: Dashboard ONLY DISPLAYS data from Firebase.
 * ❌ NO calculations, NO writes, NO releases, NO commissions.
 * ✅ All data comes directly from Firebase real-time listener.
 * 
 * Data Flow:
 * Firebase Realtime → onValue() → renderDashboard() → DOM Update
 */

import { auth } from './firebase-init.js';
import { db } from './firebase-init.js';
import { ref, onValue, off, get } from "firebase/database";
import { onAuthChange, signOut, getCurrentUser } from './auth.js';
import { 
    getGreeting, 
    saveToCache, 
    loadFromCache, 
    fetchRNDPrice,
    getRNDPrice,
    copyToClipboard
} from './utils.js';
import { showToast } from './toast.js';
import { updateWallets } from './wallet.js';
import { updateReleaseHistory, updateTransferHistory, updateReleaseInfo } from './history.js';
import { handleTransfer } from './transfer.js';
import { getCommissionTotals } from './commission.js';

// ============================================================
// DOM REFERENCES
// ============================================================

const DOM = {
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    dashboardLayout: document.getElementById('dashboardLayout'),
    errorMessage: document.getElementById('errorMessage'),
    loadingStatus: document.getElementById('loadingStatus'),
    
    // User Info
    userName: document.getElementById('userNameDisplay'),
    userId: document.getElementById('userIdDisplay'),
    greeting: document.getElementById('greetingTime'),
    rank: document.getElementById('rankText'),
    rndPrice: document.getElementById('rndPriceDisplay'),
    
    // Package Stats
    totalPackages: document.getElementById('packageCount'),
    activePackages: document.getElementById('activePackages'),
    completedPackages: document.getElementById('completedPackages'),
    totalStake: document.getElementById('totalStake'),
    totalReleased: document.getElementById('totalReleased'),
    todayRelease: document.getElementById('todayReleaseAmount'),
    dailyRelease: document.getElementById('dailyRelease'),
    lockedRND: document.getElementById('lockedRND'),
    daysPassed: document.getElementById('daysPassed'),
    dayCountDisplay: document.getElementById('dayCountDisplay'),
    
    // Referral
    referralLink: document.getElementById('referralLinkDisplay'),
    referralCode: document.getElementById('referralCodeDisplay'),
    referralCount: document.getElementById('referralCountDisplay'),
    copyReferralBtn: document.getElementById('copyReferralBtn'),
    copyUserIdBtn: document.getElementById('copyUserIdBtn'),
    
    // Sidebar
    sidebarName: document.getElementById('sidebarName'),
    sidebarUserId: document.getElementById('sidebarUserId'),
    sidebarAvatar: document.getElementById('sidebarAvatar'),
    referralBadge: document.getElementById('referralBadge'),
    
    // Commission
    level1Earn: document.getElementById('level1Earn'),
    level2Earn: document.getElementById('level2Earn'),
    level3Earn: document.getElementById('level3Earn'),
    level4Earn: document.getElementById('level4Earn'),
    level5Earn: document.getElementById('level5Earn'),
    totalReferralEarnings: document.getElementById('totalReferralEarnings'),
    
    // Team
    teamLevel1: document.getElementById('teamLevel1'),
    teamLevel2: document.getElementById('teamLevel2'),
    teamLevel3: document.getElementById('teamLevel3'),
    teamLevel4: document.getElementById('teamLevel4'),
    teamLevel5: document.getElementById('teamLevel5'),
};

// ============================================================
// STATE
// ============================================================

let currentUserId = null;
let unsubscribeRealtime = null;
let isFirstLoad = true;

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
        currentUserId = userId;
        showLoading('Connecting to server...');
        
        // Fetch RND price (read only)
        await fetchRNDPrice();
        if (DOM.rndPrice) {
            DOM.rndPrice.textContent = getRNDPrice().toFixed(4);
        }
        
        // Try cached data for instant display
        const cachedData = loadFromCache();
        if (cachedData) {
            renderDashboard(cachedData, true);
            showLoading('Updating from server...');
        }
        
        // Setup real-time listener
        setupRealtimeListener(userId);
        
        // Setup event listeners
        setupEventListeners();
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        handleError(error);
    }
}

// ============================================================
// REAL-TIME LISTENER (READ ONLY)
// ============================================================

function setupRealtimeListener(userId) {
    // Remove existing listener if any
    if (unsubscribeRealtime) {
        unsubscribeRealtime();
        unsubscribeRealtime = null;
    }
    
    const userRef = ref(db, 'users/' + userId);
    
    unsubscribeRealtime = onValue(userRef, (snapshot) => {
        try {
            if (!snapshot.exists()) {
                showError('User profile not found. Please register first.');
                return;
            }
            
            const userData = snapshot.val();
            
            // Check if banned
            if (userData.banned === true) {
                signOut();
                showError('Your account has been banned.');
                return;
            }
            
            // Save to cache
            saveToCache(userData);
            
            // Render dashboard
            renderDashboard(userData, false);
            
            // Show dashboard
            showDashboard();
            
            if (isFirstLoad) {
                isFirstLoad = false;
            }
            
        } catch (error) {
            console.error('Error in real-time listener:', error);
            // Try cached data on error
            const cachedData = loadFromCache();
            if (cachedData) {
                renderDashboard(cachedData, true);
                showDashboard();
            }
        }
    }, (error) => {
        console.error('Firebase listener error:', error);
        showToast('⚠️ Connection issue. Using cached data if available.', 'error', 5000);
        
        const cachedData = loadFromCache();
        if (cachedData) {
            renderDashboard(cachedData, true);
            showDashboard();
        }
    });
}

// ============================================================
// RENDER DASHBOARD 
// ✅ PURE READ ONLY - NO CALCULATIONS
// ============================================================

function renderDashboard(data, isCached = false) {
    if (!data) return;
    
    const u = data;
    const username = u.username || u.referralCode || 'USER';
    const name = u.name || 'User';
    const rank = u.rank || 'Member';
    const isMember = rank === 'Member' || rank === 'member' || !rank;
    const directReferrals = u.totalReferrals || 0;
    
    // ============================================================
    // 📌 READ DATA DIRECTLY FROM FIREBASE - NO CALCULATIONS
    // ============================================================
    
    // ✅ Package counts - Read directly from Firebase
    const packages = u.packages || {};
    const totalPackages = Object.keys(packages).length;
    
    // ✅ These values are already calculated by release-service.js
    const lockedRND = u.lockedRND || 0;
    const totalReleased = u.totalReleased || 0;
    const totalStake = u.totalStake || 0;
    const activePackages = u.activePackages || 0;
    const releaseWallet = u.releaseWallet || 0;
    
    // ✅ Today's release - Read from Firebase
    const todayRelease = u.todayRelease || 0;
    const daysPassed = u.daysPassed || 0;
    
    // ✅ Completed packages - Read directly from packages
    let completedPackages = 0;
    for (let key in packages) {
        if (packages[key].status === 'completed') {
            completedPackages++;
        }
    }
    
    // ============================================================
    // UPDATE DOM
    // ============================================================
    
    // User Info
    if (DOM.userName) DOM.userName.textContent = name;
    if (DOM.greeting) DOM.greeting.textContent = getGreeting();
    if (DOM.userId) DOM.userId.textContent = username.substring(0, 20) + (username.length > 20 ? '...' : '');
    if (DOM.rank) DOM.rank.textContent = rank;
    
    // Package Stats - Direct from Firebase
    if (DOM.totalPackages) DOM.totalPackages.textContent = totalPackages;
    if (DOM.activePackages) DOM.activePackages.textContent = activePackages;
    if (DOM.completedPackages) DOM.completedPackages.textContent = completedPackages;
    if (DOM.totalStake) DOM.totalStake.textContent = totalStake.toFixed(2);
    if (DOM.totalReleased) DOM.totalReleased.textContent = totalReleased.toFixed(4);
    if (DOM.todayRelease) DOM.todayRelease.textContent = todayRelease.toFixed(4) + ' RND';
    if (DOM.dailyRelease) DOM.dailyRelease.textContent = releaseWallet.toFixed(4);
    if (DOM.lockedRND) DOM.lockedRND.textContent = lockedRND.toFixed(2);
    
    // Days Passed - Direct from Firebase
    if (DOM.daysPassed) {
        DOM.daysPassed.textContent = daysPassed;
        if (DOM.dayCountDisplay) {
            DOM.dayCountDisplay.style.display = daysPassed > 0 ? 'inline-flex' : 'none';
        }
    }
    
    // Sidebar
    if (DOM.sidebarName) DOM.sidebarName.textContent = name;
    if (DOM.sidebarUserId) DOM.sidebarUserId.textContent = 'ID: ' + username.substring(0, 20) + '...';
    if (DOM.sidebarAvatar) DOM.sidebarAvatar.textContent = name.charAt(0).toUpperCase();
    
    // Referral Badge
    if (DOM.referralBadge) {
        DOM.referralBadge.textContent = directReferrals;
        DOM.referralBadge.style.display = directReferrals > 0 ? 'inline' : 'none';
    }
    
    // Referral Link
    const referralLink = `${REGISTER_URL}?ref=${u.referralCode}`;
    if (DOM.referralLink) DOM.referralLink.textContent = referralLink;
    if (DOM.referralCode) DOM.referralCode.textContent = u.referralCode || '---';
    if (DOM.referralCount) DOM.referralCount.textContent = directReferrals;
    
    // Rank Badge
    const rankBadge = document.querySelector('.rank-badge');
    if (rankBadge) {
        rankBadge.className = `rank-badge ${isMember ? 'member' : ''}`;
    }
    
    // ============================================================
    // ✅ UPDATE WALLETS - PURE DISPLAY ONLY
    // ============================================================
    updateWallets(u);
    
    // ============================================================
    // ✅ UPDATE RELEASE INFO - PURE DISPLAY ONLY
    // ============================================================
    updateReleaseInfo(u);
    
    // ============================================================
    // ✅ UPDATE HISTORY - PURE DISPLAY ONLY
    // ============================================================
    updateReleaseHistory(u);
    updateTransferHistory(u);
    
    // ============================================================
    // ✅ UPDATE COMMISSIONS - READ DIRECTLY FROM FIREBASE
    // ============================================================
    const commissions = getCommissionTotals(u);
    
    if (DOM.level1Earn) DOM.level1Earn.textContent = commissions.level1.toFixed(2);
    if (DOM.level2Earn) DOM.level2Earn.textContent = commissions.level2.toFixed(2);
    if (DOM.level3Earn) DOM.level3Earn.textContent = commissions.level3.toFixed(2);
    if (DOM.level4Earn) DOM.level4Earn.textContent = commissions.level4.toFixed(2);
    if (DOM.level5Earn) DOM.level5Earn.textContent = commissions.level5.toFixed(2);
    if (DOM.totalReferralEarnings) DOM.totalReferralEarnings.textContent = commissions.total.toFixed(2);
    
    // ============================================================
    // ✅ UPDATE TEAM LEVELS - READ DIRECTLY FROM FIREBASE
    // ============================================================
    const teamLevels = u.teamStructure || { level1: 0, level2: 0, level3: 0, level4: 0, level5: 0 };
    
    if (DOM.teamLevel1) DOM.teamLevel1.textContent = teamLevels.level1 || 0;
    if (DOM.teamLevel2) DOM.teamLevel2.textContent = teamLevels.level2 || 0;
    if (DOM.teamLevel3) DOM.teamLevel3.textContent = teamLevels.level3 || 0;
    if (DOM.teamLevel4) DOM.teamLevel4.textContent = teamLevels.level4 || 0;
    if (DOM.teamLevel5) DOM.teamLevel5.textContent = teamLevels.level5 || 0;
    
    // ============================================================
    // CACHED INDICATOR
    // ============================================================
    const cachedIndicator = document.getElementById('cachedIndicator');
    if (isCached) {
        if (!cachedIndicator) {
            const indicator = document.createElement('div');
            indicator.className = 'text-warning text-center small mt-2';
            indicator.id = 'cachedIndicator';
            indicator.innerHTML = '<i class="bi bi-clock-history me-1"></i> Showing cached data. Refreshing...';
            const layout = document.getElementById('dashboardLayout');
            if (layout) layout.appendChild(indicator);
        }
    } else {
        if (cachedIndicator) cachedIndicator.remove();
    }
}

// ============================================================
// UI STATE MANAGEMENT
// ============================================================

function showLoading(message) {
    if (DOM.loadingStatus) {
        DOM.loadingStatus.textContent = message || 'Loading...';
    }
    if (DOM.loadingState) {
        DOM.loadingState.style.display = 'block';
    }
    if (DOM.errorState) {
        DOM.errorState.style.display = 'none';
    }
    if (DOM.dashboardLayout) {
        DOM.dashboardLayout.style.display = 'none';
    }
}

function showDashboard() {
    if (DOM.loadingState) {
        DOM.loadingState.style.display = 'none';
    }
    if (DOM.errorState) {
        DOM.errorState.style.display = 'none';
    }
    if (DOM.dashboardLayout) {
        DOM.dashboardLayout.style.display = 'block';
    }
}

function showError(message) {
    if (DOM.errorMessage) {
        DOM.errorMessage.textContent = message || 'An error occurred. Please try again.';
    }
    if (DOM.errorState) {
        DOM.errorState.style.display = 'block';
    }
    if (DOM.loadingState) {
        DOM.loadingState.style.display = 'none';
    }
    if (DOM.dashboardLayout) {
        DOM.dashboardLayout.style.display = 'none';
    }
}

function handleError(error) {
    const cachedData = loadFromCache();
    if (cachedData) {
        renderDashboard(cachedData, true);
        showToast('⚠️ Showing cached data. Some information may be outdated.', 'error', 6000);
        showDashboard();
    } else {
        showError(error.message || 'Failed to load dashboard. Please check your internet connection.');
    }
}

// ============================================================
// EVENT LISTENERS
// ============================================================

function setupEventListeners() {
    // Copy User ID
    const copyUserIdBtn = DOM.copyUserIdBtn;
    if (copyUserIdBtn && !copyUserIdBtn._listenerAttached) {
        copyUserIdBtn._listenerAttached = true;
        copyUserIdBtn.addEventListener('click', () => {
            const userId = DOM.userId?.textContent || '';
            copyToClipboard(userId, () => {
                showToast('✅ User ID copied to clipboard!', 'success');
            });
        });
    }
    
    // Copy Referral Link
    const copyReferralBtn = DOM.copyReferralBtn;
    if (copyReferralBtn && !copyReferralBtn._listenerAttached) {
        copyReferralBtn._listenerAttached = true;
        copyReferralBtn.addEventListener('click', () => {
            const link = DOM.referralLink?.textContent || '';
            copyToClipboard(link, () => {
                copyReferralBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Copied!';
                setTimeout(() => {
                    copyReferralBtn.innerHTML = '<i class="bi bi-clipboard me-1"></i>Copy';
                }, 2000);
            });
        });
    }
    
    // Support Link
    const supportLink = document.getElementById('supportLink');
    if (supportLink && !supportLink._listenerAttached) {
        supportLink._listenerAttached = true;
        supportLink.addEventListener('click', (e) => {
            e.preventDefault();
            window.open('support.html', '_blank', 'noopener,noreferrer');
        });
    }
    
    // Logout Button
    const logoutBtn = document.getElementById('logoutBtnSidebar');
    if (logoutBtn && !logoutBtn._listenerAttached) {
        logoutBtn._listenerAttached = true;
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await signOut();
        });
    }
    
    // Transfer Form - Submit handler only
    const transferForm = document.getElementById('transferForm');
    if (transferForm && !transferForm._listenerAttached) {
        transferForm._listenerAttached = true;
        transferForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = getCurrentUser();
            if (!user) {
                showToast('❌ Please login first', 'error');
                return;
            }
            try {
                const userSnap = await get(ref(db, 'users/' + user.uid));
                if (userSnap.exists()) {
                    await handleTransfer(user.uid, userSnap.val());
                }
            } catch (error) {
                console.error('Error getting user data for transfer:', error);
                showToast('❌ Error processing transfer. Please try again.', 'error');
            }
        });
    }
}

// ============================================================
// AUTH STATE OBSERVER
// ============================================================

onAuthChange(async (user) => {
    if (!user) {
        // Clean up listener on logout
        if (unsubscribeRealtime) {
            unsubscribeRealtime();
            unsubscribeRealtime = null;
        }
        currentUserId = null;
        window.location.href = 'login.html';
        return;
    }
    
    await loadDashboard(user.uid);
});

// ============================================================
// CLEANUP
// ============================================================

window.addEventListener('beforeunload', () => {
    if (unsubscribeRealtime) {
        unsubscribeRealtime();
        unsubscribeRealtime = null;
    }
});

// ============================================================
// EXPOSE GLOBALLY
// ============================================================

window.loadDashboard = loadDashboard;
window.showToast = showToast;
window.getGreeting = getGreeting;