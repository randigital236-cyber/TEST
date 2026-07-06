/**
 * History Management
 * Handles release and transfer history display
 * 
 * ⚠️ IMPORTANT: This is PURE DISPLAY ONLY.
 * ❌ No database writes
 * ❌ No calculations
 * ✅ Only reads from Firebase and updates DOM
 */

import { getRecentReleases, getTodayRelease } from './release.js';

/**
 * Update release history display
 * ⚠️ READ ONLY - Just displays data from Firebase
 */
export function updateReleaseHistory(data, containerId = 'releaseHistoryContainer') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!data || !data.releaseHistory) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-inbox"></i>
                <p>No release history yet</p>
            </div>
        `;
        return;
    }
    
    const history = getRecentReleases(data, 7);
    
    if (history.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-inbox"></i>
                <p>No release history yet</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = history.map(h => `
        <div class="history-item">
            <div class="left">
                <div class="icon release">
                    <i class="bi bi-arrow-down-circle"></i>
                </div>
                <div class="info">
                    <div class="title">${h.planName || 'Package'} Release</div>
                    <div class="sub">${h.date}</div>
                </div>
            </div>
            <div class="right">
                <div class="amount positive">+${h.amount.toFixed(4)} RND</div>
                <div class="date">Day ${h.dayNumber || ''}</div>
            </div>
        </div>
    `).join('');
}

/**
 * Update transfer history display
 * ⚠️ READ ONLY - Just displays data from Firebase
 */
export function updateTransferHistory(data, containerId = 'transferHistoryContainer') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!data || !data.transferHistory || data.transferHistory.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-clock"></i>
                <p>No transfers yet</p>
            </div>
        `;
        return;
    }
    
    const history = [...data.transferHistory].reverse().slice(0, 5);
    
    container.innerHTML = history.map(t => `
        <div class="history-item">
            <div class="left">
                <div class="icon ${t.type === 'sent' ? 'debit' : 'credit'}">
                    <i class="bi ${t.type === 'sent' ? 'bi-arrow-up-right' : 'bi-arrow-down-left'}"></i>
                </div>
                <div class="info">
                    <div class="title">${t.type === 'sent' ? 'Sent to' : 'Received from'} ${t.to || t.from || 'unknown'}</div>
                    <div class="sub">${new Date(t.timestamp).toLocaleDateString('en-IN')}</div>
                </div>
            </div>
            <div class="right">
                <div class="amount ${t.type === 'sent' ? 'negative' : 'positive'}">
                    ${t.type === 'sent' ? '-' : '+'}${t.amount} ${t.currency || 'RND'}
                </div>
                <div class="date">${new Date(t.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
        </div>
    `).join('');
}

/**
 * Update release info box
 * ⚠️ READ ONLY - Just displays data from Firebase
 */
export function updateReleaseInfo(data) {
    const todayRelease = getTodayRelease(data);
    const dailyRelease = data.releaseWallet || 0;
    const lockedRND = data.lockedRND || 0;
    
    const todayElement = document.getElementById('todayReleaseAmount');
    const todayElement2 = document.getElementById('todayReleaseAmount2');
    const lockedElement = document.getElementById('releaseLockedRND');
    const dailyElement = document.getElementById('dailyRelease');
    
    const todayText = `${todayRelease.toFixed(4)} RND`;
    const dailyText = `${dailyRelease.toFixed(4)} RND`;
    const lockedText = `${lockedRND.toFixed(2)} RND`;
    
    if (todayElement) todayElement.textContent = todayText;
    if (todayElement2) todayElement2.textContent = todayText;
    if (lockedElement) lockedElement.textContent = lockedText;
    if (dailyElement) dailyElement.textContent = dailyText;
}