import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, getDocs, updateDoc, doc, onSnapshot, deleteDoc, getDoc, serverTimestamp, where, getCountFromServer, limit, startAfter, limitToLast as firestoreLimitToLast, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { SharedComponents } from "./components.js";

const firebaseConfig = {
  apiKey: "AIzaSyBIGqZLYcDg3CR5VamDwBhtOOfl2Y0NYeI",
  authDomain: "timotech-films.firebaseapp.com",
  projectId: "timotech-films",
  storageBucket: "timotech-films.firebasestorage.app",
  messagingSenderId: "563809562931",
  appId: "1:563809562931:web:750ff7e819f2d57e9dce46"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Helper for character limit truncation
const POST_PREVIEW_LIMIT = 150;

function getSnippet(content, limit = POST_PREVIEW_LIMIT) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = content || "";
    const plainText = tempDiv.textContent || tempDiv.innerText || "";
    if (plainText.length <= limit) return content;
    return plainText.substring(0, limit) + "...";
}

/**
 * Invalidates admin data caches to ensure fresh statistics and lists.
 */
function invalidateAdminCaches() {
    adminAllPosts = [];
    adminAllChats = [];
    adminGeneralChats = [];
    adminStatsCache = null;
    adminTopLikedCache = null;
}

// Initialize Quill editor
const quill = new Quill('#editor', {
    theme: 'snow',
    placeholder: 'Write your blog post here...',
});


let uploadedImageUrl = "";
let editingPostId = null; // To keep track of the post being edited
let postIdToDelete = null; // To keep track of the post pending deletion
let activeReplyListener = null; // Unsubscribe function for the modal listener
let globalChatsListener = null; // Live listener for the general questions tab
let adminAllPosts = []; // Local storage for search filtering
let adminAllChats = []; // Cache for statistics
let adminGeneralChats = []; // Cache for general questions
let adminCommentCounts = {}; // Stores counts locally: { postId: count }
let adminStatsCache = null; // Cache for calculated summary stats
let adminTopLikedCache = null; // Cache for top 5 posts list
let adminCommentCountListeners = {}; // Stores unsubscribe functions
let isInitialAdminLiveLoad = true;
let chatThreadsListenerInitialized = false;
const chatNotification = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
let activeAdminLiveChatRef = null;
let adminReplyingTo = null;
let tabsInitialized = false;
const ADMIN_CHATS_PER_PAGE = 10;
let activeTargetUserId = null;
let adminChatPagination = { lastDoc: null, hasMore: true };

// --- Tab Navigation Logic ---
function setupTabs() {
    if (tabsInitialized) return;
    
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;

            // Reset classes
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // Set active
            tab.classList.add('active');
            document.getElementById(target)?.classList.add('active');
            if (target === 'stats-tab') {
                loadStatistics();
                loadTopLikedPosts();
            }
            if (target === 'questions-tab') {
                loadAdminChats();
            }
            if (target === 'live-chat-tab') {
                // Live chat is handled by setupAdminLiveChat listener
            }
        });
    });

    tabsInitialized = true;
}

async function loadStatistics() {
    const likesDisplay = document.getElementById('total-likes-count');
    const mostLikedPostTitleDisplay = document.getElementById('most-liked-post-title');
    const commentsDisplay = document.getElementById('total-comments-count');
    const mostCommentedPostTitleDisplay = document.getElementById('most-commented-post-title');
    
    try {
        // Reset displays
        if (likesDisplay) likesDisplay.textContent = '0';
        if (mostLikedPostTitleDisplay) mostLikedPostTitleDisplay.textContent = 'N/A';
        if (commentsDisplay) commentsDisplay.textContent = '0';
        if (mostCommentedPostTitleDisplay) mostCommentedPostTitleDisplay.textContent = 'N/A';

        if (adminStatsCache) {
            renderStatsUI(adminStatsCache);
            return;
        }

        // 1. Get the single most liked post via query
        const mostLikedQuery = query(collection(db, "posts"), orderBy("likes", "desc"), limit(1));
        const mostLikedSnap = await getDocs(mostLikedQuery);

        // 2. Handle Most Commented (Requires fetching chats as there is no commentCount field on posts yet)
        if (adminAllChats.length === 0) {
            const chatsSnapshot = await getDocs(collection(db, "chats"));
            adminAllChats = chatsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        const commentCountsByPost = {}; // { postId: count }
        adminAllChats.forEach(chat => {
            const postId = chat.postId;
            if (postId) {
                commentCountsByPost[postId] = (commentCountsByPost[postId] || 0) + 1;
            }
        });

        let mostCommentedPost = { id: null, comments: -1 };
        for (const postId in commentCountsByPost) {
            if (commentCountsByPost[postId] > mostCommentedPost.comments) {
                mostCommentedPost = { id: postId, comments: commentCountsByPost[postId] };
            }
        }

        const statsToCache = {
            mostLikedTitle: !mostLikedSnap.empty ? mostLikedSnap.docs[0].data().title : 'N/A',
            mostLikedCount: !mostLikedSnap.empty ? (mostLikedSnap.docs[0].data().likes || 0) : 0,
            mostCommentedId: mostCommentedPost.id,
            mostCommentedCount: mostCommentedPost.comments > -1 ? mostCommentedPost.comments : 0,
            mostCommentedTitle: 'N/A'
        };

        if (statsToCache.mostCommentedId) {
            const postSnap = await getDoc(doc(db, "posts", statsToCache.mostCommentedId));
            statsToCache.mostCommentedTitle = postSnap.exists() ? postSnap.data().title : 'Deleted Post';
        }

        adminStatsCache = statsToCache;
        renderStatsUI(adminStatsCache);
    } catch (err) {
        console.error("Error loading statistics:", err);
    }
}

function renderStatsUI(stats) {
    const likesDisplay = document.getElementById('total-likes-count');
    const mostLikedPostTitleDisplay = document.getElementById('most-liked-post-title');
    const commentsDisplay = document.getElementById('total-comments-count');
    const mostCommentedPostTitleDisplay = document.getElementById('most-commented-post-title');

    if (likesDisplay) likesDisplay.textContent = stats.mostLikedCount;
    if (mostLikedPostTitleDisplay) mostLikedPostTitleDisplay.textContent = stats.mostLikedTitle;
    if (commentsDisplay) commentsDisplay.textContent = stats.mostCommentedCount;
    if (mostCommentedPostTitleDisplay) mostCommentedPostTitleDisplay.textContent = stats.mostCommentedTitle;
}

async function loadTopLikedPosts() {
    const topPostsList = document.getElementById('top-liked-posts-list');
    if (!topPostsList) return;

    if (adminTopLikedCache) {
        renderTopLikedUI(adminTopLikedCache);
        return;
    }

    topPostsList.innerHTML = '<p style="text-align: center;">Loading top posts...</p>';

    try {
        // Always fetch only the top 5 from Firestore
        const q = query(collection(db, "posts"), orderBy("likes", "desc"), limit(5));
        const querySnapshot = await getDocs(q);
        adminTopLikedCache = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTopLikedUI(adminTopLikedCache);
    } catch (err) {
        console.error("Error loading top liked posts:", err);
        topPostsList.innerHTML = '<p style="text-align: center; color: var(--danger);">Failed to load top posts.</p>';
    }
}

function renderTopLikedUI(posts) {
    const topPostsList = document.getElementById('top-liked-posts-list');
    topPostsList.innerHTML = '';
    if (posts.length === 0) {
        topPostsList.innerHTML = '<p style="text-align: center; color: var(--gray);">No posts with likes yet.</p>';
        return;
    }
    posts.forEach(post => {
        const postCard = document.createElement('div');
        postCard.className = 'post-card';
        postCard.innerHTML = `
            <img src="${post.image || 'https://via.placeholder.com/400'}" alt="Post Image">
            <div class="post-content">
                <h3>${post.title}</h3>
                <p>❤️ ${post.likes || 0} Likes</p>
            </div>
        `;
        topPostsList.appendChild(postCard);
    });
}

// --- 1. Authentication Logic ---
document.getElementById('login-btn').addEventListener('click', async () => {
    const loginBtn = document.getElementById('login-btn');
    const email = document.getElementById('email').value.trim();
    const pass = document.getElementById('password').value.trim();

    if (!email || !pass) {
        alert("Please enter both email and password.");
        return;
    }

    // Set loading state
    loginBtn.disabled = true;
    loginBtn.innerText = "Logging in...";

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        // Explicitly check role here to provide feedback for this specific login attempt
        const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));
        if (!userDoc.exists() || userDoc.data().role !== 'admin') {
            alert("Access Denied: You do not have administrator privileges.");
            await signOut(auth);
        }
    } catch (err) {
        alert("Login failed: " + err.message);
        // Reset button state only on failure (success hides the section)
        loginBtn.disabled = false;
        loginBtn.innerText = "Login";
    }
});

// Inject and then select elements
SharedComponents.inject('logoutModal');
SharedComponents.inject('adminReplyModal');
SharedComponents.inject('publishConfirmModal');
SharedComponents.inject('publishSuccessModal');
SharedComponents.inject('deleteConfirmModal');
const logoutConfirmModal = document.getElementById('logout-confirm-modal');
const confirmLogoutBtn = document.getElementById('confirm-logout-btn');
const cancelLogoutBtn = document.getElementById('cancel-logout-btn');

document.getElementById('logout-btn')?.addEventListener('click', () => {
    if (logoutConfirmModal) logoutConfirmModal.style.display = 'flex';
});

cancelLogoutBtn?.addEventListener('click', () => {
    logoutConfirmModal.style.display = 'none';
});

confirmLogoutBtn?.addEventListener('click', () => {
    logoutConfirmModal.style.display = 'none';
    signOut(auth);
});

// Admin Reply Modal Close Logic
document.getElementById('close-admin-reply-modal')?.addEventListener('click', () => {
    document.getElementById('admin-reply-modal').style.display = 'none';
    if (activeReplyListener) {
        activeReplyListener(); // Stop listening for updates when modal is closed
        activeReplyListener = null;
    }
});

// Handle Publish Confirm Modal Buttons
document.getElementById('cancel-publish-btn')?.addEventListener('click', () => {
    document.getElementById('publish-confirm-modal').style.display = 'none';
});

document.getElementById('confirm-publish-btn')?.addEventListener('click', () => {
    document.getElementById('publish-confirm-modal').style.display = 'none';
    // Trigger the actual save logic
    executePublish();
});

// Handle Publish Success Modal Button
document.getElementById('close-success-modal-btn')?.addEventListener('click', () => {
    document.getElementById('publish-success-modal').style.display = 'none';
    clearPostForm();
});

// Handle Delete Confirm Modal Buttons
document.getElementById('cancel-delete-btn')?.addEventListener('click', () => {
    document.getElementById('delete-confirm-modal').style.display = 'none';
    postIdToDelete = null;
});

document.getElementById('confirm-delete-btn')?.addEventListener('click', async () => {
    if (postIdToDelete) {
        const deleteBtn = document.getElementById('confirm-delete-btn');
        deleteBtn.disabled = true;
        await deleteDoc(doc(db, "posts", postIdToDelete));
        invalidateAdminCaches();
        loadExistingPosts(true);
        document.getElementById('delete-confirm-modal').style.display = 'none';
        deleteBtn.disabled = false;
        postIdToDelete = null;
    }
});

onAuthStateChanged(auth, async (user) => {
    const loginSec = document.getElementById('login-section');
    const adminPanel = document.getElementById('admin-panel');
    if (user) {
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            const userData = userDoc.data();
            if (userDoc.exists() && userData.role === 'admin') {
                loginSec.style.display = "none";
                adminPanel.style.display = "block";
                
                // Initialize Firestore Data
                setupInteractionsSummary();
                loadAdminChats(false);
                loadExistingPosts();
                setupTabs();

                // Setup Firestore Live Chat
                if (!chatThreadsListenerInitialized) {
                    setupChatThreadsListener(user);
                    chatThreadsListenerInitialized = true;
                }
                setupAdminLiveChat(user); 
            } else {
                loginSec.style.display = "block";
                adminPanel.style.display = "none";
            }
        } catch (err) {
            console.error("Error verifying admin status:", err);
        }
    } else {
        loginSec.style.display = "block";
        adminPanel.style.display = "none";
        // Clear the post creation form
        clearPostForm();
        // Reset login button state and clear credentials
        const loginBtn = document.getElementById('login-btn');
        loginBtn.disabled = false;
        loginBtn.innerText = "Login to Dashboard";
        // Clear comment count listeners
        Object.values(adminCommentCountListeners).forEach(unsubscribe => unsubscribe());
        adminCommentCountListeners = {};
        adminCommentCounts = {};
        adminAllChats = []; // Clear cache on logout
        adminGeneralChats = []; // Clear cache on logout
        adminStatsCache = null;
        adminTopLikedCache = null;
        if (globalChatsListener) globalChatsListener();
        globalChatsListener = null;

        // Cleanup Firestore listener
        if (activeAdminLiveChatRef) {
            activeAdminLiveChatRef();
            activeAdminLiveChatRef = null;
        }

        chatThreadsListenerInitialized = false;
        activeTargetUserId = null;

        document.getElementById('email').value = '';
        document.getElementById('password').value = '';
    }
});

/**
 * Listens to all private chat threads to group them separately for the admin
 */
function setupChatThreadsListener(adminUser) {
    const threadsList = document.getElementById('admin-recent-threads-list');
    if (!threadsList) return;

    // Listen for chat summaries in Firestore
    const q = query(collection(db, "chat_summaries"), orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
        threadsList.innerHTML = "";
        if (snapshot.empty) {
            threadsList.innerHTML = "<p style='text-align:center; padding: 1rem; color: var(--gray); font-size: 0.8rem;'>No message history.</p>";
            return;
        }

        snapshot.forEach((docSnap) => {
            const thread = { uid: docSnap.id, ...docSnap.data() };
            const div = document.createElement('div');
            const isUnread = thread.unreadByAdmin === true;
            div.className = `thread-item ${isUnread ? 'unread-thread' : ''} ${thread.uid === activeTargetUserId ? 'active' : ''}`;

            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; font-weight: 600; font-size: 0.85rem;">
                    <span>${thread.name}</span>
                    ${isUnread ? '<span style="color: var(--danger); font-size: 0.7rem;">● New</span>' : ''}
                </div>
                <div style="font-size: 0.75rem; color: var(--gray); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${thread.lastMessage}</div>
            `;
           div.onclick = async () => {
        activeTargetUserId = thread.uid;
        setupAdminLiveChat(adminUser, thread.uid, thread.name);
        
        // Mark as read when admin clicks
        if (isUnread) {
            await updateDoc(doc(db, "chat_summaries", thread.uid), { unreadByAdmin: false });
        }
    };
            threadsList.appendChild(div);
        });
    });
}

/**
 * Shared Live Chat Logic for Admin
 * (Note: You'll need to add the same HTML structure to admin.html for this to render)
 */
function setupAdminLiveChat(adminUser, targetUserId = null, targetUserName = null) {
    const msgContainer = document.getElementById('admin-live-messages');
    const chatForm = document.getElementById('admin-live-chat-form');
    const chatInput = document.getElementById('admin-live-chat-input');
    const headerTitle = document.getElementById('admin-chat-header-title');

    if (!msgContainer || !chatForm) return;

    // Inject reply preview bar if not exists
    if (!document.getElementById('admin-reply-preview-bar')) {
        const bar = document.createElement('div');
        bar.id = 'admin-reply-preview-bar';
        bar.className = 'reply-preview-bar';
        bar.innerHTML = `<span id="admin-reply-preview-text"></span><i class="fas fa-times" id="cancel-admin-reply"></i>`;
        chatForm.parentNode.insertBefore(bar, chatForm);
        document.getElementById('cancel-admin-reply').addEventListener('click', () => {
            adminReplyingTo = null;
            bar.style.display = 'none';
        });
    }

    adminReplyingTo = null;
    document.getElementById('admin-reply-preview-bar').style.display = 'none';
    activeTargetUserId = targetUserId;

   if (!targetUserId) {
    headerTitle.textContent = "Live Conversations";
    msgContainer.innerHTML = `
        <div style="text-align:center; padding: 3rem 1rem; color: var(--gray);">
            <i class="fas fa-comments" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
            <p>Select a conversation from the list to view messages</p>
        </div>`;
    chatForm.style.display = "none";
    return;
     }

    headerTitle.textContent = `Chatting with ${targetUserName}`;
    chatForm.style.display = "flex";

    // Clean up existing listeners before starting a new one
    if (activeAdminLiveChatRef) {
        activeAdminLiveChatRef();
        activeAdminLiveChatRef = null;
    }
    isInitialAdminLiveLoad = true;

    const q = query(collection(db, "direct_messages", targetUserId, "messages"), orderBy("timestamp", "asc"), firestoreLimitToLast(50));
    activeAdminLiveChatRef = onSnapshot(q, (snapshot) => {
        let lastMsgUid = null;
        msgContainer.innerHTML = "";
        snapshot.forEach((doc) => {
            const msg = doc.data();
            lastMsgUid = msg.uid;
            const timeStr = msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            
            const wrapper = document.createElement('div');
            const isMe = msg.uid === adminUser.uid;
            wrapper.className = `slide-wrapper ${isMe ? 'me' : 'other'}`;
            wrapper.innerHTML = `
                <div class="slide-reply-indicator"><i class="fas fa-reply"></i> REPLY</div>
                <div class="slide-content">
                    <div class="live-msg">
                        ${msg.replyTo ? `<div class="reply-preview-in-msg"><strong>${msg.replyTo.name}</strong>: ${msg.replyTo.text}</div>` : ''}
                        <small>${msg.name} • ${timeStr}</small>${msg.text}
                    </div>
                </div>
            `;
            msgContainer.appendChild(wrapper);
            initAdminLiveChatReply(wrapper, msg.name, msg.text);
        });

        if (!isInitialAdminLiveLoad && lastMsgUid && lastMsgUid !== adminUser.uid) {
            chatNotification.play().catch(e => console.log("Sound blocked until user interacts with page."));
        }
        isInitialAdminLiveLoad = false;
        // Ensure the DOM has fully rendered the new messages before scrolling to the bottom
        setTimeout(() => {
            msgContainer.scrollTo({ top: msgContainer.scrollHeight, behavior: 'smooth' });
        }, 50);
    }, (error) => {
        console.error("Admin Live Chat Sync Error:", error);
    });

    chatForm.onsubmit = async (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text || !targetUserId) return;
        try {
            const messageData = {
                uid: adminUser.uid,
                name: "Admin",
                text: text,
                timestamp: serverTimestamp(),
                replyTo: adminReplyingTo
            };

            // 1. Save to the user's specific thread in Firestore
            await addDoc(collection(db, "direct_messages", targetUserId, "messages"), messageData);

            // 2. Update the summary so the last message is visible in the sidebar
            await setDoc(doc(db, "chat_summaries", targetUserId), {
                lastMessage: text,
                timestamp: serverTimestamp(),
                unreadByAdmin: false,
                unreadByUser: true
            }, { merge: true });

            adminReplyingTo = null;
            document.getElementById('admin-reply-preview-bar').style.display = 'none';
            chatInput.value = "";
        } catch (err) {
            console.error("Admin send error:", err);
            alert("Error sending message. Ensure your Admin UID is correctly set in the Database Rules.");
        }
    };
}

/**
 * Initializes the "Slide to Reply" gesture logic for Admin Live Chat
 */
function initAdminLiveChatReply(wrapper, name, text) {
    const content = wrapper.querySelector('.slide-content');
    const indicator = wrapper.querySelector('.slide-reply-indicator');
    let startX = 0, currentX = 0, isSliding = false;
    const threshold = 60;

    const handleStart = (e) => {
        startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        isSliding = false;
        content.style.transition = 'none';
    };

    const handleMove = (e) => {
        const x = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const dx = x - startX;
        if (Math.abs(dx) > 10) isSliding = true;

        if (isSliding && dx > 0) {
            if (e.cancelable) e.preventDefault();
            currentX = Math.min(dx, 80);
            content.style.transform = `translateX(${currentX}px)`;
            indicator.style.opacity = currentX / threshold;
        }
    };

    const handleEnd = () => {
        content.style.transition = 'transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
        if (isSliding && currentX >= threshold) {
            const bar = document.getElementById('admin-reply-preview-bar');
            const previewText = document.getElementById('admin-reply-preview-text');
            adminReplyingTo = { name, text };
            if (bar && previewText) {
                previewText.textContent = `Replying to ${name}: "${text.substring(0, 40)}..."`;
                bar.style.display = 'flex';
                document.getElementById('admin-live-chat-input')?.focus();
            }
        }
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

// --- 2. Cloudinary Upload ---
const myWidget = cloudinary.createUploadWidget({
    cloudName: 'djbkqazzt', 
    uploadPreset: 'jacinta'
}, (error, result) => { 
    if (!error && result && result.event === "success") { 
        uploadedImageUrl = result.info.secure_url;
        const preview = document.getElementById('preview-img');
        preview.src = uploadedImageUrl;
        preview.style.display = "block";
    }
});
document.getElementById("upload-widget").addEventListener("click", () => myWidget.open(), false);

// --- 3. Publishing Posts ---
document.getElementById('submit-post').addEventListener('click', async () => {
    const title = document.getElementById('post-title').value;
    const isContentEmpty = quill.getText().trim().length === 0;

    if (!title || isContentEmpty) {
        alert("Please provide both a title and some content for your post.");
        return;
    }

    // Show Confirmation Modal instead of immediate submission
    const confirmModal = document.getElementById('publish-confirm-modal');
    const confirmTitle = document.getElementById('publish-confirm-title');
    const confirmMsg = document.getElementById('publish-confirm-msg');
    const confirmBtn = document.getElementById('confirm-publish-btn');

    confirmTitle.textContent = editingPostId ? "Confirm Update" : "Confirm Publication";
    confirmMsg.textContent = editingPostId 
        ? "Are you sure you want to save the changes to this post?" 
        : "Are you sure you want to publish this post to the blog?";
    confirmBtn.textContent = editingPostId ? "Update Post" : "Publish Post";

    confirmModal.style.display = 'flex';
});

async function executePublish() {
    const submitBtn = document.getElementById('submit-post');
    const title = document.getElementById('post-title').value;
    const content = quill.root.innerHTML;

    // Set loading state
    submitBtn.disabled = true;
    submitBtn.innerText = editingPostId ? "Updating Post..." : "Publishing...";

    try {
        if (editingPostId) {
            // Update existing post
            const postRef = doc(db, "posts", editingPostId);
            await updateDoc(postRef, {
                title,
                content,
                image: uploadedImageUrl, // Use the current uploaded image or existing one
                updatedAt: serverTimestamp()
            });
        } else {
            // Add new post
            await addDoc(collection(db, "posts"), {
                title,
                content,
                image: uploadedImageUrl,
                createdAt: serverTimestamp() // Use serverTimestamp for consistency
            });
        }

        // Show Success Modal
        const successModal = document.getElementById('publish-success-modal');
        const successMsg = document.getElementById('publish-success-msg');
        successMsg.textContent = editingPostId ? "Post updated successfully!" : "Blog published!";
        successModal.style.display = 'flex';

        invalidateAdminCaches();
        loadExistingPosts(true); 

        // Automatically switch to "Manage Posts" tab after success
        const manageTabBtn = document.querySelector('[data-tab="manage-posts-tab"]');
        if (manageTabBtn) manageTabBtn.click();
        window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
        alert("Failed to publish: " + err.message);
        submitBtn.disabled = false;
        submitBtn.innerText = "Publish Post";
    }
}

// --- 4. Chat Management (Paginated) ---

// Keep the summary real-time for instant notifications
function setupInteractionsSummary() {
    const summary = document.getElementById('interactions-summary');
    if (!summary) return;

    // Listen for any unread interaction (general or post-specific)
    const q = query(collection(db, "chats"), where("status", "in", ["unread", "pending_reply"]));
    onSnapshot(q, (snapshot) => {
        summary.innerHTML = `<h3>You have ${snapshot.size} unread interactions.</h3>`;
    });
}

function loadAdminChats() {
    const chatsList = document.getElementById('chats-list');
    if (!chatsList) return;

    if (globalChatsListener) globalChatsListener();

    const q = query(
        collection(db, "chats"), 
        orderBy("createdAt", "desc"),
        limit(50)
    );

    globalChatsListener = onSnapshot(q, (snapshot) => {
        adminGeneralChats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        displayAdminChats(adminGeneralChats, false);
        if (snapshot.empty) {
            chatsList.innerHTML = "<p style='text-align:center; color: var(--gray); padding: 2rem;'>No questions found.</p>";
        }
    }, (err) => {
        console.error("Error listening to admin chats:", err);
        chatsList.innerHTML = "<p style='text-align:center; color: var(--danger);'>Failed to load community questions.</p>";
    });
}

function displayAdminChats(chats, hasMore = false) {
    const chatsList = document.getElementById('chats-list');
    if (!chatsList) return;

    chatsList.innerHTML = "<h4>Questions from Community</h4><div class='conversation-stream'></div>";
    const stream = chatsList.querySelector('.conversation-stream');

    chats.forEach((chat) => {
        const item = document.createElement('div');
        item.className = `stream-item ${chat.status === 'unread' ? 'unread-chat' : ''}`;
        item.innerHTML = `
            <div class="stream-header">
                <div style="display: flex; flex-direction: column;">
                    <span class="stream-author">${chat.userName || "Anonymous"}</span>
                    ${chat.postTitle ? `<small style="color: var(--primary); font-weight: 600;">Re: ${chat.postTitle}</small>` : '<small style="color: var(--gray);">General Inquiry</small>'}
                </div>
                <span class="stream-date">${chat.createdAt?.toDate ? chat.createdAt.toDate().toLocaleDateString() : 'Just now'}</span>
            </div>
            <div class="user-msg-slide slide-wrapper">
                <div class="slide-reply-indicator"><i class="fas fa-reply"></i> REPLY</div>
                <div class="slide-content">
                    <p class="stream-text">${chat.message}</p>
                </div>
            </div>
            ${chat.reply ? `
                <div class="author-reply-slide slide-wrapper">
                    <div class="slide-reply-indicator"><i class="fas fa-reply"></i> REPLY</div>
                    <div class="slide-content">
                        <div class="stream-author-reply">
                            <span class="reply-badge">My Reply</span>
                            ${chat.reply}
                        </div>
                    </div>
                </div>
            ` : ''}
            <div class="reply-input-area" id="reply-area-${chat.id}" style="${chat.reply ? 'display:none;' : 'display:block;'} margin-top: 10px;">
                <textarea id="reply-input-${chat.id}" placeholder="Type your reply..." style="margin-bottom: 5px;">${chat.reply || ''}</textarea>
                <button onclick="window.sendReply('${chat.id}')" style="padding: 0.5rem 1rem; font-size: 0.8rem;">${chat.reply ? 'Update Reply' : 'Send Reply'}</button>
            </div>
        `;
        stream.appendChild(item);
        initSlideToReply(item.querySelector('.user-msg-slide'), chat.id);
        if (chat.reply) initSlideToReply(item.querySelector('.author-reply-slide'), chat.id);
    });

    if (hasMore) {
        const btn = document.createElement('button');
        btn.className = 'load-more-admin-chats secondary-btn';
        btn.style.marginTop = '1rem';
        btn.textContent = 'Load More Questions';
        chatsList.appendChild(btn);
    }
}

/**
 * Initializes the "Slide to Reply" gesture logic for Admin
 */
function initSlideToReply(wrapper, chatId) {
    const content = wrapper.querySelector('.slide-content');
    const indicator = wrapper.querySelector('.slide-reply-indicator');
    let startX = 0, startY = 0, currentX = 0;
    let isSliding = false;
    let isScrolling = false;
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
        if (isSliding && currentX >= threshold) {
            const area = document.getElementById(`reply-area-${chatId}`);
            if (area) {
                area.style.display = 'block';
                area.querySelector('textarea')?.focus();
            }
        }
        content.style.transform = 'translateX(0px)';
        indicator.style.opacity = 0;
        startX = 0; currentX = 0; isSliding = false;
    };
    
    wrapper.addEventListener('touchstart', handleStart, { passive: true });
    wrapper.addEventListener('touchmove', handleMove, { passive: false });
    wrapper.addEventListener('touchend', handleEnd);
    wrapper.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', (e) => { if(startX > 0) handleMove(e); });
    window.addEventListener('mouseup', () => { if(startX > 0) { handleEnd(); } });
}

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('load-more-admin-chats')) {
        loadAdminChats(true);
    }
});

// --- Function to load and watch replies for a specific post in a modal ---
function openAdminReplyModal(postId, postTitle) {
    const modal = document.getElementById('admin-reply-modal');
    const titleSpan = document.getElementById('admin-modal-post-title');
    const listDiv = document.getElementById('admin-modal-replies-list');

    if (!modal || !listDiv) return;

    titleSpan.textContent = postTitle;
    modal.style.display = 'flex';

    // Clear existing listener if any
    if (activeReplyListener) activeReplyListener();

    const q = query(collection(db, "chats"), where("postId", "==", postId), orderBy("createdAt", "desc"));
    activeReplyListener = onSnapshot(q, (snapshot) => {
        listDiv.innerHTML = "";
        if (snapshot.empty) {
            listDiv.innerHTML = "<p style='text-align:center; color: var(--gray);'>No replies for this post yet.</p>";
            return;
        }
        snapshot.forEach(chatDoc => {
            const chat = chatDoc.data();
            const id = chatDoc.id;
            const bubble = document.createElement('div');
            bubble.className = `chat-bubble ${chat.status === 'unread' ? 'unread-chat' : ''}`;
            bubble.innerHTML = `
                <p><strong>${chat.userName || "Anonymous"}:</strong> ${chat.message}</p>
                ${chat.reply ? `<p style="color: var(--primary)"><strong>My Reply:</strong> ${chat.reply}</p>` : `
                    <textarea id="reply-input-${id}" placeholder="Type your reply..."></textarea>
                    <button onclick="window.sendReply('${id}')">Send Reply</button>
                `}
            `;
            listDiv.appendChild(bubble);
        });
    });
}

function updateAdminCommentCounts(posts) {
    posts.forEach((post) => {
        const postId = post.id;
        // If we already have a listener for this post, just update the DOM if it exists
        if (adminCommentCountListeners[postId]) {
            const countSpan = document.querySelector(`.admin-reply-count-${postId}`);
            if (countSpan && adminCommentCounts[postId] !== undefined) {
                countSpan.textContent = adminCommentCounts[postId];
            }
            return;
        }

        // Otherwise, set up a new real-time listener
        const q = query(collection(db, "chats"), where("postId", "==", postId));
        adminCommentCountListeners[postId] = onSnapshot(q, (snapshot) => {
            adminCommentCounts[postId] = snapshot.size;
            const countSpan = document.querySelector(`.admin-reply-count-${postId}`);
            if (countSpan) {
                countSpan.textContent = snapshot.size;
            }
        });
    });
}

// Expose to window so the inline onclick can find it
window.sendReply = async (chatId) => {
    const replyText = document.getElementById(`reply-input-${chatId}`).value;
    if (!replyText) return;

    try {
        const chatRef = doc(db, "chats", chatId);
        await updateDoc(chatRef, {
            reply: replyText, // The response to the user's question
            status: "read",
            repliedAt: serverTimestamp()
        });
        adminAllChats = []; // Invalidate chats cache for statistics
        adminGeneralChats = []; // Invalidate general questions cache
    } catch (err) {
        console.error("Error replying:", err);
    }
};

// --- 5. Manage Existing Posts ---
async function loadExistingPosts(forceRefresh = false) {
    const existingPostsDiv = document.getElementById('existing-posts');
    if (!existingPostsDiv) return;
    
    if (!forceRefresh && adminAllPosts.length > 0) {
        displayAdminPosts(adminAllPosts);
        return;
    }

    existingPostsDiv.innerHTML = '<p style="text-align: center;">Loading posts...</p>';

    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    
    adminAllPosts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    displayAdminPosts(adminAllPosts);
}

function displayAdminPosts(posts) {
    const existingPostsDiv = document.getElementById('existing-posts');
    if (!existingPostsDiv) return;

    existingPostsDiv.innerHTML = "";

    if (posts.length === 0) {
        existingPostsDiv.innerHTML = '<p style="text-align: center; color: var(--gray);">No posts found.</p>';
        return;
    }

    posts.forEach((post) => {
        const postId = post.id;
        
        // Check if content is long enough to warrant a "Read More" toggle
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = post.content || "";
        const isLong = (tempDiv.textContent || tempDiv.innerText || "").length > POST_PREVIEW_LIMIT;

        const postCard = document.createElement('div');
        postCard.className = 'post-card';
        postCard.innerHTML = `
            <img src="${post.image || 'https://via.placeholder.com/400'}" alt="Post Image">
            <div class="post-content">
                <h3>${post.title}</h3>
                <small>Published: ${post.createdAt?.toDate ? post.createdAt.toDate().toLocaleDateString() : 'N/A'}</small>
                ${post.updatedAt ? `<small>Updated: ${post.updatedAt.toDate().toLocaleDateString()}</small>` : ''}
                <div class="post-description collapsed" id="admin-desc-${postId}">${getSnippet(post.content)}</div>
                ${isLong ? `<span class="read-more-toggle" data-id="${postId}" data-limit="${POST_PREVIEW_LIMIT}">Read More</span>` : ''}
                <button class="view-replies-btn" data-id="${postId}" data-title="${post.title}" style="background-color: var(--success); margin-right: 0.5rem;">View Replies (<span class="admin-reply-count-${postId}">${adminCommentCounts[postId] || 0}</span>)</button>
                <div class="share-container" style="display: inline-block; margin-right: 0.5rem;">
                    <button class="share-post-btn" data-id="${postId}" style="background-color: var(--primary);">Share</button>
                    <div class="share-menu" id="admin-share-menu-${postId}">
                        <a href="#" class="share-item whatsapp" data-id="${postId}" title="Share on WhatsApp"><i class="fab fa-whatsapp"></i></a>
                        <a href="#" class="share-item twitter" data-id="${postId}" title="Share on Twitter"><i class="fab fa-twitter"></i></a>
                        <a href="#" class="share-item copy" data-id="${postId}" title="Copy Link"><i class="fas fa-link"></i></a>
                    </div>
                </div>
                <button class="edit-post-btn" data-id="${postId}" style="background-color: var(--primary); margin-right: 0.5rem;">Edit Post</button>
                <button class="delete-post-btn" data-id="${postId}" style="background-color: #ef4444; margin-top: 1rem;">Delete Post</button>
            </div>
        `;
        existingPostsDiv.appendChild(postCard);
    });

    updateAdminCommentCounts(posts);
}

// Search functionality for Admin Posts
document.getElementById('admin-search-bar')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = adminAllPosts.filter(post => post.title.toLowerCase().includes(term));
    displayAdminPosts(filtered);
});

// --- 6. Edit Post Functionality ---
document.getElementById('existing-posts').addEventListener('click', async (e) => {
    // Handle Read More Toggle in Admin
    if (e.target.classList.contains('read-more-toggle')) {
        const toggleBtn = e.target;
        const postId = toggleBtn.dataset.id;
        const desc = document.getElementById(`admin-desc-${postId}`);
        const post = adminAllPosts.find(p => p.id === postId);
        if (!post) return;

        const INCREMENT = 300;
        let currentLimit = parseInt(toggleBtn.dataset.limit) || POST_PREVIEW_LIMIT;

        if (toggleBtn.textContent === 'Read Less') {
            currentLimit = POST_PREVIEW_LIMIT;
            desc.innerHTML = getSnippet(post.content, currentLimit);
            desc.classList.add('collapsed');
            toggleBtn.textContent = 'Read More';
        } else {
            currentLimit += INCREMENT;
            desc.classList.remove('collapsed');
            
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = post.content || "";
            const totalLength = (tempDiv.textContent || tempDiv.innerText || "").length;

            if (currentLimit >= totalLength) {
                desc.innerHTML = post.content;
                toggleBtn.textContent = 'Read Less';
            } else {
                desc.innerHTML = getSnippet(post.content, currentLimit);
                toggleBtn.textContent = 'Read More';
            }
        }
        toggleBtn.dataset.limit = currentLimit;

        return;
    }

    // Handle Share Post
    if (e.target.classList.contains('share-post-btn')) {
        const postId = e.target.dataset.id;
        const menu = document.getElementById(`admin-share-menu-${postId}`);
        document.querySelectorAll('.share-menu.active').forEach(m => {
            if (m !== menu) m.classList.remove('active');
        });
        if (menu) menu.classList.toggle('active');
        return;
    }

    // Handle Share Sub-menu Items
    const shareItem = e.target.closest('.share-item');
    if (shareItem && shareItem.closest('#existing-posts')) {
        e.preventDefault();
        const postId = shareItem.dataset.id;
        const shareUrl = `${window.location.origin}/index.html#post-${postId}`;
        const post = adminAllPosts.find(p => p.id === postId);
        const text = post ? encodeURIComponent(`Check out this story: ${post.title}`) : "";

        if (shareItem.classList.contains('whatsapp')) {
            window.open(`https://api.whatsapp.com/send?text=${text}%20${shareUrl}`, '_blank');
        } else if (shareItem.classList.contains('twitter')) {
            window.open(`https://twitter.com/intent/tweet?url=${shareUrl}&text=${text}`, '_blank');
        } else if (shareItem.classList.contains('copy')) {
            navigator.clipboard.writeText(shareUrl).then(() => {
                alert("Post link copied to clipboard!");
            }).catch(err => console.error("Could not copy text: ", err));
        }
        shareItem.parentElement.classList.remove('active');
        return;
    }

    // Handle View Replies Button
    if (e.target.classList.contains('view-replies-btn')) {
        const postId = e.target.dataset.id;
        const postTitle = e.target.dataset.title;
        openAdminReplyModal(postId, postTitle);
        return;
    }

    // Handle Delete Post
    if (e.target.classList.contains('delete-post-btn')) {
        postIdToDelete = e.target.dataset.id;
        const deleteModal = document.getElementById('delete-confirm-modal');
        if (deleteModal) deleteModal.style.display = 'flex';
        return;
    }

    if (e.target.classList.contains('edit-post-btn')) {
        const postIdToEdit = e.target.dataset.id;
        const postRef = doc(db, "posts", postIdToEdit);
        const postSnap = await getDoc(postRef); // Need to import getDoc

        if (postSnap.exists()) {
            const postData = postSnap.data();
            document.getElementById('post-title').value = postData.title;
            quill.root.innerHTML = postData.content; // Set content to Quill editor
            uploadedImageUrl = postData.image || ""; // Set current image URL
            document.getElementById('preview-img').src = uploadedImageUrl;
            document.getElementById('preview-img').style.display = uploadedImageUrl ? "block" : "none";
            document.getElementById('submit-post').innerText = "Update Post";
            editingPostId = postIdToEdit;

            // Ensure the dashboard switches to the Create tab for editing
            const createTabBtn = document.querySelector('[data-tab="create-post-tab"]');
            if (createTabBtn) createTabBtn.click();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
});

// Helper to clear the post form
function clearPostForm() {
    document.getElementById('post-title').value = '';
    quill.setContents([{ insert: '\n' }]); // Clear Quill editor content, insert newline to prevent empty state issues
    uploadedImageUrl = '';
    document.getElementById('preview-img').style.display = 'none';
    const submitBtn = document.getElementById('submit-post');
    submitBtn.innerText = 'Publish Post';
    submitBtn.disabled = false;
    editingPostId = null;
}