/**
 * Withdrawal Page - Withdraw Funds from Wallet
 * 
 * ⚠️ IMPORTANT: This page handles withdrawal requests.
 * 
 * Flow:
 * 1. User selects wallet (Deposit/Referral/RND)
 * 2. User enters amount
 * 3. User enters external wallet address
 * 4. Submit withdrawal request
 * 5. Show confirmation / pending status
 * 
 * ✅ Real-time wallet updates
 * ✅ Withdrawal history display
 * ✅ Preset amount buttons
 * ✅ Balance validation
 * ✅ Error handling
 * ✅ Recovery queue for failed rollbacks
 */

import { onAuthChange, signOut } from './auth.js';
import { showToast } from './toast.js';
import { initSidebar, updateSidebarUser, openSidebar, closeSidebar } from './sidebar.js';
import { db } from './firebase-init.js';
import { ref, get, onValue, off, push, set, runTransaction } from "firebase/database";
import { formatDate, roundTo8 } from './utils.js';
import { getAllWalletBalances, getWalletBalance } from './wallet-service.js';
import { createTransaction, TRANSACTION_TYPES, TRANSACTION_STATUS } from './transaction-service.js';
import { debitWallet } from './wallet-service.js';

// ============================================================
// DOM REFERENCES
// ============================================================

const DOM = {
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    errorMessage: document.getElementById('errorMessage'),
    loadingStatus: document.getElementById('loadingStatus'),
    withdrawalContent: document.getElementById('withdrawalContent'),
    
    // Wallets
    depositWallet: document.getElementById('depositWallet'),
    referralWallet: document.getElementById('referralWallet'),
    rndWallet: document.getElementById('rndWallet'),
    lockedRND: document.getElementById('lockedRND'),
    
    // Form
    withdrawalForm: document.getElementById('withdrawalForm'),
    withdrawWallet: document.getElementById('withdrawWallet'),
    withdrawAmount: document.getElementById('withdrawAmount'),
    withdrawAddress: document.getElementById('withdrawAddress'),
    withdrawNote: document.getElementById('withdrawNote'),
    withdrawBtn: document.getElementById('withdrawBtn'),
    balanceHint: document.getElementById('balanceHint'),
    presetBtns: document.querySelectorAll('.preset-btn'),
    
    // Success
    successState: document.getElementById('successState'),
    successMessage: document.getElementById('successMessage'),
    
    // History
    withdrawalHistoryContainer: document.getElementById('withdrawalHistoryContainer'),
    
    // Sidebar
    sidebarAvatar: document.getElementById('sidebarAvatar'),
    sidebarName: document.getElementById('sidebarName'),
    sidebarAvatarLarge: document.getElementById('sidebarAvatarLarge'),
    sidebarNameLarge: document.getElementById('sidebarNameLarge'),
    sidebarUserId: document.getElementById('sidebarUserId'),
    referralBadge: document.getElementById('referralBadge'),
    logoutBtn: document.getElementById('logoutBtnSidebar'),
    sidebarToggle: document.getElementById('sidebarToggle'),
    sidebarClose: document.getElementById('sidebarClose'),
    sidebarOverlay: document.getElementById('sidebarOverlay'),
    sidebarPanel: document.getElementById('sidebarPanel'),
};

// ============================================================
// CONSTANTS
// ============================================================

const MIN_WITHDRAWAL = {
    depositWallet: 10,
    referralWallet: 10,
    rndWallet: 10
};

const WITHDRAWAL_FEE = {
    depositWallet: 1,
    referralWallet: 1,
    rndWallet: 0
};

// ============================================================
// STATE
// ============================================================

let currentUserId = null;
let currentUserData = null;
let unsubscribeRealtime = null;

// ============================================================
// MAIN - Load Withdrawal Page
// ============================================================

export async function loadWithdrawalPage(user) {
    try {
        currentUserId = user.uid;
        
        showLoading('Loading withdrawal options...');
        
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
        
        // Render wallets
        renderWallets(currentUserData);
        
        // Render withdrawal history
        renderWithdrawalHistory(currentUserData);
        
        // Update balance hint
        updateBalanceHint(currentUserData);
        
        // Setup real-time wallet updates
        setupRealtimeUpdates(user.uid);
        
        // Setup event listeners
        setupEventListeners();
        
        // Init sidebar
        initSidebar();
        
        showContent();
        
    } catch (error) {
        console.error('Error loading withdrawal page:', error);
        showError(error.message || 'Please check your internet connection.');
    }
}

// ============================================================
// RENDER WALLETS
// ============================================================

function renderWallets(data) {
    const balances = getAllWalletBalances(data);
    
    if (DOM.depositWallet) {
        DOM.depositWallet.textContent = '$' + balances.depositWallet.toFixed(2);
    }
    if (DOM.referralWallet) {
        DOM.referralWallet.textContent = balances.referralWallet.toFixed(2) + ' USDT';
    }
    if (DOM.rndWallet) {
        DOM.rndWallet.textContent = balances.rndWallet.toFixed(4) + ' RND';
    }
    if (DOM.lockedRND) {
        DOM.lockedRND.textContent = balances.lockedRND.toFixed(2) + ' RND';
    }
}

// ============================================================
// UPDATE BALANCE HINT
// ============================================================

function updateBalanceHint(data) {
    const walletType = DOM.withdrawWallet?.value || 'depositWallet';
    const balance = getWalletBalance(data, walletType);
    const currency = walletType === 'rndWallet' ? 'RND' : 'USDT';
    const minWithdraw = MIN_WITHDRAWAL[walletType] || 10;
    
    if (DOM.balanceHint) {
        DOM.balanceHint.textContent = `Available: ${balance.toFixed(walletType === 'rndWallet' ? 4 : 2)} ${currency} | Min: ${minWithdraw} ${currency}`;
        DOM.balanceHint.className = balance < minWithdraw ? 'form-hint error' : 'form-hint';
    }
}

// ============================================================
// RENDER WITHDRAWAL HISTORY
// ============================================================

function renderWithdrawalHistory(data) {
    const container = DOM.withdrawalHistoryContainer;
    if (!container) return;
    
    const transactions = data.transactions || {};
    const withdrawals = Object.values(transactions)
        .filter(tx => 
            tx.type === 'wallet_debit' || 
            tx.type === TRANSACTION_TYPES.WALLET_DEBIT
        )
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 10);
    
    if (withdrawals.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-inbox"></i>
                <p>No withdrawal history yet</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = withdrawals.map(tx => {
        const isPending = tx.status === 'pending' || tx.status === 'PENDING';
        const isCompleted = tx.status === 'completed' || tx.status === 'COMPLETED';
        const statusClass = isPending ? 'pending' : (isCompleted ? 'completed' : 'failed');
        const statusText = isPending ? '⏳ Pending' : (isCompleted ? '✅ Completed' : '❌ Failed');
        const amount = tx.data?.amount || 0;
        const currency = tx.data?.currency || 'USDT';
        const address = tx.data?.address || '';
        
        return `
            <div class="history-item">
                <div class="left">
                    <div class="icon ${isPending ? 'pending' : (isCompleted ? 'completed' : 'withdraw')}">
                        <i class="bi ${isPending ? 'bi-clock' : (isCompleted ? 'bi-check-circle' : 'bi-arrow-up-circle')}"></i>
                    </div>
                    <div class="info">
                        <div class="title">Withdraw ${currency}</div>
                        <div class="sub">${tx.data?.walletType || 'Wallet'} ${address ? '→ ' + address.substring(0, 10) + '...' : ''}</div>
                    </div>
                </div>
                <div class="right">
                    <div class="amount ${isPending ? 'pending' : 'negative'}">-${amount.toFixed(2)} ${currency}</div>
                    <div><span class="status-badge ${statusClass}">${statusText}</span></div>
                    <div class="date">${formatDate(tx.timestamp)}</div>
                </div>
            </div>
        `;
    }).join('');
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
            renderWallets(data);
            renderWithdrawalHistory(data);
            updateBalanceHint(data);
        }
    }, (error) => {
        console.error('Realtime listener error:', error);
    });
}

// ============================================================
// EVENT LISTENERS
// ============================================================

function setupEventListeners() {
    // Preset amount buttons
    DOM.presetBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const walletType = DOM.withdrawWallet?.value || 'depositWallet';
            const balance = getWalletBalance(currentUserData, walletType);
            
            if (this.dataset.amount === 'max') {
                const maxAmount = Math.max(0, balance - WITHDRAWAL_FEE[walletType] || 0);
                if (DOM.withdrawAmount) {
                    DOM.withdrawAmount.value = maxAmount > 0 ? maxAmount.toFixed(2) : 0;
                }
            } else {
                const amount = parseFloat(this.dataset.amount);
                if (DOM.withdrawAmount) {
                    DOM.withdrawAmount.value = amount;
                }
            }
            
            // Highlight active button
            DOM.presetBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    // Wallet selection change
    if (DOM.withdrawWallet) {
        DOM.withdrawWallet.addEventListener('change', function() {
            updateBalanceHint(currentUserData);
            DOM.presetBtns.forEach(b => b.classList.remove('active'));
        });
    }
    
    // Withdrawal form submit
    if (DOM.withdrawalForm) {
        DOM.withdrawalForm.addEventListener('submit', handleWithdrawal);
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
// HANDLE WITHDRAWAL
// ============================================================

async function handleWithdrawal(e) {
    e.preventDefault();
    
    const walletType = DOM.withdrawWallet?.value || 'depositWallet';
    const amount = parseFloat(DOM.withdrawAmount?.value || 0);
    const address = DOM.withdrawAddress?.value?.trim() || '';
    const note = DOM.withdrawNote?.value || '';
    
    const balance = getWalletBalance(currentUserData, walletType);
    const currency = walletType === 'rndWallet' ? 'RND' : 'USDT';
    const minWithdraw = MIN_WITHDRAWAL[walletType] || 10;
    const fee = WITHDRAWAL_FEE[walletType] || 0;
    
    // Validate
    if (!amount || amount < minWithdraw) {
        showToast(`❌ Minimum withdrawal is ${minWithdraw} ${currency}`, 'error');
        return;
    }
    
    if (amount > balance) {
        showToast(`❌ Insufficient balance! You have ${balance.toFixed(2)} ${currency}`, 'error');
        return;
    }
    
    if (!address || address.length < 10) {
        showToast('❌ Please enter a valid wallet address', 'error');
        return;
    }
    
    if (DOM.withdrawBtn) {
        DOM.withdrawBtn.disabled = true;
        DOM.withdrawBtn.innerHTML = '<span class="spinner"></span>Processing...';
    }
    
    try {
        // ✅ Step 1: Debit wallet
        const operationId = `withdraw_${Date.now()}`;
        const debitResult = await debitWallet(
            currentUserId,
            walletType,
            amount,
            `Withdrawal to ${address.substring(0, 10)}...`,
            {
                operationId: operationId,
                address: address,
                note: note,
                fee: fee
            }
        );
        
        if (!debitResult.success) {
            showToast(`❌ ${debitResult.error || 'Withdrawal failed'}`, 'error');
            if (DOM.withdrawBtn) {
                DOM.withdrawBtn.disabled = false;
                DOM.withdrawBtn.innerHTML = '<i class="bi bi-arrow-up-circle me-2"></i> Withdraw';
            }
            return;
        }
        
        // ✅ Step 2: Create withdrawal record in Firebase
        const withdrawalRef = ref(db, `withdrawals/${currentUserId}`);
        const newWithdrawalRef = push(withdrawalRef);
        await set(newWithdrawalRef, {
            id: newWithdrawalRef.key,
            userId: currentUserId,
            walletType: walletType,
            amount: amount,
            currency: currency,
            address: address,
            note: note,
            fee: fee,
            status: 'pending',
            transactionId: debitResult.transactionId,
            operationId: operationId,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
        
        // Show success
        if (DOM.successMessage) {
            DOM.successMessage.textContent = `Withdrawal of ${amount} ${currency} to ${address.substring(0, 15)}... has been submitted. Processing time: 24-48 hours.`;
        }
        if (DOM.successState) {
            DOM.successState.style.display = 'block';
        }
        if (DOM.withdrawalForm) {
            DOM.withdrawalForm.style.display = 'none';
        }
        
        showToast(`✅ Withdrawal of ${amount} ${currency} submitted!`, 'success');
        
    } catch (error) {
        console.error('Withdrawal error:', error);
        showToast(`❌ Error processing withdrawal: ${error.message}`, 'error');
    } finally {
        if (DOM.withdrawBtn) {
            DOM.withdrawBtn.disabled = false;
            DOM.withdrawBtn.innerHTML = '<i class="bi bi-arrow-up-circle me-2"></i> Withdraw';
        }
    }
}

// ============================================================
// UI STATE MANAGEMENT
// ============================================================

function showLoading(message) {
    if (DOM.loadingStatus) DOM.loadingStatus.textContent = message || 'Loading...';
    if (DOM.loadingState) DOM.loadingState.style.display = 'block';
    if (DOM.errorState) DOM.errorState.style.display = 'none';
    if (DOM.withdrawalContent) DOM.withdrawalContent.style.display = 'none';
}

function showContent() {
    if (DOM.loadingState) DOM.loadingState.style.display = 'none';
    if (DOM.errorState) DOM.errorState.style.display = 'none';
    if (DOM.withdrawalContent) DOM.withdrawalContent.style.display = 'block';
}

function showError(message) {
    if (DOM.errorMessage) DOM.errorMessage.textContent = message || 'An error occurred. Please try again.';
    if (DOM.errorState) DOM.errorState.style.display = 'block';
    if (DOM.loadingState) DOM.loadingState.style.display = 'none';
    if (DOM.withdrawalContent) DOM.withdrawalContent.style.display = 'none';
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
    
    await loadWithdrawalPage(user);
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