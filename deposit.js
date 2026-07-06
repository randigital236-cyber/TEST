/**
 * Deposit Page - Deposit USDT to Wallet
 * 
 * ⚠️ IMPORTANT: This page handles deposit verification.
 * 
 * Flow:
 * 1. Display deposit address and QR code
 * 2. User enters amount and transaction hash
 * 3. Verify deposit on blockchain
 * 4. Credit wallet via wallet-service
 * 5. Show success/error
 * 
 * ✅ Real-time wallet updates
 * ✅ Deposit history display
 * ✅ Preset amount buttons
 * ✅ Blockchain verification
 * ✅ Lock management
 * ✅ Error handling
 */

import { onAuthChange, signOut } from './auth.js';
import { showToast } from './toast.js';
import { initSidebar, updateSidebarUser, openSidebar, closeSidebar } from './sidebar.js';
import { db } from './firebase-init.js';
import { ref, get, onValue, off } from "firebase/database";
import { formatDate, copyToClipboard } from './utils.js';
import { getAllWalletBalances, getWalletBalance } from './wallet-service.js';
import { WALLET_CONFIG, getDepositWallet, getUSDTContract } from './wallet.js';
import { completeDeposit, cleanupStaleLocks, checkPendingVerifications } from './verifyTransaction.js';

// ============================================================
// DOM REFERENCES
// ============================================================

const DOM = {
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    errorMessage: document.getElementById('errorMessage'),
    loadingStatus: document.getElementById('loadingStatus'),
    depositContent: document.getElementById('depositContent'),
    
    // Wallets
    depositWallet: document.getElementById('depositWallet'),
    referralWallet: document.getElementById('referralWallet'),
    rndWallet: document.getElementById('rndWallet'),
    lockedRND: document.getElementById('lockedRND'),
    
    // Deposit Address
    depositAddress: document.getElementById('depositAddress'),
    contractAddress: document.getElementById('contractAddress'),
    copyAddressBtn: document.getElementById('copyAddressBtn'),
    qrCodeImg: document.getElementById('qrCodeImg'),
    
    // Form
    depositForm: document.getElementById('depositForm'),
    depositAmount: document.getElementById('depositAmount'),
    txHash: document.getElementById('txHash'),
    verifyBtn: document.getElementById('verifyBtn'),
    presetBtns: document.querySelectorAll('.preset-btn'),
    
    // Status
    verificationStatus: document.getElementById('verificationStatus'),
    pendingVerifications: document.getElementById('pendingVerifications'),
    
    // Success
    successState: document.getElementById('successState'),
    successMessage: document.getElementById('successMessage'),
    
    // History
    depositHistoryContainer: document.getElementById('depositHistoryContainer'),
    
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
// STATE
// ============================================================

let currentUserId = null;
let currentUserData = null;
let unsubscribeRealtime = null;
let isVerifying = false;

// ============================================================
// QR CODE GENERATION
// ============================================================

function generateQRCode(address) {
    const encoded = encodeURIComponent(address);
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}&color=22c55e&bgcolor=0a0e1a`;
}

// ============================================================
// MAIN - Load Deposit Page
// ============================================================

export async function loadDepositPage(user) {
    try {
        currentUserId = user.uid;
        
        showLoading('Loading deposit options...');
        
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
        
        // Render deposit address
        renderDepositAddress();
        
        // Render deposit history
        renderDepositHistory(currentUserData);
        
        // Clean up stale locks
        await cleanupStaleLocks();
        
        // Check for pending verifications
        await resumePendingVerifications();
        
        // Setup real-time wallet updates
        setupRealtimeUpdates(user.uid);
        
        // Setup event listeners
        setupEventListeners();
        
        // Init sidebar
        initSidebar();
        
        showContent();
        
    } catch (error) {
        console.error('Error loading deposit page:', error);
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
// RENDER DEPOSIT ADDRESS
// ============================================================

function renderDepositAddress() {
    const address = getDepositWallet();
    const contract = getUSDTContract();
    
    if (DOM.depositAddress) {
        DOM.depositAddress.textContent = address;
    }
    if (DOM.contractAddress) {
        DOM.contractAddress.textContent = contract.substring(0, 10) + '...';
    }
    if (DOM.qrCodeImg) {
        DOM.qrCodeImg.src = generateQRCode(address);
        DOM.qrCodeImg.alt = 'Deposit QR Code';
    }
}

// ============================================================
// RENDER DEPOSIT HISTORY
// ============================================================

function renderDepositHistory(data) {
    const container = DOM.depositHistoryContainer;
    if (!container) return;
    
    const transactions = data.transactions || {};
    const deposits = Object.values(transactions)
        .filter(tx => tx.type === 'deposit' || tx.data?.type === 'deposit')
        .filter(tx => tx.status === 'completed' || tx.status === 'success')
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 10);
    
    if (deposits.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-inbox"></i>
                <p>No deposit history yet</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = deposits.map(tx => {
        const amount = tx.data?.amount || tx.amount || 0;
        const txHash = tx.data?.txHash || tx.txHash || '';
        const timestamp = tx.timestamp || Date.now();
        
        return `
            <div class="history-item">
                <div class="left">
                    <div class="icon deposit">
                        <i class="bi bi-arrow-down-circle"></i>
                    </div>
                    <div class="info">
                        <div class="title">Deposit</div>
                        <div class="sub">${txHash ? txHash.substring(0, 16) + '...' : 'USDT Deposit'}</div>
                    </div>
                </div>
                <div class="right">
                    <div class="amount">+$${amount.toFixed(2)}</div>
                    <div class="date">${formatDate(timestamp)}</div>
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
            renderDepositHistory(data);
        }
    }, (error) => {
        console.error('Realtime listener error:', error);
    });
}

// ============================================================
// RESUME PENDING VERIFICATIONS
// ============================================================

async function resumePendingVerifications() {
    const pendingTxs = await checkPendingVerifications(currentUserId);
    const container = DOM.pendingVerifications;
    
    if (pendingTxs.length === 0) {
        if (container) container.innerHTML = '';
        return;
    }
    
    if (container) {
        container.innerHTML = `
            <div class="verification-status show polling">
                <i class="bi bi-arrow-repeat me-2"></i>
                <strong>Resuming pending verifications...</strong>
            </div>
        `;
    }
    
    for (const pending of pendingTxs) {
        try {
            await completeDeposit(
                currentUserId,
                pending.txHash,
                pending.lockData.amount || 0,
                (confirmations, currentBlock, blockNumber) => {
                    updateVerificationStatus(
                        'polling',
                        `⏳ Verifying deposit... (${confirmations}/${WALLET_CONFIG.MIN_CONFIRMATIONS} confirmations)`
                    );
                },
                (newBalance) => {
                    updateVerificationStatus(
                        'success',
                        `✅ Deposit resumed and verified successfully!`
                    );
                    showToast('✅ Pending deposit completed!', 'success');
                },
                (error) => {
                    updateVerificationStatus('error', `❌ ${error}`);
                    showToast(`❌ ${error}`, 'error');
                }
            );
        } catch (error) {
            console.error('Error resuming pending verification:', error);
        }
    }
    
    if (container) {
        setTimeout(() => {
            container.innerHTML = '';
        }, 3000);
    }
}

// ============================================================
// UPDATE VERIFICATION STATUS
// ============================================================

function updateVerificationStatus(type, message) {
    const statusDiv = DOM.verificationStatus;
    if (!statusDiv) return;
    
    statusDiv.className = `verification-status show ${type}`;
    statusDiv.innerHTML = message;
}

// ============================================================
// EVENT LISTENERS
// ============================================================

function setupEventListeners() {
    // Copy address button
    if (DOM.copyAddressBtn) {
        DOM.copyAddressBtn.addEventListener('click', function() {
            const address = getDepositWallet();
            copyToClipboard(address, () => {
                this.classList.add('copied');
                this.innerHTML = '<i class="bi bi-check"></i> Copied!';
                setTimeout(() => {
                    this.classList.remove('copied');
                    this.innerHTML = '<i class="bi bi-copy"></i> Copy';
                }, 2000);
                showToast('✅ Address copied to clipboard!', 'success');
            });
        });
    }
    
    // Preset amount buttons
    DOM.presetBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const amount = this.dataset.amount;
            if (DOM.depositAmount) {
                DOM.depositAmount.value = amount;
                DOM.presetBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
            }
        });
    });
    
    // Deposit form submit
    if (DOM.depositForm) {
        DOM.depositForm.addEventListener('submit', handleDeposit);
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
// HANDLE DEPOSIT
// ============================================================

async function handleDeposit(e) {
    e.preventDefault();
    
    if (isVerifying) {
        showToast('⏳ Verification already in progress...', 'info');
        return;
    }
    
    const amount = parseFloat(DOM.depositAmount?.value || 0);
    const txHash = DOM.txHash?.value?.trim() || '';
    
    // Validate amount
    if (!amount || amount < 1) {
        showToast('❌ Minimum deposit is 1 USDT', 'error');
        return;
    }
    
    // Validate tx hash
    if (!txHash || txHash.length < 10) {
        showToast('❌ Please enter a valid transaction hash', 'error');
        return;
    }
    
    isVerifying = true;
    if (DOM.verifyBtn) {
        DOM.verifyBtn.disabled = true;
        DOM.verifyBtn.innerHTML = '<span class="spinner"></span> Verifying...';
    }
    
    updateVerificationStatus(
        'pending',
        `<i class="bi bi-hourglass-split me-2"></i> Verifying transaction on blockchain...`
    );
    
    try {
        const result = await completeDeposit(
            currentUserId,
            txHash,
            amount,
            (confirmations, currentBlock, blockNumber) => {
                updateVerificationStatus(
                    'polling',
                    `<span class="polling-indicator"></span>
                     ⏳ Waiting for confirmations... (${confirmations}/${WALLET_CONFIG.MIN_CONFIRMATIONS})<br>
                     <small>Auto-checking every ${WALLET_CONFIG.POLLING_INTERVAL/1000} seconds...</small>`
                );
                showToast(`⏳ Waiting for confirmations... (${confirmations}/${WALLET_CONFIG.MIN_CONFIRMATIONS})`, 'info');
            },
            (newBalance) => {
                updateVerificationStatus(
                    'success',
                    `<i class="bi bi-check-circle me-2"></i>
                     ✅ Deposit verified successfully!<br>
                     <small>$${amount} USDT added to your Deposit Wallet.</small>
                     <br><small>New Balance: $${newBalance.toFixed(2)}</small>`
                );
                showToast(`✅ $${amount} USDT deposited successfully!`, 'success');
                
                // Clear form
                if (DOM.depositAmount) DOM.depositAmount.value = '';
                if (DOM.txHash) DOM.txHash.value = '';
                DOM.presetBtns.forEach(b => b.classList.remove('active'));
            },
            (error) => {
                updateVerificationStatus('error', `<i class="bi bi-exclamation-triangle me-2"></i> ❌ ${error}`);
                showToast(`❌ ${error}`, 'error');
            }
        );
        
        if (result.error) {
            updateVerificationStatus('error', `<i class="bi bi-exclamation-triangle me-2"></i> ❌ ${result.error}`);
            showToast(`❌ ${result.error}`, 'error');
        }
        
    } catch (error) {
        console.error('Deposit error:', error);
        updateVerificationStatus('error', `<i class="bi bi-exclamation-triangle me-2"></i> ❌ ${error.message || 'Something went wrong'}`);
        showToast('❌ Error processing deposit. Please try again.', 'error');
    } finally {
        isVerifying = false;
        if (DOM.verifyBtn) {
            DOM.verifyBtn.disabled = false;
            DOM.verifyBtn.innerHTML = '<i class="bi bi-check-circle me-2"></i> Verify Deposit';
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
    if (DOM.depositContent) DOM.depositContent.style.display = 'none';
}

function showContent() {
    if (DOM.loadingState) DOM.loadingState.style.display = 'none';
    if (DOM.errorState) DOM.errorState.style.display = 'none';
    if (DOM.depositContent) DOM.depositContent.style.display = 'block';
}

function showError(message) {
    if (DOM.errorMessage) DOM.errorMessage.textContent = message || 'An error occurred. Please try again.';
    if (DOM.errorState) DOM.errorState.style.display = 'block';
    if (DOM.loadingState) DOM.loadingState.style.display = 'none';
    if (DOM.depositContent) DOM.depositContent.style.display = 'none';
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
    
    await loadDepositPage(user);
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