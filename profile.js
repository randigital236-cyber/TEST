/**
 * Profile Page - View and Edit Profile
 * 
 * ⚠️ IMPORTANT: This page handles profile management.
 * 
 * Flow:
 * 1. Display user profile information
 * 2. Edit profile (name, username)
 * 3. Change password
 * 4. Real-time updates
 * 
 * ✅ Real-time data updates
 * ✅ Profile editing
 * ✅ Password change with validation
 * ✅ Password strength indicator
 * ✅ Error handling
 * ✅ Delete account disabled (investment platform)
 */

import { onAuthChange, signOut, getCurrentUser, updateUserProfile, changePassword } from './auth.js';
import { showToast, showSuccess, showError } from './toast.js';
import { initSidebar, updateSidebarUser, openSidebar, closeSidebar } from './sidebar.js';
import { db } from './firebase-init.js';
import { ref, get, onValue, off, update } from "firebase/database";
import { formatDate, validateName, validatePassword, validatePasswordStrength, getPasswordStrengthLabel } from './utils.js';

// ============================================================
// DOM REFERENCES
// ============================================================

const DOM = {
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    errorMessage: document.getElementById('errorMessage'),
    loadingStatus: document.getElementById('loadingStatus'),
    profileContent: document.getElementById('profileContent'),
    
    // Profile Display
    profileAvatar: document.getElementById('profileAvatar'),
    profileRank: document.getElementById('profileRank'),
    profileName: document.getElementById('profileName'),
    profileUsername: document.getElementById('profileUsername'),
    profileEmail: document.getElementById('profileEmail'),
    profileReferralCode: document.getElementById('profileReferralCode'),
    profileReferrals: document.getElementById('profileReferrals'),
    profileStatus: document.getElementById('profileStatus'),
    profileMemberSince: document.getElementById('profileMemberSince'),
    
    // Edit Form
    editName: document.getElementById('editName'),
    editUsername: document.getElementById('editUsername'),
    editEmail: document.getElementById('editEmail'),
    profileForm: document.getElementById('profileForm'),
    updateProfileBtn: document.getElementById('updateProfileBtn'),
    resetProfileBtn: document.getElementById('resetProfileBtn'),
    
    // Password Form
    currentPassword: document.getElementById('currentPassword'),
    newPassword: document.getElementById('newPassword'),
    confirmPassword: document.getElementById('confirmPassword'),
    passwordForm: document.getElementById('passwordForm'),
    changePasswordBtn: document.getElementById('changePasswordBtn'),
    passwordMatchHint: document.getElementById('passwordMatchHint'),
    strengthText: document.getElementById('strengthText'),
    
    // Danger Zone
    deleteAccountBtn: document.getElementById('deleteAccountBtn'),
    
    // Sidebar
    sidebarAvatar: document.getElementById('sidebarAvatar'),
    sidebarName: document.getElementById('sidebarName'),
    sidebarAvatarLarge: document.getElementById('sidebarAvatarLarge'),
    sidebarNameLarge: document.getElementById('sidebarNameLarge'),
    sidebarUserId: document.getElementById('sidebarUserId'),
    referralBadge: document.getElementById('referralBadge'),
    referralBadgeSidebar: document.getElementById('referralBadgeSidebar'),
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
let isUpdating = false;
let originalData = {};

// ============================================================
// MAIN - Load Profile Page
// ============================================================

export async function loadProfilePage(user) {
    try {
        currentUserId = user.uid;
        
        showLoading('Loading profile...');
        
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
        
        // Render profile
        renderProfile(currentUserData);
        
        // Setup real-time updates
        setupRealtimeUpdates(user.uid);
        
        // Setup event listeners
        setupEventListeners();
        
        // Init sidebar
        initSidebar();
        
        showContent();
        
    } catch (error) {
        console.error('Error loading profile page:', error);
        showError(error.message || 'Please check your internet connection.');
    }
}

// ============================================================
// RENDER PROFILE
// ============================================================

function renderProfile(data) {
    if (!data) return;
    
    const name = data.name || 'User';
    const username = data.username || data.referralCode || 'user';
    const email = data.email || 'N/A';
    const referralCode = data.referralCode || '------';
    const referrals = data.totalReferrals || 0;
    const rank = data.rank || 'Member';
    const status = data.banned ? 'Banned' : 'Active';
    const statusClass = data.banned ? 'banned' : 'active';
    const createdAt = data.createdAt || Date.now();
    const initial = name.charAt(0).toUpperCase();
    
    // Profile display
    if (DOM.profileAvatar) DOM.profileAvatar.textContent = initial;
    if (DOM.profileRank) DOM.profileRank.textContent = rank;
    if (DOM.profileName) DOM.profileName.textContent = name;
    if (DOM.profileUsername) DOM.profileUsername.textContent = username;
    if (DOM.profileEmail) DOM.profileEmail.textContent = email;
    if (DOM.profileReferralCode) DOM.profileReferralCode.textContent = referralCode;
    if (DOM.profileReferrals) DOM.profileReferrals.textContent = referrals;
    if (DOM.profileStatus) {
        DOM.profileStatus.textContent = status;
        DOM.profileStatus.className = `value status ${statusClass}`;
    }
    if (DOM.profileMemberSince) DOM.profileMemberSince.textContent = formatDate(createdAt);
    
    // Edit form
    if (DOM.editName) DOM.editName.value = name;
    if (DOM.editUsername) DOM.editUsername.value = username;
    if (DOM.editEmail) DOM.editEmail.value = email;
    
    // Store original data for reset
    originalData = { name, username };
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
            renderProfile(data);
            
            // Update sidebar
            const name = data.name || 'User';
            const username = data.username || data.referralCode || 'USER';
            updateSidebarUser(name, username, data.totalReferrals || 0);
        }
    }, (error) => {
        console.error('Realtime listener error:', error);
    });
}

// ============================================================
// EVENT LISTENERS
// ============================================================

function setupEventListeners() {
    // Profile form submit
    if (DOM.profileForm) {
        DOM.profileForm.addEventListener('submit', handleProfileUpdate);
    }
    
    // Reset button
    if (DOM.resetProfileBtn) {
        DOM.resetProfileBtn.addEventListener('click', resetProfileForm);
    }
    
    // Password form submit
    if (DOM.passwordForm) {
        DOM.passwordForm.addEventListener('submit', handlePasswordChange);
    }
    
    // Password strength indicator
    if (DOM.newPassword) {
        DOM.newPassword.addEventListener('input', updatePasswordStrength);
    }
    
    // Confirm password check
    if (DOM.confirmPassword) {
        DOM.confirmPassword.addEventListener('input', checkPasswordMatch);
    }
    
    // Delete account (disabled)
    if (DOM.deleteAccountBtn) {
        DOM.deleteAccountBtn.addEventListener('click', handleDeleteAccount);
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
// HANDLE PROFILE UPDATE
// ============================================================

async function handleProfileUpdate(e) {
    e.preventDefault();
    
    if (isUpdating) return;
    
    const name = DOM.editName?.value?.trim() || '';
    const username = DOM.editUsername?.value?.trim() || '';
    
    // Validate name
    const nameResult = validateName(name, true);
    if (!nameResult.valid) {
        showToast(`❌ ${nameResult.errors[0]}`, 'error');
        return;
    }
    
    // Validate username
    if (!username) {
        showToast('❌ Username is required', 'error');
        return;
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        showToast('❌ Username must be 3-20 characters, letters, numbers, and underscores only', 'error');
        return;
    }
    
    isUpdating = true;
    if (DOM.updateProfileBtn) {
        DOM.updateProfileBtn.disabled = true;
        DOM.updateProfileBtn.innerHTML = '<span class="spinner"></span> Updating...';
    }
    
    try {
        const updates = {};
        if (name !== currentUserData.name) {
            updates.name = name;
        }
        if (username !== currentUserData.username) {
            updates.username = username;
        }
        
        if (Object.keys(updates).length === 0) {
            showToast('ℹ️ No changes to update', 'info');
            isUpdating = false;
            if (DOM.updateProfileBtn) {
                DOM.updateProfileBtn.disabled = false;
                DOM.updateProfileBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i> Update Profile';
            }
            return;
        }
        
        // Update Firebase
        await update(ref(db, 'users/' + currentUserId), updates);
        
        // Update auth profile
        const user = getCurrentUser();
        if (user && name !== currentUserData.name) {
            await updateUserProfile({ name });
        }
        
        showSuccess('✅ Profile updated successfully!');
        
        // Update sidebar
        updateSidebarUser(name, username, currentUserData.totalReferrals || 0);
        
    } catch (error) {
        console.error('Update profile error:', error);
        showToast(`❌ ${error.message || 'Failed to update profile'}`, 'error');
    } finally {
        isUpdating = false;
        if (DOM.updateProfileBtn) {
            DOM.updateProfileBtn.disabled = false;
            DOM.updateProfileBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i> Update Profile';
        }
    }
}

// ============================================================
// RESET PROFILE FORM
// ============================================================

function resetProfileForm() {
    if (DOM.editName) DOM.editName.value = originalData.name || '';
    if (DOM.editUsername) DOM.editUsername.value = originalData.username || '';
    showToast('✅ Form reset', 'info');
}

// ============================================================
// HANDLE PASSWORD CHANGE
// ============================================================

async function handlePasswordChange(e) {
    e.preventDefault();
    
    const currentPassword = DOM.currentPassword?.value || '';
    const newPassword = DOM.newPassword?.value || '';
    const confirmPassword = DOM.confirmPassword?.value || '';
    
    // Validate current password
    if (!currentPassword) {
        showToast('❌ Please enter your current password', 'error');
        return;
    }
    
    // Validate new password
    const passwordResult = validatePassword(newPassword);
    if (!passwordResult.valid) {
        showToast(`❌ ${passwordResult.errors[0]}`, 'error');
        return;
    }
    
    // Validate confirm password
    if (newPassword !== confirmPassword) {
        showToast('❌ Passwords do not match', 'error');
        return;
    }
    
    if (DOM.changePasswordBtn) {
        DOM.changePasswordBtn.disabled = true;
        DOM.changePasswordBtn.innerHTML = '<span class="spinner"></span> Changing...';
    }
    
    try {
        const result = await changePassword(currentPassword, newPassword);
        if (result.success) {
            showSuccess('✅ Password changed successfully!');
            DOM.passwordForm?.reset();
            if (DOM.strengthText) DOM.strengthText.textContent = 'Not Set';
            if (DOM.passwordMatchHint) DOM.passwordMatchHint.textContent = 'Passwords must match';
        } else {
            showToast(`❌ ${result.error || 'Failed to change password'}`, 'error');
        }
    } catch (error) {
        console.error('Password change error:', error);
        showToast(`❌ ${error.message || 'Failed to change password'}`, 'error');
    } finally {
        if (DOM.changePasswordBtn) {
            DOM.changePasswordBtn.disabled = false;
            DOM.changePasswordBtn.innerHTML = '<i class="bi bi-key me-1"></i> Change Password';
        }
    }
}

// ============================================================
// PASSWORD STRENGTH
// ============================================================

function updatePasswordStrength() {
    const password = DOM.newPassword?.value || '';
    const result = validatePasswordStrength(password);
    const label = getPasswordStrengthLabel(result.strength);
    
    if (DOM.strengthText) {
        DOM.strengthText.textContent = result.valid ? label.label : 'Weak';
        DOM.strengthText.className = `strength-text ${result.valid ? 'strong' : 'weak'}`;
    }
}

function checkPasswordMatch() {
    const newPassword = DOM.newPassword?.value || '';
    const confirmPassword = DOM.confirmPassword?.value || '';
    
    if (DOM.passwordMatchHint) {
        if (!confirmPassword) {
            DOM.passwordMatchHint.textContent = 'Passwords must match';
            DOM.passwordMatchHint.className = 'form-hint';
        } else if (newPassword === confirmPassword) {
            DOM.passwordMatchHint.textContent = '✅ Passwords match!';
            DOM.passwordMatchHint.className = 'form-hint success';
        } else {
            DOM.passwordMatchHint.textContent = '❌ Passwords do not match';
            DOM.passwordMatchHint.className = 'form-hint error';
        }
    }
}

// ============================================================
// HANDLE DELETE ACCOUNT (Disabled)
// ============================================================

function handleDeleteAccount() {
    showToast('❌ Account deletion is disabled. Please contact support for assistance.', 'error');
}

// ============================================================
// UI STATE MANAGEMENT
// ============================================================

function showLoading(message) {
    if (DOM.loadingStatus) DOM.loadingStatus.textContent = message || 'Loading...';
    if (DOM.loadingState) DOM.loadingState.style.display = 'block';
    if (DOM.errorState) DOM.errorState.style.display = 'none';
    if (DOM.profileContent) DOM.profileContent.style.display = 'none';
}

function showContent() {
    if (DOM.loadingState) DOM.loadingState.style.display = 'none';
    if (DOM.errorState) DOM.errorState.style.display = 'none';
    if (DOM.profileContent) DOM.profileContent.style.display = 'block';
}

function showError(message) {
    if (DOM.errorMessage) DOM.errorMessage.textContent = message || 'An error occurred. Please try again.';
    if (DOM.errorState) DOM.errorState.style.display = 'block';
    if (DOM.loadingState) DOM.loadingState.style.display = 'none';
    if (DOM.profileContent) DOM.profileContent.style.display = 'none';
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
    
    await loadProfilePage(user);
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