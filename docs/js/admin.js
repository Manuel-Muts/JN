import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, getDocs, updateDoc, doc, onSnapshot, deleteDoc, getDoc, serverTimestamp, where, getCountFromServer, limit, startAfter } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { SharedComponents } from "./components.js";

const firebaseConfig = {
  apiKey: "AIzaSyBIGqZLYcDg3CR5VamDwBhtOOfl2Y0NYeI",
  authDomain: "timotech-films.firebaseapp.com",
  databaseURL: "https://timotech-films-default-rtdb.firebaseio.com",
  projectId: "timotech-films",
  storageBucket: "timotech-films.firebasestorage.app",
  messagingSenderId: "563809562931",
  appId: "1:563809562931:web:750ff7e819f2d57e9dce46"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Initialize Quill editor
const quill = new Quill('#editor', {
    theme: 'snow',
    placeholder: 'Write your blog post here...',
});


let uploadedImageUrl = "";
let editingPostId = null; // To keep track of the post being edited
let activeReplyListener = null; // Unsubscribe function for the modal listener
let globalChatsListener = null; // Live listener for the general questions tab
let adminAllPosts = []; // Local storage for search filtering
let adminAllChats = []; // Cache for statistics
let adminGeneralChats = []; // Cache for general questions
let adminCommentCounts = {}; // Stores counts locally: { postId: count }
let adminCommentCountListeners = {}; // Stores unsubscribe functions
let tabsInitialized = false;
const ADMIN_CHATS_PER_PAGE = 10;
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

        // 1. Ensure posts are loaded into cache
        if (adminAllPosts.length === 0) {
            const postsSnapshot = await getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc")));
            adminAllPosts = postsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        // 2. Ensure chats are loaded into cache
        if (adminAllChats.length === 0) {
            const chatsSnapshot = await getDocs(collection(db, "chats"));
            adminAllChats = chatsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        let mostLikedPost = { title: 'N/A', likes: -1 };
        adminAllPosts.forEach(postData => {
            const likes = postData.likes || 0;
            if (likes > mostLikedPost.likes) {
                mostLikedPost = { title: postData.title, likes: likes };
            }
        });

        if (likesDisplay) likesDisplay.textContent = mostLikedPost.likes > -1 ? mostLikedPost.likes : 0;
        if (mostLikedPostTitleDisplay) mostLikedPostTitleDisplay.textContent = mostLikedPost.title;

        const commentCountsByPost = {}; // { postId: count }
        const postTitlesById = {}; // { postId: title }
        adminAllPosts.forEach(post => postTitlesById[post.id] = post.title);

        adminAllChats.forEach(chat => {
            const postId = chat.postId;
            if (postId && postTitlesById[postId]) { // Only count comments linked to existing posts
                commentCountsByPost[postId] = (commentCountsByPost[postId] || 0) + 1;
            }
        });

        let mostCommentedPost = { title: 'N/A', comments: -1 };
        for (const postId in commentCountsByPost) {
            if (commentCountsByPost[postId] > mostCommentedPost.comments) {
                mostCommentedPost = { title: postTitlesById[postId], comments: commentCountsByPost[postId] };
            }
        }

        if (commentsDisplay) commentsDisplay.textContent = mostCommentedPost.comments > -1 ? mostCommentedPost.comments : 0;
        if (mostCommentedPostTitleDisplay) mostCommentedPostTitleDisplay.textContent = mostCommentedPost.title;
    } catch (err) {
        console.error("Error loading statistics:", err);
    }
}

async function loadTopLikedPosts() {
    const topPostsList = document.getElementById('top-liked-posts-list');
    if (!topPostsList) return;

    topPostsList.innerHTML = '<p style="text-align: center;">Loading top posts...</p>';

    try {
        // Use cache if available
        let topPosts;
        if (adminAllPosts.length > 0) {
            topPosts = [...adminAllPosts].sort((a, b) => (b.likes || 0) - (a.likes || 0)).slice(0, 5);
        } else {
            const q = query(collection(db, "posts"), orderBy("likes", "desc"), limit(5));
            const querySnapshot = await getDocs(q);
            topPosts = querySnapshot.docs.map(doc => doc.data());
        }

        topPostsList.innerHTML = ''; // Clear loading indicator

        if (topPosts.length === 0) {
            topPostsList.innerHTML = '<p style="text-align: center; color: var(--gray);">No posts with likes yet.</p>';
            return;
        }

        topPosts.forEach(post => {
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
    } catch (err) {
        console.error("Error loading top liked posts:", err);
        topPostsList.innerHTML = '<p style="text-align: center; color: var(--danger);">Failed to load top posts.</p>';
    }
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
        loginBtn.innerText = "Login to Dashboard";
    }
});

// Inject and then select elements
SharedComponents.inject('logoutModal');
SharedComponents.inject('adminReplyModal');
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

onAuthStateChanged(auth, async (user) => {
    const loginSec = document.getElementById('login-section');
    const adminPanel = document.getElementById('admin-panel');
    if (user) {
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists() && userDoc.data().role === 'admin') {
                loginSec.style.display = "none";
                adminPanel.style.display = "block";
                setupInteractionsSummary();
                loadAdminChats(false);
                loadExistingPosts();
                setupTabs(); // Initialize tabs after panel is visible
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
        if (globalChatsListener) globalChatsListener();
        globalChatsListener = null;
        
        document.getElementById('email').value = '';
        document.getElementById('password').value = '';
    }
});

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
    const submitBtn = document.getElementById('submit-post');
    const title = document.getElementById('post-title').value;
    const content = quill.root.innerHTML; // Get content from Quill editor

    if (!title || !content) {
        alert("Please fill in the post content.");
        return;
    }

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
                updatedAt: new Date() // Add an updatedAt timestamp
            });
            alert("Post updated successfully!");
            editingPostId = null; // Reset editing state
            submitBtn.innerText = "Publish Post"; // Reset button text
        } else {
            // Add new post
            await addDoc(collection(db, "posts"), {
                title,
                content,
                image: uploadedImageUrl,
                createdAt: serverTimestamp() // Use serverTimestamp for consistency
            });
            alert("Blog published!");
        }
        clearPostForm(); // Clear the form after action

        // Invalidate cache and refresh
        adminAllPosts = [];
        adminAllChats = [];
        adminGeneralChats = [];
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
});

// --- 4. Chat Management (Paginated) ---

// Keep the summary real-time for instant notifications
function setupInteractionsSummary() {
    const summary = document.getElementById('interactions-summary');
    if (!summary) return;

    const q = query(collection(db, "chats"), where("postId", "==", null), where("status", "==", "unread"));
    onSnapshot(q, (snapshot) => {
        summary.innerHTML = `<h3>You have ${snapshot.size} unread questions.</h3>`;
    });
}

function loadAdminChats() {
    const chatsList = document.getElementById('chats-list');
    if (!chatsList) return;

    if (globalChatsListener) globalChatsListener();

    const q = query(
        collection(db, "chats"), 
        where("postId", "==", null),
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
        chatsList.innerHTML = "<p style='text-align:center; color: var(--danger);'>Failed to load live chats.</p>";
    });
}

function displayAdminChats(chats, hasMore = false) {
    const chatsList = document.getElementById('chats-list');
    if (!chatsList) return;

    chatsList.innerHTML = "";
    chats.forEach((chat) => {
        const card = document.createElement('div');
        card.className = `chat-bubble ${chat.status === 'unread' ? 'unread-chat' : ''}`;
        card.innerHTML = `
            <p><strong>${chat.userName || "Anonymous"}:</strong> ${chat.message}</p>
            ${chat.reply ? `<p style="color: var(--primary)"><strong>My Reply:</strong> ${chat.reply}</p>` : `
                <textarea id="reply-input-${chat.id}" placeholder="Type your reply..."></textarea>
                <button onclick="window.sendReply('${chat.id}')">Send Reply</button>
            `}
        `;
        chatsList.appendChild(card);
    });

    if (hasMore) {
        const btn = document.createElement('button');
        btn.className = 'load-more-admin-chats secondary-btn';
        btn.style.marginTop = '1rem';
        btn.textContent = 'Load More Questions';
        chatsList.appendChild(btn);
    }
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
            reply: replyText,
            status: "read",
            repliedAt: serverTimestamp() // Add a timestamp for when the reply was made
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

        const postCard = document.createElement('div');
        postCard.className = 'post-card';
        postCard.innerHTML = `
            <img src="${post.image || 'https://via.placeholder.com/400'}" alt="Post Image">
            <div class="post-content">
                <h3>${post.title}</h3>
                <small>Published: ${post.createdAt?.toDate ? post.createdAt.toDate().toLocaleDateString() : 'N/A'}</small>
                ${post.updatedAt ? `<small>Updated: ${post.updatedAt.toDate().toLocaleDateString()}</small>` : ''}
                <div class="post-description collapsed" id="admin-desc-${postId}">${post.content}</div>
                <span class="read-more-admin-toggle" data-id="${postId}" style="color: var(--primary); cursor: pointer; font-weight: 600; display: block; margin: 0.5rem 0;">Read More</span>
                <button class="view-replies-btn" data-id="${postId}" data-title="${post.title}" style="background-color: var(--success); margin-right: 0.5rem;">View Replies (<span class="admin-reply-count-${postId}">${adminCommentCounts[postId] || 0}</span>)</button>
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
    if (e.target.classList.contains('read-more-admin-toggle')) {
        const postId = e.target.dataset.id;
        const desc = document.getElementById(`admin-desc-${postId}`);
        const isCollapsed = desc.classList.toggle('collapsed');
        e.target.textContent = isCollapsed ? 'Read More' : 'Read Less';
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
        const postIdToDelete = e.target.dataset.id;
        if (confirm("Are you sure you want to delete this post?")) {
            await deleteDoc(doc(db, "posts", postIdToDelete));
            // Invalidate cache and refresh
            adminAllPosts = [];
            adminAllChats = [];
            loadExistingPosts(true); 
        }
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
    document.getElementById('submit-post').innerText = 'Publish Post';
    editingPostId = null;
}