/**
 * Sidebar Navigation
 * 
 * ⚠️ CRITICAL: This file handles all sidebar navigation.
 * All pages use this for consistent sidebar behavior.
 * 
 * ✅ Open/Close with animations
 * ✅ Keyboard shortcuts (Escape, Ctrl+B)
 * ✅ Swipe gestures (mobile)
 * ✅ User info update
 * ✅ Active page highlighting
 * ✅ Accessibility support (ARIA, Focus Trap)
 * ✅ Smooth transitions
 * ✅ Event listener cleanup
 * ✅ No duplicate listeners
 * 
 * Integration with:
 * - All pages (dashboard, buy-package, deposit, withdrawal, etc.)
 * - auth.js for user info
 * - utils.js for helper functions
 * 
 * ⚠️ IMPORTANT: This file has NO database writes.
 * Safe for all users - existing data is NOT affected.
 */

// ============================================================
// CONSTANTS
// ============================================================

const ANIMATION_DURATION = 350; // ms - matches CSS transition
const SWIPE_THRESHOLD = 80; // pixels
const SWIPE_EDGE = 25; // pixels from edge
const DESKTOP_BREAKPOINT = 1024;
const FOCUSABLE_ELEMENTS = 'button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])';
const DEBUG = false;

// ============================================================
// STATE
// ============================================================

let isOpen = false;
let isAnimating = false;
let previousOverflow = null;
let previousFocus = null;
let eventListeners = [];

// ============================================================
// DOM REFERENCES (Lazy Loaded)
// ============================================================

function getSidebarPanel() {
    return document.getElementById('sidebarPanel');
}

function getSidebarOverlay() {
    return document.getElementById('sidebarOverlay');
}

function getSidebarToggle() {
    return document.getElementById('sidebarToggle');
}

function getSidebarClose() {
    return document.getElementById('sidebarClose');
}

function getSidebarAvatar() {
    return document.getElementById('sidebarAvatar');
}

function getSidebarName() {
    return document.getElementById('sidebarName');
}

function getSidebarAvatarLarge() {
    return document.getElementById('sidebarAvatarLarge');
}

function getSidebarNameLarge() {
    return document.getElementById('sidebarNameLarge');
}

function getSidebarUserId() {
    return document.getElementById('sidebarUserId');
}

function getReferralBadge() {
    return document.getElementById('referralBadge');
}

function getSidebarNavItems() {
    return document.querySelectorAll('.sidebar-nav .nav-item');
}

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Open sidebar
 */
export function openSidebar() {
    if (isOpen || isAnimating) return;
    isAnimating = true;
    
    const panel = getSidebarPanel();
    const overlay = getSidebarOverlay();
    const toggle = getSidebarToggle();
    
    // Store previous overflow state
    previousOverflow = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
    
    // Store current focus
    previousFocus = document.activeElement;
    
    if (panel) {
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');
    }
    if (overlay) {
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
    }
    if (toggle) {
        toggle.setAttribute('aria-expanded', 'true');
    }
    
    // ✅ FIX 1: Setup focus trap after animation
    setTimeout(() => {
        isAnimating = false;
        // Focus first focusable element in sidebar
        if (panel) {
            const firstFocusable = panel.querySelector(FOCUSABLE_ELEMENTS);
            if (firstFocusable) {
                firstFocusable.focus();
            }
        }
        // ✅ FIX 1: Trap focus inside sidebar
        trapFocus(true);
    }, ANIMATION_DURATION);
    
    isOpen = true;
    
    document.dispatchEvent(new CustomEvent('sidebar:open'));
    log('Sidebar opened');
}

/**
 * Close sidebar
 */
export function closeSidebar() {
    if (!isOpen || isAnimating) return;
    isAnimating = true;
    
    const panel = getSidebarPanel();
    const overlay = getSidebarOverlay();
    const toggle = getSidebarToggle();
    
    // Restore previous overflow
    if (previousOverflow !== null) {
        document.body.style.overflow = previousOverflow;
        previousOverflow = null;
    } else {
        document.body.style.overflow = '';
    }
    
    if (panel) {
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');
    }
    if (overlay) {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
    }
    if (toggle) {
        toggle.setAttribute('aria-expanded', 'false');
    }
    
    // ✅ FIX 1: Remove focus trap
    trapFocus(false);
    
    setTimeout(() => {
        isAnimating = false;
        // Return focus to toggle button
        const toggleBtn = getSidebarToggle();
        if (toggleBtn) {
            toggleBtn.focus();
        } else if (previousFocus && previousFocus.focus) {
            previousFocus.focus();
            previousFocus = null;
        }
    }, ANIMATION_DURATION);
    
    isOpen = false;
    
    document.dispatchEvent(new CustomEvent('sidebar:close'));
    log('Sidebar closed');
}

/**
 * Toggle sidebar
 */
export function toggleSidebar() {
    if (isOpen) {
        closeSidebar();
    } else {
        openSidebar();
    }
}

/**
 * Check if sidebar is open
 */
export function isSidebarOpen() {
    return isOpen;
}

// ============================================================
// ✅ FIX 1: FOCUS TRAP
// ============================================================

let focusTrapHandler = null;

/**
 * Trap focus inside sidebar
 * @param {boolean} trap - True to trap focus, false to release
 */
function trapFocus(trap) {
    const panel = getSidebarPanel();
    if (!panel) return;
    
    const focusableElements = panel.querySelectorAll(FOCUSABLE_ELEMENTS);
    if (focusableElements.length === 0) return;
    
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];
    
    if (trap) {
        // Remove existing handler if any
        if (focusTrapHandler) {
            document.removeEventListener('keydown', focusTrapHandler);
            focusTrapHandler = null;
        }
        
        // Create new focus trap handler
        focusTrapHandler = function(e) {
            if (e.key !== 'Tab') return;
            
            // Get all focusable elements in sidebar
            const focusable = panel.querySelectorAll(FOCUSABLE_ELEMENTS);
            if (focusable.length === 0) return;
            
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            
            // Shift+Tab on first element → go to last
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
            // Tab on last element → go to first
            else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        
        document.addEventListener('keydown', focusTrapHandler);
        log('Focus trap enabled');
    } else {
        // Remove focus trap handler
        if (focusTrapHandler) {
            document.removeEventListener('keydown', focusTrapHandler);
            focusTrapHandler = null;
            log('Focus trap disabled');
        }
    }
}

// ============================================================
// USER INFO UPDATE
// ============================================================

export function updateSidebarUser(name, userId, referralCount = 0, avatarInitial = null) {
    const initial = avatarInitial || (name ? name.charAt(0).toUpperCase() : 'U');
    
    const avatar = getSidebarAvatar();
    const avatarLarge = getSidebarAvatarLarge();
    const nameEl = getSidebarName();
    const nameLarge = getSidebarNameLarge();
    const userIdEl = getSidebarUserId();
    const badge = getReferralBadge();
    
    if (avatar) avatar.textContent = initial;
    if (avatarLarge) avatarLarge.textContent = initial;
    if (nameEl) nameEl.textContent = name || 'User';
    if (nameLarge) nameLarge.textContent = name || 'User';
    
    if (userIdEl) {
        const displayId = userId ? userId.substring(0, 20) + (userId.length > 20 ? '...' : '') : 'ID: ---';
        userIdEl.textContent = 'ID: ' + displayId;
    }
    
    if (badge) {
        badge.textContent = referralCount || 0;
        badge.style.display = referralCount > 0 ? 'inline' : 'none';
    }
    
    const badgeElement = document.querySelector('.sidebar-nav .nav-item .badge-count');
    if (badgeElement) {
        badgeElement.textContent = referralCount || 0;
        badgeElement.style.display = referralCount > 0 ? 'inline' : 'none';
    }
}

export function updateSidebarFromUserData(userData, displayName) {
    if (!userData) return;
    
    const name = displayName || userData.name || userData.username || 'User';
    const userId = userData.username || userData.referralCode || '';
    const referrals = userData.totalReferrals || 0;
    const initial = name.charAt(0).toUpperCase();
    
    updateSidebarUser(name, userId, referrals, initial);
}

// ============================================================
// ACTIVE PAGE HIGHLIGHT
// ============================================================

export function setActivePage(pageName) {
    const navItems = getSidebarNavItems();
    navItems.forEach(item => {
        item.classList.remove('active');
        const href = item.getAttribute('href');
        if (href && href.includes(pageName)) {
            item.classList.add('active');
        }
    });
}

export function getCurrentPage() {
    const path = window.location.pathname;
    const fileName = path.split('/').pop() || 'dashboard.html';
    return fileName.replace('.html', '');
}

// ============================================================
// EVENT LISTENER MANAGEMENT
// ============================================================

function addTrackedEventListener(element, event, handler, options = {}) {
    if (!element) return;
    element.addEventListener(event, handler, options);
    eventListeners.push({ element, event, handler, options });
}

export function cleanupSidebar() {
    // Remove focus trap
    trapFocus(false);
    
    // Remove all tracked listeners
    eventListeners.forEach(({ element, event, handler, options }) => {
        element.removeEventListener(event, handler, options);
    });
    eventListeners = [];
    log('Sidebar event listeners cleaned up');
}

// ============================================================
// ✅ FIX 2: OVERLAY CLASS - CSS driven
// ============================================================

function updateOverlayVisibility() {
    const overlay = getSidebarOverlay();
    if (!overlay) return;
    
    if (window.innerWidth >= DESKTOP_BREAKPOINT) {
        overlay.classList.add('desktop-hidden');
    } else {
        overlay.classList.remove('desktop-hidden');
    }
}

// ============================================================
// ✅ FIX 3: INIT WITH CLEANUP (No duplicate listeners)
// ============================================================

export function initSidebar() {
    // ✅ FIX 3: Cleanup before initializing (prevents duplicate listeners)
    cleanupSidebar();
    
    const panel = getSidebarPanel();
    const overlay = getSidebarOverlay();
    const toggle = getSidebarToggle();
    const close = getSidebarClose();
    
    // Set initial ARIA attributes
    if (panel) {
        panel.setAttribute('aria-hidden', 'true');
    }
    if (overlay) {
        overlay.setAttribute('aria-hidden', 'true');
    }
    if (toggle) {
        toggle.setAttribute('aria-expanded', 'false');
    }
    
    // Highlight current page
    const currentPage = getCurrentPage();
    setActivePage(currentPage);
    
    // ✅ FIX 2: Initial overlay visibility
    updateOverlayVisibility();
    
    // Toggle button
    if (toggle) {
        addTrackedEventListener(toggle, 'click', (e) => {
            e.stopPropagation();
            toggleSidebar();
        });
    }
    
    // Close button
    if (close) {
        addTrackedEventListener(close, 'click', (e) => {
            e.stopPropagation();
            closeSidebar();
        });
    }
    
    // Overlay click
    if (overlay) {
        addTrackedEventListener(overlay, 'click', (e) => {
            if (e.target === overlay) {
                closeSidebar();
            }
        });
    }
    
    // Keyboard shortcuts
    addTrackedEventListener(document, 'keydown', (e) => {
        if (e.key === 'Escape' && isOpen) {
            closeSidebar();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            toggleSidebar();
        }
    });
    
    // Touch gestures
    let touchStartX = 0;
    let touchStartY = 0;
    
    addTrackedEventListener(document, 'touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });
    
    addTrackedEventListener(document, 'touchend', (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;
        
        if (Math.abs(diffX) < Math.abs(diffY)) return;
        
        if (diffX > SWIPE_THRESHOLD && touchStartX < SWIPE_EDGE && !isOpen) {
            openSidebar();
        }
        if (diffX < -SWIPE_THRESHOLD && isOpen) {
            closeSidebar();
        }
    }, { passive: true });
    
    // ✅ FIX 2: Resize handler using class
    let resizeTimeout = null;
    addTrackedEventListener(window, 'resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            updateOverlayVisibility();
        }, 250);
    });
    
    log('Sidebar initialized');
}

// ============================================================
// HELPER - Logging
// ============================================================

function log(message, ...args) {
    if (DEBUG) {
        console.log(`[Sidebar] ${message}`, ...args);
    }
}

// ============================================================
// EXPOSE GLOBALLY
// ============================================================

if (typeof window !== 'undefined') {
    window.openSidebar = openSidebar;
    window.closeSidebar = closeSidebar;
    window.toggleSidebar = toggleSidebar;
    window.isSidebarOpen = isSidebarOpen;
    window.updateSidebarUser = updateSidebarUser;
    window.updateSidebarFromUserData = updateSidebarFromUserData;
    window.setActivePage = setActivePage;
    window.initSidebar = initSidebar;
    window.cleanupSidebar = cleanupSidebar;
}

// ============================================================
// EXPORTS
// ============================================================

export {
    openSidebar,
    closeSidebar,
    toggleSidebar,
    isSidebarOpen,
    updateSidebarUser,
    updateSidebarFromUserData,
    setActivePage,
    getCurrentPage,
    initSidebar,
    cleanupSidebar
};