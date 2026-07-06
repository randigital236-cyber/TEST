/**
 * Toast Notification System
 * 
 * ⚠️ CRITICAL: This file handles all toast notifications.
 * All pages and services use this for user feedback.
 * 
 * ✅ Queue-based notification system (sequential display)
 * ✅ Multiple types (success, error, info, warning)
 * ✅ Auto-dismiss with configurable duration
 * ✅ Manual dismiss on click
 * ✅ XSS-safe (uses textContent)
 * ✅ Smooth animations (entry & exit)
 * ✅ Mobile responsive
 * ✅ Accessibility support (ARIA)
 * 
 * Integration with:
 * - All pages (dashboard, buy-package, deposit, withdrawal, etc.)
 * - All services (wallet, package, release, commission, transaction)
 * - auth.js for auth notifications
 * 
 * ⚠️ IMPORTANT: This file has NO database writes.
 * Safe for all users - existing data is NOT affected.
 */

// ============================================================
// CONSTANTS
// ============================================================

const DEFAULT_DURATION = 5000; // 5 seconds
const TOAST_TYPES = {
    SUCCESS: 'success',
    ERROR: 'error',
    INFO: 'info',
    WARNING: 'warning'
};

const ICONS = {
    [TOAST_TYPES.SUCCESS]: 'bi-check-circle-fill',
    [TOAST_TYPES.ERROR]: 'bi-exclamation-triangle-fill',
    [TOAST_TYPES.INFO]: 'bi-info-circle-fill',
    [TOAST_TYPES.WARNING]: 'bi-exclamation-circle-fill'
};

// ============================================================
// STATE
// ============================================================

let toastQueue = [];
let isProcessing = false;
let toastContainer = null;
let stylesInjected = false;

// ============================================================
// DOM REFERENCE
// ============================================================

function getToastContainer() {
    if (!toastContainer) {
        toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toastContainer';
            toastContainer.className = 'toast-container';
            document.body.appendChild(toastContainer);
        }
        injectStyles();
    }
    return toastContainer;
}

// ============================================================
// INJECT STYLES (Once)
// ============================================================

function injectStyles() {
    if (stylesInjected) return;
    
    const styleId = 'toast-styles';
    if (document.getElementById(styleId)) {
        stylesInjected = true;
        return;
    }
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        /* Toast Container - Mobile First */
        .toast-container {
            position: fixed;
            bottom: 16px;
            left: 16px;
            right: 16px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 100%;
            pointer-events: none;
        }

        /* ✅ FIX 5: Better mobile positioning */
        @media (min-width: 768px) {
            .toast-container {
                bottom: 20px;
                right: 20px;
                left: auto;
                max-width: 380px;
                width: 100%;
            }
        }

        /* Toast Item */
        .toast-item {
            background: #1a2236;
            border: 1px solid #2a3a5a;
            border-radius: 10px;
            padding: 14px 18px;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            pointer-events: auto;
            cursor: pointer;
            font-size: 14px;
            color: #ffffff;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            line-height: 1.4;
            transition: all 0.3s ease;
            border-left: 4px solid #3b82f6;
            /* ✅ FIX 4: Consistent animation */
            animation: toastSlideIn 0.35s ease;
        }

        .toast-item .toast-icon {
            font-size: 20px;
            flex-shrink: 0;
        }

        .toast-item .toast-msg {
            flex: 1;
            word-break: break-word;
        }

        /* Toast Types */
        .toast-item.success { border-left-color: #22c55e; }
        .toast-item.success .toast-icon { color: #22c55e; }

        .toast-item.error { border-left-color: #ef4444; }
        .toast-item.error .toast-icon { color: #ef4444; }

        .toast-item.info { border-left-color: #3b82f6; }
        .toast-item.info .toast-icon { color: #3b82f6; }

        .toast-item.warning { border-left-color: #f59e0b; }
        .toast-item.warning .toast-icon { color: #f59e0b; }

        /* ✅ FIX 4: Consistent Slide In */
        @keyframes toastSlideIn {
            from {
                opacity: 0;
                transform: translateY(20px) scale(0.95);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        /* ✅ FIX 4: Consistent Slide Out */
        .toast-item.removing {
            opacity: 0;
            transform: translateX(30px) scale(0.95);
        }

        /* ✅ FIX 5: Mobile adjustments */
        @media (max-width: 480px) {
            .toast-item {
                font-size: 13px;
                padding: 12px 14px;
                border-radius: 8px;
            }
            .toast-item .toast-icon {
                font-size: 18px;
            }
        }

        /* Animation Keyframes for Smooth Display */
        @keyframes toastSlideIn {
            from {
                opacity: 0;
                transform: translateY(20px) scale(0.95);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }
    `;
    document.head.appendChild(style);
    stylesInjected = true;
}

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Show a toast notification
 * 
 * @param {string} message - Message to display
 * @param {string} type - 'success', 'error', 'info', 'warning'
 * @param {number} duration - Display duration in ms (default: 5000)
 */
export function showToast(message, type = TOAST_TYPES.SUCCESS, duration = DEFAULT_DURATION) {
    if (!message) return;
    
    // Validate type
    if (!Object.values(TOAST_TYPES).includes(type)) {
        type = TOAST_TYPES.INFO;
    }
    
    // Add to queue
    toastQueue.push({ message, type, duration });
    
    // Process if not already processing
    if (!isProcessing) {
        processToastQueue();
    }
}

/**
 * Show success toast
 */
export function showSuccess(message, duration = DEFAULT_DURATION) {
    showToast(message, TOAST_TYPES.SUCCESS, duration);
}

/**
 * Show error toast
 */
export function showError(message, duration = DEFAULT_DURATION) {
    showToast(message, TOAST_TYPES.ERROR, duration);
}

/**
 * Show info toast
 */
export function showInfo(message, duration = DEFAULT_DURATION) {
    showToast(message, TOAST_TYPES.INFO, duration);
}

/**
 * Show warning toast
 */
export function showWarning(message, duration = DEFAULT_DURATION) {
    showToast(message, TOAST_TYPES.WARNING, duration);
}

// ============================================================
// QUEUE PROCESSING
// ============================================================

function processToastQueue() {
    if (toastQueue.length === 0) {
        isProcessing = false;
        return;
    }
    
    isProcessing = true;
    const { message, type, duration } = toastQueue.shift();
    renderToast(message, type, duration, () => {
        processToastQueue();
    });
}

// ============================================================
// RENDER TOAST (XSS-Safe)
// ============================================================

function renderToast(message, type, duration, onComplete) {
    const container = getToastContainer();
    if (!container) {
        console.warn('Toast container not found');
        if (onComplete) onComplete();
        return;
    }
    
    // ✅ FIX 2: Use DOM methods instead of innerHTML (XSS-safe)
    const toast = document.createElement('div');
    toast.className = `toast-item ${type}`;
    
    // ✅ FIX 3: Use class-based styling instead of inline CSS
    const icon = document.createElement('i');
    icon.className = `bi ${ICONS[type] || ICONS[TOAST_TYPES.INFO]} toast-icon`;
    
    const msgSpan = document.createElement('span');
    msgSpan.className = 'toast-msg';
    // ✅ FIX 2: Use textContent to prevent XSS
    msgSpan.textContent = message;
    
    toast.appendChild(icon);
    toast.appendChild(msgSpan);
    
    // Set ARIA attributes
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    
    container.appendChild(toast);
    
    // Auto remove after duration
    const timeoutId = setTimeout(() => {
        removeToast(toast, onComplete);
    }, duration);
    
    // Manual close on click
    toast.addEventListener('click', () => {
        clearTimeout(timeoutId);
        removeToast(toast, onComplete);
    });
}

// ============================================================
// REMOVE TOAST (Consistent Animation)
// ============================================================

function removeToast(toast, onComplete) {
    if (!toast || !toast.parentNode) {
        if (onComplete) onComplete();
        return;
    }
    
    // ✅ FIX 4: Consistent exit animation
    toast.classList.add('removing');
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
        if (onComplete) onComplete();
    }, 350);
}

// ============================================================
// CLEAR ALL TOASTS
// ============================================================

export function clearAllToasts() {
    const container = getToastContainer();
    if (container) {
        const toasts = container.querySelectorAll('.toast-item');
        toasts.forEach(toast => {
            toast.classList.add('removing');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 350);
        });
    }
    toastQueue = [];
    isProcessing = false;
}

// ============================================================
// EXPOSE GLOBALLY
// ============================================================

if (typeof window !== 'undefined') {
    window.showToast = showToast;
    window.showSuccess = showSuccess;
    window.showError = showError;
    window.showInfo = showInfo;
    window.showWarning = showWarning;
    window.clearAllToasts = clearAllToasts;
}

// ============================================================
// EXPORTS
// ============================================================

export { TOAST_TYPES };
export default showToast;