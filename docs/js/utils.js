/**
 * Shared Utilities for JACINTA BLOG
 */

export const firebaseConfig = {
  apiKey: "AIzaSyBIGqZLYcDg3CR5VamDwBhtOOfl2Y0NYeI",
  authDomain: "timotech-films.firebaseapp.com",
  projectId: "timotech-films",
  storageBucket: "timotech-films.firebasestorage.app",
  messagingSenderId: "563809562931",
  appId: "1:563809562931:web:750ff7e819f2d57e9dce46"
};

export const POST_PREVIEW_LIMIT = 150;

/**
 * Truncates HTML content to plain text snippet
 */
export function getSnippet(content, limit = POST_PREVIEW_LIMIT) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = content || "";
    const plainText = tempDiv.textContent || tempDiv.innerText || "";
    if (plainText.length <= limit) return content;
    return plainText.substring(0, limit) + "...";
}

/**
 * Shared Gesture Logic for "Slide to Reply"
 * @param {HTMLElement} wrapper - The element wrapping the slideable content
 * @param {Function} onTrigger - Callback executed when threshold is met
 */
export function initSlideGesture(wrapper, onTrigger) {
    const content = wrapper.querySelector('.slide-content');
    const indicator = wrapper.querySelector('.slide-reply-indicator');
    if (!content || !indicator) return;

    let startX = 0, startY = 0, currentX = 0;
    let isSliding = false, isScrolling = false;
    const threshold = 60;

    const handleStart = (e) => {
        startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        isSliding = false;
        isScrolling = false;
        content.style.transition = 'none';
    };

    const handleMove = (e) => {
        const x = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const y = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        const dx = x - startX;
        const dy = y - startY;

        if (!isSliding && !isScrolling) {
            if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) isSliding = true;
            else if (Math.abs(dy) > 10) isScrolling = true;
        }

        if (isSliding && dx > 0) {
            if (e.cancelable) e.preventDefault();
            currentX = Math.min(dx, 80);
            content.style.transform = `translateX(${currentX}px)`;
            indicator.style.opacity = currentX / threshold;
        }
    };

    const handleEnd = () => {
        content.style.transition = 'transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
        if (isSliding && currentX >= threshold) onTrigger();
        content.style.transform = 'translateX(0px)';
        indicator.style.opacity = 0;
        startX = 0; currentX = 0; isSliding = false;
    };

    wrapper.addEventListener('touchstart', handleStart, { passive: true });
    wrapper.addEventListener('touchmove', handleMove, { passive: false });
    wrapper.addEventListener('touchend', handleEnd);
    wrapper.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', (e) => { if(startX > 0) handleMove(e); });
    window.addEventListener('mouseup', () => { if(startX > 0) handleEnd(); });
}

/**
 * Shared Tab Navigation Logic
 * @param {Function} onTabSwitch - Optional callback executed when a tab is clicked, receives (targetId)
 */
export function setupTabs(onTabSwitch) {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.dataset.tab;
            if (!targetId) return;

            // Reset classes
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // Set active
            tab.classList.add('active');
            document.getElementById(targetId)?.classList.add('active');

            if (typeof onTabSwitch === 'function') onTabSwitch(targetId);
        });
    });
}

/**
 * Centralized Toast Notification System
 * @param {string} message - The text to display
 * @param {string} type - 'success', 'error', 'warning', 'info'
 */
export function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    toast.innerHTML = `
        <i class="fas ${icons[type] || icons.info}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}