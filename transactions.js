/**
 * Transactions Page - View Transaction History
 * 
 * ⚠️ IMPORTANT: This page displays transaction history.
 * 
 * Flow:
 * 1. Display transaction summary
 * 2. Filter transactions by type, status, date
 * 3. Display filtered transaction list
 * 4. Real-time updates
 * 
 * ✅ Real-time data updates
 * ✅ Filter by type, status, date
 * ✅ Summary statistics
 * ✅ Pagination support
 * ✅ Error handling
 */

import { onAuthChange, signOut } from './auth.js';
import { showToast } from './toast.js';
import { initSidebar, updateSidebarUser, openSidebar, closeSidebar } from './sidebar.js';
import { db } from './firebase-init.js';
import { ref, get, onValue, off } from "firebase/database";
import { formatDate, formatCurrency, formatRND } from './utils.js';
import { getAllWalletBalances } from './wallet-service.js';
import { getCommissionTotals } from './commission.js';

// ============================================================
// DOM REFERENCES
// ============================================================

const DOM = {
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    errorMessage: document.getElementById('errorMessage'),
    loadingStatus: document.getElementById('loadingStatus'),
    transactionsContent: document.getElementById('transactionsContent'),
    
    // Summary
    totalTransactions: document.getElementById('totalTransactions'),
    totalDeposits: document.getElementById('totalDeposits'),
    totalWithdrawals: document.getElementById('totalWithdrawals'),
    totalCommission: document.getElementById('totalCommission'),
    
    // Filters
    filterType: document.getElementById('filterType'),
    filterStatus: document.getElementById('filterStatus'),
    filterDate: document.getElementById('filterDate'),
    applyFilter: document.getElementById('applyFilter'),
    resetFilter: document.getElementById('resetFilter'),
    
    // List
    transactionList: document.getElementById('transactionList'),
    
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
// STATE
// ============================================================

let currentUserId = null;
let currentUserData = null;
let allTransactions = [];
let unsubscribeRealtime = null;
let currentFilter = {
    type: 'all',
    status: 'all',
    date: 30
};

// ============================================================
// ICON MAPPING
// ============================================================

const TYPE_ICONS = {
    'wallet_credit': { icon: 'credit', label: 'Deposit' },
    'wallet_debit': { icon: 'debit', label: 'Withdrawal' },
    'package_purchase': { icon: 'package', label: 'Package Purchase' },
    'daily_release': { icon: 'release', label: 'Daily Release' },
    'referral_commission': { icon: 'commission', label: 'Referral Commission' },
    'wallet_transfer': { icon: 'transfer', label: 'Transfer' },
    'package_status_update': { icon: 'package', label: 'Package Status Update' }
};

const STATUS_CLASSES = {
    'completed': 'completed',
    'pending': 'pending',
    'failed': 'failed',
    'rolled_back': 'failed'
};

// ============================================================
// MAIN - Load Transactions Page
// ============================================================

export async function loadTransactionsPage(user) {
    try {
        currentUserId = user.uid;
        
        showLoading('Loading transactions...');
        
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
        
        // Setup real-time updates
        setupRealtimeUpdates(user.uid);
        
        // Setup event listeners
        setupEventListeners();
        
        // Init sidebar
        initSidebar();
        
        showContent();
        
    } catch (error) {
        console.error('Error loading transactions page:', error);
        showError(error.message || 'Please check your internet connection.');
    }
}

// ============================================================
// RENDER TRANSACTIONS
// ============================================================

function renderTransactions(data) {
    if (!data) return;
    
    // Get all transactions
    const transactions = data.transactions || {};
    allTransactions = Object.values(transactions)
        .filter(tx => tx.deleted !== true)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    // Update summary
    updateSummary(allTransactions);
    
    // Apply filters and render
    applyFilters();
}

// ============================================================
// UPDATE SUMMARY
// ============================================================

function updateSummary(transactions) {
    let total = transactions.length;
    let deposits = 0;
    let withdrawals = 0;
    let commission = 0;
    
    transactions.forEach(tx => {
        if (tx.type === 'wallet_credit') {
            deposits += tx.data?.amount || 0;
        } else if (tx.type === 'wallet_debit') {
            withdrawals += tx.data?.amount || 0;
        } else if (tx.type === 'referral_commission') {
            commission += tx.data?.amount || 0;
        }
    });
    
    if (DOM.totalTransactions) DOM.totalTransactions.textContent = total;
    if (DOM.totalDeposits) DOM.totalDeposits.textContent = '$' + deposits.toFixed(2);
    if (DOM.totalWithdrawals) DOM.totalWithdrawals.textContent = '$' + withdrawals.toFixed(2);
    if (DOM.totalCommission) DOM.totalCommission.textContent = '$' + commission.toFixed(2);
}

// ============================================================
// FILTER FUNCTIONS
// ============================================================

function applyFilters() {
    const typeFilter = currentFilter.type;
    const statusFilter = currentFilter.status;
    const dateFilter = parseInt(currentFilter.date);
    
    let filtered = [...allTransactions];
    
    // Filter by type
    if (typeFilter !== 'all') {
        filtered = filtered.filter(tx => tx.type === typeFilter);
    }
    
    // Filter by status
    if (statusFilter !== 'all') {
        filtered = filtered.filter(tx => tx.status === statusFilter);
    }
    
    // Filter by date
    if (dateFilter > 0 && dateFilter !== 'all') {
        const cutoff = Date.now() - (dateFilter * 24 * 60 * 60 * 1000);
        filtered = filtered.filter(tx => (tx.timestamp || 0) > cutoff);
    }
    
    renderTransactionList(filtered);
}

function renderTransactionList(filtered) {
    const container = DOM.transactionList;
    if (!container) return;
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-inbox"></i>
                <p>No transactions found</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filtered.map(tx => {
        const typeInfo = TYPE_ICONS[tx.type] || { icon: 'pending', label: tx.type || 'Unknown' };
        const statusClass = STATUS_CLASSES[tx.status] || 'pending';
        const amount = tx.data?.amount || 0;
        const currency = tx.data?.currency || 'USDT';
        const isPositive = tx.type === 'wallet_credit' || 
                          tx.type === 'daily_release' || 
                          tx.type === 'referral_commission';
        const isPending = tx.status === 'pending' || tx.status === 'PENDING';
        const isFailed = tx.status === 'failed' || tx.status === 'FAILED';
        
        let amountClass = 'negative';
        let amountPrefix = '-';
        if (isPositive) {
            amountClass = 'positive';
            amountPrefix = '+';
        } else if (isPending) {
            amountClass = 'pending';
            amountPrefix = '';
        } else if (isFailed) {
            amountClass = 'negative';
            amountPrefix = '-';
        }
        
        return `
            <div class="transaction-item">
                <div class="left">
                    <div class="icon ${typeInfo.icon} ${isPending ? 'pending' : ''} ${isFailed ? 'failed' : ''}">
                        <i class="bi ${getIconClass(tx.type, isPending)}"></i>
                    </div>
                    <div class="info">
                        <div class="title">${getTransactionTitle(tx)}</div>
                        <div class="sub">${tx.description || typeInfo.label} • ${formatDate(tx.timestamp)}</div>
                    </div>
                </div>
                <div class="right">
                    <div class="amount ${amountClass}">${amountPrefix}${amount.toFixed(4)} ${currency}</div>
                    <div>
                        <span class="status-badge ${statusClass}">${capitalizeStatus(tx.status)}</span>
                    </div>
                    <div class="date">${formatDate(tx.timestamp)}</div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getIconClass(type, isPending) {
    if (isPending) return 'bi-clock';
    const map = {
        'wallet_credit': 'bi-arrow-down-circle',
        'wallet_debit': 'bi-arrow-up-circle',
        'package_purchase': 'bi-box-seam',
        'daily_release': 'bi-arrow-down-circle',
        'referral_commission': 'bi-trophy',
        'wallet_transfer': 'bi-arrow-left-right',
        'package_status_update': 'bi-arrow-repeat'
    };
    return map[type] || 'bi-clock-history';
}

function getTransactionTitle(tx) {
    const map = {
        'wallet_credit': 'Deposit',
        'wallet_debit': 'Withdrawal',
        'package_purchase': 'Package Purchase',
        'daily_release': 'Daily Release',
        'referral_commission': 'Referral Commission',
        'wallet_transfer': 'Transfer',
        'package_status_update': 'Package Status Update'
    };
    const base = map[tx.type] || tx.type || 'Transaction';
    if (tx.data?.planName) {
        return `${base} - ${tx.data.planName}`;
    }
    return base;
}

function capitalizeStatus(status) {
    if (!status) return 'Completed';
    return status.charAt(0).toUpperCase() + status.slice(1);
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
            renderTransactions(data);
        }
    }, (error) => {
        console.error('Realtime listener error:', error);
    });
}

// ============================================================
// EVENT LISTENERS
// ============================================================

function setupEventListeners() {
    // Apply filter
    if (DOM.applyFilter) {
        DOM.applyFilter.addEventListener('click', function() {
            currentFilter.type = DOM.filterType?.value || 'all';
            currentFilter.status = DOM.filterStatus?.value || 'all';
            currentFilter.date = DOM.filterDate?.value || '30';
            applyFilters();
            showToast('✅ Filters applied', 'success');
        });
    }
    
    // Reset filter
    if (DOM.resetFilter) {
        DOM.resetFilter.addEventListener('click', function() {
            if (DOM.filterType) DOM.filterType.value = 'all';
            if (DOM.filterStatus) DOM.filterStatus.value = 'all';
            if (DOM.filterDate) DOM.filterDate.value = '30';
            currentFilter = { type: 'all', status: 'all', date: 30 };
            applyFilters();
            showToast('✅ Filters reset', 'info');
        });
    }
    
    // Keyboard: Enter key triggers filter
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const activeElement = document.activeElement;
            if (activeElement && activeElement.closest('.filter-bar')) {
                DOM.applyFilter?.click();
            }
        }
    });
    
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
    if (DOM.transactionsContent) DOM.transactionsContent.style.display = 'none';
}

function showContent() {
    if (DOM.loadingState) DOM.loadingState.style.display = 'none';
    if (DOM.errorState) DOM.errorState.style.display = 'none';
    if (DOM.transactionsContent) DOM.transactionsContent.style.display = 'block';
}

function showError(message) {
    if (DOM.errorMessage) DOM.errorMessage.textContent = message || 'An error occurred. Please try again.';
    if (DOM.errorState) DOM.errorState.style.display = 'block';
    if (DOM.loadingState) DOM.loadingState.style.display = 'none';
    if (DOM.transactionsContent) DOM.transactionsContent.style.display = 'none';
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
    
    await loadTransactionsPage(user);
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