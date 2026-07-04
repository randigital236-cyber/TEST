import { auth, db, LOGIN_URL } from "./firebase.js";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { ref, get, update, runTransaction } from "firebase/database";

// ============================================================
// 🔥 TOAST NOTIFICATION
// ============================================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast-custom ${type}`;
    const icon = type === 'success' ? 'bi-check-circle-fill text-success' : 'bi-exclamation-triangle-fill text-danger';
    toast.innerHTML = `<i class="bi ${icon}"></i><span class="toast-msg">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// ============================================================
// 🔥 SIDEBAR
// ============================================================
const sidebarPanel = document.getElementById('sidebarPanel');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarClose = document.getElementById('sidebarClose');

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
sidebarToggle?.addEventListener('click', openSidebar);
sidebarClose?.addEventListener('click', closeSidebar);
sidebarOverlay?.addEventListener('click', closeSidebar);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });

document.getElementById('logoutBtnSidebar')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = LOGIN_URL;
});

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
// 🔥 FORMAT NUMBER
// ============================================================
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toFixed(2);
}

// ============================================================
// 🔥 RANK LEVELS (Only these ranks)
// ============================================================
const RANK_LEVELS = [
    { id: 'executive', name: 'Executive', business: 3000, reward: 50, direct: 0 },
    { id: 'senior_executive', name: 'Senior Executive', business: 10000, reward: 150, direct: 2 },
    { id: 'manager', name: 'Manager', business: 30000, reward: 500, direct: 2 },
    { id: 'senior_manager', name: 'Senior Manager', business: 75000, reward: 1000, direct: 2 },
    { id: 'director', name: 'Director', business: 150000, reward: 2500, direct: 2 },
    { id: 'senior_director', name: 'Senior Director', business: 300000, reward: 5000, direct: 2 },
    { id: 'diamond', name: 'Diamond', business: 750000, reward: 10000, direct: 2 }
];

// ============================================================
// 🔥 GET RANK PROGRESS
// ============================================================
function getRankProgress(teamBusiness, qualifiedDirects, currentRankName) {
    const currentIndex = RANK_LEVELS.findIndex(r => r.name === currentRankName);
    
    if (currentIndex === -1 || currentIndex >= RANK_LEVELS.length - 1) {
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
// 🔥 CHECK AND UPDATE RANK (AUTO RANK + REWARD)
// ============================================================
async function checkAndUpdateRank(userId) {
    try {
        const userRef = ref(db, 'users/' + userId);
        const result = await runTransaction(userRef, (currentData) => {
            if (!currentData) return { ...currentData };
            
            const teamBusiness = currentData.teamBusiness || 0;
            const qualifiedDirects = currentData.qualifiedDirects || 0;
            const currentRank = currentData.rank || 'Member';
            const rankRewardPaid = currentData.rankRewardPaid || {};
            
            let achievedRank = null;
            let rankUpgraded = false;
            
            for (let i = RANK_LEVELS.length - 1; i >= 0; i--) {
                const rank = RANK_LEVELS[i];
                if (teamBusiness >= rank.business && qualifiedDirects >= rank.direct) {
                    const currentIndex = RANK_LEVELS.findIndex(r => r.name === currentRank);
                    if (i > currentIndex || currentRank === 'Member') {
                        achievedRank = rank;
                        rankUpgraded = true;
                        break;
                    }
                }
            }
            
            if (!rankUpgraded || !achievedRank) {
                return { ...currentData };
            }
            
            if (rankRewardPaid[achievedRank.id]) {
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
            
            rankRewardPaid[achievedRank.id] = {
                paidAt: Date.now(),
                amount: achievedRank.reward,
                teamBusiness: teamBusiness,
                qualifiedDirects: qualifiedDirects
            };
            
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
                description: `🏆 Rank Achieved: ${achievedRank.name} - Reward $${achievedRank.reward}`
            };
            
            const notifications = currentData.notifications || {};
            const notifId = 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            notifications[notifId] = {
                title: '🎉 Rank Achieved!',
                message: `Congratulations! You achieved ${achievedRank.name} rank and earned $${achievedRank.reward} USDT.`,
                rank: achievedRank.name,
                reward: achievedRank.reward,
                read: false,
                timestamp: Date.now(),
                date: new Date().toDateString(),
                type: 'rank_reward'
            };
            
            setTimeout(() => {
                showToast(`🎉 Congratulations! You achieved ${achievedRank.name} rank! $${achievedRank.reward} USDT credited.`, 'success');
            }, 1000);
            
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
        
        return result.committed ? result.snapshot.val() : null;
    } catch (error) {
        console.error('Error checking rank:', error);
        return null;
    }
}

// ============================================================
// 🔥 RECALCULATE TEAM STRUCTURE (Basic - No Residual)
// ============================================================
async function recalculateTeamStructure(userId) {
    try {
        const usersSnap = await get(ref(db, 'users'));
        if (!usersSnap.exists()) return null;
        const allUsers = usersSnap.val();
        const currentUser = allUsers[userId];
        if (!currentUser) return null;
        
        const userRefCode = currentUser.referralCode;
        let directReferrals = 0;
        let qualifiedDirects = 0;
        
        for (let uid in allUsers) {
            const u = allUsers[uid];
            if (u.referredBy === userRefCode) {
                directReferrals++;
                // Check if this direct member has a rank (not Member)
                if (u.rank && u.rank !== 'Member' && u.rank !== 'member') {
                    qualifiedDirects++;
                }
            }
        }
        
        await update(ref(db, 'users/' + userId), {
            totalReferrals: directReferrals,
            qualifiedDirects: qualifiedDirects
        });
        
        return { directReferrals, qualifiedDirects };
    } catch (error) {
        console.error('Error recalculating team structure:', error);
        return null;
    }
}

// ============================================================
// 🔥 LOAD DASHBOARD
// ============================================================
function loadDashboard(userData) {
    const u = userData;
    const username = u.username || u.referralCode || 'USER';
    const name = u.name || 'User';
    const rank = u.rank || 'Member';
    const isMember = rank === 'Member' || rank === 'member' || !rank;
    
    const directReferrals = u.totalReferrals || 0;
    const qualifiedDirects = u.qualifiedDirects || 0;
    const teamBusiness = u.teamBusiness || 0;
    
    // Wallets
    const depositWallet = u.depositWallet || 0;
    const incomeWallet = u.incomeWallet || 0;
    const rewardWallet = u.rewardWallet || 0;
    const rndWallet = u.rndWallet || 0;
    const lockedRND = u.lockedRND || 0;
    const releaseWallet = u.releaseWallet || 0;
    const totalReleased = u.totalReleased || 0;
    const activePackages = u.activePackages || 0;
    const totalStake = u.totalStake || 0;
    
    const packages = u.packages || {};
    const totalPackages = Object.keys(packages).length;
    
    // 🔥 RANK PROGRESS
    const progress = getRankProgress(teamBusiness, qualifiedDirects, rank);
    
    // Update sidebar
    document.getElementById('sidebarName').textContent = name;
    document.getElementById('sidebarUserId').textContent = 'ID: ' + username.substring(0, 15) + '...';
    document.getElementById('sidebarAvatar').textContent = name.charAt(0).toUpperCase();
    const badge = document.getElementById('referralBadge');
    if (badge) badge.textContent = directReferrals;
    
    const rankClass = isMember ? 'rank-badge member' : 'rank-badge';

    document.getElementById('dashboardContent').innerHTML = `
        <div class="row g-4">
            <!-- ====== WELCOME SECTION ====== -->
            <div class="col-12">
                <div class="welcome-section">
                    <div class="d-flex flex-wrap align-items-center justify-content-between gap-3">
                        <div>
                            <div class="greeting">WELCOME BACK</div>
                            <h2>Good ${getGreeting()}, <span>${name}</span></h2>
                            <div class="d-flex flex-wrap align-items-center gap-3 mt-2">
                                <span class="user-id">
                                    <i class="bi bi-person-badge me-1"></i>${username}
                                </span>
                                <span class="${rankClass}">
                                    <span class="icon">🏆</span> ${rank}
                                </span>
                                <span class="rank-badge" style="background:rgba(46,204,113,0.08);border-color:rgba(46,204,113,0.15);color:#8899bb;">
                                    <span class="icon">📊</span> Directs: ${directReferrals}
                                </span>
                            </div>
                        </div>
                        <div>
                            <a href="deposit.html" class="btn-primary-custom me-2"><i class="bi bi-plus-circle me-1"></i>Deposit</a>
                            <a href="withdraw.html" class="btn-outline-custom"><i class="bi bi-arrow-up-right me-1"></i>Withdraw</a>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ====== RANK PROGRESS ====== -->
            <div class="col-12">
                <div class="rank-progress-card">
                    <div class="row g-3">
                        <div class="col-md-4">
                            <div class="rank-current">
                                <div class="rank-label">Current Rank</div>
                                <div class="rank-name">${rank}</div>
                                <div class="rank-badge-small">
                                    <i class="bi bi-award-fill"></i> 
                                    ${isMember ? 'Start your journey!' : 'Keep going!'}
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            ${progress.nextRank ? `
                                <div class="rank-next">
                                    <div class="rank-label">Next Rank</div>
                                    <div class="rank-name">${progress.nextRank.name}</div>
                                    <div class="rank-reward">💰 Reward: $${progress.nextRank.reward}</div>
                                </div>
                            ` : `
                                <div class="rank-next">
                                    <div class="rank-label">🎯 Maximum Rank</div>
                                    <div class="rank-name">${rank}</div>
                                    <div class="rank-reward">🏆 You are at the top!</div>
                                </div>
                            `}
                        </div>
                        <div class="col-md-4">
                            <div class="rank-requirements">
                                <div class="rank-label">Requirements</div>
                                ${progress.nextRank ? `
                                    <div class="req-item">
                                        <span>Team Business</span>
                                        <span>$${formatNumber(teamBusiness)} / $${formatNumber(progress.nextRank.business)}</span>
                                    </div>
                                    <div class="req-item">
                                        <span>Qualified Directs</span>
                                        <span>${qualifiedDirects} / ${progress.nextRank.direct}</span>
                                    </div>
                                ` : `
                                    <div class="req-item">
                                        <span>✅ All requirements met!</span>
                                        <span>🏆</span>
                                    </div>
                                `}
                            </div>
                        </div>
                    </div>
                    
                    ${progress.nextRank ? `
                        <div class="progress-container mt-3">
                            <div class="progress-labels">
                                <span>Progress to ${progress.nextRank.name}</span>
                                <span>${Math.round(progress.businessProgress)}%</span>
                            </div>
                            <div class="progress-bar-wrapper">
                                <div class="progress-bar-fill" style="width: ${Math.min(progress.businessProgress, 100)}%"></div>
                            </div>
                            <div class="progress-details">
                                <span>🏢 Business: $${formatNumber(teamBusiness)} / $${formatNumber(progress.nextRank.business)}</span>
                                <span>👥 Directs: ${qualifiedDirects} / ${progress.nextRank.direct}</span>
                            </div>
                        </div>
                    ` : `
                        <div class="progress-container mt-3">
                            <div class="progress-labels">
                                <span>🎯 Maximum Rank Achieved</span>
                                <span>100%</span>
                            </div>
                            <div class="progress-bar-wrapper">
                                <div class="progress-bar-fill" style="width: 100%; background: linear-gradient(90deg, #fbbf24, #f59e0b);"></div>
                            </div>
                            <div class="progress-details">
                                <span>🏆 You are a ${rank}!</span>
                            </div>
                        </div>
                    `}
                </div>
            </div>

            <!-- ====== TOP STATS ====== -->
            <div class="col-12">
                <div class="stats-row">
                    <div class="stat-box">
                        <div class="number green">${directReferrals}</div>
                        <div class="label">Direct Referrals</div>
                    </div>
                    <div class="stat-box">
                        <div class="number blue">${qualifiedDirects}</div>
                        <div class="label">Qualified Directs</div>
                    </div>
                    <div class="stat-box">
                        <div class="number gold">$${formatNumber(teamBusiness)}</div>
                        <div class="label">Team Business</div>
                    </div>
                    <div class="stat-box">
                        <div class="number teal">${totalPackages}</div>
                        <div class="label">Active Packages</div>
                    </div>
                </div>
            </div>

            <!-- ====== 4 WALLETS ====== -->
            <div class="col-12">
                <div class="wallet-grid">
                    <div class="wallet-card">
                        <div class="wallet-icon deposit"><i class="bi bi-wallet2"></i></div>
                        <div class="wallet-amount green">$${depositWallet.toFixed(2)}</div>
                        <div class="wallet-label">Deposit Wallet</div>
                        <div class="wallet-sub">USDT</div>
                    </div>
                    <div class="wallet-card">
                        <div class="wallet-icon income"><i class="bi bi-graph-up-arrow"></i></div>
                        <div class="wallet-amount teal">$${incomeWallet.toFixed(2)}</div>
                        <div class="wallet-label">Income Wallet</div>
                        <div class="wallet-sub">USDT</div>
                    </div>
                    <div class="wallet-card">
                        <div class="wallet-icon reward"><i class="bi bi-gift"></i></div>
                        <div class="wallet-amount gold">$${rewardWallet.toFixed(2)}</div>
                        <div class="wallet-label">Reward Wallet</div>
                        <div class="wallet-sub">USDT</div>
                    </div>
                    <div class="wallet-card">
                        <div class="wallet-icon rnd"><i class="bi bi-database"></i></div>
                        <div class="wallet-amount blue">${rndWallet.toFixed(4)}</div>
                        <div class="wallet-label">RND Wallet</div>
                        <div class="wallet-sub">RND</div>
                    </div>
                </div>
            </div>

            <!-- ====== DAILY RELEASE ====== -->
            <div class="col-12">
                <div class="row g-3">
                    <div class="col-md-4">
                        <div class="wallet-card" style="background:rgba(52,211,153,0.05);border-color:rgba(52,211,153,0.15);">
                            <div class="wallet-icon" style="background:rgba(52,211,153,0.12);color:#34d399;"><i class="bi bi-clock-history"></i></div>
                            <div class="wallet-amount teal">${releaseWallet.toFixed(4)} RND</div>
                            <div class="wallet-label">📅 Daily Release</div>
                            <div class="wallet-sub">Fixed Per Day</div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="wallet-card" style="background:rgba(96,165,250,0.05);border-color:rgba(96,165,250,0.15);">
                            <div class="wallet-icon" style="background:rgba(96,165,250,0.12);color:#60a5fa;"><i class="bi bi-cash-stack"></i></div>
                            <div class="wallet-amount blue">${totalReleased.toFixed(4)} RND</div>
                            <div class="wallet-label">📊 Total Released</div>
                            <div class="wallet-sub">So Far</div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="wallet-card" style="background:rgba(139,92,246,0.05);border-color:rgba(139,92,246,0.15);">
                            <div class="wallet-icon" style="background:rgba(139,92,246,0.12);color:#a78bfa;"><i class="bi bi-lock"></i></div>
                            <div class="wallet-amount purple">${lockedRND.toFixed(2)} RND</div>
                            <div class="wallet-label">🔒 Locked RND</div>
                            <div class="wallet-sub">Remaining</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ====== REFERRAL LINK ====== -->
            <div class="col-12">
                <div class="card-glass">
                    <div class="card-title"><i class="bi bi-link-45deg text-success me-2"></i>Your Referral Link</div>
                    <div class="referral-box">
                        <span class="referral-code">
                            <span class="highlight">${username}</span>
                            <span style="color:#556688;"> | Code: </span>
                            <span class="highlight">${u.referralCode}</span>
                        </span>
                        <button class="copy-btn" id="copyReferralBtn"><i class="bi bi-clipboard me-1"></i>Copy</button>
                    </div>
                    <div class="mt-2 d-flex flex-wrap gap-3">
                        <span class="text-muted small"><i class="bi bi-people me-1"></i>Direct: <strong style="color:#2ecc71;">${directReferrals}</strong></span>
                        <span class="text-muted small"><i class="bi bi-award me-1"></i>Qualified: <strong style="color:#fbbf24;">${qualifiedDirects}</strong></span>
                    </div>
                </div>
            </div>

            <!-- ====== QUICK LINKS ====== -->
            <div class="col-12">
                <div class="card-glass">
                    <div class="card-title"><i class="bi bi-grid-3x3-gap-fill text-success me-2"></i>Quick Links</div>
                    <div class="d-flex flex-wrap gap-2">
                        <a href="deposit.html" class="btn-primary-custom"><i class="bi bi-arrow-down-circle me-1"></i>Deposit</a>
                        <a href="withdraw.html" class="btn-outline-custom"><i class="bi bi-arrow-up-circle me-1"></i>Withdraw</a>
                        <a href="referral.html" class="btn-outline-custom"><i class="bi bi-people me-1"></i>Referrals</a>
                        <a href="packages.html" class="btn-outline-custom"><i class="bi bi-box-seam me-1"></i>Packages</a>
                        <a href="profile.html" class="btn-outline-custom"><i class="bi bi-person me-1"></i>Profile</a>
                        <a href="rank.html" class="btn-outline-custom"><i class="bi bi-trophy me-1"></i>Rank</a>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('copyReferralBtn')?.addEventListener('click', () => {
        const text = `${username} | Code: ${u.referralCode}`;
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById('copyReferralBtn');
            btn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Copied!';
            setTimeout(() => { btn.innerHTML = '<i class="bi bi-clipboard me-1"></i>Copy'; }, 2000);
        });
    });
}

// ============================================================
// 🔥 MAIN - AUTH STATE
// ============================================================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = LOGIN_URL;
        return;
    }

    try {
        const userSnap = await get(ref(db, 'users/' + user.uid));
        if (!userSnap.exists()) {
            document.getElementById('dashboardContent').innerHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-exclamation-triangle text-danger fs-1 d-block mb-3"></i>
                    <h4>Profile Not Found</h4>
                    <p class="text-muted">Please register first to access your dashboard.</p>
                    <a href="register.html" class="btn btn-primary-custom mt-3">Register Now</a>
                </div>
            `;
            return;
        }

        const u = userSnap.val();
        if (u.banned === true) {
            await signOut(auth);
            alert('Your account has been banned.');
            window.location.href = LOGIN_URL;
            return;
        }

        // 🔥 Recalculate team structure (direct referrals + qualified directs)
        await recalculateTeamStructure(user.uid);

        // 🔥 Check and update rank (auto promotion + reward)
        await checkAndUpdateRank(user.uid);

        // 🔥 Get updated data
        const updatedSnap = await get(ref(db, 'users/' + user.uid));
        if (updatedSnap.exists()) {
            loadDashboard(updatedSnap.val());
        }

    } catch (error) {
        console.error('Error loading dashboard:', error);
        document.getElementById('dashboardContent').innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-exclamation-triangle text-danger fs-1 d-block mb-3"></i>
                <h4>Error Loading Dashboard</h4>
                <p class="text-muted">${error.message || 'Please check your internet connection.'}</p>
                <button class="btn btn-primary-custom mt-3" onclick="location.reload()">Refresh</button>
            </div>
        `;
    }
});
