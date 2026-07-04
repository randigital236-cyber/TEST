// ============================================================
// 🔥 AUTHENTICATION - REGISTER, LOGIN, LOGOUT
// ============================================================
import { auth, db, LOGIN_URL, DASHBOARD_URL, REGISTER_URL } from "./firebase.js";
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged,
    signOut 
} from "firebase/auth";
import { ref, get, set, update, runTransaction } from "firebase/database";

// ============================================================
// 🔥 TOAST NOTIFICATION
// ============================================================
function showToast(message, type = 'error') {
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
// 🔥 AUTH STATE LISTENER
// ============================================================
onAuthStateChanged(auth, async (user) => {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const isLoginPage = currentPage === 'login.html';
    const isRegisterPage = currentPage === 'register.html';
    const isIndexPage = currentPage === 'index.html' || currentPage === '';

    if (user) {
        // If logged in and on login/register/index, redirect to dashboard
        if (isLoginPage || isRegisterPage || isIndexPage) {
            window.location.href = DASHBOARD_URL;
        }
    } else {
        // If not logged in and trying to access dashboard
        if (currentPage === 'dashboard.html') {
            window.location.href = LOGIN_URL;
        }
    }
});

// ============================================================
// 🔥 VALIDATE UID
// ============================================================
async function validateUID(uid) {
    if (!uid || uid.length < 10) return false;
    try {
        const userSnap = await get(ref(db, 'users/' + uid));
        return userSnap.exists();
    } catch (error) {
        console.error('UID Validation Error:', error);
        return false;
    }
}

// ============================================================
// 🔥 LOGIN
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;
            const btn = document.getElementById('loginBtn');

            if (!email || !password) {
                showToast('Please enter both email and password', 'error');
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Logging in...';

            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // Check if user exists in database
                const userSnap = await get(ref(db, 'users/' + user.uid));
                if (!userSnap.exists()) {
                    await signOut(auth);
                    showToast('User profile not found. Please register first.', 'error');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-2"></i>Login';
                    return;
                }

                const userData = userSnap.val();
                if (userData.banned === true) {
                    await signOut(auth);
                    showToast('Your account has been banned.', 'error');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-2"></i>Login';
                    return;
                }

                showToast('Login successful! Redirecting...', 'success');
                setTimeout(() => {
                    window.location.href = DASHBOARD_URL;
                }, 1000);

            } catch (error) {
                let msg = 'Login failed. Please check your credentials.';
                if (error.code === 'auth/user-not-found') msg = 'User not found. Please register first.';
                else if (error.code === 'auth/wrong-password') msg = 'Incorrect password. Please try again.';
                else if (error.code === 'auth/too-many-requests') msg = 'Too many attempts. Please try again later.';
                else if (error.code === 'auth/invalid-credential') msg = 'Invalid email or password.';
                showToast(msg, 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-2"></i>Login';
            }
        });
    }

    // ============================================================
    // 🔥 REGISTER
    // ============================================================
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('regName').value.trim();
            const email = document.getElementById('regEmail').value.trim();
            const password = document.getElementById('regPassword').value;
            const referralUID = document.getElementById('regReferral').value.trim();
            const btn = document.getElementById('registerBtn');
            const emailError = document.getElementById('emailError');

            // Hide previous errors
            emailError.style.display = 'none';

            // Validation
            if (!name || !email || !password) {
                showToast('Please fill all required fields', 'error');
                return;
            }

            if (password.length < 6) {
                showToast('Password must be at least 6 characters', 'error');
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creating...';

            try {
                // 🔥 Check if email already exists
                const usersSnap = await get(ref(db, 'users'));
                let emailExists = false;
                if (usersSnap.exists()) {
                    const users = usersSnap.val();
                    for (let uid in users) {
                        if (users[uid].email === email) {
                            emailExists = true;
                            break;
                        }
                    }
                }

                if (emailExists) {
                    emailError.style.display = 'block';
                    showToast('Email already registered! Please login.', 'error');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-person-plus me-2"></i>Create Account';
                    return;
                }

                // 🔥 Validate Referral UID (if provided)
                let parentUid = null;
                if (referralUID) {
                    const isValid = await validateUID(referralUID);
                    if (isValid) {
                        parentUid = referralUID;
                    } else {
                        showToast('Invalid Referral UID. You can still register.', 'error');
                    }
                }

                // 🔥 Create user in Firebase Authentication
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                const uid = user.uid;

                // 🔥 Create user profile in Realtime Database
                const userData = {
                    uid: uid,
                    name: name,
                    email: email,
                    rank: 'Member',
                    parentUid: parentUid,
                    depositWallet: 0,
                    incomeWallet: 0,
                    rewardWallet: 0,
                    rndWallet: 0,
                    lockedRND: 0,
                    releaseWallet: 0,
                    totalReleased: 0,
                    activePackages: 0,
                    totalStake: 0,
                    teamBusiness: 0,
                    totalReferrals: 0,
                    qualifiedDirects: 0,
                    level1Earnings: 0,
                    level2Earnings: 0,
                    level3Earnings: 0,
                    level4Earnings: 0,
                    level5Earnings: 0,
                    referralEarnings: 0,
                    teamStructure: { level1: 0, level2: 0, level3: 0, level4: 0, level5: 0 },
                    earnedRewards: {},
                    createdAt: Date.now(),
                    lastLogin: Date.now(),
                    packages: {},
                    transactions: {},
                    notifications: {},
                    transferHistory: [],
                    banned: false
                };

                await set(ref(db, 'users/' + uid), userData);
                console.log('✅ User registered successfully:', uid);

                // 🔥 Update parent's total referrals
                if (parentUid) {
                    await runTransaction(ref(db, 'users/' + parentUid), (currentData) => {
                        if (!currentData) return { ...currentData };
                        currentData.totalReferrals = (currentData.totalReferrals || 0) + 1;
                        return currentData;
                    });

                    // Add notification to parent
                    const notifId = 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                    await update(ref(db, 'users/' + parentUid + '/notifications/' + notifId), {
                        title: '🎉 New Referral!',
                        message: `${name} joined using your referral link!`,
                        read: false,
                        timestamp: Date.now(),
                        date: new Date().toDateString(),
                        type: 'referral'
                    });
                }

                showToast('✅ Registration successful! Please login.', 'success');
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-person-plus me-2"></i>Create Account';

                // Redirect to login after 2 seconds
                setTimeout(() => {
                    window.location.href = LOGIN_URL;
                }, 2000);

            } catch (error) {
                console.error('🔥 Registration Error:', error);
                
                let msg = 'Registration failed. Please try again.';
                if (error.code === 'auth/email-already-in-use') {
                    msg = 'Email already in use. Please login.';
                    emailError.style.display = 'block';
                } else if (error.code === 'auth/weak-password') {
                    msg = 'Password is too weak. Use at least 6 characters.';
                } else if (error.code === 'auth/invalid-email') {
                    msg = 'Invalid email address. Please enter a valid email.';
                } else if (error.code === 'auth/network-request-failed') {
                    msg = 'Network error. Please check your internet connection.';
                }
                
                showToast('❌ ' + msg, 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-person-plus me-2"></i>Create Account';
            }
        });
    }

    // ============================================================
    // 🔥 LOGOUT
    // ============================================================
    const logoutBtns = document.querySelectorAll('#logoutBtnSidebar, #logoutBtn');
    logoutBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                await signOut(auth);
                window.location.href = LOGIN_URL;
            });
        }
    });
});
