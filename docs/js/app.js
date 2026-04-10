// --- Firebase Imports & Initialization ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, getDocs, serverTimestamp, where, updateDoc, doc, increment, limit, startAfter, onSnapshot, getDoc, setDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

let allPosts = [];
let currentUser = null;
let currentUserData = { likedPosts: [] };
let currentPostIdForReply = null;
let currentPostTitleForReply = null;
let lastVisiblePost = null;
let hasMore = true;
let isLoading = false;
const POSTS_PER_PAGE = 6; 
let allGeneralChats = []; // Cache for community chats
let commentPagination = {}; // Tracks { lastDoc, hasMore } per postId
let generalChatPagination = { lastDoc: null, hasMore: true };
let commentSortOrder = {}; // Tracks { postId: 'asc' | 'desc' }
let commentCounts = {}; // Stores counts locally: { postId: count }
let commentCountListeners = {}; // Stores unsubscribe functions
let likeCounts = {}; // Stores like counts locally
let likeCountListeners = {}; // Stores unsubscribe functions for likes
const COMMENTS_PER_PAGE = 10;

// --- State and Element Selectors ---
const blogFeed = document.getElementById('blog-feed');
const searchBar = document.getElementById('search-bar');
const replyModal = document.getElementById('reply-modal');
const closeButton = document.querySelector('#reply-modal .close-button');
const replyForm = document.getElementById('reply-form');
const replyUserNameInput = document.getElementById('reply-user-name');
const replyMessageInput = document.getElementById('reply-message');
const modalPostTitleSpan = document.getElementById('modal-post-title');
const hiddenPostIdInput = document.getElementById('hidden-post-id');
const hiddenPostTitleInput = document.getElementById('hidden-post-title');
const sentinel = document.getElementById('infinite-scroll-sentinel');

// --- Auth Handlers ---
const userAuthModalBtn = document.getElementById('user-auth-modal-btn');
const logoutBtn = document.getElementById('user-logout-btn');
const profileNav = document.getElementById('user-profile-nav');
const displayNameSpan = document.getElementById('user-display-name');

// Auth Modal Elements
const userAuthModal = document.getElementById('user-auth-modal');
const closeAuthModalBtn = document.getElementById('close-auth-modal');
const authModalTitle = document.getElementById('auth-modal-title');
const authForm = document.getElementById('auth-form');
const signupFields = document.getElementById('signup-fields');
const authFirstNameInput = document.getElementById('auth-first-name');
const authLastNameInput = document.getElementById('auth-last-name');
const authEmailInput = document.getElementById('auth-email');
const authPasswordInput = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authToggleText = document.getElementById('auth-toggle-text');
const authToggleLink = document.getElementById('auth-toggle-link');
const authErrorMessage = document.getElementById('auth-error-message');

// Inject shared components before selecting them
SharedComponents.inject('logoutModal');
SharedComponents.inject('viewRepliesModal');
SharedComponents.inject('communityChatModal');

// Logout Modal Elements
const logoutConfirmModal = document.getElementById('logout-confirm-modal');
const confirmLogoutBtn = document.querySelector('#logout-confirm-modal #confirm-logout-btn');
const cancelLogoutBtn = document.querySelector('#logout-confirm-modal #cancel-logout-btn');

let isSigningUp = false;

userAuthModalBtn?.addEventListener('click', () => {
    userAuthModal.style.display = 'flex';
    isSigningUp = false; // Default to sign-in form
    updateAuthModalUI();
});

closeAuthModalBtn?.addEventListener('click', () => {
    userAuthModal.style.display = 'none';
    authForm.reset();
    authErrorMessage.textContent = '';
});

userAuthModal?.addEventListener('click', (e) => {
    if (e.target === userAuthModal) {
        userAuthModal.style.display = 'none';
        authForm.reset();
        authErrorMessage.textContent = '';
    }
});

authToggleLink?.addEventListener('click', (e) => {
    e.preventDefault();
    isSigningUp = !isSigningUp;
    updateAuthModalUI();
});

function updateAuthModalUI() {
    authModalTitle.textContent = isSigningUp ? 'Sign Up' : 'Sign In';
    signupFields.style.display = isSigningUp ? 'block' : 'none';
    authSubmitBtn.textContent = isSigningUp ? 'Sign Up' : 'Sign In';
    authToggleText.textContent = isSigningUp ? 'Already have an account?' : 'Don\'t have an account?';
    authToggleLink.textContent = isSigningUp ? 'Sign In' : 'Sign Up';
    authErrorMessage.textContent = ''; // Clear previous errors

    // Toggle the required attribute based on mode to prevent "not focusable" validation errors
    authFirstNameInput.required = isSigningUp;
    authLastNameInput.required = isSigningUp;
}

authForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    authErrorMessage.textContent = ''; // Clear previous errors
    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = isSigningUp ? 'Signing Up...' : 'Signing In...';

    const email = authEmailInput.value;
    const password = authPasswordInput.value;
    const firstName = authFirstNameInput.value;
    const lastName = authLastNameInput.value;

    try {
        if (isSigningUp) {
            if (!firstName || !lastName) {
                throw new Error("Please enter your first and last name.");
            }
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await setDoc(doc(db, "users", userCredential.user.uid), {
                firstName: firstName,
                lastName: lastName,
                email: email,
                likedPosts: [],
                createdAt: serverTimestamp()
            });
            alert("Registration successful! You are now logged in.");
        } else {
            await signInWithEmailAndPassword(auth, email, password);
            alert("Login successful!");
        }
        authForm.reset();
        // Redirect to client dashboard on success
        window.location.href = 'client.html';
    } catch (error) {
        console.error("Authentication error:", error);
        authErrorMessage.textContent = error.message;
    } finally {
        authSubmitBtn.disabled = false;
        authSubmitBtn.textContent = isSigningUp ? 'Sign Up' : 'Sign In';
    }
});

logoutBtn?.addEventListener('click', () => {
    logoutConfirmModal.style.display = 'flex';
});

cancelLogoutBtn?.addEventListener('click', () => {
    logoutConfirmModal.style.display = 'none';
});

confirmLogoutBtn?.addEventListener('click', () => {
    logoutConfirmModal.style.display = 'none';
    signOut(auth).then(() => {
        window.location.href = 'index.html';
    }).catch(console.error);
});

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    const isClientPage = window.location.pathname.includes('client.html');
    const isIndexPage = window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/');

    // Always hide community trigger on client page for both guests and members
    const commCard = document.getElementById('community-modal-trigger')?.closest('.interaction-box');
    if (isClientPage && commCard) commCard.style.display = 'none';

    if (user) {
        if (userAuthModalBtn) userAuthModalBtn.style.display = 'none';
        if (profileNav) profileNav.style.display = 'flex';
        
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const data = userSnap.data() || {};
        currentUserData = { ...data, likedPosts: data.likedPosts || [] };
        if (displayNameSpan) displayNameSpan.textContent = currentUserData.firstName || user.email.split('@')[0];
        
        // Auto-fill name fields if they exist
        const replyNameInput = document.getElementById('reply-user-name');
        const modalCommNameInput = document.getElementById('modal-user-name');
        const fullName = `${currentUserData.firstName || ''} ${currentUserData.lastName || ''}`.trim();

        if (replyNameInput) replyNameInput.value = fullName;
        if (modalCommNameInput) modalCommNameInput.value = fullName;

        setupUserChatListener();
    } else {
        if (userAuthModalBtn) userAuthModalBtn.style.display = 'block';
        if (profileNav) profileNav.style.display = 'none';
        currentUserData = { likedPosts: [] };

        // Clear name field for guest access
        const modalCommNameInput = document.getElementById('modal-user-name');
        if (modalCommNameInput) modalCommNameInput.value = '';

        // Protect the client page from guests
        if (isClientPage) window.location.href = 'index.html';

        if (userChatListener) userChatListener();
        userChatListener = null;
    }
    renderPosts(allPosts); // Refresh view to update like buttons
});

// --- 1. Fetch and Display Blog Posts ---
async function loadPosts(append = false, forceRefresh = false) {
    if (isLoading) return;

    // Caching check: use existing posts if available and not forcing a refresh
    if (!append && !forceRefresh && allPosts.length > 0) {
        renderPosts(allPosts);
        updateReplyCounts(allPosts);
        setupLikeListeners(allPosts);
        return;
    }

    if (append && !hasMore) return;
    isLoading = true;

    // Show loading indicator in the sentinel
    if (sentinel) sentinel.innerHTML = '<span class="spinner" style="border-top-color: var(--primary); border-left-color: var(--primary);"></span> Loading more stories...';

    try {
        let q;
        if (!append) {
            allPosts = [];
            lastVisiblePost = null;
            hasMore = true;
            q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(POSTS_PER_PAGE));
        } else {
            q = query(collection(db, "posts"), orderBy("createdAt", "desc"), startAfter(lastVisiblePost), limit(POSTS_PER_PAGE));
        }

        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            hasMore = false;
            if (sentinel) sentinel.innerHTML = "<p style='color: var(--gray);'>You've reached the end of our stories.</p>";
            if (!append) renderPosts([]);
            return;
        }

        lastVisiblePost = querySnapshot.docs[querySnapshot.docs.length - 1];
        hasMore = querySnapshot.docs.length === POSTS_PER_PAGE;
        
        const newPosts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allPosts = [...allPosts, ...newPosts];

        if (!hasMore && sentinel) {
            sentinel.innerHTML = "<p style='color: var(--gray);'>You've reached the end of our stories.</p>";
        } else if (sentinel) {
            sentinel.innerHTML = "";
        }

        renderPosts(allPosts);
        updateReplyCounts(allPosts);
        setupLikeListeners(allPosts);
    } catch (err) {
        console.error("Error loading posts:", err);
    } finally {
        isLoading = false;
    }
}

function updateReplyCounts(posts) {
    posts.forEach((post) => {
        // If we already have a listener for this post, just update the DOM if it exists
        if (commentCountListeners[post.id]) {
            const countSpan = document.querySelector(`.reply-count-${post.id}`);
            if (countSpan && commentCounts[post.id] !== undefined) {
                countSpan.textContent = commentCounts[post.id];
            }
            return;
        }

        // Otherwise, set up a new real-time listener
        const q = query(collection(db, "chats"), where("postId", "==", post.id));
        commentCountListeners[post.id] = onSnapshot(q, (snapshot) => {
            commentCounts[post.id] = snapshot.size;
            const countSpan = document.querySelector(`.reply-count-${post.id}`);
            if (countSpan) {
                countSpan.textContent = snapshot.size;
            }
        });
    });
}

function setupLikeListeners(posts) {
    posts.forEach((post) => {
        // If we already have a listener for this post, just update the DOM if it exists
        if (likeCountListeners[post.id]) {
            const countSpan = document.querySelector(`.like-count-${post.id}`);
            if (countSpan && likeCounts[post.id] !== undefined) {
                countSpan.textContent = likeCounts[post.id];
            }
            return;
        }

        // Set up a new real-time listener for the post document
        const postRef = doc(db, "posts", post.id);
        likeCountListeners[post.id] = onSnapshot(postRef, (docSnap) => {
            if (docSnap.exists()) {
                const newLikes = docSnap.data().likes || 0; // Ensure likes field exists
                const oldLikes = likeCounts[post.id];
                
                likeCounts[post.id] = newLikes;
                const countSpan = document.querySelector(`.like-count-${post.id}`);
                
                if (countSpan) {
                    countSpan.textContent = newLikes;
                    // Animate only if the count actually increased from a known value
                    if (oldLikes !== undefined && newLikes > oldLikes) {
                        countSpan.classList.add('like-pop');
                        setTimeout(() => countSpan.classList.remove('like-pop'), 400);
                    }
                }
            }
        });
    });
}

// --- Floating Heart Animation ---
const triggerHeartAnimation = (button) => {
    const rect = button.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    for (let i = 0; i < 12; i++) {
        const heart = document.createElement('div');
        heart.className = 'floating-heart';
        heart.innerHTML = ['❤️', '💖', '💗', '💓', '✨', '💕'][Math.floor(Math.random() * 6)];
        
        heart.style.left = `${centerX}px`;
        heart.style.top = `${centerY}px`;
        heart.style.setProperty('--x-dir', `${(Math.random() - 0.5) * 200}px`);
        heart.style.setProperty('--y-dir', `${-100 - Math.random() * 150}px`);
        
        document.body.appendChild(heart);
        setTimeout(() => heart.remove(), 1000);
    }
};

// --- Infinite Scroll Observer ---
const observer = new IntersectionObserver((entries) => {
    // Trigger fetch when sentinel is 10% visible
    if (entries[0].isIntersecting && hasMore && !isLoading) {
        loadPosts(true);
    }
}, { threshold: 0.1 });

if (sentinel) {
    observer.observe(sentinel);
}

function renderPosts(posts) {
    if (!blogFeed) return;
    blogFeed.innerHTML = "";
    
    // If guest, only show the first 3 posts to encourage sign-up
    const displayPosts = currentUser ? posts : posts.slice(0, 3);

    if (displayPosts.length === 0 && posts.length === 0) {
        blogFeed.innerHTML = "<p style='text-align: center; grid-column: 1 / -1;'>No stories found matching your search.</p>";
        return;
    }

    displayPosts.forEach((post) => {
        const hasLiked = currentUserData.likedPosts?.includes(post.id);
        const postElement = document.createElement("div");
        postElement.className = "post-card fade-in";
        postElement.innerHTML = `
            <img src="${post.image || 'https://via.placeholder.com/400'}" alt="Blog Image">
            <div class="post-content">
                <h3>${post.title}</h3>
                <small>
                    ${post.createdAt?.toDate ? post.createdAt.toDate().toLocaleDateString() : ''}
                    ${currentUser && allPosts.indexOf(post) >= 3 ? '<span class="member-badge">Member</span>' : ''}
                </small>
                <div class="post-description collapsed" id="desc-${post.id}">${post.content || ""}</div>
                <span class="read-more-toggle" data-id="${post.id}">Read More</span>
                <div class="post-actions">
                    <button class="like-btn ${hasLiked ? 'liked' : ''}" data-post-id="${post.id}" ${hasLiked ? 'disabled' : ''}>
                        ❤️ <span class="like-count like-count-${post.id}">${likeCounts[post.id] !== undefined ? likeCounts[post.id] : (post.likes || 0)}</span>
                    </button>
                    <button class="open-reply-modal-btn" data-post-id="${post.id}" data-post-title="${post.title}">Reply</button>
                    <button class="toggle-replies-btn" data-post-id="${post.id}">View Replies (<span class="reply-count-${post.id}">${commentCounts[post.id] || 0}</span>)</button>
                </div>
            </div>
        `;
        blogFeed.appendChild(postElement);
    });

    // Add "Unlock More" card for guests if there are more posts available
    if (!currentUser && posts.length > 3) {
        const ctaCard = document.createElement("div");
        ctaCard.className = "post-card cta-card fade-in";
        ctaCard.innerHTML = `
            <div class="post-content">
                <i class="fas fa-lock"></i>
                <h3>Unlock More Stories</h3>
                <p>Sign in to your account to access our full library of youth insights and mental wellness conversations.</p>
                <button onclick="document.getElementById('user-auth-modal-btn').click()" style="width: 100%; margin-top: 1rem;">Join for Free</button>
            </div>
        `;
        blogFeed.appendChild(ctaCard);
    }
}

// --- Global Click Handler for Dynamic Buttons (Likes & Reply Modal) ---
document.addEventListener('click', async (e) => {
    const likeBtn = e.target.closest('.like-btn');
    const replyOpenBtn = e.target.closest('.open-reply-modal-btn');
    const toggleRepliesBtn = e.target.closest('.toggle-replies-btn');
    const readMoreBtn = e.target.closest('.read-more-toggle');

    // Handle Read More Toggle
    if (readMoreBtn) {
        const postId = readMoreBtn.dataset.id;
        const desc = document.getElementById(`desc-${postId}`);
        const isCollapsed = desc.classList.toggle('collapsed');
        readMoreBtn.textContent = isCollapsed ? 'Read More' : 'Read Less';
        return;
    }

    // Handle Like
    if (likeBtn) {
        const postId = likeBtn.dataset.postId;

        if (!currentUser) {
            userAuthModal.style.display = 'flex';
            isSigningUp = false;
            updateAuthModalUI();
            return;
        }

        // Safety check: if already liked, do nothing
        if (currentUserData.likedPosts?.includes(postId)) return;

        likeBtn.disabled = true; // Prevent double-clicks
        try {
            // Trigger the love emoji animation
            triggerHeartAnimation(likeBtn);

            // Update both the post count and the user's liked history
            await updateDoc(doc(db, "posts", postId), { likes: increment(1) });
            await setDoc(doc(db, "users", currentUser.uid), {
                likedPosts: arrayUnion(postId)
            }, { merge: true });
            currentUserData.likedPosts.push(postId);
            likeBtn.classList.add('liked');
            // Keep button disabled as the user has now liked the post
        } catch (err) {
            console.error("Error liking post:", err);
            likeBtn.disabled = false; // Re-enable only on failure so they can try again
        }
    }

    // Handle Load More Comments
    const loadMoreCommentsBtn = e.target.closest('.load-more-comments');
    if (loadMoreCommentsBtn) {
        loadRepliesForPost(loadMoreCommentsBtn.dataset.postId, true);
    }

    // Handle Load More General Chats
    if (e.target.closest('.load-more-chats')) {
        loadChats(true);
    }

    // Handle Open Reply Modal
    if (replyOpenBtn) {
        if (!currentUser) {
            userAuthModal.style.display = 'flex';
            isSigningUp = false;
            updateAuthModalUI();
            return;
        }

        currentPostIdForReply = replyOpenBtn.dataset.postId;
        currentPostTitleForReply = replyOpenBtn.dataset.postTitle;
        if (modalPostTitleSpan) modalPostTitleSpan.textContent = currentPostTitleForReply;
        if (hiddenPostIdInput) hiddenPostIdInput.value = currentPostIdForReply;
        if (hiddenPostTitleInput) hiddenPostTitleInput.value = currentPostTitleForReply;
        if (replyModal) replyModal.style.display = 'flex';
    }

    // Handle View Replies Modal
    if (toggleRepliesBtn) {
        if (!currentUser) {
            userAuthModal.style.display = 'flex';
            isSigningUp = false;
            updateAuthModalUI();
            return;
        }
        const postId = toggleRepliesBtn.dataset.postId;
        const postTitle = allPosts.find(p => p.id === postId)?.title || "";
        openViewRepliesModal(postId, postTitle);
    }

    // Handle Community Chat Modal Trigger
    const commTrigger = e.target.closest('#community-modal-trigger');
    if (commTrigger) {
        document.getElementById('community-chat-modal').style.display = 'flex';
    }
});

// --- Search Functionality ---
searchBar?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allPosts.filter(post => post.title.toLowerCase().includes(term));
    renderPosts(filtered);
    updateReplyCounts(filtered);
    setupLikeListeners(filtered);
    
    // Hide sentinel during search to prevent accidental triggers
    if (sentinel) {
        sentinel.style.display = term === "" ? 'block' : 'none';
    }
});

// --- Live Chatting (User's Matters) ---
let userChatListener = null;
function setupUserChatListener() {
    if (userChatListener) userChatListener();
    const myChatsDiv = document.getElementById('my-conversations-list');
    if (!myChatsDiv || !currentUser) return;

    const q = query(
        collection(db, "chats"),
        where("userId", "==", currentUser.uid),
        orderBy("createdAt", "desc")
    );

    userChatListener = onSnapshot(q, (snapshot) => {
        myChatsDiv.innerHTML = "";
        if (snapshot.empty) {
            myChatsDiv.innerHTML = "<p style='color: var(--gray); text-align: center; padding: 1rem;'>No conversations yet.</p>";
            return;
        }
        snapshot.forEach(docSnap => {
            const chat = docSnap.data();
            const bubble = document.createElement('div');
            // Use the unread-chat class if there's a new admin reply
            bubble.className = `chat-bubble ${chat.reply && chat.status !== 'read' ? 'unread-chat' : ''}`;
            bubble.innerHTML = `
                <p><strong>Me:</strong> ${chat.message}</p>
                ${chat.reply ? `<p style="color: var(--primary); margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 8px;"><strong>Admin:</strong> ${chat.reply}</p>` : 
                '<p style="color: var(--gray); font-style: italic; font-size: 0.85rem; margin-top: 5px;">Waiting for a response...</p>'}
                <small style="display:block; margin-top: 8px; color: var(--gray); font-size: 0.75rem;">
                    ${chat.postTitle ? `Topic: ${chat.postTitle}` : 'General Inquiry'} • 
                    ${chat.createdAt?.toDate ? chat.createdAt.toDate().toLocaleString() : 'Just now'}
                </small>
            `;
            myChatsDiv.appendChild(bubble);
        });
    });
}

// --- 2. Submit Chat/Question ---
document.getElementById('community-chat-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('modal-send-chat-btn');
    const name = document.getElementById('modal-user-name').value.trim();
    const message = document.getElementById('modal-user-question').value.trim();

    if (!message) return;

    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Sending...';

    try {
        await addDoc(collection(db, "chats"), {
            userName: name || "Anonymous",
            message: message,
            userId: currentUser.uid,
            postId: null, // General chat identifier
            createdAt: serverTimestamp(),
            status: "unread"
        });

        alert("Thank you! Your message has been sent to the community.");
        document.getElementById('community-chat-modal').style.display = 'none';
        document.getElementById('community-chat-form').reset();
        
        // Refresh the chats list to show the update (though it only shows author-replied chats)
        loadChats(false, true);
    } catch (err) {
        console.error("Error sending community message:", err);
        alert("Failed to send message: " + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
});

// Close Community Modal
document.getElementById('close-community-modal')?.addEventListener('click', () => {
    document.getElementById('community-chat-modal').style.display = 'none';
});
document.getElementById('community-chat-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('community-chat-modal')) {
        document.getElementById('community-chat-modal').style.display = 'none';
    }
});

// --- 3. Load Public Replies (General Questions) ---
async function loadChats(append = false, forceRefresh = false) {
    const chatDiv = document.getElementById('public-chats');
    if (!chatDiv) return;

    if (!append && !forceRefresh && allGeneralChats.length > 0) {
        displayChats(allGeneralChats, generalChatPagination.hasMore);
        return;
    }

    if (!append) {
        generalChatPagination = { lastDoc: null, hasMore: true };
        allGeneralChats = [];
    }

    if (!generalChatPagination.hasMore) return;

    try {
        let q = query(
            collection(db, "chats"), 
            where("postId", "==", null), 
            orderBy("createdAt", "desc"),
            limit(COMMENTS_PER_PAGE)
        );

        if (append && generalChatPagination.lastDoc) {
            q = query(q, startAfter(generalChatPagination.lastDoc));
        }

        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            generalChatPagination.hasMore = false;
            return;
        }

        generalChatPagination.lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
        generalChatPagination.hasMore = querySnapshot.docs.length === COMMENTS_PER_PAGE;

        const newChats = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allGeneralChats = [...allGeneralChats, ...newChats];

        displayChats(allGeneralChats, generalChatPagination.hasMore);
    } catch (err) {
        console.error("Error loading chats:", err);
    }
}

function displayChats(chats, hasMore = false) {
    const chatDiv = document.getElementById('public-chats');
    if (!chatDiv) return;

    chatDiv.innerHTML = "<h4>Recent Conversations</h4><div class='chats-list'></div>";
    const chatsList = chatDiv.querySelector('.chats-list');

    chats.forEach((chat) => {
        if(chat.reply) { // Ensure there's an author reply to display in this section
            const bubble = document.createElement('div');
            bubble.className = 'chat-bubble';
            bubble.innerHTML = `
                <strong>${chat.userName || "Anonymous"}:</strong> ${chat.message}
                <div style="margin-top:10px; color: var(--primary);">
                    <strong>Author Reply:</strong> ${chat.reply}
                </div>
                <small style="display:block; margin-top: 5px; color: var(--gray);">
                    ${chat.createdAt?.toDate ? chat.createdAt.toDate().toLocaleDateString() : 'Just now'}
                </small>
            `;
            chatsList.appendChild(bubble);
        }
    });

    if (hasMore) {
        const btn = document.createElement('button');
        btn.className = 'load-more-chats secondary-btn';
        btn.textContent = 'Load More Conversations';
        chatDiv.appendChild(btn);
    }
}

// --- View Replies Modal Helpers ---
let currentViewRepliesPostId = null;
function openViewRepliesModal(postId, postTitle) {
    currentViewRepliesPostId = postId;
    const modal = document.getElementById('view-replies-modal');
    const titleSpan = document.getElementById('view-modal-post-title');
    const sortSelect = document.getElementById('modal-sort-replies');
    if (!modal || !titleSpan) return;
    titleSpan.textContent = postTitle;
    sortSelect.value = commentSortOrder[postId] || 'desc';
    modal.style.display = 'flex';
    loadRepliesForPost(postId);
}

document.getElementById('close-view-replies-modal')?.addEventListener('click', () => {
    document.getElementById('view-replies-modal').style.display = 'none';
    if (currentPostRepliesListener) currentPostRepliesListener();
});

document.getElementById('modal-sort-replies')?.addEventListener('change', (e) => {
    if (currentViewRepliesPostId) {
        commentSortOrder[currentViewRepliesPostId] = e.target.value;
        loadRepliesForPost(currentViewRepliesPostId);
    }
});

// --- 4. Load Replies for Specific Posts ---
let currentPostRepliesListener = null;
function loadRepliesForPost(postId) {
    const repliesList = document.getElementById('view-modal-replies-list');
    if (!repliesList) return;

    if (currentPostRepliesListener) currentPostRepliesListener();

    const sortOrder = commentSortOrder[postId] || 'desc';
    const q = query(
        collection(db, "chats"), 
        where("postId", "==", postId), 
        orderBy("createdAt", sortOrder),
        limit(50)
    );

    currentPostRepliesListener = onSnapshot(q, (snapshot) => {
        repliesList.innerHTML = "";
        if (snapshot.empty) {
            repliesList.innerHTML = "<p style='font-size: 0.9em; color: var(--gray); text-align: center; padding: 1rem;'>No replies yet. Be the first!</p>";
            return;
        }
        snapshot.forEach((docSnap) => {
            const chat = docSnap.data();
            const bubble = document.createElement('div');
            bubble.className = 'post-reply-bubble';
            bubble.innerHTML = `
                <strong>${chat.userName || "Anonymous"}:</strong> ${chat.message}
                ${chat.reply ? `
                    <div style="margin-top:10px; color: var(--primary); border-top: 1px solid #e2e8f0; padding-top: 8px;">
                        <strong>Author Reply:</strong> ${chat.reply}
                    </div>
                ` : ''}
                <small style="display:block; margin-top: 5px; color: var(--gray); font-size: 0.8em;">
                    ${chat.createdAt?.toDate ? chat.createdAt.toDate().toLocaleString() : 'Just now'}
                </small>
            `;
            repliesList.appendChild(bubble);
        });
    });
}

// Close modal
closeButton?.addEventListener('click', () => {
    if (replyModal) replyModal.style.display = 'none';
    replyForm.reset();
});
replyModal?.addEventListener('click', (e) => {
    if (e.target === replyModal) {
        replyModal.style.display = 'none';
        replyForm?.reset();
    }
});

// Submit reply
replyForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submit-reply-btn'); // Ensure this button exists
    if (!submitBtn) {
        console.error("Submit reply button not found.");
        return;
    }

    const userName = replyUserNameInput.value.trim() || "Anonymous";
    const message = replyMessageInput.value.trim();

    if (!message) {
        alert("Please enter your reply.");
        submitBtn.disabled = false; // Re-enable if validation fails
        return;
    }

    // Show loading state
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Sending...';

    try {
        await addDoc(collection(db, "chats"), {
            userName: userName,
            message: message,
            userId: currentUser.uid,
            postId: currentPostIdForReply,
            postTitle: currentPostTitleForReply,
            createdAt: serverTimestamp(),
            status: "pending_reply" // New status for replies awaiting author response
        });
        alert("Your reply has been sent!");
        replyModal.style.display = 'none';
        replyForm.reset();
        // Refresh replies for the specific post
        loadRepliesForPost(currentPostIdForReply);
        
        // Ensure the replies section is visible after posting
        const repliesDiv = document.getElementById(`replies-for-${currentPostIdForReply}`);
        if (repliesDiv) repliesDiv.style.display = 'block';
        
        const toggleBtn = document.querySelector(`.toggle-replies-btn[data-post-id="${currentPostIdForReply}"]`);
        if (toggleBtn) toggleBtn.textContent = 'Hide Replies';

    } catch (err) {
        console.error("Error sending reply:", err);
        alert("Failed to send reply: " + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
});

loadPosts();
// Only load general chats/conversations on the main index page
if (!window.location.pathname.includes('client.html')) {
    loadChats();
}