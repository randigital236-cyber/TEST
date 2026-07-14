// ============================================================
// RND STAKING PLATFORM V2 - REGISTER.JS
// ============================================================
// 📌 PROJECT: mywebsite-600d3
// 📌 RULE: Firebase Auth UID = User ID = Referral Code
// 📌 RULE: NO get(ref(db,'users')) - Only Direct Path Reads
// ============================================================

import { 
    auth, 
    database,
    createUserWithEmailAndPassword,
    updateProfile,
    onAuthStateChanged,
    ref,
    set,
    get,
    runTransaction,
    serverTimestamp,
    getCurrentTimestamp,
    getCurrentDate,
    validateEmail,
    validatePassword,
    validateName,
    validatePasswordMatch,
    generateTransactionID,
    hashEmail,
    isUsernameAvailable,
    verifyReferral,
    saveUserWithIndexes,
    createBackup,
    createTransaction,
    createLog
} from './firebase.js';

// ============================================================
// 🔥 DOM REFERENCES
// ============================================================
const form = document.getElementById('registerForm');
const nameInput = document.getElementById('regName');
const emailInput = document.getElementById('regEmail');
const passwordInput = document.getElementById('regPassword');
const confirmPasswordInput = document.getElementById('regConfirmPassword');
const referralInput = document.getElementById('regRef');
const registerBtn = document.getElementById('registerBtn');
const referralNotice = document.getElementById('referralNotice');
const referralNoticeText = document.getElementById('referralNoticeText');
const toastContainer = document.getElementById('toastContainer');

// ============================================================
// 🔥 URL REFERRAL CODE
// ============================================================
let referralCodeFromURL = '';

function getReferralFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) {
        referralCodeFromURL = ref;
        referralInput.value = ref;
        referralNotice.className = 'referral-notice active';
        referralNoticeText.textContent = '✅ Referral code auto-filled from link!';
        console.log('✅ Referral code from URL:', ref);
    }
}
getReferralFromURL();

// ============================================================
// 🔥 REFERRAL INPUT LISTENER
// ============================================================
referralInput.addEventListener('input', function() {
    const val = this.value.trim();
    if (val) {
        referralNotice.className = 'referral-notice active';
        referralNoticeText.textContent = '📌 Referral code: ' + val;
    } else {
        referralNotice.className = 'referral-notice';
        referralNoticeText.textContent = 'Enter referrer\'s User ID if you have one';
    }
});

// ============================================================
// 🔥 TOAST FUNCTION
// ============================================================
function showToast(message, type = 'success') {
    if (!toastContainer) {
        console.error('Toast container not found');
        return;
    }
    
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
// 🔥 SET LOADING STATE
// ============================================================
function setLoading(isLoading) {
    if (!registerBtn) return;
    if (isLoading) {
        registerBtn.disabled = true;
        registerBtn.innerHTML = `
            <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
            Creating Account...
        `;
    } else {
        registerBtn.disabled = false;
        registerBtn.innerHTML = 'Create Account <i class="bi bi-arrow-right ms-2"></i>';
    }
}

// ============================================================
// 🔥 UPDATE REFERRER (LEVEL 1 ONLY)
// ============================================================
async function updateReferrer(referralCode, newUserUid, newUserName) {
    try {
        console.log('🔄 Updating referrer with code:', referralCode);
        
        // ✅ Verify referral (direct path - referralCode is UID)
        const refResult = await verifyReferral(referralCode);
        if (!refResult.valid) {
            console.log('ℹ️ Referrer not found - skipping referral update');
            return { success: false, error: refResult.error };
        }
        
        const referrerUid = refResult.uid;
        const referrerData = refResult.user;
        
        // ✅ Update referrer using transaction
        const referrerRef = ref(database, 'users/' + referrerUid);
        
        const result = await runTransaction(referrerRef, (currentData) => {
            if (!currentData) return currentData;
            
            // ✅ Add to direct referrals
            const directRefs = currentData.directReferrals || {};
            if (!directRefs[newUserUid]) {
                directRefs[newUserUid] = {
                    uid: newUserUid,
                    name: newUserName,
                    joinedAt: serverTimestamp()
                };
            }
            
            // ✅ Update team structure level 1
            const ts = currentData.teamStructure || { 
                level1: 0, level2: 0, level3: 0, level4: 0, level5: 0 
            };
            ts.level1 = (ts.level1 || 0) + 1;
            
            currentData.totalReferrals = (currentData.totalReferrals || 0) + 1;
            currentData.downline = (currentData.downline || 0) + 1;
            currentData.directReferrals = directRefs;
            currentData.teamStructure = ts;
            
            return currentData;
        });
        
        if (result.committed) {
            console.log('✅ Referrer updated successfully');
            
            // ✅ Create backup for referrer
            await createBackup(referrerUid, 'referral_commission', {
                newReferral: newUserUid,
                newReferralName: newUserName
            });
            
            // ✅ Create transaction for referrer
            await createTransaction(referrerUid, 'referral', {
                type: 'new_referral',
                referralUid: newUserUid,
                referralName: newUserName,
                totalReferrals: (referrerData.totalReferrals || 0) + 1
            });
            
            return { success: true };
        }
        
        return { success: false, error: 'Transaction not committed' };
        
    } catch (error) {
        console.error('❌ Error updating referrer:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// 🔥 REGISTER USER
// ============================================================
async function registerUser(event) {
    event.preventDefault();
    
    // ============================================================
    // STEP 1: GET FORM VALUES
    // ============================================================
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    const refCode = referralInput.value.trim();
    
    console.log('📝 Registration started for:', email);
    
    // ============================================================
    // STEP 2: VALIDATE FORM
    // ============================================================
    
    // Validate Name
    const nameValidation = validateName(name);
    if (!nameValidation.valid) {
        showToast('❌ ' + nameValidation.message, 'error');
        nameInput.focus();
        return;
    }
    
    // Validate Email
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
        showToast('❌ ' + emailValidation.message, 'error');
        emailInput.focus();
        return;
    }
    
    // Validate Password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
        showToast('❌ ' + passwordValidation.message, 'error');
        passwordInput.focus();
        return;
    }
    
    // Validate Password Match
    const matchValidation = validatePasswordMatch(password, confirmPassword);
    if (!matchValidation.valid) {
        showToast('❌ ' + matchValidation.message, 'error');
        confirmPasswordInput.focus();
        return;
    }
    
    // ============================================================
    // STEP 3: CHECK USERNAME AVAILABILITY
    // ============================================================
    const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    const availability = await isUsernameAvailable(username);
    if (!availability.available) {
        showToast('❌ Username "' + username + '" is already taken. Please try another email.', 'error');
        emailInput.focus();
        return;
    }
    
    // ============================================================
    // STEP 4: DISABLE BUTTON & SHOW LOADING
    // ============================================================
    setLoading(true);
    
    try {
        // ============================================================
        // STEP 5: CREATE USER IN FIREBASE AUTH
        // ============================================================
        console.log('🔐 Creating Firebase Auth user...');
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const uid = user.uid;
        
        console.log('✅ Auth user created. UID:', uid);
        
        // Update profile
        await updateProfile(user, { displayName: name });
        
        // ============================================================
        // STEP 6: DETERMINE REFERRAL CODE
        // ============================================================
        // ✅ Referral Code = Firebase Auth UID
        const referralCode = uid;
        const finalRefCode = refCode || referralCodeFromURL || '';
        
        console.log('📌 Referral Code:', referralCode);
        console.log('📌 Referred By:', finalRefCode || 'None');
        
        // ============================================================
        // STEP 7: SAVE USER DATA TO DATABASE
        // ============================================================
        console.log('💾 Saving user data to database...');
        
        const timestamp = getCurrentTimestamp();
        const date = getCurrentDate();
        
        const userData = {
            uid: uid,
            name: name,
            email: email,
            username: username,
            referralCode: referralCode,
            referredBy: finalRefCode || '',
            rank: 'Member',
            role: 'user',
            status: 'active',
            createdAt: timestamp,
            lastLogin: timestamp,
            depositWallet: 0,
            referralWallet: 0,
            rndWallet: 0,
            lockedRND: 0,
            releaseWallet: 0,
            totalReleased: 0,
            totalStake: 0,
            totalReferrals: 0,
            downline: 0,
            teamBusiness: 0,
            teamStructure: { level1: 0, level2: 0, level3: 0, level4: 0, level5: 0 },
            directReferrals: {},
            packages: {},
            transactions: {},
            transferHistory: [],
            commissionHistory: [],
            level1Earnings: 0,
            level2Earnings: 0,
            level3Earnings: 0,
            level4Earnings: 0,
            level5Earnings: 0,
            referralEarnings: 0
        };
        
        // ✅ Save user with indexes
        const saveResult = await saveUserWithIndexes(uid, userData);
        if (!saveResult.success) {
            throw new Error(saveResult.error || 'Failed to save user data');
        }
        
        console.log('✅ User data saved to database');
        
        // ============================================================
        // STEP 8: CREATE BACKUP
        // ============================================================
        await createBackup(uid, 'registration', {
            name: name,
            email: email,
            username: username,
            referralCode: referralCode,
            referredBy: finalRefCode
        });
        
        // ============================================================
        // STEP 9: CREATE WELCOME TRANSACTION
        // ============================================================
        await createTransaction(uid, 'registration', {
            name: name,
            email: email,
            referralCode: referralCode,
            referredBy: finalRefCode || 'None'
        });
        
        // ============================================================
        // STEP 10: UPDATE REFERRER (IF REFERRAL EXISTS)
        // ============================================================
        if (finalRefCode) {
            console.log('🔗 Updating referrer...');
            try {
                const refUpdateResult = await updateReferrer(finalRefCode, uid, name);
                if (refUpdateResult.success) {
                    console.log('✅ Referrer updated successfully');
                } else {
                    console.log('⚠️ Referrer update skipped:', refUpdateResult.error);
                }
            } catch (refError) {
                console.error('⚠️ Referral update failed:', refError);
                // ✅ Registration continues even if referral update fails
            }
        } else {
            console.log('ℹ️ No referral code provided');
        }
        
        // ============================================================
        // STEP 11: CREATE LOG
        // ============================================================
        await createLog('info', 'New user registered', {
            uid: uid,
            name: name,
            email: email,
            username: username,
            referredBy: finalRefCode || 'None'
        });
        
        // ============================================================
        // STEP 12: SUCCESS
        // ============================================================
        console.log('✅ Registration completed successfully');
        showToast('🎉 Account created successfully! Welcome ' + name + '!', 'success');
        
        // Reset form
        form.reset();
        referralNotice.className = 'referral-notice';
        referralNoticeText.textContent = 'Enter referrer\'s User ID if you have one';
        
        // ============================================================
        // STEP 13: REDIRECT TO DASHBOARD
        // ============================================================
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 2000);
        
    } catch (error) {
        // ============================================================
        // STEP 14: ERROR HANDLING
        // ============================================================
        console.error('❌ Registration Error:', error);
        
        let errorMessage = 'Registration failed. Please try again.';
        
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = '❌ This email is already registered. Please login.';
                break;
            case 'auth/weak-password':
                errorMessage = '❌ Password must be at least 6 characters.';
                break;
            case 'auth/invalid-email':
                errorMessage = '❌ Please enter a valid email address.';
                break;
            case 'auth/too-many-requests':
                errorMessage = '❌ Too many attempts. Please try again later.';
                break;
            case 'auth/network-request-failed':
                errorMessage = '❌ Network error. Please check your connection.';
                break;
            case 'auth/internal-error':
                errorMessage = '❌ Internal error. Please try again.';
                break;
            default:
                errorMessage = '❌ ' + (error.message || 'Registration failed. Please try again.');
        }
        
        showToast(errorMessage, 'error');
        
        // ✅ Create error log
        await createLog('error', 'Registration failed', {
            email: email,
            errorCode: error.code,
            errorMessage: error.message
        });
        
    } finally {
        // ============================================================
        // STEP 15: RE-ENABLE BUTTON
        // ============================================================
        setLoading(false);
    }
}

// ============================================================
// 🔥 FORM SUBMIT LISTENER
// ============================================================
if (form) {
    form.addEventListener('submit', registerUser);
}

// ============================================================
// 🔥 AUTH STATE LISTENER (Redirect if already logged in)
// ============================================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log('👤 User already logged in:', user.uid);
        // Uncomment to redirect if already logged in
        // window.location.href = 'dashboard.html';
    }
});

// ============================================================
// 🔥 KEYBOARD SHORTCUT: Enter to Submit
// ============================================================
document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
        const form = event.target.closest('form');
        if (form && form.id === 'registerForm') {
            event.preventDefault();
            form.dispatchEvent(new Event('submit'));
        }
    }
});

// ============================================================
// 🔥 INIT LOG
// ============================================================
console.log('✅ Register module loaded successfully');
console.log('📌 Project: mywebsite-600d3');
console.log('📌 Phase: 1 - Registration Module');
console.log('📌 Rule: Firebase Auth UID = User ID = Referral Code');