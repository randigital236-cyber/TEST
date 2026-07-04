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
// 🔥 RANK LEVELS
// ============================================================
const RANK_LEVELS = [
    { id: 'executive', name: 'Executive', business: 3000, reward: 50, direct: 0 },
    { id: 'senior_executive', name: 'Senior Executive', business: 5000, reward: 200, direct: 2 },
    { id: 'manager', name: 'Manager', business: 10000, reward: 500, direct: 5 },
    { id: 'senior_manager', name: 'Senior Manager', business: 25000, reward: 1000, direct: 10 },
    { id: 'diamond', name: 'Diamond', business: 50000, reward: 2000, direct: 20 },
    { id: 'royal_diamond', name: 'Royal Diamond', business: 100000, reward: 5000, direct: 30 },
    { id: 'crown_diamond', name: 'Crown Diamond', business: 200000, reward: 10000, direct: 50 },
    { id: 'global_crown', name: 'Global Crown', business: 500000, reward: 25000, direct: 75 },
    { id: 'ambassador', name: 'Ambassador', business: 1000000, reward: 50000, direct: 100 },
    { id: 'royal_ambassador', name: 'Royal Ambassador', business: 2000000, reward: 100000, direct: 150 }
];

// ============================================================
// 🔥 PROCESS DAILY RELEASES
// ============================================================
async function processDailyReleases(userId) {
    try {
        const userRef = ref(db, 'users/' + userId);
        const result = await runTransaction(userRef, (currentData) => {
            if (!currentData) return { ...currentData };
            const packages = currentData.packages || {};
            const today = new Date().toDateString();
            const lastReleaseDate = currentData.lastReleaseDate || '';
            if (lastReleaseDate === today) return { ...currentData };

            let totalReleaseToday = 0;
            let updatedPackages = {};
            let rndWallet = currentData.rndWallet || 0;
            let lockedRND = currentData.lockedRND || 0;
            let totalReleased = currentData.totalReleased || 0;
            let totalDailyRelease = 0;
            let releaseTransactions = [];
            let totalStake = 0;
            let activePackages = 0;

            for (let key in packages) {
                const pkg = packages[key];
                if (pkg.status !== 'active') {
                    updatedPackages[key] = pkg;
                    continue;
                }
                const remainingRND = pkg.remainingRND || 0;
                const dailyRelease = pkg.dailyRelease || 0;
                let releaseAmount = dailyRelease;
                if (releaseAmount > remainingRND) releaseAmount = remainingRND;

                pkg.remainingRND = remainingRND - releaseAmount;
                pkg.releasedRND = (pkg.releasedRND || 0) + releaseAmount;
                rndWallet += releaseAmount;
                lockedRND -= releaseAmount;
                totalReleased += releaseAmount;
                totalReleaseToday += releaseAmount;
                totalDailyRelease += dailyRelease;
                totalStake += (pkg.usdtAmount || 0);
                activePackages++;
                if (pkg.remainingRND <= 0) { pkg.remainingRND = 0; pkg.status = 'completed'; }
                updatedPackages[key] = pkg;
                releaseTransactions.push({
                    type: 'daily_release',
                    amount: releaseAmount,
                    currency: 'RND',
                    packageId: key,
                    planName: pkg.planName || 'Package',
                    timestamp: Date.now(),
                    date: today,
                    status: 'completed',
                    description: `Daily release of ${releaseAmount.toFixed(4)} RND`
                });
            }

            if (totalReleaseToday > 0) {
                const transactions = currentData.transactions || {};
                for (let tx of releaseTransactions) {
                    const txId = 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                    transactions[txId] = tx;
                }
                return {
                    ...currentData,
                    packages: updatedPackages,
                    rndWallet: rndWallet,
                    lockedRND: lockedRND,
                    totalReleased: totalReleased,
                    releaseWallet: totalDailyRelease,
                    totalStake: totalStake,
                    activePackages: activePackages,
                    lastReleaseDate: today,
                    transactions: transactions
                };
            }
            return { ...currentData };
        });
        return result.committed ? result.snapshot.val() : null;
    } catch (error) {
        console.error('Error processing daily releases:', error);
        return null;
    }
}

// ============================================================
// 🔥 RECALCULATE TEAM STRUCTURE
// ============================================================
async function recalculateTeamStructure(userId) {
    try {
        const usersSnap = await get(ref(db, 'users'));
        if (!usersSnap.exists()) return null;
        const allUsers = usersSnap.val();
        const currentUser = allUsers[userId];
        if (!currentUser) return null;
        const userRefCode = currentUser.referralCode;

        let level1 = [], level2 = [], level3 = [], level4 = [], level5 = [];
        for (let uid in allUsers) {
            const u = allUsers[uid];
            if (u.referredBy === userRefCode) level1.push({ uid, data: u });
        }

        let currentLevel = level1;
        let levelNum = 2;
        while (currentLevel.length > 0 && levelNum <= 5) {
            let nextLevel = [];
            for (let item of currentLevel) {
                const refCode = item.data.referralCode;
                for (let uid in allUsers) {
                    const u = allUsers[uid];
                    if (u.referredBy === refCode && !nextLevel.some(x => x.uid === uid)) {
                        nextLevel.push({ uid, data: u });
                    }
                }
            }
            if (levelNum === 2) level2 = nextLevel;
            else if (levelNum === 3) level3 = nextLevel;
            else if (levelNum === 4) level4 = nextLevel;
            else if (levelNum === 5) level5 = nextLevel;
            currentLevel = nextLevel;
            levelNum++;
        }

        const teamLevels = {
            level1: level1.filter((v, i, a) => a.findIndex(t => t.uid === v.uid) === i).length,
            level2: level2.filter((v, i, a) => a.findIndex(t => t.uid === v.uid) === i).length,
            level3: level3.filter((v, i, a) => a.findIndex(t => t.uid === v.uid) === i).length,
            level4: level4.filter((v, i, a) => a.findIndex(t => t.uid === v.uid) === i).length,
            level5: level5.filter((v, i, a) => a.findIndex(t => t.uid === v.uid) === i).length
        };

        await update(ref(db, 'users/' + userId), {
            teamStructure: teamLevels,
            totalReferrals: teamLevels.level1,
            downline: teamLevels.level1 + teamLevels.level2 + teamLevels.level3 + teamLevels.level4 + teamLevels.level5
        });

        return teamLevels;
    } catch (error) {
        console.error('Error recalculating team structure:', error);
        return null;
    }
}

// ============================================================
// 🔥 CHECK RANK AND AUTO REWARD
// ============================================================
async function checkAndUpdateRank(userId) {
    try {
        const userRef = ref(db, 'users/' + userId);
        const result = await runTransaction(userRef, (currentData) => {
            if (!currentData) return { ...currentData };
            const teamBusiness = currentData.teamBusiness || 0;
            const directReferrals = currentData.totalReferrals || 0;
            const currentRank = currentData.rank || 'Member';
            const earnedRewards = currentData.earnedRewards || {};

            let newRank = currentRank;
            let rankUpgraded = false;
            for (let i = RANK_LEVELS.length - 1; i >= 0; i--) {
                const rank = RANK_LEVELS[i];
                if (teamBusiness >= rank.business && directReferrals >= rank.direct) {
                    if (currentRank !== rank.name && !earnedRewards[rank.id]) {
                        newRank = rank.name;
                        rankUpgraded = true;
                    } else if (currentRank === rank.name) {
                        newRank = rank.name;
                    }
                    break;
                }
            }

            if (rankUpgraded) {
                let achievedRank = null;
                for (let i = RANK_LEVELS.length - 1; i >= 0; i--) {
                    const rank = RANK_LEVELS[i];
                    if (teamBusiness >= rank.business && directReferrals >= rank.direct) {
                        if (!earnedRewards[rank.id]) {
                            achievedRank = rank;
                            break;
                        }
                    }
                }
                if (achievedRank) {
                    const incomeWallet = currentData.incomeWallet || 0;
                    earnedRewards[achievedRank.id] = {
                        date: new Date().toISOString(),
                        reward: achievedRank.reward,
                        teamBusiness: teamBusiness,
                        directReferrals: directReferrals
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
                        description: `Rank achieved: ${achievedRank.name} - Reward $${achievedRank.reward}`
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
                        showToast(`🎉 Congratulations! You achieved ${achievedRank.name} rank! Reward $${achievedRank.reward} USDT credited.`, 'success');
                    }, 1000);
                    return {
                        ...currentData,
                        rank: achievedRank.name,
                        incomeWallet: incomeWallet + achievedRank.reward,
                        earnedRewards: earnedRewards,
                        transactions: transactions,
                        notifications: notifications
                    };
                }
            }
            return { ...currentData };
        });
        return result.committed ? result.snapshot.val() : null;
    } catch (error) {
        console.error('Error checking rank:', error);
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
    const teamBusiness = u.teamBusiness || 0;
    const directReferrals = u.totalReferrals || 0;
    const downline = u.downline || 0;

    // Commissions
    const level1Earn = u.level1Earnings || 0;
    const level2Earn = u.level2Earnings || 0;
    const level3Earn = u.level3Earnings || 0;
    const level4Earn = u.level4Earnings || 0;
    const level5Earn = u.level5Earnings || 0;
    const referralEarnings = u.referralEarnings || 0;

    const teamLevels = u.teamStructure || { level1: 0, level2: 0, level3: 0, level4: 0, level5: 0 };
    const packages = u.packages || {};
    const totalPackages = Object.keys(packages).length;

    // Update sidebar
    document.getElementById('sidebarName').textContent = name;
    document.getElementById('sidebarUserId').textContent = 'ID: ' + username.substring(0, 15) + '...';
    document.getElementById('sidebarAvatar').textContent = name.charAt(0).toUpperCase();
    const badge = document.getElementById('referralBadge');
    if (badge) badge.textContent = directReferrals;

    const rankClass = isMember ? 'rank-badge member' : 'rank-badge';

    // Build HTML
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
                                <span class="rank-badge" style="background:rgba(139,92,246,0.1);border-color:rgba(139,92,246,0.2);color:#a78bfa;">
                                    <span class="icon">📊</span> Residual Levels: ${downline || 0}
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

            <!-- ====== TOP STATS ====== -->
            <div class="col-12">
                <div class="stats-row">
                    <div class="stat-box">
                        <div class="number green">${directReferrals}</div>
                        <div class="label">Direct Referrals</div>
                    </div>
                    <div class="stat-box">
                        <div class="number blue">${downline}</div>
                        <div class="label">Residual Levels</div>
                    </div>
                    <div class="stat-box">
                        <div class="number gold">${totalPackages}</div>
                        <div class="label">Active Packages</div>
                    </div>
                    <div class="stat-box">
                        <div class="number teal">$${formatNumber(teamBusiness)}</div>
                        <div class="label">Team Business</div>
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

            <!-- ====== DAILY RELEASE & LOCKED ====== -->
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

            <!-- ====== 5 LEVEL TEAM ====== -->
            <div class="col-12">
                <h5 class="fw-bold mb-3"><i class="bi bi-people text-success me-2"></i>Team Members by Level</h5>
                <div class="level-grid">
                    <div class="level-card">
                        <div class="level-number">${teamLevels.level1 || 0}</div>
                        <div class="level-label">Level 1</div>
                    </div>
                    <div class="level-card">
                        <div class="level-number">${teamLevels.level2 || 0}</div>
                        <div class="level-label">Level 2</div>
                    </div>
                    <div class="level-card">
                        <div class="level-number">${teamLevels.level3 || 0}</div>
                        <div class="level-label">Level 3</div>
                    </div>
                    <div class="level-card">
                        <div class="level-number">${teamLevels.level4 || 0}</div>
                        <div class="level-label">Level 4</div>
                    </div>
                    <div class="level-card">
                        <div class="level-number">${teamLevels.level5 || 0}</div>
                        <div class="level-label">Level 5</div>
                    </div>
                </div>
            </div>

            <!-- ====== 5 LEVEL COMMISSIONS ====== -->
            <div class="col-12">
                <div class="card-glass">
                    <div class="card-title"><i class="bi bi-cash-stack text-success me-2"></i>5 Level Referral Commissions</div>
                    <div class="row">
                        <div class="col-md-8">
                            <div class="commission-row">
                                <span class="level-name">Level 1 <span class="badge-percent">8%</span></span>
                                <span class="earnings">$${level1Earn.toFixed(2)}</span>
                            </div>
                            <div class="commission-row">
                                <span class="level-name">Level 2 <span class="badge-percent">4%</span></span>
                                <span class="earnings">$${level2Earn.toFixed(2)}</span>
                            </div>
                            <div class="commission-row">
                                <span class="level-name">Level 3 <span class="badge-percent">2%</span></span>
                                <span class="earnings">$${level3Earn.toFixed(2)}</span>
                            </div>
                            <div class="commission-row">
                                <span class="level-name">Level 4 <span class="badge-percent">1%</span></span>
                                <span class="earnings">$${level4Earn.toFixed(2)}</span>
                            </div>
                            <div class="commission-row">
                                <span class="level-name">Level 5 <span class="badge-percent">1%</span></span>
                                <span class="earnings">$${level5Earn.toFixed(2)}</span>
                            </div>
                            <div class="commission-row total">
                                <span class="level-name">Total Referral Earnings</span>
                                <span class="earnings">$${referralEarnings.toFixed(2)}</span>
                            </div>
                        </div>
                        <div class="col-md-4 text-center d-flex flex-column justify-content-center">
                            <div style="padding:20px;background:rgba(46,204,113,0.05);border-radius:12px;border:1px solid rgba(46,204,113,0.1);">
                                <small class="text-muted">Total Stake</small>
                                <h3 style="color:#60a5fa;">$${totalStake.toFixed(2)}</h3>
                                <small class="text-muted">USDT</small>
                            </div>
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
                        <span class="text-muted small"><i class="bi bi-tree me-1"></i>Downline: <strong style="color:#60a5fa;">${downline}</strong></span>
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

    // Copy referral button
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

        // 🔥 Process daily releases
        await processDailyReleases(user.uid);
        await recalculateTeamStructure(user.uid);
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
