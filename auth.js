/**
 * Authentication Management
 * 
 * ⚠️ CRITICAL: This file handles all authentication operations.
 * 
 * ✅ Email/Password authentication
 * ✅ Google Sign-In with redirect fallback
 * ✅ Session management
 * ✅ Ban check on login
 * ✅ Unique username and referral code
 * ✅ 5-level referral tree (optimized)
 * ✅ Migration for existing users (only missing fields added)
 * ✅ Delete account disabled (admin only)
 * ✅ No email verification required
 * ✅ Backward compatible
 * ✅ Optimized for large user base (50,000+ users)
 * 
 * ⚠️ IMPORTANT: Never overwrite existing data.
 * Only add missing fields for backward compatibility.
 */

import { 
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    GoogleAuthProvider,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    updateProfile,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider,
    deleteUser
} from "firebase/auth";

import { auth } from './firebase-init.js';
import { db } from './firebase-init.js';
import { get, ref, set, update, runTransaction, query, orderByChild, equalTo } from "firebase/database";

// ============================================================
// CONSTANTS
// ============================================================

const SESSION_KEY = 'rnd_auth_session';
const REMEMBER_ME_KEY = 'rnd_remember_me';
const INACTIVITY_KEY = 'rnd_last_activity';
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const USER_CACHE_KEY = 'rnd_user_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const DEBUG = false;

const AUTH_ERRORS = {
    'auth/user-not-found': 'No account found with this email. Please sign up first.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/email-already-in-use': 'This email is already registered. Please login instead.',
    'auth/invalid-email': 'Invalid email address. Please check and try again.',
    'auth/weak-password': 'Password is too weak. Please use at least 6 characters.',
    'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
    'auth/requires-recent-login': 'Please login again to continue.',
    'auth/account-exists-with-different-credential': 'An account already exists with this email. Please login with your password.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed. Please try again.',
    'auth/cancelled-popup-request': 'Sign-in request was cancelled. Please try again.',
    'auth/popup-blocked': 'Sign-in popup was blocked. Please allow popups for this site.',
    'auth/unauthorized-domain': 'This domain is not authorized. Please contact support.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled. Please contact support.',
    'auth/user-disabled': 'This account has been disabled. Please contact support.',
    'auth/invalid-credential': 'Invalid credentials. Please check your email and password.',
    'auth/missing-email': 'Email is required. Please enter your email address.',
    'auth/missing-password': 'Password is required. Please enter your password.',
    'auth/internal-error': 'An internal error occurred. Please try again later.'
};

// ============================================================
// USER CACHE (Optimization)
// ============================================================

let userCache = null;
let userCacheTimestamp = 0;

async function getCachedUsers(forceRefresh = false) {
    if (forceRefresh || !userCache || (Date.now() - userCacheTimestamp) > CACHE_DURATION) {
        const usersSnap = await get(ref(db, 'users'));
        if (usersSnap.exists()) {
            userCache = usersSnap.val();
            userCacheTimestamp = Date.now();
        } else {
            userCache = {};
        }
    }
    return userCache;
}

function clearUserCache() {
    userCache = null;
    userCacheTimestamp = 0;
}

// ============================================================
// HELPER - Logging
// ============================================================

function log(message, ...args) {
    if (DEBUG) {
        console.log(`[Auth] ${message}`, ...args);
    }
}

function logError(message, ...args) {
    console.error(`[Auth] ${message}`, ...args);
}

// ============================================================
// HELPER - Get User-friendly Error Message
// ============================================================

function getAuthErrorMessage(errorCode) {
    return AUTH_ERRORS[errorCode] || 'Authentication failed. Please try again.';
}

// ============================================================
// ✅ FIX 2: DEFAULT USER DATA (Single Source of Truth)
// ============================================================

function createDefaultUserData(uid, email, name, username, referralCode, referredBy = null) {
    return {
        uid: uid,
        email: email,
        name: name || email?.split('@')[0] || 'User',
        username: username,
        referralCode: referralCode,
        referredBy: referredBy,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastLogin: Date.now(),
        // Wallets (NEVER overwrite)
        depositWallet: 0,
        referralWallet: 0,
        rndWallet: 0,
        lockedRND: 0,
        releaseWallet: 0,
        // Stats (NEVER overwrite)
        totalStake: 0,
        totalReleased: 0,
        totalReferrals: 0,
        activePackages: 0,
        // Commission (NEVER overwrite)
        level1Earnings: 0,
        level2Earnings: 0,
        level3Earnings: 0,
        level4Earnings: 0,
        level5Earnings: 0,
        referralEarnings: 0,
        totalReferralCommission: 0,
        teamBusiness: 0,
        teamStructure: { level1: 0, level2: 0, level3: 0, level4: 0, level5: 0 },
        // Packages & History (NEVER overwrite)
        packages: {},
        transactions: {},
        releaseHistory: {},
        transferHistory: [],
        commissionHistory: {},
        // Status
        status: 'active',
        rank: 'Member',
        isVerified: false,
        banned: false,
        // Release tracking
        lastReleaseDate: null,
        todayRelease: 0,
        referrerChain: []
    };
}

// ============================================================
// ✅ FIX 3: OPTIMIZED REFERRAL SEARCH (Query instead of Loop)
// ============================================================

async function findReferrerByCodeOptimized(referralCode) {
    if (!referralCode) return null;
    
    try {
        // ✅ Use query for better performance
        const usersRef = ref(db, 'users');
        const referralQuery = query(usersRef, orderByChild('referralCode'), equalTo(referralCode));
        const snapshot = await get(referralQuery);
        
        if (!snapshot.exists()) return null;
        
        const users = snapshot.val();
        const uid = Object.keys(users)[0];
        return { uid, data: users[uid] };
    } catch (error) {
        logError('Error finding referrer:', error);
        // Fallback to loop if query fails
        const users = await getCachedUsers();
        for (let uid in users) {
            if (users[uid].referralCode === referralCode) {
                return { uid, data: users[uid] };
            }
        }
        return null;
    }
}

// ============================================================
// ✅ FIX 4: OPTIMIZED USERNAME GENERATION
// ============================================================

async function generateUniqueUsernameOptimized(email, existingUsers = null) {
    if (!email) return 'user_' + Date.now().toString(36);
    
    const base = email.split('@')[0];
    const clean = base.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    
    let users = existingUsers;
    if (!users) {
        users = await getCachedUsers();
    }
    
    // ✅ Use Set for O(1) lookup
    const existingUsernames = new Set();
    for (let uid in users) {
        if (users[uid]?.username) {
            existingUsernames.add(users[uid].username.toLowerCase());
        }
    }
    
    if (!existingUsernames.has(clean) && clean.length >= 3) {
        return clean;
    }
    
    let suffix = 1;
    const maxAttempts = 100;
    
    while (suffix <= maxAttempts) {
        const testUsername = clean + suffix;
        if (!existingUsernames.has(testUsername)) {
            return testUsername;
        }
        suffix++;
    }
    
    return clean + '_' + Date.now().toString(36).substring(0, 6);
}

// ============================================================
// ✅ FIX 4: OPTIMIZED REFERRAL CODE GENERATION
// ============================================================

async function generateUniqueReferralCodeOptimized(existingUsers = null) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let users = existingUsers;
    if (!users) {
        users = await getCachedUsers();
    }
    
    const existingCodes = new Set();
    for (let uid in users) {
        if (users[uid]?.referralCode) {
            existingCodes.add(users[uid].referralCode);
        }
    }
    
    const maxAttempts = 100;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        if (!existingCodes.has(code)) {
            return code;
        }
    }
    
    return 'REF' + Date.now().toString(36).toUpperCase().substring(0, 6);
}

// ============================================================
// ✅ FIX 5: OPTIMIZED REFERRAL TREE (Single Read)
// ============================================================

async function updateReferralTreeOptimized(userUid, referrerUid) {
    try {
        // ✅ Single read for all users
        const allUsers = await getCachedUsers();
        if (!allUsers) return;
        
        let chain = [];
        let currentUid = referrerUid;
        let level = 1;
        
        while (currentUid && level <= 5) {
            const userData = allUsers[currentUid];
            if (!userData) break;
            
            chain.push({ uid: currentUid, data: userData, level: level });
            
            if (userData.referredBy) {
                let found = false;
                for (let uid in allUsers) {
                    if (allUsers[uid].referralCode === userData.referredBy) {
                        currentUid = uid;
                        found = true;
                        break;
                    }
                }
                if (!found) break;
            } else {
                break;
            }
            level++;
        }
        
        // Update each referrer's team structure
        for (let ref of chain) {
            await runTransaction(ref(db, 'users/' + ref.uid), (currentData) => {
                if (!currentData) return;
                
                const teamStructure = currentData.teamStructure || { 
                    level1: 0, level2: 0, level3: 0, level4: 0, level5: 0 
                };
                
                teamStructure[`level${ref.level}`] = (teamStructure[`level${ref.level}`] || 0) + 1;
                
                return {
                    ...currentData,
                    teamStructure: teamStructure,
                    totalReferrals: (currentData.totalReferrals || 0) + (ref.level === 1 ? 1 : 0)
                };
            });
        }
        
        await update(ref(db, 'users/' + userUid), {
            referrerChain: chain.map(r => ({ uid: r.uid, level: r.level }))
        });
        
    } catch (error) {
        logError('Error updating referral tree:', error);
    }
}

// ============================================================
// ✅ FIX 1 & 6: MIGRATION (Only updates when needed)
// ============================================================

async function migrateUserData(userId, userData) {
    try {
        const updates = {};
        let needsUpdate = false;
        
        // ✅ Check and add missing wallet fields
        const walletFields = ['depositWallet', 'referralWallet', 'rndWallet', 'lockedRND', 'releaseWallet'];
        for (let field of walletFields) {
            if (userData[field] === undefined || userData[field] === null) {
                updates[field] = 0;
                needsUpdate = true;
            }
        }
        
        // ✅ Check and add missing stats
        const statFields = ['totalStake', 'totalReleased', 'totalReferrals', 'activePackages'];
        for (let field of statFields) {
            if (userData[field] === undefined || userData[field] === null) {
                updates[field] = 0;
                needsUpdate = true;
            }
        }
        
        // ✅ Check and add missing commission fields
        const commissionFields = ['level1Earnings', 'level2Earnings', 'level3Earnings', 'level4Earnings', 'level5Earnings', 'referralEarnings', 'totalReferralCommission', 'teamBusiness'];
        for (let field of commissionFields) {
            if (userData[field] === undefined || userData[field] === null) {
                updates[field] = 0;
                needsUpdate = true;
            }
        }
        
        // ✅ TeamStructure
        if (!userData.teamStructure || typeof userData.teamStructure !== 'object') {
            updates.teamStructure = { level1: 0, level2: 0, level3: 0, level4: 0, level5: 0 };
            needsUpdate = true;
        }
        
        // ✅ History fields
        if (!userData.releaseHistory || typeof userData.releaseHistory !== 'object') {
            updates.releaseHistory = {};
            needsUpdate = true;
        }
        if (!userData.commissionHistory || typeof userData.commissionHistory !== 'object') {
            updates.commissionHistory = {};
            needsUpdate = true;
        }
        if (!userData.transactions || typeof userData.transactions !== 'object') {
            updates.transactions = {};
            needsUpdate = true;
        }
        if (!userData.packages || typeof userData.packages !== 'object') {
            updates.packages = {};
            needsUpdate = true;
        }
        if (!userData.transferHistory || !Array.isArray(userData.transferHistory)) {
            updates.transferHistory = [];
            needsUpdate = true;
        }
        
        // ✅ Status fields
        if (!userData.status) {
            updates.status = 'active';
            needsUpdate = true;
        }
        if (!userData.rank) {
            updates.rank = 'Member';
            needsUpdate = true;
        }
        if (userData.banned === undefined || userData.banned === null) {
            updates.banned = false;
            needsUpdate = true;
        }
        if (userData.isVerified === undefined || userData.isVerified === null) {
            updates.isVerified = false;
            needsUpdate = true;
        }
        
        // ✅ Release tracking
        if (userData.lastReleaseDate === undefined || userData.lastReleaseDate === null) {
            updates.lastReleaseDate = null;
            needsUpdate = true;
        }
        if (userData.todayRelease === undefined || userData.todayRelease === null) {
            updates.todayRelease = 0;
            needsUpdate = true;
        }
        if (!userData.referrerChain || !Array.isArray(userData.referrerChain)) {
            updates.referrerChain = [];
            needsUpdate = true;
        }
        
        // ✅ ONLY update if there are missing fields
        if (needsUpdate) {
            // ✅ FIX 6: Only update updatedAt when actually migrating
            updates.updatedAt = Date.now();
            await update(ref(db, 'users/' + userId), updates);
            log(`✅ User ${userId} migrated:`, Object.keys(updates));
            clearUserCache(); // Clear cache after migration
        } else {
            log(`✅ User ${userId} already has all fields`);
        }
        
        return { migrated: needsUpdate, updates };
        
    } catch (error) {
        logError('Error migrating user data:', error);
        return { migrated: false, error: error.message };
    }
}

// ============================================================
// HELPER - Session Management
// ============================================================

function saveSession(user) {
    try {
        const sessionData = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            timestamp: Date.now()
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
        updateActivityTimestamp();
    } catch (error) {
        logError('Failed to save session:', error);
    }
}

function getSession() {
    try {
        const data = localStorage.getItem(SESSION_KEY);
        if (!data) return null;
        return JSON.parse(data);
    } catch (error) {
        return null;
    }
}

function clearSession() {
    try {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(INACTIVITY_KEY);
    } catch (error) {
        logError('Failed to clear session:', error);
    }
}

function updateActivityTimestamp() {
    try {
        localStorage.setItem(INACTIVITY_KEY, String(Date.now()));
    } catch (error) {}
}

function getLastActivity() {
    try {
        const data = localStorage.getItem(INACTIVITY_KEY);
        return data ? parseInt(data) : Date.now();
    } catch {
        return Date.now();
    }
}

function getRememberMe() {
    try {
        return localStorage.getItem(REMEMBER_ME_KEY) === 'true';
    } catch {
        return false;
    }
}

function setRememberMe(value) {
    try {
        localStorage.setItem(REMEMBER_ME_KEY, String(value));
    } catch (error) {
        logError('Failed to set remember me:', error);
    }
}

// ============================================================
// HELPER - Check Ban Status
// ============================================================

async function checkBanStatus(uid) {
    try {
        const userSnap = await get(ref(db, 'users/' + uid + '/banned'));
        return userSnap.exists() ? userSnap.val() : false;
    } catch (error) {
        logError('Error checking ban status:', error);
        return false;
    }
}

// ============================================================
// HELPER - Track Inactivity
// ============================================================

function setupInactivityTracking() {
    const events = ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'];
    
    const updateActivity = () => {
        updateActivityTimestamp();
    };
    
    events.forEach(event => {
        document.addEventListener(event, updateActivity, { passive: true });
    });
    
    setInterval(() => {
        const lastActivity = getLastActivity();
        if (Date.now() - lastActivity > INACTIVITY_TIMEOUT) {
            // User inactive - token refresh handled by Firebase
        }
    }, 60000);
}

// ============================================================
// ✅ FIX 2: CREATE USER (Single Source of Truth)
// ============================================================

async function createNewUser(user, name, referralCode = null) {
    const allUsers = await getCachedUsers(true);
    
    const username = await generateUniqueUsernameOptimized(user.email, allUsers);
    const finalReferralCode = await generateUniqueReferralCodeOptimized(allUsers);

    let referrer = null;
    if (referralCode) {
        referrer = await findReferrerByCodeOptimized(referralCode);
        if (!referrer) {
            return { success: false, error: 'Invalid referral code' };
        }
    }

    const userData = createDefaultUserData(
        user.uid,
        user.email,
        name || user.displayName,
        username,
        finalReferralCode,
        referrer ? referrer.data.referralCode : null
    );

    await set(ref(db, 'users/' + user.uid), userData);

    if (referrer) {
        await updateReferralTreeOptimized(user.uid, referrer.uid);
    }

    clearUserCache();

    return {
        success: true,
        username: username,
        referralCode: finalReferralCode
    };
}

// ============================================================
// CORE AUTH FUNCTIONS
// ============================================================

export async function signUp(email, password, name, referralCode = null) {
    try {
        if (!email || !password || !name) {
            return { success: false, error: 'All fields are required' };
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await updateProfile(user, { displayName: name });

        const result = await createNewUser(user, name, referralCode);
        if (!result.success) {
            // Rollback: Delete the auth user if user creation fails
            try {
                await deleteUser(user);
            } catch (rollbackError) {
                logError('Rollback failed:', rollbackError);
            }
            return result;
        }

        saveSession(user);
        setupInactivityTracking();

        return {
            success: true,
            user: user,
            uid: user.uid,
            username: result.username,
            referralCode: result.referralCode
        };

    } catch (error) {
        logError('Sign up error:', error);
        const message = getAuthErrorMessage(error.code);
        return { success: false, error: message, code: error.code };
    }
}

export async function login(email, password, rememberMe = false) {
    try {
        if (!email || !password) {
            return { success: false, error: 'Email and password are required' };
        }

        const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
        await setPersistence(auth, persistence);
        setRememberMe(rememberMe);

        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // ✅ No email verification check

        const isBanned = await checkBanStatus(user.uid);
        if (isBanned) {
            await firebaseSignOut(auth);
            return { success: false, error: 'Your account has been banned. Please contact support.' };
        }

        // ✅ Get user data and migrate if needed
        const userSnap = await get(ref(db, 'users/' + user.uid));
        if (!userSnap.exists()) {
            // Create user if exists in Auth but not in DB
            const result = await createNewUser(user);
            if (!result.success) {
                return { success: false, error: 'Account setup failed' };
            }
        } else {
            await migrateUserData(user.uid, userSnap.val());
        }

        await update(ref(db, 'users/' + user.uid), {
            lastLogin: Date.now(),
            updatedAt: Date.now()
        });

        saveSession(user);
        setupInactivityTracking();

        return {
            success: true,
            user: user,
            uid: user.uid
        };

    } catch (error) {
        logError('Login error:', error);
        const message = getAuthErrorMessage(error.code);
        return { success: false, error: message, code: error.code };
    }
}

export async function signInWithGoogle(referralCode = null, rememberMe = false) {
    try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({
            prompt: 'select_account'
        });

        const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
        await setPersistence(auth, persistence);
        setRememberMe(rememberMe);

        let userCredential;

        try {
            userCredential = await signInWithPopup(auth, provider);
        } catch (popupError) {
            if (popupError.code === 'auth/popup-blocked' || 
                popupError.code === 'auth/popup-closed-by-user' ||
                popupError.code === 'auth/cancelled-popup-request') {
                log('Popup failed, using redirect...');
                await signInWithRedirect(auth, provider);
                return { success: true, redirect: true };
            }
            throw popupError;
        }

        const user = userCredential.user;

        const isBanned = await checkBanStatus(user.uid);
        if (isBanned) {
            await firebaseSignOut(auth);
            return { success: false, error: 'Your account has been banned. Please contact support.' };
        }

        const userSnap = await get(ref(db, 'users/' + user.uid));
        
        if (!userSnap.exists()) {
            const result = await createNewUser(user, user.displayName, referralCode);
            if (!result.success) {
                return { success: false, error: result.error };
            }
        } else {
            await migrateUserData(user.uid, userSnap.val());
            await update(ref(db, 'users/' + user.uid), {
                lastLogin: Date.now(),
                updatedAt: Date.now()
            });
        }

        saveSession(user);
        setupInactivityTracking();

        return {
            success: true,
            user: user,
            uid: user.uid
        };

    } catch (error) {
        logError('Google sign-in error:', error);
        const message = getAuthErrorMessage(error.code);
        return { success: false, error: message, code: error.code };
    }
}

export async function handleRedirectResult() {
    try {
        const result = await getRedirectResult(auth);
        if (!result) return { success: false, redirect: false };
        
        const user = result.user;
        
        const isBanned = await checkBanStatus(user.uid);
        if (isBanned) {
            await firebaseSignOut(auth);
            return { success: false, error: 'Your account has been banned.' };
        }
        
        const userSnap = await get(ref(db, 'users/' + user.uid));
        if (!userSnap.exists()) {
            const result = await createNewUser(user, user.displayName);
            if (!result.success) {
                return { success: false, error: result.error };
            }
        } else {
            await migrateUserData(user.uid, userSnap.val());
            await update(ref(db, 'users/' + user.uid), {
                lastLogin: Date.now(),
                updatedAt: Date.now()
            });
        }
        
        saveSession(user);
        setupInactivityTracking();
        
        return { success: true, user: user, uid: user.uid };
    } catch (error) {
        logError('Redirect result error:', error);
        const message = getAuthErrorMessage(error.code);
        return { success: false, error: message, code: error.code };
    }
}

export async function signOut(redirect = true) {
    try {
        clearSession();
        await firebaseSignOut(auth);
        
        if (redirect) {
            window.location.href = 'login.html';
        }
        
        return { success: true };
    } catch (error) {
        logError('Sign out error:', error);
        return { success: false, error: error.message };
    }
}

export async function resetPassword(email) {
    try {
        if (!email) {
            return { success: false, error: 'Email is required' };
        }

        await sendPasswordResetEmail(auth, email);
        return { success: true };
    } catch (error) {
        logError('Reset password error:', error);
        const message = getAuthErrorMessage(error.code);
        return { success: false, error: message, code: error.code };
    }
}

export async function changePassword(currentPassword, newPassword) {
    try {
        const user = getCurrentUser();
        if (!user) {
            return { success: false, error: 'Please login again' };
        }
        
        if (!newPassword || newPassword.length < 6) {
            return { success: false, error: 'Password must be at least 6 characters' };
        }
        
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
        
        await updatePassword(user, newPassword);
        return { success: true };
    } catch (error) {
        logError('Change password error:', error);
        const message = getAuthErrorMessage(error.code);
        return { success: false, error: message, code: error.code };
    }
}

export async function updateUserProfile(updates) {
    try {
        const user = getCurrentUser();
        if (!user) {
            return { success: false, error: 'Please login again' };
        }
        
        if (updates.name) {
            await updateProfile(user, { displayName: updates.name });
        }
        
        if (updates.photoURL) {
            await updateProfile(user, { photoURL: updates.photoURL });
        }
        
        const dbUpdates = {};
        for (let key of Object.keys(updates)) {
            if (key !== 'name' && key !== 'photoURL') {
                dbUpdates[key] = updates[key];
            }
        }
        
        if (Object.keys(dbUpdates).length > 0) {
            dbUpdates.updatedAt = Date.now();
            await update(ref(db, 'users/' + user.uid), dbUpdates);
            clearUserCache();
        }
        
        return { success: true };
    } catch (error) {
        logError('Update profile error:', error);
        return { success: false, error: error.message };
    }
}

export async function refreshUserData() {
    try {
        const user = getCurrentUser();
        if (!user) return null;
        
        clearUserCache(); // Force refresh
        const userSnap = await get(ref(db, 'users/' + user.uid));
        if (!userSnap.exists()) return null;
        
        return {
            ...userSnap.val(),
            uid: user.uid,
            email: user.email,
            displayName: user.displayName
        };
    } catch (error) {
        logError('Refresh user data error:', error);
        return null;
    }
}

// ============================================================
// DELETE ACCOUNT - DISABLED (Admin Only)
// ============================================================

export async function deleteAccount() {
    return { 
        success: false, 
        error: 'Account deletion is not available. Please contact support for assistance.' 
    };
}

// ============================================================
// GET CURRENT USER
// ============================================================

export function getCurrentUser() {
    return auth.currentUser;
}

export async function getCurrentUserData() {
    try {
        const user = getCurrentUser();
        if (!user) return null;
        
        const userSnap = await get(ref(db, 'users/' + user.uid));
        if (!userSnap.exists()) return null;
        
        return {
            ...userSnap.val(),
            uid: user.uid,
            email: user.email,
            displayName: user.displayName
        };
    } catch (error) {
        logError('Error getting user data:', error);
        return null;
    }
}

export function isAuthenticated() {
    return !!auth.currentUser;
}

// ============================================================
// AUTH STATE OBSERVER
// ============================================================

export function onAuthChange(callback) {
    return onAuthStateChanged(auth, (user) => {
        if (user) {
            saveSession(user);
            updateActivityTimestamp();
        } else {
            clearSession();
        }
        callback(user);
    });
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================

export function restoreSession() {
    const session = getSession();
    if (session && auth.currentUser) {
        updateActivityTimestamp();
        return session;
    }
    return null;
}

export function logout(redirect = true) {
    clearSession();
    if (redirect) {
        window.location.href = 'login.html';
    }
}

// ============================================================
// EXPOSE GLOBALLY
// ============================================================

if (typeof window !== 'undefined') {
    window.signUp = signUp;
    window.login = login;
    window.signInWithGoogle = signInWithGoogle;
    window.handleRedirectResult = handleRedirectResult;
    window.signOut = signOut;
    window.resetPassword = resetPassword;
    window.getCurrentUser = getCurrentUser;
    window.isAuthenticated = isAuthenticated;
    window.onAuthChange = onAuthChange;
    window.logout = logout;
    window.changePassword = changePassword;
    window.updateUserProfile = updateUserProfile;
    window.refreshUserData = refreshUserData;
    window.deleteAccount = deleteAccount;
}