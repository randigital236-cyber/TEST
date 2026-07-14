// ============================================================
// RND STAKING PLATFORM V2 - DASHBOARD.JS (FINAL PHASE 4)
// ============================================================
// 📌 PHASE 4: ONLY READ DATA - DISPLAY DASHBOARD UI
// 📌 RULE: Firebase Auth UID = User ID = Referral Code
// 📌 RULE: ALWAYS use UID as primary identifier
// 📌 NO WRITES - NO DAILY RELEASE - NO COMMISSION - NO TRANSFER
// ============================================================

import { 
    auth, 
    database,
    onAuthStateChanged,
    signOut,
    ref,
    get,
    onValue,
    formatDate,
    formatAmount,
    maskString,
    getUserByUID,
    createLog
} from './firebase.js';

// ============================================================
// 🔥 DOM REFERENCES
// ============================================================
const dashboardContent = document.getElementById('dashboardContent');
const loadingState = document.getElementById('loadingState');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarClose = document.getElementById('sidebarClose');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebarPanel = document.getElementById('sidebarPanel');
const logoutBtnSidebar = document.getElementById('logoutBtnSidebar');
const toastContainer = document.getElementById('toastContainer');

// ============================================================
// 🔥 GLOBAL VARIABLES
// ============================================================
let currentUserData = null;
let currentUserId = null;
let listenerOff = null;
let isDashboardLoading = false;

// ============================================================
// 🔥 TOAST FUNCTION
// ============================================================
function showToast(message, type = 'success') {
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast-custom ${type}`;
    
    const icons = {
        success: 'bi-check-circle-fill text-success',
        error: 'bi-exclamation-triangle-fill text-danger',
        warning: 'bi-exclamation-triangle-fill text-warning',
        info: 'bi-info-circle-fill text-info'
    };
    
    const icon = icons[type] || icons.info;
    
    toast.innerHTML = `
        <i class="bi ${icon}"></i>
        <span class="toast-msg">${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    }, 5000);
}

// ============================================================
// 🔥 SIDEBAR CONTROLS
// ============================================================
function openSidebar() {
    sidebarPanel.classList.add('open');
    sidebarOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    sidebarPanel.classList.remove('open');
    sidebarOverlay.classList.remove('active');
    document.body.style.overflow = '';
}

if (sidebarToggle) sidebarToggle.addEventListener('click', openSidebar);
if (sidebarClose) sidebarClose.addEventListener('click', closeSidebar);
if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
});

// ============================================================
// 🔥 LOGOUT
// ============================================================
if (logoutBtnSidebar) {
    logoutBtnSidebar.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await signOut(auth);
            showToast('👋 Logged out successfully', 'info');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 500);
        } catch (error) {
            console.error('Logout error:', error);
            showToast('❌ Error logging out', 'error');
        }
    });
}

// ============================================================
// 🔥 GET GREETING
// ============================================================
function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Morning';
    if (hour < 17) return 'Afternoon';
    return 'Evening';
}

// ============================================================
// 🔥 GET LIVE REFERRAL COUNTS
// ============================================================
function getLiveReferralCounts(userData) {
    try {
        const result = {
            level1: 0,
            level2: 0,
            level3: 0,
            level4: 0,
            level5: 0,
            total: 0
        };
        
        if (!userData || !userData.referralCode) {
            return result;
        }
        
        // ✅ Level 1: from directReferrals
        if (userData.directReferrals) {
            result.level1 = Object.keys(userData.directReferrals).length;
        }
        
        // ✅ Level 2-5: from teamStructure
        if (userData.teamStructure) {
            result.level2 = userData.teamStructure.level2 || 0;
            result.level3 = userData.teamStructure.level3 || 0;
            result.level4 = userData.teamStructure.level4 || 0;
            result.level5 = userData.teamStructure.level5 || 0;
        }
        
        result.total = result.level1 + result.level2 + result.level3 + result.level4 + result.level5;
        return result;
        
    } catch (error) {
        console.error('Error getting referral counts:', error);
        return {
            level1: userData.totalReferrals || 0,
            level2: userData.teamStructure?.level2 || 0,
            level3: userData.teamStructure?.level3 || 0,
            level4: userData.teamStructure?.level4 || 0,
            level5: userData.teamStructure?.level5 || 0,
            total: userData.totalReferrals || 0
        };
    }
}

// ============================================================
// 🔥 CALCULATE ACTIVE PACKAGES (LIVE COUNT)
// ============================================================
function getActivePackagesCount(packages) {
    if (!packages) return 0;
    let count = 0;
    for (let key in packages) {
        if (packages[key].status === 'active') {
            count++;
        }
    }
    return count;
}

// ============================================================
// 🔥 CONVERT TRANSFER HISTORY OBJECT TO ARRAY
// ============================================================
function getTransferHistoryArray(transferHistory) {
    if (!transferHistory) return [];
    
    // ✅ If it's already an array, return it
    if (Array.isArray(transferHistory)) {
        return transferHistory;
    }
    
    // ✅ If it's an object, convert to array
    if (typeof transferHistory === 'object') {
        return Object.values(transferHistory);
    }
    
    return [];
}

// ============================================================
// 🔥 RENDER DASHBOARD
// ============================================================
function renderDashboard(userData) {
    if (!userData) {
        dashboardContent.innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-exclamation-triangle text-warning fs-1 d-block mb-3"></i>
                <h4>No Data Found</h4>
                <p class="text-muted">Please complete your profile.</p>
                <a href="profile.html" class="btn-primary-custom mt-3">Go to Profile</a>
            </div>
        `;
        return;
    }
    
    // ============================================================
    // ✅ ALWAYS USE FIREBASE UID AS PRIMARY IDENTIFIER
    // ============================================================
    const currentUser = auth.currentUser;
    const uid = currentUser ? currentUser.uid : null;
    
    const name = userData.name || 'User';
    
    // ✅ Primary Identifier: Firebase UID
    const primaryId = uid || userData.uid || 'USER';
    
    // ✅ Secondary: Referral Code (same as UID by design)
    const referralCode = userData.referralCode || primaryId;
    
    // ✅ Display Name (for UI only)
    const displayName = userData.username || userData.name || userData.uid || 'User';
    
    const rank = userData.rank || 'Member';
    const isMember = rank === 'Member' || rank === 'member' || !rank;
    const rankClass = isMember ? 'Member' : rank;
    
    // ✅ Get referral counts
    const counts = getLiveReferralCounts(userData);
    
    // ✅ Wallet values
    const depositWallet = userData.depositWallet || 0;
    const referralWallet = userData.referralWallet || 0;
    const rndWallet = userData.rndWallet || 0;
    const lockedRND = userData.lockedRND || 0;
    const releaseWallet = userData.releaseWallet || 0;
    const totalReleased = userData.totalReleased || 0;
    const totalStake = userData.totalStake || 0;
    const teamBusiness = userData.teamBusiness || 0;
    
    // ✅ Live count from packages
    const activePackages = getActivePackagesCount(userData.packages);
    
    // ✅ Earnings
    const level1Earn = userData.level1Earnings || 0;
    const level2Earn = userData.level2Earnings || 0;
    const level3Earn = userData.level3Earnings || 0;
    const level4Earn = userData.level4Earnings || 0;
    const level5Earn = userData.level5Earnings || 0;
    const referralEarnings = userData.referralEarnings || 0;
    
    // ✅ Team levels
    const teamLevels = {
        level1: counts.level1 || 0,
        level2: counts.level2 || 0,
        level3: counts.level3 || 0,
        level4: counts.level4 || 0,
        level5: counts.level5 || 0
    };
    
    const totalReferrals = counts.total || 0;
    
    // ✅ Packages count
    const packages = userData.packages || {};
    const totalPackages = Object.keys(packages).length;
    
    // ✅ Transfer history (support both array and object)
    const transferHistoryRaw = userData.transferHistory || [];
    const transferHistoryArray = getTransferHistoryArray(transferHistoryRaw);
    const sortedHistory = transferHistoryArray.reverse().slice(0, 5);
    
    // ✅ Referral link (using UID as referral code)
    const referralLink = `${window.location.origin}/register.html?ref=${referralCode}`;
    
    // ✅ Update sidebar
    document.getElementById('sidebarName').textContent = name;
    document.getElementById('sidebarUserId').textContent = 'ID: ' + maskString(primaryId, 6);
    document.getElementById('sidebarAvatar').textContent = name.charAt(0).toUpperCase();
    document.getElementById('topAvatar').textContent = name.charAt(0).toUpperCase();
    document.getElementById('topName').textContent = name;
    
    const badge = document.getElementById('referralBadge');
    if (badge) badge.textContent = totalReferrals;
    
    // ✅ Build dashboard HTML
    dashboardContent.innerHTML = `
        <div class="row g-4">
            <!-- WELCOME SECTION -->
            <div class="col-12">
                <div class="card-glass">
                    <div class="d-flex flex-wrap align-items-center justify-content-between gap-3">
                        <div>
                            <h2 style="font-size:1.5rem;font-weight:700;">Good ${getGreeting()}, <span style="color:#2ecc71;">${name}</span></h2>
                            <div class="badge-group">
                                <span class="badge-custom"><i class="bi bi-person-badge me-1"></i>User ID: <strong style="color:#f0f4ff;font-size:0.7rem;font-family:monospace;">${maskString(primaryId, 8)}</strong></span>
                                <span class="badge-custom active"><i class="bi bi-award me-1"></i>${rankClass}</span>
                                <span class="badge-custom"><i class="bi bi-box-seam me-1"></i>${totalPackages} Packages</span>
                                <span class="badge-custom active"><i class="bi bi-shield-check me-1"></i>Secure</span>
                            </div>
                        </div>
                        <div class="d-flex gap-2 flex-wrap">
                            <a href="deposit.html" class="btn-primary-custom" style="padding:8px 18px;font-size:0.85rem;">
                                <i class="bi bi-plus-circle me-1"></i>Deposit
                            </a>
                            <a href="withdrawal.html" class="btn-outline-custom" style="padding:8px 18px;font-size:0.85rem;">
                                <i class="bi bi-arrow-up-right me-1"></i>Withdraw
                            </a>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- 4 WALLETS -->
            <div class="col-12">
                <div class="wallet-grid">
                    <div class="wallet-card">
                        <div class="wallet-icon deposit"><i class="bi bi-wallet2"></i></div>
                        <div class="wallet-number green">$${formatAmount(depositWallet)}</div>
                        <div class="wallet-label">Deposit Wallet</div>
                        <div class="wallet-sub">USDT Balance</div>
                    </div>
                    <div class="wallet-card">
                        <div class="wallet-icon referral"><i class="bi bi-coin"></i></div>
                        <div class="wallet-number gold">${formatAmount(referralWallet, 'RND')}</div>
                        <div class="wallet-label">💰 Referral Wallet</div>
                        <div class="wallet-sub">RND Balance</div>
                    </div>
                    <div class="wallet-card">
                        <div class="wallet-icon rnd"><i class="bi bi-database"></i></div>
                        <div class="wallet-number blue">${formatAmount(rndWallet, 'RND')}</div>
                        <div class="wallet-label">RND Wallet</div>
                        <div class="wallet-sub">💰 Total Released RND</div>
                    </div>
                    <div class="wallet-card">
                        <div class="wallet-icon locked"><i class="bi bi-lock"></i></div>
                        <div class="wallet-number purple">${formatAmount(lockedRND, 'RND')}</div>
                        <div class="wallet-label">🔒 Locked RND</div>
                        <div class="wallet-sub">Remaining Locked</div>
                    </div>
                </div>
            </div>
            
            <!-- DAILY RELEASE & STATS -->
            <div class="col-12">
                <div class="row g-3">
                    <div class="col-md-4">
                        <div class="card-glass" style="border-color:rgba(52,211,153,0.15);">
                            <div style="display:flex;align-items:center;gap:12px;">
                                <div style="width:40px;height:40px;border-radius:50%;background:rgba(52,211,153,0.1);display:flex;align-items:center;justify-content:center;color:#34d399;">
                                    <i class="bi bi-clock-history fs-5"></i>
                                </div>
                                <div>
                                    <div style="font-size:1.2rem;font-weight:700;color:#34d399;">${formatAmount(releaseWallet, 'RND')}</div>
                                    <div style="font-size:0.7rem;color:#8899bb;">📅 Daily Release</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card-glass" style="border-color:rgba(96,165,250,0.15);">
                            <div style="display:flex;align-items:center;gap:12px;">
                                <div style="width:40px;height:40px;border-radius:50%;background:rgba(96,165,250,0.1);display:flex;align-items:center;justify-content:center;color:#60a5fa;">
                                    <i class="bi bi-cash-stack fs-5"></i>
                                </div>
                                <div>
                                    <div style="font-size:1.2rem;font-weight:700;color:#60a5fa;">${formatAmount(totalReleased, 'RND')}</div>
                                    <div style="font-size:0.7rem;color:#8899bb;">📊 Total Released</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card-glass" style="border-color:rgba(167,139,250,0.15);">
                            <div style="display:flex;align-items:center;gap:12px;">
                                <div style="width:40px;height:40px;border-radius:50%;background:rgba(167,139,250,0.1);display:flex;align-items:center;justify-content:center;color:#a78bfa;">
                                    <i class="bi bi-box-seam fs-5"></i>
                                </div>
                                <div>
                                    <div style="font-size:1.2rem;font-weight:700;color:#a78bfa;">${activePackages}</div>
                                    <div style="font-size:0.7rem;color:#8899bb;">📦 Active Packages</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- RELEASE INFO -->
            <div class="col-12">
                <div class="release-info-box">
                    <div>
                        <span class="label"><i class="bi bi-info-circle me-1"></i> Fixed daily release. Same amount every day.</span>
                    </div>
                    <div>
                        <span class="label">Locked RND:</span>
                        <span class="value">${formatAmount(lockedRND, 'RND')}</span>
                    </div>
                    <div>
                        <span class="label">Daily Release:</span>
                        <span class="value">${formatAmount(releaseWallet, 'RND')}</span>
                    </div>
                </div>
            </div>
            
            <!-- STATISTICS -->
            <div class="col-12">
                <div class="card-glass">
                    <div class="card-title"><i class="bi bi-diagram-3 text-success me-2"></i>Statistics</div>
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="number">$${formatAmount(totalStake)}</div>
                            <div class="label">Total Stake (USDT)</div>
                        </div>
                        <div class="stat-card">
                            <div class="number">${totalReferrals}</div>
                            <div class="label">Total Referrals</div>
                        </div>
                        <div class="stat-card">
                            <div class="number">$${formatAmount(teamBusiness)}</div>
                            <div class="label">Team Business</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- 5 LEVEL MEMBERS -->
            <div class="col-12">
                <div class="card-glass">
                    <div class="card-title"><i class="bi bi-people text-success me-2"></i>Team Members by Level</div>
                    <div class="level-stats">
                        <div class="level-stat-card">
                            <div class="number">${teamLevels.level1}</div>
                            <div class="label">Level 1</div>
                        </div>
                        <div class="level-stat-card">
                            <div class="number" style="color:#60a5fa;">${teamLevels.level2}</div>
                            <div class="label">Level 2</div>
                        </div>
                        <div class="level-stat-card">
                            <div class="number" style="color:#a78bfa;">${teamLevels.level3}</div>
                            <div class="label">Level 3</div>
                        </div>
                        <div class="level-stat-card">
                            <div class="number" style="color:#f472b6;">${teamLevels.level4}</div>
                            <div class="label">Level 4</div>
                        </div>
                        <div class="level-stat-card">
                            <div class="number" style="color:#fb923c;">${teamLevels.level5}</div>
                            <div class="label">Level 5</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- 5 LEVEL COMMISSIONS -->
            <div class="col-12">
                <div class="card-glass">
                    <div class="card-title"><i class="bi bi-cash-stack text-success me-2"></i>5 Level Referral Commissions</div>
                    <div class="commission-row">
                        <span class="level">Level 1 (8%)</span>
                        <span class="earnings">$${formatAmount(level1Earn)}</span>
                    </div>
                    <div class="commission-row">
                        <span class="level">Level 2 (4%)</span>
                        <span class="earnings" style="color:#60a5fa;">$${formatAmount(level2Earn)}</span>
                    </div>
                    <div class="commission-row">
                        <span class="level">Level 3 (2%)</span>
                        <span class="earnings" style="color:#a78bfa;">$${formatAmount(level3Earn)}</span>
                    </div>
                    <div class="commission-row">
                        <span class="level">Level 4 (1%)</span>
                        <span class="earnings" style="color:#f472b6;">$${formatAmount(level4Earn)}</span>
                    </div>
                    <div class="commission-row">
                        <span class="level">Level 5 (1%)</span>
                        <span class="earnings" style="color:#fb923c;">$${formatAmount(level5Earn)}</span>
                    </div>
                    <div class="commission-row" style="border-top:2px solid rgba(251,191,36,0.2);padding-top:12px;margin-top:4px;">
                        <span class="level" style="font-weight:700;color:#fbbf24;">Total Referral Earnings</span>
                        <span class="earnings" style="font-size:1.1rem;color:#fbbf24;">$${formatAmount(referralEarnings)}</span>
                    </div>
                </div>
            </div>
            
            <!-- REFERRAL LINK -->
            <div class="col-12">
                <div class="card-glass">
                    <div class="card-title"><i class="bi bi-link-45deg"></i>Your Referral Link</div>
                    <div class="referral-box">
                        <code>${referralLink}</code>
                        <button class="copy-btn" data-copy="${referralLink}"><i class="bi bi-clipboard me-1"></i>Copy</button>
                    </div>
                    <div class="mt-3 d-flex flex-wrap gap-3">
                        <span class="text-muted small"><i class="bi bi-people me-1"></i>Total Referrals: <strong style="color:#2ecc71;">${totalReferrals}</strong></span>
                        <span class="text-muted small"><i class="bi bi-box-arrow-up-right me-1"></i>Referral Code: <strong style="color:#2ecc71;font-size:0.7rem;font-family:monospace;">${referralCode}</strong></span>
                    </div>
                </div>
            </div>
            
            <!-- TRANSFER HISTORY -->
            <div class="col-12">
                <div class="card-glass">
                    <div class="card-title"><i class="bi bi-clock-history text-success me-2"></i>Recent Transfers</div>
                    ${sortedHistory.length === 0 ? `
                        <div class="text-center text-muted py-3">
                            <i class="bi bi-clock fs-3 d-block mb-2"></i>
                            <p style="font-size:0.85rem;">No transfers yet</p>
                        </div>
                    ` : `
                        <div class="transfer-history">
                            ${sortedHistory.map(t => `
                                <div class="transfer-item">
                                    <div>
                                        ${t.type === 'sent' ? 
                                            `<span class="sent"><i class="bi bi-arrow-up-right"></i> Sent to <span class="user">${t.to || 'unknown'}</span></span>` :
                                            `<span class="received"><i class="bi bi-arrow-down-left"></i> Received from <span class="user">${t.from || 'unknown'}</span></span>`
                                        }
                                    </div>
                                    <div>
                                        <span class="amount ${t.type === 'sent' ? 'sent' : 'received'}">${t.type === 'sent' ? '-' : '+'}${t.amount} ${t.currency || 'RND'}</span>
                                        <div class="date">${formatDate(t.timestamp)}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
            </div>
            
            <!-- QUICK LINKS -->
            <div class="col-12">
                <div class="card-glass">
                    <div class="card-title"><i class="bi bi-grid-3x3-gap-fill"></i>Quick Links</div>
                    <div class="quick-links">
                        <a href="deposit.html" class="btn-link-custom"><i class="bi bi-arrow-down-circle me-1"></i>Deposit</a>
                        <a href="withdrawal.html" class="btn-link-custom"><i class="bi bi-arrow-up-circle me-1"></i>Withdraw</a>
                        <a href="buy-package.html" class="btn-link-custom"><i class="bi bi-box-seam me-1"></i>Buy Package</a>
                        <a href="referrals.html" class="btn-link-custom"><i class="bi bi-people me-1"></i>Referrals</a>
                        <a href="profile.html" class="btn-link-custom"><i class="bi bi-person me-1"></i>Profile</a>
                        <a href="support.html" class="btn-link-custom"><i class="bi bi-headset me-1"></i>Support</a>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // ✅ Copy button functionality
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            navigator.clipboard.writeText(btn.dataset.copy).then(() => {
                btn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Copied!';
                setTimeout(() => {
                    btn.innerHTML = '<i class="bi bi-clipboard me-1"></i>Copy';
                }, 2000);
            });
        });
    });
    
    // ✅ Hide loading state
    if (loadingState) {
        loadingState.style.display = 'none';
    }
}

// ============================================================
// 🔥 LOAD DASHBOARD DATA
// ============================================================
async function loadDashboardData(userId) {
    if (isDashboardLoading) return;
    isDashboardLoading = true;
    
    try {
        if (loadingState) {
            loadingState.style.display = 'block';
        }
        
        const result = await getUserByUID(userId);
        
        if (!result.success || !result.user) {
            dashboardContent.innerHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-exclamation-triangle text-danger fs-1 d-block mb-3"></i>
                    <h4>User Not Found</h4>
                    <p class="text-muted">Please complete your profile.</p>
                    <a href="profile.html" class="btn-primary-custom mt-3">Go to Profile</a>
                </div>
            `;
            return;
        }
        
        const userData = result.user;
        currentUserData = userData;
        currentUserId = userId;
        
        console.log('✅ Dashboard data loaded for:', userData.name || userId);
        renderDashboard(userData);
        setupRealtimeListener(userId);
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        dashboardContent.innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-exclamation-triangle text-danger fs-1 d-block mb-3"></i>
                <h4>Error Loading Dashboard</h4>
                <p class="text-muted">${error.message || 'Please try again later.'}</p>
                <button class="btn-primary-custom mt-3" onclick="location.reload()">Refresh</button>
            </div>
        `;
    } finally {
        isDashboardLoading = false;
        if (loadingState) {
            loadingState.style.display = 'none';
        }
    }
}

// ============================================================
// 🔥 SETUP REALTIME LISTENER
// ============================================================
function setupRealtimeListener(userId) {
    if (listenerOff) {
        listenerOff();
        listenerOff = null;
    }
    
    const userRef = ref(database, 'users/' + userId);
    
    listenerOff = onValue(userRef, (snapshot) => {
        try {
            if (!snapshot.exists()) return;
            const data = snapshot.val();
            currentUserData = data;
            renderDashboard(data);
        } catch (error) {
            console.error('Realtime listener error:', error);
        }
    });
}

// ============================================================
// 🔥 MAIN AUTH HANDLER
// ============================================================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    try {
        console.log('👤 User authenticated:', user.uid);
        await loadDashboardData(user.uid);
        await createLog('info', 'Dashboard loaded', {
            uid: user.uid,
            email: user.email
        });
    } catch (error) {
        console.error('Error in auth handler:', error);
        dashboardContent.innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-exclamation-triangle text-danger fs-1 d-block mb-3"></i>
                <h4>Authentication Error</h4>
                <p class="text-muted">${error.message || 'Please try again later.'}</p>
                <button class="btn-primary-custom mt-3" onclick="location.reload()">Refresh</button>
            </div>
        `;
    }
});

// ============================================================
// 🔥 CLEANUP
// ============================================================
window.addEventListener('beforeunload', () => {
    if (listenerOff) {
        listenerOff();
        listenerOff = null;
    }
});

console.log('✅ Dashboard module (Phase 4 Final) loaded successfully');
console.log('📌 Project: mywebsite-600d3');
console.log('📌 Rule: Firebase Auth UID = User ID = Referral Code');
console.log('📌 Transfer History: Supports both Array and Object');