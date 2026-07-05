/**
 * Package UI - Render and Event Handling
 */

import { db } from './firebase-init.js';
import { ref, onValue } from "firebase/database";
import { showToast } from './toast.js';
import { formatDate } from './utils.js';
import { PLANS, calculateStaking, checkDuplicatePurchase, processAtomicPurchase } from './package-service.js';
import { distributeReferralCommission } from './commission-service.js';

let purchaseInProgress = false;

// ============================================================
// RENDER PACKAGE UI
// ============================================================

export function renderPackageUI(container, data) {
    const { userData, packageHistory, rndPrice } = data;
    
    const depositWallet = userData.depositWallet || 0;
    const referralWallet = userData.referralWallet || 0;
    const rndWallet = userData.rndWallet || 0;
    const lockedRND = userData.lockedRND || 0;
    const releaseWallet = userData.releaseWallet || 0;

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

    container.innerHTML = `
        <div class="row g-4">
            <div class="col-12">
                <div class="d-flex flex-wrap justify-content-between align-items-center">
                    <h4 class="fw-bold"><i class="bi bi-box-seam text-success me-2"></i>Buy Package</h4>
                    <span class="rnd-price-badge"><i class="bi bi-currency-dollar"></i> 1 RND = $${(rndPrice || 1).toFixed(4)}</span>
                </div>
                <hr class="border-secondary">
            </div>

            <!-- Wallets -->
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

            <!-- Plans -->
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

            <!-- Confirm Form -->
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

            <!-- Package History -->
            <div class="col-12">
                <div class="card-glass">
                    <div class="card-title"><i class="bi bi-clock-history text-success me-2"></i>Package History</div>
                    ${packageHistory.length === 0 ? `
                        <div class="text-center text-muted py-4">
                            <i class="bi bi-box-seam fs-1 d-block mb-2"></i>
                            <p>No packages purchased yet.</p>
                        </div>
                    ` : `<div class="package-history">${packagesHtml}</div>`}
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// ATTACH PLAN LISTENERS
// ============================================================

export function attachPlanListeners(plans, rndPrice) {
    document.querySelectorAll('.plan-cta').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (purchaseInProgress) {
                showToast('⏳ Purchase in progress. Please wait.', 'info');
                return;
            }
            
            const planId = this.dataset.planId;
            const plan = plans.find(p => p.id === planId);
            if (!plan) return;
            
            document.querySelectorAll('.package-card').forEach(c => c.classList.remove('selected'));
            const parentCard = this.closest('.package-card');
            if (parentCard) parentCard.classList.add('selected');
            
            document.getElementById('selectedPlan').value = plan.name;
            document.getElementById('payAmount').value = plan.minAmount;
            document.getElementById('payAmount').min = plan.minAmount;
            const result = calculateStaking(plan.minAmount, rndPrice || 1, plan);
            document.getElementById('totalRNDDisplay').value = result.totalRND.toFixed(2) + ' RND';
            document.getElementById('dailyReleaseDisplay').value = result.dailyRelease.toFixed(4) + ' RND';
            document.getElementById('buyBtn').innerHTML = `<i class="bi bi-check-circle me-1"></i>Buy ${plan.name}`;
        });
    });
}

// ============================================================
// ATTACH FORM LISTENERS
// ============================================================

export function attachFormListeners(context) {
    const { userId, userData, rndPrice, plans } = context;
    
    // Amount input real-time calculation
    const payAmountInput = document.getElementById('payAmount');
    if (payAmountInput) {
        payAmountInput.addEventListener('input', function() {
            const planName = document.getElementById('selectedPlan').value;
            if (planName === 'None') {
                document.getElementById('totalRNDDisplay').value = '0 RND';
                document.getElementById('dailyReleaseDisplay').value = '0 RND';
                return;
            }
            const plan = plans.find(p => p.name === planName);
            if (!plan) return;
            const amount = parseFloat(this.value);
            if (!amount || amount < plan.minAmount) {
                document.getElementById('totalRNDDisplay').value = '0 RND';
                document.getElementById('dailyReleaseDisplay').value = '0 RND';
                return;
            }
            const result = calculateStaking(amount, rndPrice || 1, plan);
            document.getElementById('totalRNDDisplay').value = result.totalRND.toFixed(2) + ' RND';
            document.getElementById('dailyReleaseDisplay').value = result.dailyRelease.toFixed(4) + ' RND';
        });
    }
    
    // Form submit
    const buyForm = document.getElementById('buyForm');
    if (buyForm) {
        buyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (purchaseInProgress) {
                showToast('⏳ Purchase already in progress. Please wait...', 'info');
                return;
            }
            
            const planName = document.getElementById('selectedPlan').value;
            let payAmount = parseFloat(document.getElementById('payAmount').value);
            const payFrom = document.getElementById('payFrom').value;
            const buyBtn = document.getElementById('buyBtn');

            if (!planName || planName === 'None') { 
                showToast('❌ Please select a plan first!', 'error'); 
                return; 
            }

            const plan = plans.find(p => p.name === planName);
            if (!plan) { 
                showToast('❌ Invalid plan selected!', 'error'); 
                return; 
            }
            
            if (!payAmount || payAmount < plan.minAmount) { 
                showToast(`❌ Minimum investment for ${plan.name} is $${plan.minAmount} USDT!`, 'error'); 
                return; 
            }
            
            // Validate balance
            const balance = userData[payFrom] || 0;
            if (balance < payAmount) {
                showToast(`❌ Insufficient balance! You have $${balance.toFixed(2)}, need $${payAmount.toFixed(2)}`, 'error');
                return;
            }

            purchaseInProgress = true;
            buyBtn.disabled = true;
            buyBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Processing...';

            try {
                const result = calculateStaking(payAmount, rndPrice || 1, plan);
                
                // Check duplicate
                const isDuplicate = checkDuplicatePurchase(userData, plan.id, payAmount, Date.now());
                if (isDuplicate) {
                    showToast('⚠️ Duplicate purchase detected. Please wait a moment.', 'error');
                    purchaseInProgress = false;
                    buyBtn.disabled = false;
                    buyBtn.innerHTML = `<i class="bi bi-check-circle me-1"></i>Buy ${planName}`;
                    return;
                }
                
                // Atomic Purchase
                const purchaseResult = await processAtomicPurchase(
                    userId, 
                    plan, 
                    payAmount, 
                    payFrom, 
                    result,
                    rndPrice
                );
                
                if (!purchaseResult.success) {
                    let errorMsg = '❌ Purchase failed!';
                    if (purchaseResult.error === 'Insufficient balance' || purchaseResult.error === 'Transaction aborted - insufficient balance') {
                        errorMsg = `❌ Insufficient balance! Please check your wallet.`;
                    } else {
                        errorMsg = '❌ ' + purchaseResult.error;
                    }
                    showToast(errorMsg, 'error');
                    purchaseInProgress = false;
                    buyBtn.disabled = false;
                    buyBtn.innerHTML = `<i class="bi bi-check-circle me-1"></i>Buy ${planName}`;
                    return;
                }
                
                // Referral Commission (only if purchase succeeded)
                try {
                    const commissionResult = await distributeReferralCommission(
                        userId, 
                        payAmount, 
                        rndPrice || 1,
                        purchaseResult.packageId
                    );
                    
                    if (commissionResult.failedCount > 0) {
                        console.warn(`⚠️ ${commissionResult.failedCount} referral commissions failed`);
                    }
                } catch (commissionError) {
                    console.warn('Referral commission error (non-critical):', commissionError);
                }

                showToast(`✅ ${plan.name} purchased! ${result.totalRND.toFixed(2)} RND locked. Daily release: ${result.dailyRelease.toFixed(4)} RND from tomorrow.`, 'success');
                
                buyBtn.classList.add('success-animation');
                
                setTimeout(() => { 
                    window.location.reload(); 
                }, 2500);

            } catch (error) {
                console.error('Purchase error:', error);
                showToast(`❌ Error purchasing plan: ${error.message || 'Please try again.'}`, 'error');
                purchaseInProgress = false;
                buyBtn.disabled = false;
                buyBtn.innerHTML = `<i class="bi bi-check-circle me-1"></i>Buy ${planName}`;
            }
        });
    }
}

// ============================================================
// REAL-TIME WALLET UPDATES
// ============================================================

export function updateWalletDisplays(uid) {
    const userRef = ref(db, 'users/' + uid);
    onValue(userRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const deposit = data.depositWallet || 0;
            const referral = data.referralWallet || 0;
            const rnd = data.rndWallet || 0;
            const locked = data.lockedRND || 0;
            
            const elDeposit = document.getElementById('walletDeposit');
            const elReferral = document.getElementById('walletReferral');
            const elRND = document.getElementById('walletRND');
            const elLocked = document.getElementById('walletLocked');
            
            if (elDeposit) elDeposit.textContent = '$' + deposit.toFixed(2);
            if (elReferral) elReferral.textContent = referral.toFixed(2) + ' USDT';
            if (elRND) elRND.textContent = rnd.toFixed(4) + ' RND';
            if (elLocked) elLocked.textContent = locked.toFixed(2) + ' RND';
        }
    });
}

// ============================================================
// SHOW ERROR STATE
// ============================================================

export function showErrorState(container, message) {
    container.innerHTML = `
        <div class="error-state">
            <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
            <h4>Error Loading Page</h4>
            <p>${message || 'Please check your internet connection.'}</p>
            <button class="btn btn-primary-custom mt-3" onclick="location.reload()" style="width:auto;padding:10px 30px;">
                <i class="bi bi-arrow-clockwise me-1"></i> Refresh
            </button>
        </div>
    `;
}