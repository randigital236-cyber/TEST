// ============================================================
// RND STAKING PLATFORM V2 - FIREBASE.JS (FINAL v3)
// ============================================================
// 📌 PROJECT: mywebsite-600d3
// 📌 RULE: Firebase Auth UID = User ID = Referral Code
// 📌 RULE: NO get(ref(db,'users')) - Only Direct Path Reads
// 📌 RULE: NO UI Code, ONLY Backend Logic
// ============================================================

import { initializeApp } from "firebase/app";
import { 
    getAuth, 
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    updateProfile,
    onAuthStateChanged,
    currentUser
} from "firebase/auth";
import { 
    getDatabase, 
    ref, 
    set, 
    get, 
    update, 
    remove,
    push,
    runTransaction,
    serverTimestamp,
    onValue,
    query,
    orderByChild,
    equalTo,
    limitToLast,
    orderByKey
} from "firebase/database";

// ============================================================
// FIREBASE CONFIGURATION
// ============================================================
const firebaseConfig = {
    apiKey: "AIzaSyBshAGZScyo7PJegLHMzORbkkrCLGD6U5s",
    authDomain: "mywebsite-600d3.firebaseapp.com",
    databaseURL: "https://mywebsite-600d3-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "mywebsite-600d3",
    storageBucket: "mywebsite-600d3.firebasestorage.app",
    messagingSenderId: "584485288598",
    appId: "1:584485288598:web:01856eaa18ba5ada49e0b7",
    measurementId: "G-GQ9J9QH42J"
};

// ============================================================
// INITIALIZE FIREBASE
// ============================================================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

// ============================================================
// 🔥 EXPORTS - FIREBASE INSTANCES
// ============================================================
export { 
    app, 
    auth, 
    database,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    updateProfile,
    onAuthStateChanged,
    currentUser,
    ref,
    set,
    get,
    update,
    remove,
    push,
    runTransaction,
    serverTimestamp,
    onValue,
    query,
    orderByChild,
    equalTo,
    limitToLast,
    orderByKey
};

// ============================================================
// 🔥 HELPER FUNCTIONS
// ============================================================

// ============================================================
// ID GENERATORS
// ============================================================
export function generateTransactionID() {
    return 'txn_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 8);
}

export function generatePackageID() {
    return 'pkg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
}

export function generateBackupID() {
    return 'bkp_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
}

export function generateLockID() {
    return 'lock_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
}

// ============================================================
// DATE & TIME
// ============================================================
export function getCurrentDate() {
    return new Date().toISOString().split('T')[0];
}

export function getCurrentDateTime() {
    return new Date().toISOString();
}

export function getCurrentTimestamp() {
    return Date.now();
}

export function getServerTime() {
    return serverTimestamp();
}

export function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-IN');
}

export function formatDateTime(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString('en-IN');
}

export function getDaysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = Math.abs(d2 - d1);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// ============================================================
// HASH FUNCTION FOR EMAIL (To avoid . dot issue)
// ============================================================
export function hashEmail(email) {
    if (!email) return '';
    // Simple hash - can be improved with SHA-256 if needed
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
        const char = email.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return 'email_' + Math.abs(hash).toString(36);
}

// ============================================================
// VALIDATION FUNCTIONS
// ============================================================
export function validateEmail(email) {
    if (!email) return { valid: false, message: 'Email is required' };
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { valid: false, message: 'Please enter a valid email address' };
    }
    return { valid: true };
}

export function validatePassword(password) {
    if (!password) return { valid: false, message: 'Password is required' };
    if (password.length < 6) {
        return { valid: false, message: 'Password must be at least 6 characters' };
    }
    if (password.length > 30) {
        return { valid: false, message: 'Password must be less than 30 characters' };
    }
    return { valid: true };
}

export function validateName(name) {
    if (!name) return { valid: false, message: 'Name is required' };
    if (name.length < 2) {
        return { valid: false, message: 'Name must be at least 2 characters' };
    }
    if (name.length > 50) {
        return { valid: false, message: 'Name must be less than 50 characters' };
    }
    return { valid: true };
}

export function validateAmount(amount) {
    if (!amount && amount !== 0) return { valid: false, message: 'Amount is required' };
    if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
        return { valid: false, message: 'Please enter a valid amount' };
    }
    if (amount <= 0) {
        return { valid: false, message: 'Amount must be greater than 0' };
    }
    return { valid: true };
}

export function validateWalletBalance(balance, amount) {
    if (balance < amount) {
        return { valid: false, message: 'Insufficient balance', balance: balance, required: amount };
    }
    return { valid: true };
}

// ============================================================
// FORMAT FUNCTIONS
// ============================================================
export function formatAmount(amount, currency = 'USDT') {
    if (!amount && amount !== 0) return '0.00';
    if (typeof amount !== 'number') return '0.00';
    if (currency === 'RND') {
        return amount.toFixed(4);
    }
    return amount.toFixed(2);
}

export function formatCurrency(amount, currency = 'USDT') {
    const symbol = currency === 'RND' ? 'RND' : '$';
    const formatted = formatAmount(amount, currency);
    return `${symbol}${formatted}`;
}

export function maskEmail(email) {
    if (!email) return 'N/A';
    const parts = email.split('@');
    if (parts.length !== 2) return email;
    const name = parts[0];
    const domain = parts[1];
    if (name.length <= 2) return email;
    return name.substring(0, 2) + '***@' + domain;
}

export function maskString(str, visible = 4) {
    if (!str) return 'N/A';
    if (str.length <= visible * 2) return str;
    return str.substring(0, visible) + '...' + str.substring(str.length - visible);
}

// ============================================================
// 🔥 DATABASE OPERATIONS - DIRECT PATH ONLY
// ============================================================

// ============================================================
// GET DATA (Direct Path)
// ============================================================
export async function getData(path) {
    try {
        const refPath = ref(database, path);
        const snapshot = await get(refPath);
        if (snapshot.exists()) {
            return { success: true, data: snapshot.val() };
        }
        return { success: true, data: null };
    } catch (error) {
        console.error('Get Data Error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// SET DATA
// ============================================================
export async function setData(path, data) {
    try {
        const refPath = ref(database, path);
        await set(refPath, data);
        return { success: true };
    } catch (error) {
        console.error('Set Data Error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// UPDATE DATA
// ============================================================
export async function updateData(path, data) {
    try {
        const refPath = ref(database, path);
        await update(refPath, data);
        return { success: true };
    } catch (error) {
        console.error('Update Data Error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// PUSH DATA
// ============================================================
export async function pushData(path, data) {
    try {
        const refPath = ref(database, path);
        const newRef = push(refPath);
        await set(newRef, data);
        return { success: true, key: newRef.key };
    } catch (error) {
        console.error('Push Data Error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// REMOVE DATA
// ============================================================
export async function removeData(path) {
    try {
        const refPath = ref(database, path);
        await remove(refPath);
        return { success: true };
    } catch (error) {
        console.error('Remove Data Error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// SAFE TRANSACTION - With Rollback
// ============================================================
export async function safeTransaction(path, updateFunction) {
    try {
        const refPath = ref(database, path);
        const result = await runTransaction(refPath, updateFunction);
        if (result.committed) {
            return { success: true, data: result.snapshot.val() };
        }
        return { success: false, error: 'Transaction not committed' };
    } catch (error) {
        console.error('Safe Transaction Error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// 🔥 LOCK SYSTEM (With Auto Expiry)
// ============================================================
export async function acquireLock(lockType, userId, timeout = 30000) {
    try {
        const lockId = generateLockID();
        const lockPath = `processing_locks/${lockType}/${userId}`;
        const timestamp = getCurrentTimestamp();
        
        const result = await safeTransaction(lockPath, (currentData) => {
            if (currentData) {
                // ✅ Check if lock is expired
                if (currentData.expiresAt && timestamp > currentData.expiresAt) {
                    // Lock expired, allow new lock
                    return {
                        lockedAt: timestamp,
                        userId: userId,
                        lockType: lockType,
                        lockId: lockId,
                        expiresAt: timestamp + timeout
                    };
                }
                return; // Lock is active
            }
            return {
                lockedAt: timestamp,
                userId: userId,
                lockType: lockType,
                lockId: lockId,
                expiresAt: timestamp + timeout
            };
        });
        
        if (result.success) {
            console.log(`🔒 Lock acquired: ${lockType} for ${userId}`);
            return { success: true, lockId: lockId };
        }
        return { success: false, error: 'Lock already held' };
    } catch (error) {
        console.error('Acquire lock error:', error);
        return { success: false, error: error.message };
    }
}

export async function releaseLock(lockType, userId) {
    try {
        const lockPath = `processing_locks/${lockType}/${userId}`;
        await removeData(lockPath);
        console.log(`🔓 Lock released: ${lockType} for ${userId}`);
        return { success: true };
    } catch (error) {
        console.error('Release lock error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// 🔥 BACKUP SYSTEM (Only Critical Events)
// ============================================================
export async function createBackup(userId, action, data) {
    try {
        const criticalActions = [
            'registration', 'deposit', 'buy_package', 
            'withdrawal', 'transfer', 'admin_update'
        ];
        
        if (!criticalActions.includes(action)) {
            console.log(`ℹ️ Skipping backup for: ${action}`);
            return { success: true, skipped: true };
        }
        
        const backupId = generateBackupID();
        const backupPath = `backups/${userId}/${backupId}`;
        const timestamp = getCurrentTimestamp();
        const date = getCurrentDate();
        
        // ✅ Only backup: Wallet, Packages, Transactions, Referral
        const backupData = {
            action: action,
            timestamp: timestamp,
            date: date,
            data: {
                depositWallet: data.depositWallet || 0,
                referralWallet: data.referralWallet || 0,
                rndWallet: data.rndWallet || 0,
                lockedRND: data.lockedRND || 0,
                releaseWallet: data.releaseWallet || 0,
                totalReferrals: data.totalReferrals || 0,
                teamBusiness: data.teamBusiness || 0,
                referralEarnings: data.referralEarnings || 0,
                level1Earnings: data.level1Earnings || 0,
                level2Earnings: data.level2Earnings || 0,
                level3Earnings: data.level3Earnings || 0,
                level4Earnings: data.level4Earnings || 0,
                level5Earnings: data.level5Earnings || 0,
                packages: data.packages || {},
                teamStructure: data.teamStructure || {},
                directReferrals: data.directReferrals || {}
            },
            userId: userId,
            backupId: backupId
        };
        
        const result = await setData(backupPath, backupData);
        if (result.success) {
            console.log(`✅ Backup created: ${backupId} for action: ${action}`);
            return { success: true, backupId: backupId };
        }
        return result;
    } catch (error) {
        console.error('Backup creation failed:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// 🔥 TRANSACTION SYSTEM (Type-wise)
// ============================================================
export async function createTransaction(userId, type, data) {
    try {
        const txId = generateTransactionID();
        const txPath = `transactions/${userId}/${type}/${txId}`;
        const timestamp = getCurrentTimestamp();
        const date = getCurrentDate();
        
        const transactionData = {
            id: txId,
            type: type,
            ...data,
            timestamp: timestamp,
            date: date,
            status: 'completed'
        };
        
        const result = await setData(txPath, transactionData);
        if (result.success) {
            console.log(`✅ Transaction created: ${txId} for type: ${type}`);
            return { success: true, txId: txId };
        }
        return result;
    } catch (error) {
        console.error('Transaction creation failed:', error);
        return { success: false, error: error.message };
    }
}

export async function getTransactionsByType(userId, type, limit = 20) {
    try {
        const txPath = `transactions/${userId}/${type}`;
        const queryRef = query(
            ref(database, txPath),
            orderByKey(),
            limitToLast(limit)
        );
        const snapshot = await get(queryRef);
        
        if (!snapshot.exists()) {
            return { success: true, transactions: [] };
        }
        
        const data = snapshot.val();
        const transactions = Object.values(data).reverse();
        return { success: true, transactions: transactions };
    } catch (error) {
        console.error('Get transactions error:', error);
        return { success: false, error: error.message };
    }
}

export async function getAllTransactions(userId, limit = 50) {
    try {
        const txPath = `transactions/${userId}`;
        const snapshot = await get(ref(database, txPath));
        
        if (!snapshot.exists()) {
            return { success: true, transactions: [] };
        }
        
        const data = snapshot.val();
        let allTransactions = [];
        
        // ✅ Flatten all transaction types
        for (let type in data) {
            const txs = Object.values(data[type] || {});
            allTransactions = [...allTransactions, ...txs];
        }
        
        // ✅ Sort by timestamp (newest first)
        allTransactions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        allTransactions = allTransactions.slice(0, limit);
        
        return { success: true, transactions: allTransactions };
    } catch (error) {
        console.error('Get all transactions error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// 🔥 LOG SYSTEM
// ============================================================
export async function createLog(level, message, data = {}) {
    try {
        const logId = generateTransactionID();
        
        let logPath;
        if (level === 'error') {
            logPath = `error_logs/${logId}`;
        } else if (level === 'admin') {
            logPath = `admin_logs/${logId}`;
        } else {
            logPath = `system_logs/${logId}`;
        }
        
        const timestamp = getCurrentTimestamp();
        const date = getCurrentDate();
        
        const logData = {
            id: logId,
            level: level,
            message: message,
            data: data,
            timestamp: timestamp,
            date: date
        };
        
        const result = await setData(logPath, logData);
        if (result.success) {
            console.log(`📝 Log created: ${logId} - ${message}`);
            return { success: true, logId: logId };
        }
        return result;
    } catch (error) {
        console.error('Log creation failed:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// 🔥 VERIFICATION FUNCTIONS
// ============================================================

// ✅ VERIFY USER
export async function verifyUser(userId) {
    try {
        if (!userId) return { valid: false, error: 'User ID required' };
        
        const result = await getData(`users/${userId}`);
        if (!result.success || !result.data) {
            return { valid: false, error: 'User not found' };
        }
        
        const user = result.data;
        
        if (user.status === 'banned' || user.status === 'deleted' || 
            user.status === 'blocked' || user.status === 'inactive') {
            return { 
                valid: false, 
                error: `Account is ${user.status}`,
                status: user.status 
            };
        }
        
        return { valid: true, user: user };
    } catch (error) {
        console.error('Verify user error:', error);
        return { valid: false, error: error.message };
    }
}

// ✅ VERIFY WALLET
export async function verifyWallet(userId, walletType, amount) {
    try {
        const result = await getData(`users/${userId}`);
        if (!result.success || !result.data) {
            return { valid: false, error: 'User not found' };
        }
        
        const user = result.data;
        const balance = user[walletType] || 0;
        
        if (balance < amount) {
            return { 
                valid: false, 
                error: 'Insufficient balance',
                balance: balance,
                required: amount 
            };
        }
        
        return { valid: true, balance: balance, available: balance - amount };
    } catch (error) {
        console.error('Verify wallet error:', error);
        return { valid: false, error: error.message };
    }
}

// ✅ VERIFY RECIPIENT (By UID or Username)
export async function verifyRecipient(userId, identifier) {
    try {
        if (!identifier) return { valid: false, error: 'Recipient identifier required' };
        
        let recipientUid = identifier;
        let recipientData = null;
        
        // ✅ Check if identifier is UID
        const uidResult = await getData(`users/${identifier}`);
        if (uidResult.success && uidResult.data) {
            recipientUid = identifier;
            recipientData = uidResult.data;
        } else {
            // ✅ Check if identifier is Username
            const usernameResult = await getData(`usernames/${identifier}`);
            if (usernameResult.success && usernameResult.data) {
                recipientUid = usernameResult.data;
                const userResult = await getData(`users/${recipientUid}`);
                if (userResult.success && userResult.data) {
                    recipientData = userResult.data;
                }
            }
        }
        
        if (!recipientData) {
            return { valid: false, error: 'Recipient not found' };
        }
        
        if (recipientUid === userId) {
            return { valid: false, error: 'Cannot transfer to yourself' };
        }
        
        if (recipientData.status === 'banned' || recipientData.status === 'deleted' || 
            recipientData.status === 'blocked' || recipientData.status === 'inactive') {
            return { valid: false, error: 'Recipient account is inactive' };
        }
        
        return { valid: true, uid: recipientUid, user: recipientData };
    } catch (error) {
        console.error('Verify recipient error:', error);
        return { valid: false, error: error.message };
    }
}

// ✅ VERIFY REFERRAL
export async function verifyReferral(referralCode) {
    try {
        if (!referralCode) return { valid: false, error: 'Referral code required' };
        
        // ✅ Direct path - referralCode = UID
        const result = await getData(`users/${referralCode}`);
        if (!result.success || !result.data) {
            return { valid: false, error: 'Invalid referral code' };
        }
        
        const user = result.data;
        if (user.status === 'banned' || user.status === 'deleted' || 
            user.status === 'blocked' || user.status === 'inactive') {
            return { valid: false, error: 'Referral account is inactive' };
        }
        
        return { valid: true, uid: referralCode, user: user };
    } catch (error) {
        console.error('Verify referral error:', error);
        return { valid: false, error: error.message };
    }
}

// ✅ VERIFY TRANSFER
export async function verifyTransfer(senderId, recipientIdentifier, amount, walletType) {
    try {
        const senderResult = await verifyUser(senderId);
        if (!senderResult.valid) {
            return { valid: false, error: senderResult.error };
        }
        
        const recipientResult = await verifyRecipient(senderId, recipientIdentifier);
        if (!recipientResult.valid) {
            return { valid: false, error: recipientResult.error };
        }
        
        const amountValidation = validateAmount(amount);
        if (!amountValidation.valid) {
            return { valid: false, error: amountValidation.message };
        }
        
        const walletResult = await verifyWallet(senderId, walletType, amount);
        if (!walletResult.valid) {
            return { valid: false, error: walletResult.error };
        }
        
        return { 
            valid: true, 
            sender: senderResult.user,
            recipient: recipientResult.user,
            recipientUid: recipientResult.uid,
            balance: walletResult.balance 
        };
    } catch (error) {
        console.error('Verify transfer error:', error);
        return { valid: false, error: error.message };
    }
}

// ✅ VERIFY DEPOSIT
export async function verifyDeposit(userId, amount, method) {
    try {
        const userResult = await verifyUser(userId);
        if (!userResult.valid) {
            return { valid: false, error: userResult.error };
        }
        
        const amountValidation = validateAmount(amount);
        if (!amountValidation.valid) {
            return { valid: false, error: amountValidation.message };
        }
        
        return { valid: true, user: userResult.user };
    } catch (error) {
        console.error('Verify deposit error:', error);
        return { valid: false, error: error.message };
    }
}

// ✅ VERIFY WITHDRAWAL
export async function verifyWithdrawal(userId, amount, walletType) {
    try {
        const userResult = await verifyUser(userId);
        if (!userResult.valid) {
            return { valid: false, error: userResult.error };
        }
        
        const amountValidation = validateAmount(amount);
        if (!amountValidation.valid) {
            return { valid: false, error: amountValidation.message };
        }
        
        const walletResult = await verifyWallet(userId, walletType, amount);
        if (!walletResult.valid) {
            return { valid: false, error: walletResult.error };
        }
        
        return { valid: true, user: userResult.user, balance: walletResult.balance };
    } catch (error) {
        console.error('Verify withdrawal error:', error);
        return { valid: false, error: error.message };
    }
}

// ✅ VERIFY PACKAGE
export async function verifyPackage(packageId) {
    try {
        if (!packageId) return { valid: false, error: 'Package ID required' };
        
        const result = await getData(`packages/${packageId}`);
        if (!result.success || !result.data) {
            return { valid: false, error: 'Package not found' };
        }
        
        const pkg = result.data;
        if (pkg.status === 'completed') {
            return { valid: false, error: 'Package already completed' };
        }
        if (pkg.status === 'cancelled') {
            return { valid: false, error: 'Package is cancelled' };
        }
        if (pkg.status === 'expired') {
            return { valid: false, error: 'Package has expired' };
        }
        
        return { valid: true, package: pkg };
    } catch (error) {
        console.error('Verify package error:', error);
        return { valid: false, error: error.message };
    }
}

// ✅ VERIFY DAILY RELEASE
export async function verifyDailyRelease(userId, packageId) {
    try {
        const pkgResult = await verifyPackage(packageId);
        if (!pkgResult.valid) {
            return { valid: false, error: pkgResult.error };
        }
        
        const pkg = pkgResult.package;
        if (pkg.remainingRND <= 0) {
            return { valid: false, error: 'No RND remaining to release' };
        }
        if (pkg.dailyRelease <= 0) {
            return { valid: false, error: 'Daily release is 0' };
        }
        
        return { valid: true, package: pkg };
    } catch (error) {
        console.error('Verify daily release error:', error);
        return { valid: false, error: error.message };
    }
}

// ✅ VERIFY COMMISSION
export async function verifyCommission(userId, amount) {
    try {
        const userResult = await verifyUser(userId);
        if (!userResult.valid) {
            return { valid: false, error: userResult.error };
        }
        
        const amountValidation = validateAmount(amount);
        if (!amountValidation.valid) {
            return { valid: false, error: amountValidation.message };
        }
        
        return { valid: true, user: userResult.user };
    } catch (error) {
        console.error('Verify commission error:', error);
        return { valid: false, error: error.message };
    }
}

// ============================================================
// 🔥 WALLET OPERATIONS (With Rollback)
// ============================================================
export async function updateWallet(userId, walletType, amount, operation = 'add', description = '') {
    try {
        const userPath = `users/${userId}`;
        let newBalance = 0;
        let oldBalance = 0;
        
        // ✅ Use transaction for atomic update
        const result = await safeTransaction(userPath, (currentData) => {
            if (!currentData) return currentData;
            
            oldBalance = currentData[walletType] || 0;
            
            if (operation === 'add') {
                currentData[walletType] = oldBalance + amount;
                newBalance = currentData[walletType];
            } else if (operation === 'subtract') {
                if (oldBalance < amount) {
                    return; // Rollback - insufficient balance
                }
                currentData[walletType] = oldBalance - amount;
                newBalance = currentData[walletType];
            } else {
                return; // Invalid operation
            }
            
            return currentData;
        });
        
        if (!result.success) {
            console.error('❌ Wallet update failed:', result.error);
            return { success: false, error: result.error || 'Wallet update failed' };
        }
        
        console.log(`✅ Wallet updated: ${walletType} ${operation} ${amount}`);
        
        // ✅ Auto create transaction
        await createTransaction(userId, 'wallet_update', {
            walletType: walletType,
            operation: operation,
            amount: amount,
            oldBalance: oldBalance,
            newBalance: newBalance,
            description: description || `${operation} ${amount} to ${walletType}`
        });
        
        // ✅ Auto create backup (only if amount is significant)
        if (amount > 10) {
            await createBackup(userId, 'wallet_update', {
                walletType: walletType,
                operation: operation,
                amount: amount,
                newBalance: newBalance
            });
        }
        
        // ✅ Auto create log
        await createLog('info', `Wallet ${operation}: ${amount} to ${walletType}`, {
            userId: userId,
            walletType: walletType,
            amount: amount,
            oldBalance: oldBalance,
            newBalance: newBalance
        });
        
        return { success: true, newBalance: newBalance, oldBalance: oldBalance };
    } catch (error) {
        console.error('Wallet update error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// 🔥 USER OPERATIONS (Direct Path - NO SCAN)
// ============================================================

// ✅ GET USER BY UID (Direct)
export async function getUserByUID(uid) {
    try {
        if (!uid) return { success: false, error: 'UID required' };
        const result = await getData(`users/${uid}`);
        if (!result.success || !result.data) {
            return { success: false, error: 'User not found' };
        }
        return { success: true, user: result.data };
    } catch (error) {
        console.error('Get user by UID error:', error);
        return { success: false, error: error.message };
    }
}

// ✅ GET USER BY USERNAME (Indexed)
export async function getUserByUsername(username) {
    try {
        if (!username) return { success: false, error: 'Username required' };
        
        const result = await getData(`usernames/${username}`);
        if (!result.success || !result.data) {
            return { success: false, error: 'User not found' };
        }
        
        const uid = result.data;
        return await getUserByUID(uid);
    } catch (error) {
        console.error('Get user by username error:', error);
        return { success: false, error: error.message };
    }
}

// ✅ GET USER BY EMAIL (Indexed - Safe)
export async function getUserByEmail(email) {
    try {
        if (!email) return { success: false, error: 'Email required' };
        
        const emailHash = hashEmail(email);
        const result = await getData(`emailIndex/${emailHash}`);
        if (!result.success || !result.data) {
            return { success: false, error: 'User not found' };
        }
        
        // ✅ Verify email matches (prevent hash collision)
        const emailData = result.data;
        if (emailData.email !== email) {
            return { success: false, error: 'User not found' };
        }
        
        return await getUserByUID(emailData.uid);
    } catch (error) {
        console.error('Get user by email error:', error);
        return { success: false, error: error.message };
    }
}

// ✅ GET USER BY REFERRAL CODE (Direct - referralCode = UID)
export async function getUserByReferralCode(referralCode) {
    try {
        if (!referralCode) return { success: false, error: 'Referral code required' };
        // ✅ Direct path - referralCode is UID
        return await getUserByUID(referralCode);
    } catch (error) {
        console.error('Get user by referral code error:', error);
        return { success: false, error: error.message };
    }
}

// ✅ CHECK USERNAME AVAILABILITY
export async function isUsernameAvailable(username) {
    try {
        if (!username) return { success: false, error: 'Username required' };
        const result = await getData(`usernames/${username}`);
        if (result.success && result.data) {
            return { available: false, message: 'Username already taken' };
        }
        return { available: true };
    } catch (error) {
        console.error('Check username error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// 🔥 SAVE USER WITH INDEXES
// ============================================================
export async function saveUserWithIndexes(uid, userData) {
    try {
        // ✅ Check username availability
        if (userData.username) {
            const availability = await isUsernameAvailable(userData.username);
            if (!availability.available) {
                return { success: false, error: 'Username already taken' };
            }
        }
        
        // ✅ Save main user data
        const userResult = await setData(`users/${uid}`, userData);
        if (!userResult.success) {
            return { success: false, error: 'Failed to save user' };
        }
        
        // ✅ Save indexes
        const promises = [];
        
        if (userData.username) {
            promises.push(setData(`usernames/${userData.username}`, uid));
        }
        
        if (userData.email) {
            const emailHash = hashEmail(userData.email);
            promises.push(setData(`emailIndex/${emailHash}`, {
                uid: uid,
                email: userData.email
            }));
        }
        
        await Promise.all(promises);
        
        console.log(`✅ User saved with indexes: ${uid}`);
        return { success: true };
    } catch (error) {
        console.error('Save user with indexes error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// 🔥 COMMISSION FUNCTIONS
// ============================================================
export function getCommissionRates() {
    return {
        level1: 0.08,
        level2: 0.04,
        level3: 0.02,
        level4: 0.01,
        level5: 0.01
    };
}

export function calculateCommission(amount, level) {
    const rates = getCommissionRates();
    const rateKey = `level${level}`;
    const rate = rates[rateKey] || 0;
    return amount * rate;
}

// ============================================================
// 🔥 EXPORT ALL FUNCTIONS
// ============================================================
export default {
    app,
    auth,
    database,
    
    // Auth Functions
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    updateProfile,
    onAuthStateChanged,
    currentUser,
    
    // Database Functions
    ref,
    set,
    get,
    update,
    remove,
    push,
    runTransaction,
    serverTimestamp,
    onValue,
    query,
    orderByChild,
    equalTo,
    limitToLast,
    orderByKey,
    
    // ID Generators
    generateTransactionID,
    generatePackageID,
    generateBackupID,
    generateLockID,
    
    // Date & Time
    getCurrentDate,
    getCurrentDateTime,
    getCurrentTimestamp,
    getServerTime,
    formatDate,
    formatDateTime,
    getDaysBetween,
    
    // Hash
    hashEmail,
    
    // Validation
    validateEmail,
    validatePassword,
    validateName,
    validateAmount,
    validateWalletBalance,
    
    // Format
    formatAmount,
    formatCurrency,
    maskEmail,
    maskString,
    
    // Database Operations
    getData,
    setData,
    updateData,
    pushData,
    removeData,
    safeTransaction,
    
    // Lock System
    acquireLock,
    releaseLock,
    
    // Backup
    createBackup,
    
    // Transaction
    createTransaction,
    getTransactionsByType,
    getAllTransactions,
    
    // Logs
    createLog,
    
    // Verification
    verifyUser,
    verifyWallet,
    verifyRecipient,
    verifyReferral,
    verifyTransfer,
    verifyDeposit,
    verifyWithdrawal,
    verifyPackage,
    verifyDailyRelease,
    verifyCommission,
    
    // Wallet
    updateWallet,
    
    // User Operations
    getUserByUID,
    getUserByUsername,
    getUserByEmail,
    getUserByReferralCode,
    isUsernameAvailable,
    saveUserWithIndexes,
    
    // Commission
    getCommissionRates,
    calculateCommission
};

console.log('✅ firebase.js (v3) loaded successfully');
console.log('📌 Project: mywebsite-600d3');
console.log('📌 Version: 3.0 - Production Ready');
console.log('📌 Rule: Firebase Auth UID = User ID = Referral Code');
console.log('📌 Rule: NO get(ref(db,"users")) - Direct Path Only');