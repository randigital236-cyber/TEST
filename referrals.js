/**
 * Referrals Page - View Referral Details and Commissions
 * 
 * ⚠️ IMPORTANT: This page displays referral data.
 * 
 * Flow:
 * 1. Display referral link
 * 2. Display referral stats
 * 3. Display commission earnings by level
 * 4. Display referral history
 * 
 * ✅ Real-time data updates
 * ✅ Copy referral link
 * ✅ Commission breakdown
 * ✅ Referral history
 * ✅ Error handling
 */

import { onAuthChange, signOut } from './auth.js';
import { showToast } from './toast.js';
import { initSidebar, updateSidebarUser, openSidebar, closeSidebar } from './sidebar.js';
import { db } from './firebase-init.js';
import { ref, get, onValue, off } from "firebase/database";
import { formatDate, copyToClipboard } from './utils.js';
import { getCommissionTotals } from './commission.js';
import { getAllWalletBalances } from './wallet-service.js';

// ============================================================
// DOM REFERENCES
// ============================================================

const DOM = {
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    errorMessage: document.getElementById('errorMessage'),
    loadingStatus: document.getElementById('loadingStatus'),
    referralsContent: document.getElementById('referralsContent'),
    
    // Stats
    totalReferrals: document.getElementById('totalReferrals'),
    level1Count: document.getElementById('level1Count'),
    level2Count: document.getElementById('level2Count'),
    level3Count: document.getElementById('level3Count'),
    level4Count: document.getElementById('level4Count'),
    level5Count: document.getElementById('level5Count'),
    
    // Referral Link
    referralLinkDisplay: document.getElementById('referralLinkDisplay'),
    copyReferralBtn: document.getElementById('copyReferralBtn'),
    
    // Commission
    level1Earn: document.getElementById('level1Earn'),
    level2Earn: document.getElementById('level2Earn'),
    level3Earn: document.getElementById('level3Earn'),
    level4Earn: document.getElementById('level4Earn'),
    level5Earn: document.getElementById('level5Earn'),
    totalReferralEarnings: document.getElementById('totalReferralEarnings'),
    
    // History
    referralHistoryContainer: document.getElementById('referralHistoryContainer'),
    
    // Sidebar
    sidebarAvatar: document.getElementById('sidebarAvatar'),
    sidebarName: document.getElementById('sidebarName'),
    sidebarAvatarLarge: document.getElementById('sidebarAvatarLarge'),
    sidebarNameLarge: document.getElementById('sidebarNameLarge'),
    sidebarUserId: document.getElementById('sidebarUserId'),
    referralBadge: document.getElementById('referralBadge'),
    referralBadgeSidebar: document.getElementById('referralBadgeSidebar'),
    logoutBtn: document.getElementById('logoutBtnSidebar'),
    sidebarToggle: document.getElementById('sidebarToggle'),
    sidebarClose: document.getElementById('sidebarClose'),
    sidebarOverlay: document.getElementById('sidebarOverlay'),
    sidebarPanel: document.getElementById('sidebarPanel'),
};

// ============================================================
// CONSTANTS
// ============================================================

const DOMAIN = 'https://staking.randigital.in';
const REGISTER_URL = `${DOMAIN}/register.html`;

// ============================================================
// STATE
// ============================================================

let currentUserId = null;
let currentUserData = null;
let unsubscribeRealtime = null;

// ============================================================
// MAIN - Load Referrals Page
// ============================================================

export async function loadReferralsPage(user) {
    try {
        currentUserId = user.uid;
        
        showLoading('Loading referral details...');
        
        const userSnap = await get(ref(db, 'users/' + user.uid));
        if (!userSnap.exists()) {
            showError('User data not found. Please contact support.');
            return;
        }
        
        currentUserData = userSnap.val();
        
        if (currentUserData.banned === true) {
            await signOut();
            showError('Your account has been banned.');
            return;
        }
        
        // Update Sidebar
        const username = currentUserData.username || currentUserData.referralCode || 'USER';
        const name = currentUserData.name || 'User';
        updateSidebarUser(name, username, currentUserData.totalReferrals || 0);
        
        // Render data
        renderReferralData(currentUserData);
        
        // Setup real-time updates
        setupRealtimeUpdates(user.uid);
        
        // Setup event listeners
        setupEventListeners();
        
        // Init sidebar
        initSidebar();
        
        showContent();
        
    } catch (error) {
        console.error('Error loading referrals page:', error);
        showError(error.message || 'Please check your internet connection.');
    }
}

// ============================================================
// RENDER REFERRAL DATA
// ============================================================

function renderReferralData(data) {
    if (!data) return;
    
    // Stats
    const totalReferrals = data.totalReferrals || 0;
    const teamStructure = data.teamStructure || { level1: 0, level2: 0, level3: 0, level4: 0, level5: 0 };
    
    if (DOM.totalReferrals) DOM.totalReferrals.textContent = totalReferrals;
    if (DOM.level1Count) DOM.level1Count.textContent = teamStructure.level1 || 0;
    if (DOM.level2Count) DOM.level2Count.textContent = teamStructure.level2 || 0;
    if (DOM.level3Count) DOM.level3Count.textContent = teamStructure.level3 || 0;
    if (DOM.level4Count) DOM.level4Count.textContent = teamStructure.level4 || 0;
    if (DOM.level5Count) DOM.level5Count.textContent = teamStructure.level5 || 0;
    
    // Update sidebar badge
    if (DOM.referralBadgeSidebar) {
        DOM.referralBadgeSidebar.textContent = totalReferrals;
        DOM.referralBadgeSidebar.style.display = totalReferrals > 0 ? 'inline' : 'none';
    }
    
    // Referral Link
    const referralLink = `${REGISTER_URL}?ref=${data.referralCode || ''}`;
    if (DOM.referralLinkDisplay) {
        DOM.referralLinkDisplay.textContent = referralLink;
    }
    
    // Commission
    const commissions = getCommissionTotals(data);
    
    if (DOM.level1Earn) DOM.level1Earn.textContent = commissions.level1.toFixed(2) + ' USDT';
    if (DOM.level2Earn) DOM.level2Earn.textContent = commissions.level2.toFixed(2) + ' USDT';
    if (DOM.level3Earn) DOM.level3Earn.textContent = commissions.level3.toFixed(2) + ' USDT';
    if (DOM.level4Earn) DOM.level4Earn.textContent = commissions.level4.toFixed(2) + ' USDT';
    if (DOM.level5Earn) DOM.level5Earn.textContent = commissions.level5.toFixed(2) + ' USDT';
    if (DOM.totalReferralEarnings) DOM.totalReferralEarnings.textContent = commissions.total.toFixed(2) + ' USDT';
    
    // History
    renderReferralHistory(data);
}

// ============================================================
// RENDER REFERRAL HISTORY
// ============================================================

function renderReferralHistory(data) {
    const container = DOM.referralHistoryContainer;
    if (!container) return;
    
    // Get commission history
    const history = [];
    
    // From commissionHistory
    if (data.commissionHistory) {
        for (let key in data.commissionHistory) {
            const entry = data.commissionHistory[key];
            if (entry && entry.type !== 'referral_commission') {
                history.push({
                    ...entry,
                    type: 'commission',
                    title: `${entry.levelName || 'Level ' + entry.level} Commission`,
                    amount: entry.amount,
                    currency: 'USDT',
                    timestamp: entry.timestamp
                });
            }
        }
    }
    
    // Sort by timestamp (newest first)
    history.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    // Take first 20
    const recentHistory = history.slice(0, 20);
    
    if (recentHistory.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-inbox"></i>
                <p>No referral history yet</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = recentHistory.map(h => `
        <div class="history-item">
            <div class="left">
                <div class="icon ${h.type === 'commission' ? 'commission' : 'referral'}">
                    <i class="bi ${h.type === 'commission' ? 'bi-trophy' : 'bi-person-plus'}"></i>
                </div>
                <div class="info">
                    <div class="title">${h.title || 'Referral Commission'}</div>
                    <div class="sub">${h.fromUser || 'Referral'} ${h.packageId ? '| Package: ' + h.packageId.substring(0, 8) : ''}</div>
                </div>
            </div>
            <div class="right">
                <div class="amount positive">+${h.amount.toFixed(2)} ${h.currency || 'USDT'}</div>
                <div class="date">${formatDate(h.timestamp)}</div>
            </div>
        </div>
    `).join('');
}

// ============================================================
// REAL-TIME UPDATES
// ============================================================

function setupRealtimeUpdates(uid) {
    if (unsubscribeRealtime) {
        off(ref(db, 'users/' + uid));
        unsubscribeRealtime = null;
    }
    
    const userRef = ref(db, 'users/' + uid);
    unsubscribeRealtime = onValue(userRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            currentUserData = data;
            renderReferralData(data);
        }
    }, (error) => {
        console.error('Realtime listener error:', error);
    });
}

// ============================================================
// EVENT LISTENERS
// ============================================================

function setupEventListeners() {
    // Copy Referral Link
    if (DOM.copyReferralBtn) {
        DOM.copyReferralBtn.addEventListener('click', function() {
            const link = DOM.referralLinkDisplay?.textContent || '';
            copyToClipboard(link, () => {
                const icon = this.querySelector('i');
                if (icon) {
                    icon.className = 'bi bi-check-circle';
                    setTimeout(() => {
                        icon.className = 'bi bi-clipboard';
                    }, 2000);
                }
                showToast('✅ Referral link copied to clipboard!', 'success');
            });
        });
    }
    
    // Sidebar toggle
    if (DOM.sidebarToggle) {
        DOM.sidebarToggle.addEventListener('click', openSidebar);
    }
    if (DOM.sidebarClose) {
        DOM.sidebarClose.addEventListener('click', closeSidebar);
    }
    if (DOM.sidebarOverlay) {
        DOM.sidebarOverlay.addEventListener('click', closeSidebar);
    }
    
    // Logout
    if (DOM.logoutBtn) {
        DOM.logoutBtn.addEventListener('click', async () => {
            await signOut();
        });
    }
}

// ============================================================
// UI STATE MANAGEMENT
// ============================================================

function showLoading(message) {
    if (DOM.loadingStatus) DOM.loadingStatus.textContent = message || 'Loading...';
    if (DOM.loadingState) DOM.loadingState.style.display = 'block';
    if (DOM.errorState) DOM.errorState.style.display = 'none';
    if (DOM.referralsContent) DOM.referralsContent.style.display = 'none';
}

function showContent() {
    if (DOM.loadingState) DOM.loadingState.style.display = 'none';
    if (DOM.errorState) DOM.errorState.style.display = 'none';
    if (DOM.referralsContent) DOM.referralsContent.style.display = 'block';
}

function showError(message) {
    if (DOM.errorMessage) DOM.errorMessage.textContent = message || 'An error occurred. Please try again.';
    if (DOM.errorState) DOM.errorState.style.display = 'block';
    if (DOM.loadingState) DOM.loadingState.style.display = 'none';
    if (DOM.referralsContent) DOM.referralsContent.style.display = 'none';
}

// ============================================================
// AUTH STATE OBSERVER
// ============================================================

onAuthChange(async (user) => {
    if (!user) {
        if (unsubscribeRealtime) {
            off(ref(db, 'users/' + currentUserId));
            unsubscribeRealtime = null;
        }
        currentUserId = null;
        window.location.href = 'login.html';
        return;
    }
    
    await loadReferralsPage(user);
});

// ============================================================
// CLEANUP
// ============================================================

window.addEventListener('beforeunload', () => {
    if (unsubscribeRealtime) {
        off(ref(db, 'users/' + currentUserId));
        unsubscribeRealtime = null;
    }
});

// ============================================================
// EXPOSE
// ============================================================

window.openSidebar = openSidebar;
window.closeSidebar = closeSidebar;
window.showToast = showToast;