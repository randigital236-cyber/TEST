/**
 * Sidebar Navigation
 * Handles open/close with keyboard support
 */

const sidebarPanel = document.getElementById('sidebarPanel');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarClose = document.getElementById('sidebarClose');

let isOpen = false;

function openSidebar() {
    if (!sidebarPanel || !sidebarOverlay) return;
    sidebarPanel.classList.add('open');
    sidebarOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (sidebarToggle) {
        sidebarToggle.setAttribute('aria-expanded', 'true');
    }
    isOpen = true;
}

function closeSidebar() {
    if (!sidebarPanel || !sidebarOverlay) return;
    sidebarPanel.classList.remove('open');
    sidebarOverlay.classList.remove('active');
    document.body.style.overflow = '';
    if (sidebarToggle) {
        sidebarToggle.setAttribute('aria-expanded', 'false');
    }
    isOpen = false;
}

function toggleSidebar() {
    if (isOpen) {
        closeSidebar();
    } else {
        openSidebar();
    }
}

// Event listeners
if (sidebarToggle) {
    sidebarToggle.addEventListener('click', toggleSidebar);
}

if (sidebarClose) {
    sidebarClose.addEventListener('click', closeSidebar);
}

if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeSidebar);
}

// Keyboard: Escape key closes sidebar
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
        closeSidebar();
    }
});

// Keyboard: Ctrl+B or Cmd+B toggles sidebar
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
    }
});

// Touch: Swipe right to open, left to close
let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

document.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchEndX - touchStartX;
    
    // Swipe right from left edge (open)
    if (diff > 80 && touchStartX < 30 && !isOpen) {
        openSidebar();
    }
    
    // Swipe left from right edge (close)
    if (diff < -80 && isOpen) {
        closeSidebar();
    }
}, { passive: true });

// Export functions
export { openSidebar, closeSidebar, toggleSidebar, isOpen };