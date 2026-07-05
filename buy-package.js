/**
 * Buy Package - Main Entry Point
 */

import { onAuthChange, signOut, getCurrentUser } from './auth.js';
import { getRNDPrice, getUserData } from './utils.js';
import { showToast } from './toast.js';
import { initSidebar, updateSidebarUser } from './sidebar.js';
import { PLANS, getPackageHistory } from './package-service.js';
import { renderPackageUI, attachPlanListeners, attachFormListeners, updateWalletDisplays, showErrorState } from './package-ui.js';

// ============================================================
// MAIN FUNCTION
// ============================================================

export async function loadPackagePage(user) {
    try {
        // 1. Get RND Price
        const price = await getRNDPrice();
        
        // 2. Get User Data
        const userData = await getUserData(user.uid);
        if (!userData) {
            window.location.href = 'dashboard.html';
            return;
        }
        
        // 3. Update Sidebar
        const username = userData.username || userData.referralCode || 'USER';
        const name = userData.name || 'User';
        updateSidebarUser(name, username, userData.totalReferrals || 0);
        
        // 4. Get Package History
        const packageHistory = getPackageHistory(userData);
        
        // 5. Render UI
        const container = document.getElementById('packageContent');
        renderPackageUI(container, {
            userData,
            packageHistory,
            rndPrice: price
        });
        
        // 6. Attach Event Listeners
        attachPlanListeners(PLANS, price);
        attachFormListeners({
            userId: user.uid,
            userData: userData,
            rndPrice: price,
            plans: PLANS
        });
        
        // 7. Setup Real-time Wallet Updates
        updateWalletDisplays(user.uid);
        
        // 8. Init Sidebar
        initSidebar();
        
        // 9. Support Link
        document.getElementById('supportLink')?.addEventListener('click', (e) => {
            e.preventDefault();
            window.open('support.html', '_blank', 'noopener,noreferrer');
        });
        
        // 10. Logout
        document.getElementById('logoutBtnSidebar')?.addEventListener('click', async (e) => {
            e.preventDefault();
            await signOut();
        });

    } catch (error) {
        console.error('Error loading page:', error);
        showErrorState(
            document.getElementById('packageContent'),
            error.message || 'Please check your internet connection.'
        );
    }
}

// ============================================================
// AUTO-START ON PAGE LOAD
// ============================================================

onAuthChange(async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    await loadPackagePage(user);
});

// ============================================================
// EXPOSE FOR MODULE
// ============================================================

export { PLANS };