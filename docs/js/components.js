/**
 * Shared UI Components for JACINTA BLOG
 */
export const SharedComponents = {
    // Define the HTML for the Logout Confirmation Modal
    logoutModal: `
        <div id="logout-confirm-modal" class="modal-overlay" style="display: none;">
            <div class="modal-content" style="max-width: 400px; text-align: center;">
                <h3>Confirm Logout</h3>
                <p>Are you sure you want to log out?</p>
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button id="confirm-logout-btn" style="background: var(--danger); flex: 1; color: white; border: none; border-radius: 6px; padding: 0.8rem; cursor: pointer; font-weight: 600;">Logout</button>
                    <button id="cancel-logout-btn" class="secondary-btn" style="flex: 1; margin: 0;">Cancel</button>
                </div>
            </div>
        </div>
    `,

    // Modal for viewing and replying to post-specific comments in Admin
    adminReplyModal: `
        <div id="admin-reply-modal" class="modal-overlay" style="display: none;">
            <div class="modal-content" style="max-width: 600px;">
                <span class="close-button" id="close-admin-reply-modal">&times;</span>
                <h3>Replies for: <span id="admin-modal-post-title"></span></h3>
                <div id="admin-modal-replies-list" style="max-height: 400px; overflow-y: auto; margin-top: 1rem; padding-right: 5px;">
                    <!-- Replies loaded here -->
                </div>
            </div>
        </div>
    `,

    // Modal for viewing replies in Client side
    viewRepliesModal: `
        <div id="view-replies-modal" class="modal-overlay" style="display: none;">
            <div class="modal-content" style="max-width: 600px;">
                <span class="close-button" id="close-view-replies-modal">&times;</span>
                <h3>Replies for: <span id="view-modal-post-title"></span></h3>
                <div class="replies-header" style="display: flex; justify-content: flex-end; align-items: center; margin-top: 1rem;">
                    <select id="modal-sort-replies" style="width: auto; padding: 4px; margin: 0; font-size: 0.8rem; border: 1px solid #e2e8f0; border-radius: 4px;">
                        <option value="desc">Newest First</option>
                        <option value="asc">Oldest First</option>
                    </select>
                </div>
                <div id="view-modal-replies-list" style="max-height: 450px; overflow-y: auto; margin-top: 1rem; padding-right: 5px;">
                    <!-- Replies loaded here -->
                </div>
            </div>
        </div>
    `,

    // Modal for General Community Questions/Comments
    communityChatModal: `
        <div id="community-chat-modal" class="modal-overlay" style="display: none;">
            <div class="modal-content" style="max-width: 500px;">
                <span class="close-button" id="close-community-modal">&times;</span>
                <h3 style="margin-bottom: 0.5rem;">Community Connection</h3>
                <p style="color: var(--gray); font-size: 0.9rem; margin-bottom: 1.5rem;">Have a question, comment, or concern? We're here to listen and grow together.</p>
                <form id="community-chat-form">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; font-size: 0.9rem;">Your Name</label>
                    <input type="text" id="modal-user-name" placeholder="Your name or nickname..." required>
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; font-size: 0.9rem;">Your Message</label>
                    <textarea id="modal-user-question" placeholder="Type your question or concern here..." rows="4" required></textarea>
                    <button type="submit" id="modal-send-chat-btn" style="width: 100%; margin-top: 10px;">Send Message</button>
                </form>
            </div>
        </div>
    `,

    // Confirmation modal before publishing/updating
    publishConfirmModal: `
        <div id="publish-confirm-modal" class="modal-overlay" style="display: none;">
            <div class="modal-content" style="max-width: 400px; text-align: center;">
                <h3 id="publish-confirm-title">Confirm Publication</h3>
                <p id="publish-confirm-msg">Are you sure you want to publish this post to the blog?</p>
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button id="confirm-publish-btn" style="flex: 1;">Yes, Publish</button>
                    <button id="cancel-publish-btn" class="secondary-btn" style="flex: 1; margin: 0;">Cancel</button>
                </div>
            </div>
        </div>
    `,

    // Success modal after publishing/updating
    publishSuccessModal: `
        <div id="publish-success-modal" class="modal-overlay" style="display: none;">
            <div class="modal-content" style="max-width: 400px; text-align: center;">
                <div style="font-size: 3.5rem; color: var(--success); margin-bottom: 1rem;">
                    <i class="fas fa-check-circle"></i>
                </div>
                <h3>Success!</h3>
                <p id="publish-success-msg">Your blog post is now live.</p>
                <button id="close-success-modal-btn" style="width: 100%; margin-top: 1.5rem;">Great!</button>
            </div>
        </div>
    `,

    // Confirmation modal for deleting posts
    deleteConfirmModal: `
        <div id="delete-confirm-modal" class="modal-overlay" style="display: none;">
            <div class="modal-content" style="max-width: 400px; text-align: center;">
                <h3 style="color: var(--danger);">Delete Post?</h3>
                <p>Are you sure you want to permanently delete this post? This action cannot be undone.</p>
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button id="confirm-delete-btn" style="background: var(--danger); flex: 1;">Delete</button>
                    <button id="cancel-delete-btn" class="secondary-btn" style="flex: 1; margin: 0;">Cancel</button>
                </div>
            </div>
        </div>
    `,

    // Injects a component into the bottom of the body
    inject(templateKey) {
        const idMap = { 
            logoutModal: 'logout-confirm-modal', 
            adminReplyModal: 'admin-reply-modal',
            viewRepliesModal: 'view-replies-modal',
            communityChatModal: 'community-chat-modal',
            publishConfirmModal: 'publish-confirm-modal',
            publishSuccessModal: 'publish-success-modal',
            deleteConfirmModal: 'delete-confirm-modal'
        };
        if (this[templateKey] && !document.getElementById(idMap[templateKey])) {
            document.body.insertAdjacentHTML('beforeend', this[templateKey]);
        }
    }
};