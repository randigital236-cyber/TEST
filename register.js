// register.js - FINAL VERSION
import { auth, db } from './firebase.js';
import {
    createUserWithEmailAndPassword,
    updateProfile,
    onAuthStateChanged
} from "firebase/auth";
import {
    ref,
    set,
    get,
    update
} from "firebase/database";

// ============================================================
// REFERRAL CODE FROM URL
// ============================================================
let referralCodeFromURL = '';

function getReferralFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode) {
        referralCodeFromURL = refCode;
        return refCode;
    }
    return '';
}

// Auto-fill referral from URL
const refFromURL = getReferralFromURL();
if (refFromURL) {
    document.getElementById('regRef').value = refFromURL;
    document.getElementById('referralNoticeText').textContent = '✅ Referral code auto-filled from link!';
    document.getElementById('referralNotice').className = 'referral-notice active';
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast-custom ${type}`;
    const icon = type === 'success' ? 'bi-check-circle-fill text-success' : 'bi-exclamation-triangle-fill text-danger';
    toast.innerHTML = `<i class="bi ${icon}"></i><span class="toast-msg">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 6000);
}

// ============================================================
// REFERRAL INPUT HANDLER
// ============================================================
document.getElementById('regRef').addEventListener('input', function() {
    const val = this.value.trim();
    if (val) {
        document.getElementById('referralNoticeText').textContent = '📌 Referral code: ' + val;
        document.getElementById('referralNotice').className = 'referral-notice active';
    } else {
        document.getElementById('referralNoticeText').textContent = 'Enter referrer\'s User ID if you have one';
        document.getElementById('referralNotice').className = 'referral-notice';
    }
});

// ============================================================
// VALIDATE REFERRAL CODE USING INDEX
// ============================================================
async function validateReferralCode(referralCode) {
    try {
        const refSnap = await get(ref(db, 'referralIndex/' + referralCode));
        if (refSnap.exists()) {
            const data = refSnap.val();
            return data.uid || data; // Support both old and new format
        }
        return null;
    } catch (error) {
        console.error('Error validating referral code:', error);
        return null;
    }
}

// ============================================================
// UPDATE REFERRER (With teamStructure.level1)
// ============================================================
async function updateReferrer(referralCode, newUserUid, newUserName) {
    try {
        // Get referrer UID from index
        const referrerUid = await validateReferralCode(referralCode);
        if (!referrerUid) {
            console.log('❌ Referrer not found');
            return;
        }

        console.log('✅ Referrer found:', referrerUid);

        // Get referrer data
        const referrerSnap = await get(ref(db, 'users/' + referrerUid));
        if (!referrerSnap.exists()) {
            console.log('❌ Referrer data not found');
            return;
        }
        const referrerData = referrerSnap.val();

        // Update direct referrals
        const directRefs = referrerData.directReferrals || {};
        directRefs[newUserUid] = {
            uid: newUserUid,
            name: newUserName,
            joinedAt: Date.now()
        };

        // Update teamStructure
        const teamStructure = referrerData.teamStructure || {
            level1: 0,
            level2: 0,
            level3: 0,
            level4: 0,
            level5: 0
        };
        teamStructure.level1 = (teamStructure.level1 || 0) + 1;

        // Update referrer
        await update(ref(db, 'users/' + referrerUid), {
            totalReferrals: (referrerData.totalReferrals || 0) + 1,
            downline: (referrerData.downline || 0) + 1,
            directReferrals: directRefs,
            teamStructure: teamStructure
        });

        console.log('✅ Referrer updated successfully!');
        console.log('   - totalReferrals:', (referrerData.totalReferrals || 0) + 1);
        console.log('   - downline:', (referrerData.downline || 0) + 1);
        console.log('   - teamStructure.level1:', teamStructure.level1);

    } catch (error) {
        console.error('❌ Error updating referrer:', error);
    }
}

// ============================================================
// EMAIL REGISTRATION - FINAL
// ============================================================
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPassword').value;
    const refCode = document.getElementById('regRef').value.trim();
    const registerBtn = document.getElementById('registerBtn');

    // ============================================================
    // VALIDATION
    // ============================================================
    if (!name || name.length < 2) {
        showToast('❌ Please enter your full name', 'error');
        return;
    }
    if (!email || !email.includes('@')) {
        showToast('❌ Please enter a valid email address', 'error');
        return;
    }
    if (pass.length < 6) {
        showToast('❌ Password must be at least 6 characters long!', 'error');
        return;
    }

    // Validate referral code if provided
    if (refCode) {
        const referrerUid = await validateReferralCode(refCode);
        if (!referrerUid) {
            showToast('❌ Invalid referral code. Please check and try again.', 'error');
            return;
        }
        console.log('✅ Referral code validated:', refCode, '→', referrerUid);
    }

    registerBtn.disabled = true;
    registerBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creating Account...';

    try {
        // ============================================================
        // STEP 1: Create user in Firebase Auth
        // ============================================================
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        const uid = cred.user.uid;
        await updateProfile(auth.currentUser, { displayName: name });
        console.log('✅ User created with UID:', uid);

        // ============================================================
        // STEP 2: Final referral code
        // ============================================================
        const finalRefCode = refCode || referralCodeFromURL || '';

        // ============================================================
        // STEP 3: USER DATA (COMPLETE - Dashboard Ready)
        // ============================================================
        const userData = {
            // Basic Info
            uid: uid,
            username: uid,
            name: name,
            email: email,
            referralCode: uid,
            referredBy: finalRefCode,
            role: 'user',
            rank: 'Member',
            status: 'active',
            banned: false,
            createdAt: Date.now(),
            lastLogin: Date.now(),
            
            // Wallets
            wallets: {
                deposit: 0,
                reward: 0,
                release: 0,
                referral: 0,
                rnd: 0,
                lockedRND: 0
            },
            
            // Referral System
            totalReferrals: 0,
            downline: 0,
            teamStructure: {
                level1: 0,
                level2: 0,
                level3: 0,
                level4: 0,
                level5: 0
            },
            directReferrals: {},
            
            // Packages & Investments
            packages: {},
            totalStake: 0,
            teamBusiness: 0,
            
            // Earnings
            referralEarnings: 0,
            level1Earnings: 0,
            level2Earnings: 0,
            level3Earnings: 0,
            level4Earnings: 0,
            level5Earnings: 0,
            totalReward: 0,
            totalReleased: 0,
            totalWithdrawn: 0,
            
            // History
            transactions: {},
            transferHistory: {},
            commissionHistory: {}
        };

        console.log('💾 Saving user data...');

        // ============================================================
        // STEP 4: Save to database
        // ============================================================
        
        // 4a: Save user data
        await set(ref(db, 'users/' + uid), userData);
        console.log('✅ User data saved');

        // 4b: Save to username index
        await set(ref(db, 'usernames/' + uid), {
            uid: uid,
            name: name,
            email: email,
            createdAt: Date.now()
        });
        console.log('✅ Username index saved');

        // 4c: Save to referral index (with createdAt)
        await set(ref(db, 'referralIndex/' + uid), {
            uid: uid,
            createdAt: Date.now()
        });
        console.log('✅ Referral index saved');

        // 4d: Save to email index (for fast login)
        const emailKey = email.replace(/[.#$\/\[\]]/g, '_');
        await set(ref(db, 'emailIndex/' + emailKey), {
            uid: uid,
            email: email,
            createdAt: Date.now()
        });
        console.log('✅ Email index saved');

        // ============================================================
        // STEP 5: UPDATE REFERRER
        // ============================================================
        if (finalRefCode) {
            console.log('🔗 Updating referrer...');
            await updateReferrer(finalRefCode, uid, name);
        } else {
            console.log('ℹ️ No referral code provided');
        }

        // ============================================================
        // STEP 6: Update lastLogin
        // ============================================================
        await update(ref(db, 'users/' + uid), {
            lastLogin: Date.now()
        });

        // ============================================================
        // STEP 7: Save to localStorage
        // ============================================================
        localStorage.setItem('uid', uid);
        localStorage.setItem('userId', uid);
        localStorage.setItem('userName', name);
        localStorage.setItem('userEmail', email);
        localStorage.setItem('loggedIn', 'true');
        console.log('✅ LocalStorage updated');

        // ============================================================
        // STEP 8: Success
        // ============================================================
        showToast('✅ Account created successfully! Welcome ' + name + '!', 'success');

        // Redirect to dashboard
        window.location.href = 'dashboard.html';

    } catch (err) {
        console.error('❌ Registration Error:', err);
        let msg = 'Registration failed. Please try again.';
        if (err.code === 'auth/email-already-in-use') {
            msg = '❌ This email is already registered.';
        } else if (err.code === 'auth/weak-password') {
            msg = '❌ Password must be at least 6 characters.';
        } else if (err.code === 'auth/invalid-email') {
            msg = '❌ Please enter a valid email address.';
        } else if (err.code === 'auth/network-request-failed') {
            msg = '❌ Network error. Please check your connection.';
        }
        showToast(msg, 'error');
    }

    registerBtn.disabled = false;
    registerBtn.innerHTML = 'Create Account <i class="bi bi-arrow-right ms-2"></i>';
});

// ============================================================
// CHECK IF USER IS ALREADY LOGGED IN
// ============================================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log('ℹ️ User already logged in, redirecting to dashboard');
        window.location.href = 'dashboard.html';
    }
});
