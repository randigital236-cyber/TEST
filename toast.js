/**
 * Toast Notification System
 * Queue-based to handle multiple notifications
 */

let toastQueue = [];
let isProcessing = false;
const MAX_TOASTS = 5;

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - 'success' or 'error'
 * @param {number} duration - Display duration in ms
 */
export function showToast(message, type = 'success', duration = 5000) {
    // Add to queue
    toastQueue.push({ message, type, duration });
    
    // Process if not already processing
    if (!isProcessing) {
        processToastQueue();
    }
}

function processToastQueue() {
    if (toastQueue.length === 0) {
        isProcessing = false;
        return;
    }
    
    isProcessing = true;
    const { message, type, duration } = toastQueue.shift();
    renderToast(message, type, duration, () => {
        // After this toast is done, process next
        processToastQueue();
    });
}

function renderToast(message, type, duration, onComplete) {
    const container = document.getElementById('toastContainer');
    if (!container) {
        console.warn('Toast container not found');
        if (onComplete) onComplete();
        return;
    }
    
    const toast = document.createElement('div');
    toast.className = `toast-custom ${type}`;
    const icon = type === 'success' ? 'bi-check-circle-fill text-success' : 'bi-exclamation-triangle-fill text-danger';
    toast.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i><span class="toast-msg">${message}</span>`;
    
    // Set ARIA attributes
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    
    container.appendChild(toast);
    
    // Auto remove after duration
    const timeoutId = setTimeout(() => {
        removeToast(toast);
        if (onComplete) onComplete();
    }, duration);
    
    // Allow manual close on click
    toast.addEventListener('click', () => {
        clearTimeout(timeoutId);
        removeToast(toast);
        if (onComplete) onComplete();
    });
    
    // Remove old toasts if too many
    const toasts = container.querySelectorAll('.toast-custom');
    while (toasts.length > MAX_TOASTS) {
        toasts[0].classList.add('fade-out');
        setTimeout(() => {
            if (toasts[0] && toasts[0].parentNode) {
                toasts[0].remove();
            }
        }, 300);
    }
}

function removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.add('fade-out');
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 300);
}

// Also expose globally for inline usage
window.showToast = showToast;