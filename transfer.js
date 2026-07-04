/**
 * Transfer Management
 * Handles user-to-user transfers with atomic transactions
 */

import { db } from './firebase-init.js';
import { ref, runTransaction, get } from "firebase/database";
import { getUserByUsername } from './utils.js';
import { showToast } from './toast.js';

/**
 * Atomic transfer between two users
 */
export async function atomicTransfer(
    senderUid,
    recipientUid,
    amount,
    walletType,
    currency,
    senderUsername,
    recipientUsername
) {
    // Step 1: Deduct from sender
    const senderRef = ref(db, 'users/' + senderUid);
    const senderResult = await runTransaction(senderRef, (currentData) => {
        if (!currentData) return { ...currentData };
        const balance = currentData[walletType] || 0;
        if (balance < amount) {
            return { ...currentData };
        }
        const newBalance = balance - amount;
        
        // Add to transfer history
        const transferHistory = currentData.transferHistory || [];
        transferHistory.push({
            type: 'sent',
            to: recipientUsername,
            amount: amount,
            from: senderUsername,
            currency: currency,
            timestamp: Date.now()
        });
        
        // Add transaction
        const transactions = currentData.transactions || {};
        const txId = 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
        transactions[txId] = {
            type: 'transfer_sent',
            amount: amount,
            currency: currency,
            to: recipientUsername,
            from: senderUsername,
            timestamp: Date.now(),
            date: new Date().toDateString(),
            status: 'completed',
            description: `Sent ${amount} ${currency} to ${recipientUsername}`
        };
        
        return {
            ...currentData,
            [walletType]: newBalance,
            transferHistory: transferHistory,
            transactions: transactions
        };
    });
    
    if (!senderResult.committed) {
        return { success: false, error: 'Insufficient balance or sender update failed' };
    }
    
    // Step 2: Credit to recipient
    const recipientRef = ref(db, 'users/' + recipientUid);
    const recipientResult = await runTransaction(recipientRef, (currentData) => {
        if (!currentData) return { ...currentData };
        const balance = currentData[walletType] || 0;
        const newBalance = balance + amount;
        
        const transferHistory = currentData.transferHistory || [];
        transferHistory.push({
            type: 'received',
            from: senderUsername,
            to: recipientUsername,
            amount: amount,
            currency: currency,
            timestamp: Date.now()
        });
        
        const transactions = currentData.transactions || {};
        const txId = 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
        transactions[txId] = {
            type: 'transfer_received',
            amount: amount,
            currency: currency,
            from: senderUsername,
            to: recipientUsername,
            timestamp: Date.now(),
            date: new Date().toDateString(),
            status: 'completed',
            description: `Received ${amount} ${currency} from ${senderUsername}`
        };
        
        return {
            ...currentData,
            [walletType]: newBalance,
            transferHistory: transferHistory,
            transactions: transactions
        };
    });
    
    if (!recipientResult.committed) {
        // Rollback sender if recipient failed
        const rollbackRef = ref(db, 'users/' + senderUid);
        await runTransaction(rollbackRef, (currentData) => {
            if (!currentData) return { ...currentData };
            const balance = currentData[walletType] || 0;
            const newBalance = balance + amount;
            return {
                ...currentData,
                [walletType]: newBalance
            };
        });
        return { success: false, error: 'Recipient update failed, funds returned' };
    }
    
    return { success: true };
}

/**
 * Handle transfer form submission
 */
export async function handleTransfer(userId, userData) {
    const toUsername = document.getElementById('transferUserId').value.trim();
    const amount = parseFloat(document.getElementById('transferAmount').value);
    const walletType = document.getElementById('transferWallet').value;
    const btn = document.querySelector('#transferForm button[type="submit"]');
    
    if (!toUsername) {
        showToast('❌ Please enter recipient User ID', 'error');
        return;
    }
    if (!amount || amount <= 0) {
        showToast('❌ Please enter a valid amount', 'error');
        return;
    }
    
    const senderUsername = userData.username || userData.referralCode;
    
    if (toUsername === senderUsername) {
        showToast('❌ You cannot send money to yourself!', 'error');
        return;
    }
    
    const recipient = await getUserByUsername(toUsername);
    if (!recipient) {
        showToast('❌ User ID not found!', 'error');
        return;
    }
    
    const senderBalance = userData[walletType] || 0;
    if (senderBalance < amount) {
        const walletLabels = {
            'depositWallet': 'Deposit Wallet (USDT)',
            'referralWallet': 'Referral Wallet (USDT)',
            'rndWallet': 'RND Wallet (RND)'
        };
        showToast(`❌ Insufficient balance in ${walletLabels[walletType] || 'Wallet'}! You have ${senderBalance.toFixed(4)}`, 'error');
        return;
    }
    
    const currency = walletType === 'rndWallet' ? 'RND' : 'USDT';
    
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Sending...';
    
    try {
        const result = await atomicTransfer(
            userId,
            recipient.uid,
            amount,
            walletType,
            currency,
            senderUsername,
            toUsername
        );
        
        if (result.success) {
            showToast(`✅ ${amount} ${currency} sent successfully to ${toUsername}!`, 'success');
            document.getElementById('transferUserId').value = '';
            document.getElementById('transferAmount').value = '';
            setTimeout(() => { window.location.reload(); }, 1500);
        } else {
            showToast('❌ ' + (result.error || 'Transfer failed. Please try again.'), 'error');
        }
    } catch (error) {
        console.error('Transfer error:', error);
        showToast('❌ Error sending. Please try again.', 'error');
    }
    
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-send me-1" aria-hidden="true"></i>Send';
}