/**
 * History Management
 * Handles release and transfer history display
 */

import { getRecentReleases, getTodayRelease } from './release.js';

/**
 * Update release history display
 */
export function updateReleaseHistory(data, containerId = 'releaseHistoryContainer') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!data || !data.releaseHistory) {
        container.innerHTML = `
            <div class="text-center text-muted py-3" style="font-size:0.85rem;">
                <i class="bi bi-inbox me-1" aria-hidden="true"></i> No release history yet
            </div>
        `;
        return;
    }
    
    const history = getRecentReleases(data, 7);
    
    if (history.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-3" style="font-size:0.85rem;">
                <i class="bi bi-inbox me-1" aria-hidden="true"></i> No release history yet
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="release-history-list">
            ${history.map(h => `
                <div class="release-item">
                    <span>${h.date}</span>
                    <span class="amount">+${h.amount.toFixed(4)} RND</span>
                    <span style="color:#8899bb;font-size:0.7rem;">${h.planName || 'Package'}</span>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Update transfer history display
 */
export function updateTransferHistory(data, containerId = 'transferHistoryContainer') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!data || !data.transferHistory || data.transferHistory.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-2" style="font-size:0.8rem;">
                <i class="bi bi-clock me-1" aria-hidden="true"></i> No transfers yet
            </div>
        `;
        return;
    }
    
    const history = [...data.transferHistory].reverse().slice(0, 5);
    
    container.innerHTML = history.map(t => `
        <div class="transfer-item">
            <div>
                ${t.type === 'sent' ? 
                    `<span class="sent"><i class="bi bi-arrow-up-right" aria-hidden="true"></i> Sent to <span class="user">${t.to || 'unknown'}</span></span>` :
                    `<span class="received"><i class="bi bi-arrow-down-left" aria-hidden="true"></i> Received from <span class="user">${t.from || 'unknown'}</span></span>`
                }
            </div>
            <div>
                <span class="amount ${t.type === 'sent' ? 'sent' : 'received'}">${t.type === 'sent' ? '-' : '+'}${t.amount} ${t.currency || 'RND'}</span>
                <div class="date">${new Date(t.timestamp).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                })}</div>
            </div>
        </div>
    `).join('');
}

/**
 * Update release info box
 */
export function updateReleaseInfo(data) {
    const todayRelease = getTodayRelease(data);
    const dailyRelease = data.releaseWallet || 0;
    const lockedRND = data.lockedRND || 0;
    
    const todayElement = document.getElementById('todayReleaseAmount');
    const lockedElement = document.getElementById('releaseLockedRND');
    const dailyElement = document.getElementById('releaseDailyAmount');
    
    if (todayElement) {
        todayElement.textContent = `${todayRelease.toFixed(4)} RND`;
    }
    if (lockedElement) {
        lockedElement.textContent = `${lockedRND.toFixed(2)} RND`;
    }
    if (dailyElement) {
        dailyElement.textContent = `${dailyRelease.toFixed(4)} RND`;
    }
}