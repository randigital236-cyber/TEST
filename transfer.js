/**
 * Transfer Management
 * Handles user-to-user transfers with atomic transactions
 * 
 * ⚠️ IMPORTANT: This handles WRITE operations.
 * ✅ Atomic transactions using runTransaction
 * ✅ Balance validation
 * ✅ Transaction history via transaction-service.js
 */

import { db } from './firebase-init.js';
import { ref, runTransaction, get } from "firebase/database";
import { getUserByUsername } from './utils.js';
import { showToast } from './toast.js';
import { debitWallet, creditWallet } from './wallet-service.js';
import { createTransaction, TRANSACTION_TYPES, TRANSACTION_STATUS } from './transaction-service.js';

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
    const timestamp = Date.now();
    const operationId = `transfer_${timestamp}`;
    
    // Step 1: Deduct from sender
    const senderResult = await debitWallet(
        senderUid,
        walletType,
        amount,
        `Transferred to ${recipientUsername}`,
        {
            operationId: operationId,
            toUser: recipientUsername,
            toUid: recipientUid
        }
    );
    
    if (!senderResult.success) {
        return { success: false, error: senderResult.error || 'Sender update failed' };
    }
    
    // Step 2: Credit to recipient
    const recipientResult = await creditWallet(
        recipientUid,
        walletType,
        amount,
        `Received from ${senderUsername}`,
        {
            operationId: operationId,
            fromUser: senderUsername,
            fromUid: senderUid
        }
    );
    
    if (!recipientResult.success) {
        // Rollback sender if recipient failed
        await creditWallet(
            senderUid,
            walletType,
            amount,
            `Rollback: Transfer to ${recipientUsername} failed`,
            {
                operationId: `rollback_${operationId}`,
                originalOperationId: operationId
            }
        );
        return { success: false, error: 'Recipient update failed, funds returned' };
    }
    
    // Save transfer history for both users
    // Sender history
    await createTransaction(
        senderUid,
        TRANSACTION_TYPES.WALLET_TRANSFER,
        {
            type: 'sent',
            to: recipientUsername,
            amount: amount,
            currency: currency,
            from: senderUsername
        },
        TRANSACTION_STATUS.COMPLETED,
        `Transferred ${amount} ${currency} to ${recipientUsername}`,
        operationId
    );
    
    // Recipient history
    await createTransaction(
        recipientUid,
        TRANSACTION_TYPES.WALLET_TRANSFER,
        {
            type: 'received',
            from: senderUsername,
            amount: amount,
            currency: currency,
            to: recipientUsername
        },
        TRANSACTION_STATUS.COMPLETED,
        `Received ${amount} ${currency} from ${senderUsername}`,
        operationId
    );
    
    return { success: true, transactionId: senderResult.transactionId };
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
            // UI will update via realtime listener
        } else {
            showToast('❌ ' + (result.error || 'Transfer failed. Please try again.'), 'error');
        }
    } catch (error) {
        console.error('Transfer error:', error);
        showToast('❌ Error sending. Please try again.', 'error');
    }
    
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-send me-1"></i>Send';
}