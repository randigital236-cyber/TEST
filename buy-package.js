/**
 * Buy Package - Main Entry Point for Package Purchase
 * 
 * ⚠️ CRITICAL: This file orchestrates the entire package purchase flow.
 * 
 * Flow:
 * 1. User selects a plan
 * 2. User enters amount
 * 3. User selects wallet (depositWallet or referralWallet)
 * 4. Validate balance (UI feedback only - final check in wallet-service)
 * 5. Calculate staking using package-service.js
 * 6. Debit wallet using wallet-service.js (Atomic)
 * 7. Create package using package-service.js (Atomic)
 * 8. Distribute referral commission using commission-service.js
 * 9. Open Invoice in new window
 * 10. Show success message and refresh UI via realtime listener
 * 
 * ✅ Wallet debit and package creation are SEPARATE transactions
 * ✅ If package creation fails, wallet is rolled back
 * ✅ Atomic operations with proper error handling
 * ✅ Real-time wallet updates via listener
 * ✅ Invoice auto-generated after successful purchase
 */

import { onAuthChange, signOut, getCurrentUser } from './auth.js';
import { getRNDPrice, roundTo8, formatDate } from './utils.js';
import { showToast } from './toast.js';
import { initSidebar, updateSidebarUser } from './sidebar.js';
import { db } from './firebase-init.js';
import { ref, get, onValue, off } from "firebase/database";
import { 
    getWalletBalance,
    hasSufficientBalance,
    getAllWalletBalances,
    debitWallet,
    creditWallet
} from './wallet-service.js';
import {
    PLANS,
    calculateStaking,
    createPackage,
    getPackageHistory,
    checkDuplicatePurchase,
    calculateTotalLockedRND
} from './package-service.js';
import {
    distributeReferralCommission
} from './commission-service.js';

// ============================================================
// CONSTANTS
// ============================================================

const DEBUG = false;

// ============================================================
// STATE
// ============================================================

let currentUserId = null;
let currentUserData = null;
let currentRndPrice = 1;
let purchaseInProgress = false;
let unsubscribeRealtime = null;
let unsubscribePrice = null;

// ============================================================
// DOM REFERENCES
// ============================================================

const DOM = {
    packageContent: document.getElementById('packageContent'),
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    errorMessage: document.getElementById('errorMessage'),
    loadingStatus: document.getElementById('loadingStatus'),
    
    walletDeposit: document.getElementById('walletDeposit'),
    walletReferral: document.getElementById('walletReferral'),
    walletRND: document.getElementById('walletRND'),
    walletLocked: document.getElementById('walletLocked'),
    
    selectedPlan: document.getElementById('selectedPlan'),
    payAmount: document.getElementById('payAmount'),
    totalRNDDisplay: document.getElementById('totalRNDDisplay'),
    dailyReleaseDisplay: document.getElementById('dailyReleaseDisplay'),
    payFrom: document.getElementById('payFrom'),
    buyBtn: document.getElementById('buyBtn'),
    buyForm: document.getElementById('buyForm'),
    
    supportLink: document.getElementById('supportLink'),
    logoutBtn: document.getElementById('logoutBtnSidebar'),
    
    packageHistoryContainer: document.getElementById('packageHistoryContainer'),
    rndPriceDisplay: document.getElementById('rndPriceDisplay'),
    releaseInfo: document.getElementById('releaseInfo')
};

// ============================================================
// HELPER - Logging
// ============================================================

function log(message, ...args) {
    if (DEBUG) {
        console.log(`[BuyPackage] ${message}`, ...args);
    }
}

function logError(message, ...args) {
    console.error(`[BuyPackage] ${message}`, ...args);
}

// ============================================================
// MAIN FUNCTION - Load Package Page
// ============================================================

export async function loadPackagePage(user) {
    try {
        currentUserId = user.uid;
        
        showLoading('Loading package options...');
        
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
        
        await fetchRNDPrice();
        
        const username = currentUserData.username || currentUserData.referralCode || 'USER';
        const name = currentUserData.name || 'User';
        updateSidebarUser(name, username, currentUserData.totalReferrals || 0);
        
        renderPackageUI(currentUserData, currentRndPrice);
        
        attachPlanListeners();
        attachFormListeners();
        
        setupRealtimeUpdates(user.uid);
        setupEventListeners();
        
        initSidebar();
        showContent();
        
    } catch (error) {
        logError('Error loading page:', error);
        showError(error.message || 'Please check your internet connection.');
    }
}

// ============================================================
// FETCH RND PRICE
// ============================================================

async function fetchRNDPrice() {
    try {
        const settingsRef = ref(db, 'settings/rate');
        const snapshot = await get(settingsRef);
        if (snapshot.exists()) {
            currentRndPrice = snapshot.val();
            if (DOM.rndPriceDisplay) {
                DOM.rndPriceDisplay.textContent = '$' + currentRndPrice.toFixed(4);
            }
        }
    } catch (error) {
        logError('Error fetching RND price:', error);
    }
}

// ============================================================
// RENDER UI
// ============================================================

function renderPackageUI(userData, rndPrice) {
    const container = DOM.packageContent;
    if (!container) return;
    
    const depositWallet = userData.depositWallet || 0;
    const referralWallet = userData.referralWallet || 0;
    const rndWallet = userData.rndWallet || 0;
    const lockedRND = userData.lockedRND || 0;
    const releaseWallet = userData.releaseWallet || 0;
    
    const packageHistory = getPackageHistory(userData);
    
    let packagesHtml = '';
    if (packageHistory.length === 0) {
        packagesHtml = `
            <div class="text-center text-muted py-4">
                <i class="bi bi-box-seam fs-1 d-block mb-2"></i>
                <p>No packages purchased yet.</p>
            </div>
        `;
    } else {
        packageHistory.forEach((p) => {
            const statusClass = p.status === 'active' ? 'status-active' : 'status-completed';
            const statusText = p.status === 'active' ? '🟢 Active' : '🔵 Completed';
            const released = p.releasedRND || 0;
            const remaining = p.remainingRND || 0;
            const total = p.totalRND || 0;
            const progress = total > 0 ? (released / total * 100) : 0;
            
            packagesHtml += `
                <div class="package-item">
                    <div>
                        <span class="plan">${p.planName || 'Package'}</span>
                        <span class="plan-badge ms-1">${p.planId || 'N/A'}</span>
                        <div class="date">${formatDate(p.purchaseDate || p.timestamp)}</div>
                        ${p.rndPriceAtTime ? `<span class="rate-badge">Rate: $${p.rndPriceAtTime.toFixed(4)}/RND</span>` : ''}
                        <div class="mt-1">
                            <div class="progress"><div class="progress-bar" style="width:${Math.min(progress, 100)}%;"></div></div>
                            <small class="text-muted">${progress.toFixed(1)}% Released</small>
                        </div>
                    </div>
                    <div>
                        <span class="amount">$${(p.usdtAmount || 0).toFixed(2)}</span>
                        <span class="total-rnd">→ ${(total || 0).toFixed(2)} RND</span>
                        <span class="${statusClass} ms-2">${statusText}</span>
                        ${p.dailyRelease ? `<div class="daily">📈 Daily: ${(p.dailyRelease || 0).toFixed(4)} RND</div>` : ''}
                        ${released > 0 ? `<div class="released">✅ Released: ${released.toFixed(2)} RND</div>` : ''}
                        ${remaining > 0 ? `<div class="locked">🔒 Remaining: ${remaining.toFixed(2)} RND</div>` : ''}
                        ${p.planDays ? `<div class="daily">📅 ${p.planDays} Days</div>` : ''}
                    </div>
                </div>
            `;
        });
    }
    
    container.innerHTML = `
        <div class="row g-4">
            <div class="col-12">
                <div class="d-flex flex-wrap justify-content-between align-items-center">
                    <h4 class="fw-bold"><i class="bi bi-box-seam text-success me-2"></i>Buy Package</h4>
                    <span class="rnd-price-badge"><i class="bi bi-currency-dollar"></i> 1 RND = $${(rndPrice || 1).toFixed(4)}</span>
                </div>
                <hr class="border-secondary">
            </div>
            
            <div class="col-12">
                <div class="row g-2">
                    <div class="col-6 col-lg-3">
                        <div class="wallet-mini-box">
                            <div class="label">Deposit Wallet (USDT)</div>
                            <div class="amount green" id="walletDeposit">$${(depositWallet || 0).toFixed(2)}</div>
                        </div>
                    </div>
                    <div class="col-6 col-lg-3">
                        <div class="wallet-mini-box">
                            <div class="label">Referral Wallet (USDT)</div>
                            <div class="amount gold" id="walletReferral">${(referralWallet || 0).toFixed(2)} USDT</div>
                        </div>
                    </div>
                    <div class="col-6 col-lg-3">
                        <div class="wallet-mini-box">
                            <div class="label">RND Wallet</div>
                            <div class="amount blue" id="walletRND">${(rndWallet || 0).toFixed(4)} RND</div>
                        </div>
                    </div>
                    <div class="col-6 col-lg-3">
                        <div class="wallet-mini-box">
                            <div class="label">Locked RND</div>
                            <div class="amount purple" id="walletLocked">${(lockedRND || 0).toFixed(2)} RND</div>
                        </div>
                    </div>
                </div>
                
                <div class="release-info-box mt-3">
                    <span class="label"><i class="bi bi-info-circle me-1"></i> Package buy karte hi RND Locked wallet mein add ho jayega. Release next day se start hoga.</span>
                    <span class="label">Today's Release:</span>
                    <span class="value">${(releaseWallet || 0).toFixed(4)} RND</span>
                </div>
            </div>
            
            <div class="col-12">
                <div class="row g-4">
                    ${PLANS.map((plan) => {
                        const example = calculateStaking(plan.minAmount, rndPrice || 1, plan);
                        return `
                        <div class="col-md-4">
                            <div class="package-card" data-plan="${plan.id}">
                                <h5 class="plan-name" style="color:${plan.color};">${plan.name}</h5>
                                <div class="price">$${plan.minAmount} <span>USDT</span></div>
                                <div class="reward">${plan.bonusText}</div>
                                <div class="duration">⏱ ${plan.days} Days</div>
                                <div class="you-will-receive">📊 You Will Receive: ${example.totalRND.toFixed(2)} RND</div>
                                <div class="daily-release">📈 Daily: ${example.dailyRelease.toFixed(4)} RND</div>
                                <div class="features">
                                    <li><i class="bi bi-check-circle"></i> ${plan.bonus}% Bonus</li>
                                    <li><i class="bi bi-check-circle"></i> Fixed Daily Release</li>
                                    <li><i class="bi bi-check-circle"></i> ${plan.days} Days Lock</li>
                                    <li><i class="bi bi-check-circle"></i> Min: $${plan.minAmount}</li>
                                </div>
                                <button class="plan-cta" data-plan-id="${plan.id}">
                                    <i class="bi bi-lightning-charge-fill"></i> Select ${plan.name}
                                </button>
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
            
            <div class="col-12">
                <div class="card-glass">
                    <div class="card-title"><i class="bi bi-cart-check text-success me-2"></i>Confirm Purchase</div>
                    <form id="buyForm" novalidate>
                        <div class="row g-3">
                            <div class="col-md-3">
                                <label class="form-label">Selected Plan</label>
                                <input type="text" id="selectedPlan" class="form-control form-control-custom" value="None" readonly>
                            </div>
                            <div class="col-md-2">
                                <label class="form-label">Amount (USDT)</label>
                                <input type="number" id="payAmount" class="form-control form-control-custom" placeholder="Enter amount" min="10" step="1" required>
                            </div>
                            <div class="col-md-2">
                                <label class="form-label">You Will Receive</label>
                                <input type="text" id="totalRNDDisplay" class="form-control form-control-custom" value="0 RND" readonly>
                            </div>
                            <div class="col-md-2">
                                <label class="form-label">Daily Release</label>
                                <input type="text" id="dailyReleaseDisplay" class="form-control form-control-custom" value="0 RND" readonly>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">Pay From</label>
                                <select id="payFrom" class="form-select form-select-custom">
                                    <option value="depositWallet">💰 Deposit Wallet (USDT)</option>
                                    <option value="referralWallet">💳 Referral Wallet (USDT)</option>
                                </select>
                            </div>
                        </div>
                        <div class="row mt-3">
                            <div class="col-12">
                                <button type="submit" class="btn-primary-custom" id="buyBtn">
                                    <i class="bi bi-check-circle me-1"></i>Buy Now
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
            
            <div class="col-12">
                <div class="card-glass">
                    <div class="card-title"><i class="bi bi-clock-history text-success me-2"></i>Package History</div>
                    <div class="package-history" id="packageHistoryContainer">${packagesHtml}</div>
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// REAL-TIME UPDATES
// ============================================================

function setupRealtimeUpdates(uid) {
    if (unsubscribeRealtime) {
        off(ref(db, 'users/' + uid));
        unsubscribeRealtime = null;
    }
    
    if (unsubscribePrice) {
        off(ref(db, 'settings/rate'));
        unsubscribePrice = null;
    }
    
    const userRef = ref(db, 'users/' + uid);
    unsubscribeRealtime = onValue(userRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            currentUserData = data;
            
            const deposit = data.depositWallet || 0;
            const referral = data.referralWallet || 0;
            const rnd = data.rndWallet || 0;
            const locked = data.lockedRND || 0;
            const release = data.releaseWallet || 0;
            
            if (DOM.walletDeposit) DOM.walletDeposit.textContent = '$' + deposit.toFixed(2);
            if (DOM.walletReferral) DOM.walletReferral.textContent = referral.toFixed(2) + ' USDT';
            if (DOM.walletRND) DOM.walletRND.textContent = rnd.toFixed(4) + ' RND';
            if (DOM.walletLocked) DOM.walletLocked.textContent = locked.toFixed(2) + ' RND';
            
            updatePackageHistory(data);
            
            const releaseInfo = document.querySelector('.release-info-box .value');
            if (releaseInfo) releaseInfo.textContent = release.toFixed(4) + ' RND';
        }
    }, (error) => {
        logError('Realtime user listener error:', error);
    });
    
    const priceRef = ref(db, 'settings/rate');
    unsubscribePrice = onValue(priceRef, (snapshot) => {
        if (snapshot.exists()) {
            currentRndPrice = snapshot.val();
            if (DOM.rndPriceDisplay) {
                DOM.rndPriceDisplay.textContent = '$' + currentRndPrice.toFixed(4);
            }
        }
    }, (error) => {
        logError('Realtime price listener error:', error);
    });
}

// ============================================================
// UPDATE PACKAGE HISTORY
// ============================================================

function updatePackageHistory(userData) {
    const container = DOM.packageHistoryContainer;
    if (!container) return;
    
    const packageHistory = getPackageHistory(userData);
    
    if (packageHistory.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-4">
                <i class="bi bi-box-seam fs-1 d-block mb-2"></i>
                <p>No packages purchased yet.</p>
            </div>
        `;
        return;
    }
    
    let packagesHtml = '';
    packageHistory.forEach((p) => {
        const statusClass = p.status === 'active' ? 'status-active' : 'status-completed';
        const statusText = p.status === 'active' ? '🟢 Active' : '🔵 Completed';
        const released = p.releasedRND || 0;
        const remaining = p.remainingRND || 0;
        const total = p.totalRND || 0;
        const progress = total > 0 ? (released / total * 100) : 0;
        
        packagesHtml += `
            <div class="package-item">
                <div>
                    <span class="plan">${p.planName || 'Package'}</span>
                    <span class="plan-badge ms-1">${p.planId || 'N/A'}</span>
                    <div class="date">${formatDate(p.purchaseDate || p.timestamp)}</div>
                    ${p.rndPriceAtTime ? `<span class="rate-badge">Rate: $${p.rndPriceAtTime.toFixed(4)}/RND</span>` : ''}
                    <div class="mt-1">
                        <div class="progress"><div class="progress-bar" style="width:${Math.min(progress, 100)}%;"></div></div>
                        <small class="text-muted">${progress.toFixed(1)}% Released</small>
                    </div>
                </div>
                <div>
                    <span class="amount">$${(p.usdtAmount || 0).toFixed(2)}</span>
                    <span class="total-rnd">→ ${(total || 0).toFixed(2)} RND</span>
                    <span class="${statusClass} ms-2">${statusText}</span>
                    ${p.dailyRelease ? `<div class="daily">📈 Daily: ${(p.dailyRelease || 0).toFixed(4)} RND</div>` : ''}
                    ${released > 0 ? `<div class="released">✅ Released: ${released.toFixed(2)} RND</div>` : ''}
                    ${remaining > 0 ? `<div class="locked">🔒 Remaining: ${remaining.toFixed(2)} RND</div>` : ''}
                    ${p.planDays ? `<div class="daily">📅 ${p.planDays} Days</div>` : ''}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = packagesHtml;
}

// ============================================================
// PLAN LISTENERS
// ============================================================

function attachPlanListeners() {
    document.querySelectorAll('.plan-cta').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            
            if (purchaseInProgress) {
                showToast('⏳ Purchase in progress. Please wait.', 'info');
                return;
            }
            
            const planId = this.dataset.planId;
            const plan = PLANS.find(p => p.id === planId);
            if (!plan) return;
            
            document.querySelectorAll('.package-card').forEach(c => c.classList.remove('selected'));
            const parentCard = this.closest('.package-card');
            if (parentCard) parentCard.classList.add('selected');
            
            if (DOM.selectedPlan) DOM.selectedPlan.value = plan.name;
            if (DOM.payAmount) {
                DOM.payAmount.value = plan.minAmount;
                DOM.payAmount.min = plan.minAmount;
            }
            
            const result = calculateStaking(plan.minAmount, currentRndPrice || 1, plan);
            if (DOM.totalRNDDisplay) {
                DOM.totalRNDDisplay.value = result.totalRND.toFixed(2) + ' RND';
            }
            if (DOM.dailyReleaseDisplay) {
                DOM.dailyReleaseDisplay.value = result.dailyRelease.toFixed(4) + ' RND';
            }
            if (DOM.buyBtn) {
                DOM.buyBtn.innerHTML = `<i class="bi bi-check-circle me-1"></i>Buy ${plan.name}`;
            }
        });
    });
}

// ============================================================
// FORM LISTENERS
// ============================================================

function attachFormListeners() {
    if (DOM.payAmount) {
        DOM.payAmount.addEventListener('input', function() {
            const planName = DOM.selectedPlan?.value;
            if (!planName || planName === 'None') {
                if (DOM.totalRNDDisplay) DOM.totalRNDDisplay.value = '0 RND';
                if (DOM.dailyReleaseDisplay) DOM.dailyReleaseDisplay.value = '0 RND';
                return;
            }
            const plan = PLANS.find(p => p.name === planName);
            if (!plan) return;
            const amount = parseFloat(this.value);
            if (!amount || amount < plan.minAmount) {
                if (DOM.totalRNDDisplay) DOM.totalRNDDisplay.value = '0 RND';
                if (DOM.dailyReleaseDisplay) DOM.dailyReleaseDisplay.value = '0 RND';
                return;
            }
            const result = calculateStaking(amount, currentRndPrice || 1, plan);
            if (DOM.totalRNDDisplay) {
                DOM.totalRNDDisplay.value = result.totalRND.toFixed(2) + ' RND';
            }
            if (DOM.dailyReleaseDisplay) {
                DOM.dailyReleaseDisplay.value = result.dailyRelease.toFixed(4) + ' RND';
            }
        });
    }
    
    if (DOM.buyForm) {
        DOM.buyForm.addEventListener('submit', handlePurchase);
    }
}

// ============================================================
// ✅ INVOICE FUNCTION - Open invoice after purchase
// ============================================================

function openInvoice(plan, amount, result, packageResult) {
    try {
        const invoiceData = {
            name: currentUserData.name || 'User',
            username: currentUserData.username || currentUserData.referralCode || 'user',
            email: currentUserData.email || 'N/A',
            plan: plan.name,
            amount: amount,
            rnd: result.totalRND,
            daily: result.dailyRelease,
            days: plan.days,
            bonus: plan.bonus,
            price: currentRndPrice || 1,
            pid: packageResult.packageId,
            ts: Date.now()
        };

        // Build URL with parameters
        const params = new URLSearchParams(invoiceData);
        const invoiceUrl = `invoice.html?${params.toString()}`;
        
        // Open in new window
        window.open(invoiceUrl, '_blank', 'width=900,height=700,scrollbars=yes');
        
        log('✅ Invoice opened successfully');
    } catch (invoiceError) {
        logError('Invoice error (non-critical):', invoiceError);
    }
}

// ============================================================
// PURCHASE HANDLER
// ============================================================

async function handlePurchase(e) {
    e.preventDefault();
    
    if (purchaseInProgress) {
        showToast('⏳ Purchase already in progress. Please wait...', 'info');
        return;
    }
    
    if (!DOM.selectedPlan || !DOM.selectedPlan.value || DOM.selectedPlan.value === 'None') {
        showToast('❌ Please select a plan first!', 'error');
        return;
    }
    
    const plan = PLANS.find(p => p.name === DOM.selectedPlan.value);
    if (!plan) {
        showToast('❌ Invalid plan selected!', 'error');
        return;
    }
    
    const amount = parseFloat(DOM.payAmount?.value || 0);
    if (!amount || amount < plan.minAmount) {
        showToast(`❌ Minimum investment for ${plan.name} is $${plan.minAmount} USDT!`, 'error');
        return;
    }
    
    const walletType = DOM.payFrom?.value || 'depositWallet';
    
    // UI balance check only
    const balance = currentUserData[walletType] || 0;
    if (balance < amount) {
        const walletLabel = walletType === 'depositWallet' ? 'Deposit Wallet' : 'Referral Wallet';
        showToast(`❌ Insufficient balance in ${walletLabel}! You have $${balance.toFixed(2)}, need $${amount.toFixed(2)}`, 'error');
        return;
    }
    
    // Start purchase
    purchaseInProgress = true;
    if (DOM.buyBtn) {
        DOM.buyBtn.disabled = true;
        DOM.buyBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Processing...';
    }
    
    try {
        const result = calculateStaking(amount, currentRndPrice || 1, plan);
        log(`Staking calculation: ${amount} USDT → ${result.totalRND} RND`);
        
        // ✅ Step 1: Debit wallet using wallet-service.js
        log(`Debiting ${amount} USDT from ${walletType}...`);
        const operationId = `purchase_${plan.id}_${Date.now()}`;
        
        const debitResult = await debitWallet(
            currentUserId,
            walletType,
            amount,
            `Package purchase: ${plan.name}`,
            { 
                operationId: operationId,
                planId: plan.id,
                planName: plan.name
            }
        );
        
        if (!debitResult.success) {
            showToast(`❌ ${debitResult.error || 'Failed to debit wallet'}`, 'error');
            resetPurchaseState();
            return;
        }
        
        log(`✅ Wallet debited: ${amount} USDT, transaction: ${debitResult.transactionId}`);
        
        // ✅ Step 2: Create package using package-service.js
        log('Creating package...');
        const packageResult = await createPackage(
            currentUserId,
            plan,
            amount,
            result,
            currentRndPrice || 1,
            walletType,
            operationId,
            debitResult.transactionId
        );
        
        if (!packageResult.success) {
            // ✅ Step 3: Rollback - Credit wallet back
            log('Rolling back: Crediting wallet...');
            await creditWallet(
                currentUserId,
                walletType,
                amount,
                `Rollback: Package creation failed for ${plan.name}`,
                {
                    operationId: `rollback_${operationId}`,
                    originalOperationId: operationId
                }
            );
            showToast(`❌ ${packageResult.error || 'Failed to create package'}`, 'error');
            resetPurchaseState();
            return;
        }
        
        log(`✅ Package created: ${packageResult.packageId}`);
        
        // ✅ Step 4: Distribute referral commission (non-critical)
        try {
            log('Distributing referral commission...');
            const commissionResult = await distributeReferralCommission(
                currentUserId,
                amount,
                currentRndPrice || 1,
                packageResult.packageId
            );
            
            if (commissionResult.successCount > 0) {
                log(`✅ ${commissionResult.successCount} commissions credited, total: ${commissionResult.totalCommission} USDT`);
            }
        } catch (commissionError) {
            logError('Commission distribution error (non-critical):', commissionError);
        }
        
        // ✅ Step 5: OPEN INVOICE (New Feature)
        setTimeout(() => {
            openInvoice(plan, amount, result, packageResult);
        }, 500);
        
        showToast(`✅ ${plan.name} purchased! ${result.totalRND.toFixed(2)} RND locked. Daily release: ${result.dailyRelease.toFixed(4)} RND from tomorrow.`, 'success');
        
        if (DOM.buyBtn) {
            DOM.buyBtn.classList.add('success-animation');
        }
        
        setTimeout(() => {
            resetPurchaseState();
        }, 2000);
        
    } catch (error) {
        logError('Purchase error:', error);
        showToast(`❌ Error purchasing plan: ${error.message || 'Please try again.'}`, 'error');
        resetPurchaseState();
    }
}

// ============================================================
// UI STATE MANAGEMENT
// ============================================================

function showLoading(message) {
    if (DOM.loadingStatus) DOM.loadingStatus.textContent = message || 'Loading...';
    if (DOM.loadingState) DOM.loadingState.style.display = 'block';
    if (DOM.errorState) DOM.errorState.style.display = 'none';
    if (DOM.packageContent) DOM.packageContent.style.display = 'none';
}

function showContent() {
    if (DOM.loadingState) DOM.loadingState.style.display = 'none';
    if (DOM.errorState) DOM.errorState.style.display = 'none';
    if (DOM.packageContent) DOM.packageContent.style.display = 'block';
}

function showError(message) {
    if (DOM.errorMessage) DOM.errorMessage.textContent = message || 'An error occurred. Please try again.';
    if (DOM.errorState) DOM.errorState.style.display = 'block';
    if (DOM.loadingState) DOM.loadingState.style.display = 'none';
    if (DOM.packageContent) DOM.packageContent.style.display = 'none';
}

function resetPurchaseState() {
    purchaseInProgress = false;
    if (DOM.buyBtn) {
        DOM.buyBtn.disabled = false;
        const planName = DOM.selectedPlan?.value || 'Package';
        DOM.buyBtn.innerHTML = `<i class="bi bi-check-circle me-1"></i>Buy ${planName}`;
        DOM.buyBtn.classList.remove('success-animation');
    }
}

// ============================================================
// EVENT LISTENERS
// ============================================================

function setupEventListeners() {
    if (DOM.supportLink && !DOM.supportLink._listenerAttached) {
        DOM.supportLink._listenerAttached = true;
        DOM.supportLink.addEventListener('click', (e) => {
            e.preventDefault();
            window.open('support.html', '_blank', 'noopener,noreferrer');
        });
    }
    
    if (DOM.logoutBtn && !DOM.logoutBtn._listenerAttached) {
        DOM.logoutBtn._listenerAttached = true;
        DOM.logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await signOut();
        });
    }
}

// ============================================================
// CLEANUP
// ============================================================

window.addEventListener('beforeunload', () => {
    if (unsubscribeRealtime) {
        off(ref(db, 'users/' + currentUserId));
        unsubscribeRealtime = null;
    }
    if (unsubscribePrice) {
        off(ref(db, 'settings/rate'));
        unsubscribePrice = null;
    }
});

// ============================================================
// AUTH STATE OBSERVER
// ============================================================

onAuthChange(async (user) => {
    if (!user) {
        if (unsubscribeRealtime) {
            off(ref(db, 'users/' + currentUserId));
            unsubscribeRealtime = null;
        }
        if (unsubscribePrice) {
            off(ref(db, 'settings/rate'));
            unsubscribePrice = null;
        }
        currentUserId = null;
        window.location.href = 'login.html';
        return;
    }
    
    await loadPackagePage(user);
});

// ============================================================
// EXPOSE GLOBALLY
// ============================================================

window.loadPackagePage = loadPackagePage;
window.showToast = showToast;
window.PLANS = PLANS;

export { PLANS, loadPackagePage };