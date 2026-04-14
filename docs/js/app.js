// --- Firebase Imports & Initialization ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, getDocs, serverTimestamp, where, updateDoc, doc, increment, limit, startAfter, onSnapshot, getDoc, setDoc, arrayUnion, limitToLast as firestoreLimitToLast } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

let allPosts = [];
let currentUser = null;
let presenceInitialized = false;
let activeLiveChatRef = null;
let activeTypingRef = null;
let isInitialLiveLoad = true;
const chatNotification = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
let clientReplyingTo = null;
let clientCommunityReplyingTo = null;
let currentUserData = { likedPosts: [] };
let currentPostIdForReply = null;
let currentPostTitleForReply = null;
let lastVisiblePost = null;
let hasMore = true;
let isLoading = false;
const POSTS_PER_PAGE = 6; 
let userChatListener = null;
let allGeneralChats = []; // Cache for community chats
let commentPagination = {}; // Tracks { lastDoc, hasMore } per postId
const POSTS_CACHE_KEY = 'jacinta_blog_posts_cache';
const COUNTS_CACHE_KEY = 'jacinta_blog_counts_cache';
let generalChatPagination = { lastDoc: null, hasMore: true };
let commentSortOrder = {}; // Tracks { postId: 'asc' | 'desc' }
let commentCounts = {}; // Stores counts locally: { postId: count }
let commentCountListeners = {}; // Stores unsubscribe functions
let likeCounts = {}; // Stores like counts locally
let likeCountListeners = {}; // Stores unsubscribe functions for likes
const COMMENTS_PER_PAGE = 10;

let hasScrolledToHash = false;
// Helper for character limit truncation
const POST_PREVIEW_LIMIT = 150;

/**
 * Triggers a floating heart animation when a post is liked.
 */
function triggerHeartAnimation(btn) {
    const rect = btn.getBoundingClientRect();
    const heart = document.createElement('div');
    heart.innerHTML = '❤️';
    heart.className = 'floating-heart';
    heart.style.left = `${rect.left + rect.width / 2}px`;
    heart.style.top = `${rect.top}px`;
    heart.style.setProperty('--x-dir', `${(Math.random() - 0.5) * 100}px`);
    heart.style.setProperty('--y-dir', '-100px');
    document.body.appendChild(heart);
    setTimeout(() => heart.remove(), 1000);
}

function getSnippet(content, limit = POST_PREVIEW_LIMIT) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = content || "";
    const plainText = tempDiv.textContent || tempDiv.innerText || "";
    if (plainText.length <= limit) return content;
    return plainText.substring(0, limit) + "...";
}

function handleHashScroll() {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#post-')) {
        const targetId = hash.substring(1);
        const element = document.getElementById(targetId);
        if (element) {
            hasScrolledToHash = true;
            setTimeout(() => {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                element.classList.add('highlight-post');
                setTimeout(() => element.classList.remove('highlight-post'), 3000);
            }, 500); // Small delay to ensure images/layout are settled
        }
    }
}

// --- State and Element Selectors ---
const blogFeed = document.getElementById('blog-feed');
const searchBar = document.getElementById('search-bar');
const replyModal = document.getElementById('reply-modal');
const closeButton = document.querySelector('#reply-modal .close-button');
const replyForm = document.getElementById('reply-form');
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
    if (currentUser) {
        // Mark user offline in Firestore before logging out
        updateDoc(doc(db, "users", currentUser.uid), { isOnline: false, lastSeen: serverTimestamp() })
            .catch(() => {}) // Ignore errors if connection is already lost
            .finally(() => {
                signOut(auth).then(() => { window.location.href = 'index.html'; });
            });
    } else {
        signOut(auth).then(() => { window.location.href = 'index.html'; });
    }
});

onAuthStateChanged(auth, async (user) => {
    currentUser = user;

    const isClientPage = window.location.pathname.includes('client.html');
    const isIndexPage = window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/');

    if (user) {
        if (userAuthModalBtn) userAuthModalBtn.style.display = 'none';
        if (profileNav) profileNav.style.display = 'flex';

        const userSnap = await getDoc(doc(db, "users", user.uid));
        const data = userSnap.data() || {};
        currentUserData = { ...data, likedPosts: data.likedPosts || [] };

        if (displayNameSpan) {
            displayNameSpan.textContent =
                currentUserData.firstName || user.email.split('@')[0];
        }

        const fullName = `${currentUserData.firstName || ''} ${currentUserData.lastName || ''}`.trim();

        const modalCommNameInput = document.getElementById('modal-user-name');
        if (modalCommNameInput) modalCommNameInput.value = fullName;

        document.getElementById('live-chat-tab-btn')?.style.setProperty('display', 'flex');
        document.getElementById('open-dm-btn')?.style.setProperty('display', 'flex');

        setupUserChatListener();

        if (!presenceInitialized) {
            setupPresence(user, fullName);
            presenceInitialized = true;
        }

        setupLiveChat();

    } else {
        if (userAuthModalBtn) userAuthModalBtn.style.display = 'block';
        if (profileNav) profileNav.style.display = 'none';

        currentUserData = { likedPosts: [] };

        const modalNameInput = document.getElementById('modal-user-name');
       if (modalNameInput) {
         modalNameInput.value = '';
         }
        document.getElementById('live-chat-tab-btn')?.style.setProperty('display', 'none');
        document.getElementById('open-dm-btn')?.style.setProperty('display', 'none');

        if (isClientPage) {
            window.location.href = 'index.html';
            return;
        }

        document.getElementById('live-chat-section')?.style.setProperty('display', 'none');

        const storiesTabBtn = document.querySelector('[data-tab="stories-tab"]');
        if (storiesTabBtn) storiesTabBtn.click();

        if (userChatListener) userChatListener();
        userChatListener = null;

        // ✅ CLEAN unsubscribe handling
        if (activeLiveChatRef) {
            activeLiveChatRef();
            activeLiveChatRef = null;
        }

        if (activeTypingRef) {
            activeTypingRef();
            activeTypingRef = null;
        }

        presenceInitialized = false;
    }

    renderPosts(allPosts);
});

/**
 * Tab Navigation Logic for Client Side
 */
let tabsInitialized = false;
function setupTabs() {
    if (tabsInitialized) return;
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(target)?.classList.add('active');

            // Clear notification when user opens the chat tab
            if (target === 'live-chat-section' && currentUser) {
                updateDoc(doc(db, "chat_summaries", currentUser.uid), { unreadByUser: false }).catch(() => {});
            }
            // Load data for specific tabs when opened
            if (target === 'community-tab') {
                loadChats();
            }
        });
    });
    tabsInitialized = true;
}
/**
 * Tracks user presence using Firestore
 */
function setupPresence(user, fullName) {
    const userRef = doc(db, "users", user.uid);
    
    // Set online status in Firestore
    updateDoc(userRef, {
        isOnline: true,
        lastSeen: serverTimestamp()
    }).catch(console.error);

    // Listen for all online users via the users collection
    const usersUl = document.getElementById('users-ul');
    const countBadge = document.getElementById('online-count-badge');
    
    if (usersUl || countBadge) {
        const q = query(collection(db, "users"), where("isOnline", "==", true));
        onSnapshot(q, (snapshot) => {
            if (usersUl) usersUl.innerHTML = "";
            let onlineCount = snapshot.size;
            snapshot.forEach((docSnap) => {
                const val = docSnap.data();
                const li = document.createElement('li');
                li.className = "online-user-item";
                const name = val.firstName || "User";
                li.innerHTML = `<i class="fas fa-circle" style="color: var(--success); font-size: 0.6rem;"></i> ${name}`;
                if (usersUl) usersUl.appendChild(li);
            });
            if (countBadge) countBadge.textContent = `${onlineCount} Online`;
        });
    }
}

/**
 * Handles Live Community Messaging
 */
function setupLiveChat() {
    const msgContainer = document.getElementById('live-messages-container');
    const chatForm = document.getElementById('live-chat-form');
    const chatInput = document.getElementById('live-chat-input');
    const typingIndicator = document.getElementById('typing-indicator');
    if (!msgContainer || !chatForm || !currentUser) return;

    // Inject reply preview bar if not exists
    if (!document.getElementById('client-reply-preview-bar')) {
        const bar = document.createElement('div');
        bar.id = 'client-reply-preview-bar';
        bar.className = 'reply-preview-bar';
        bar.innerHTML = `<span id="client-reply-preview-text"></span><i class="fas fa-times" id="cancel-client-reply"></i>`;
        chatForm.parentNode.insertBefore(bar, chatForm);
        document.getElementById('cancel-client-reply').addEventListener('click', () => {
            clientReplyingTo = null;
            bar.style.display = 'none';
        });
    }

    // Inject community modal reply bar if not exists
    const commModal = document.getElementById('community-chat-modal');
    if (commModal && !document.getElementById('community-reply-preview-bar')) {
        const commBar = document.createElement('div');
        commBar.id = 'community-reply-preview-bar';
        commBar.className = 'reply-preview-bar';
        commBar.style.borderRadius = '8px';
        commBar.innerHTML = `<span id="community-reply-preview-text"></span><i class="fas fa-times" id="cancel-community-reply"></i>`;
        const textarea = document.getElementById('modal-user-question');
        textarea.parentNode.insertBefore(commBar, textarea);
        document.getElementById('cancel-community-reply').addEventListener('click', () => {
            clientCommunityReplyingTo = null;
            commBar.style.display = 'none';
        });
    }

    clientReplyingTo = null;
    document.getElementById('client-reply-preview-bar').style.display = 'none';

    // Clean up existing listeners
    if (activeLiveChatRef) activeLiveChatRef();
    if (activeTypingRef) {
        activeTypingRef();
        activeTypingRef = null;
    }

    // 1. Listen for messages in Firestore
    const q = query(collection(db, "direct_messages", currentUser.uid, "messages"), orderBy("timestamp", "asc"), firestoreLimitToLast(50));
    activeLiveChatRef = onSnapshot(q, (snapshot) => {
        msgContainer.innerHTML = "";
        snapshot.forEach((docSnap) => {
            const msg = docSnap.data();
            const timeStr = msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            const wrapper = document.createElement('div');
            const isMe = msg.uid === currentUser.uid;
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
            initClientLiveChatReply(wrapper, msg.name, msg.text);
        });
        setTimeout(() => {
            msgContainer.scrollTo({ top: msgContainer.scrollHeight, behavior: 'smooth' });
        }, 50);
    });

    // Typing Indicator Logic in Firestore
    let typingTimeout;
    const typingDocRef = doc(db, "typing_indicators", currentUser.uid);

    chatInput.addEventListener('input', () => {
        setDoc(typingDocRef, {
            name: currentUserData.firstName || currentUser.email.split('@')[0],
            isTyping: true,
            timestamp: serverTimestamp()
        }, { merge: true });

        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => updateDoc(typingDocRef, { isTyping: false }), 2500);
    });

    const typingQuery = query(collection(db, "typing_indicators"), where("isTyping", "==", true));
    activeTypingRef = onSnapshot(typingQuery, (snapshot) => {
        if (!typingIndicator) return;
        const typingUsers = [];
        snapshot.forEach((docSnap) => {
            if (docSnap.id !== currentUser.uid) {
                typingUsers.push(docSnap.data().name);
            }
        });
        typingIndicator.textContent = typingUsers.length > 0 ? `${typingUsers.join(', ')} typing...` : "";
    });

    // Sending message
    chatForm.onsubmit = async (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;

        try {
            const messageData = {
                uid: currentUser.uid,
                name: `${currentUserData.firstName || ''} ${currentUserData.lastName || ''}`.trim() || currentUser.email.split('@')[0],
                text: text,
                timestamp: serverTimestamp(),
                replyTo: clientReplyingTo
            };

            // 1. Save to the sub-collection for this user's specific thread
            await addDoc(collection(db, "direct_messages", currentUser.uid, "messages"), messageData);

            // 2. Update the global summary list for the Admin dashboard
            await setDoc(doc(db, "chat_summaries", currentUser.uid), {
                name: messageData.name,
                lastMessage: text,
                timestamp: serverTimestamp(),
                unreadByAdmin: true,
                unreadByUser: false
            }, { merge: true });

            clientReplyingTo = null;
            document.getElementById('client-reply-preview-bar').style.display = 'none';
            chatInput.value = "";
            updateDoc(typingDocRef, { isTyping: false });
        } catch (err) {
            console.error("Failed to send message:", err);
            alert("Message could not be sent. Please check your connection or permissions.");
        }
    };
}

/**
 * Initializes the "Slide to Reply" gesture logic for Client Live Chat
 */
function initClientLiveChatReply(wrapper, name, text) {
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
            const bar = document.getElementById('client-reply-preview-bar');
            const previewText = document.getElementById('client-reply-preview-text');
            clientReplyingTo = { name, text };
            if (bar && previewText) {
                previewText.textContent = `Replying to ${name}: "${text.substring(0, 40)}..."`;
                bar.style.display = 'flex';
                document.getElementById('live-chat-input')?.focus();
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

// --- 1. Fetch and Display Blog Posts ---
async function loadPosts(append = false, forceRefresh = false) {
    if (isLoading) return;

    // 1. Initial Load: Check localStorage for an instant render
    if (!append && allPosts.length === 0 && !forceRefresh) {
        const cachedPosts = localStorage.getItem(POSTS_CACHE_KEY);
        const cachedCounts = localStorage.getItem(COUNTS_CACHE_KEY);
        
        // Load cached counts first so renderPosts can use them immediately
        if (cachedCounts) {
            try {
                const parsed = JSON.parse(cachedCounts);
                likeCounts = parsed.likes || {};
                commentCounts = parsed.comments || {};
            } catch (e) { console.error("Counts cache corrupted:", e); }
        }

        if (cachedPosts) {
            try {
                allPosts = JSON.parse(cachedPosts);
                renderPosts(allPosts);
                setupPostStateListeners(allPosts);
            } catch (e) { console.error("Cache corrupted:", e); }
        }
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
        
        const newPosts = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        allPosts = [...allPosts, ...newPosts];

        // 2. Update localStorage with the latest fresh batch and current counts
        if (!append) {
            localStorage.setItem(POSTS_CACHE_KEY, JSON.stringify(newPosts));
            localStorage.setItem(COUNTS_CACHE_KEY, JSON.stringify({ likes: likeCounts, comments: commentCounts }));
        }

        renderPosts(newPosts, append);

        if (sentinel) {
            sentinel.innerHTML = hasMore ? "" : "<p style='color: var(--gray);'>You've reached the end of our stories.</p>";
        }
        setupPostStateListeners(allPosts);

        if (!append && !hasScrolledToHash) {
            handleHashScroll();
        }
    } catch (err) {
        console.error("Error loading posts:", err);
    } finally {
        isLoading = false;
    }
}

/**
 * Sets up real-time listeners for comment and like counts, consolidating state logic.
 */
function setupPostStateListeners(posts) {
    posts.forEach(post => {
        const postId = post.id;
        // Handle Comment Counts
        if (!commentCountListeners[postId]) {
            const q = query(collection(db, "chats"), where("postId", "==", postId));
            commentCountListeners[postId] = onSnapshot(q, (snap) => {
                commentCounts[postId] = snap.size;
                const span = document.querySelector(`.reply-count-${postId}`);
                if (span) span.textContent = snap.size;
            });
        } else {
            const span = document.querySelector(`.reply-count-${postId}`);
            if (span && commentCounts[postId] !== undefined) span.textContent = commentCounts[postId];
        }

        // Handle Like Counts
        if (!likeCountListeners[postId]) {
            const postRef = doc(db, "posts", postId);
            likeCountListeners[postId] = onSnapshot(postRef, (snap) => {
                if (snap.exists()) {
                    const newLikes = snap.data().likes || 0;
                    const oldLikes = likeCounts[postId];
                    likeCounts[postId] = newLikes;
                    const span = document.querySelector(`.like-count-${postId}`);
                    if (span) {
                        span.textContent = newLikes;
                        if (oldLikes !== undefined && newLikes > oldLikes) {
                            span.classList.add('like-pop');
                            setTimeout(() => span.classList.remove('like-pop'), 400);
                        }
                    }
                }
            });
        } else {
            const span = document.querySelector(`.like-count-${postId}`);
            if (span && likeCounts[postId] !== undefined) span.textContent = likeCounts[postId];
        }
    });
}

const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && hasMore && !isLoading && currentUser) {
        loadPosts(true);
    }
}, { threshold: 0.1 });

if (sentinel) {
    observer.observe(sentinel);
}

function renderPosts(posts, append = false) {
    if (!blogFeed) return;
    if (!append) blogFeed.innerHTML = "";
    
    // If guest, only show the first 3 posts to encourage sign-up
    const displayPosts = currentUser ? posts : posts.slice(0, 3);

    if (!append && displayPosts.length === 0) {
        blogFeed.innerHTML = "<p style='text-align: center; grid-column: 1 / -1;'>No stories found matching your search.</p>";
        return;
    }

    const fragment = document.createDocumentFragment();
    displayPosts.forEach((post) => {
        const hasLiked = currentUserData.likedPosts?.includes(post.id);

        // Check if content is long enough to warrant a "Read More" toggle
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = post.content || "";
        const isLong = (tempDiv.textContent || tempDiv.innerText || "").length > POST_PREVIEW_LIMIT;

        const postElement = document.createElement("div");
        postElement.id = `post-${post.id}`;
        postElement.className = "post-card fade-in";
        
        // Handle both Firestore Timestamp objects and serialized JSON dates
        const dateStr = post.createdAt?.toDate 
            ? post.createdAt.toDate().toLocaleDateString() 
            : (post.createdAt?.seconds ? new Date(post.createdAt.seconds * 1000).toLocaleDateString() : '');

        postElement.innerHTML = `
            <img src="${post.image || 'https://via.placeholder.com/400'}" alt="Blog Image" loading="lazy">
            <div class="post-content">
                <h3>${post.title}</h3>
                <small>
                    ${dateStr}
                    ${currentUser && allPosts.indexOf(post) >= 3 ? '<span class="member-badge">Member</span>' : ''}
                </small>
                <div class="post-description collapsed" id="desc-${post.id}">${getSnippet(post.content)}</div>
                ${isLong ? `<span class="read-more-toggle" data-id="${post.id}" data-limit="${POST_PREVIEW_LIMIT}">Read More</span>` : ''}
                <div class="post-actions">
                    <button class="like-btn ${hasLiked ? 'liked' : ''}" data-post-id="${post.id}" ${hasLiked ? 'disabled' : ''}>
                        ❤️ <span class="like-count like-count-${post.id}">${likeCounts[post.id] !== undefined ? likeCounts[post.id] : (post.likes || 0)}</span>
                    </button>
                    
                    <button class="open-reply-modal-btn" data-post-id="${post.id}" data-post-title="${post.title}"><i class="fas fa-comment-sms"></i> Reply</button>
                    <button class="toggle-replies-btn" data-post-id="${post.id}"><i class="fas fa-comments"></i> View Replies (<span class="reply-count-${post.id}">${commentCounts[post.id] || 0}</span>)</button>
                    <div class="share-container">
                        <button class="share-btn" data-post-id="${post.id}"><i class="fas fa-share-alt"></i> Share</button>
                        <div class="share-menu" id="share-menu-${post.id}">
                            <a href="#" class="share-item whatsapp" data-id="${post.id}" title="Share on WhatsApp"><i class="fab fa-whatsapp"></i></a>
                            <a href="#" class="share-item twitter" data-id="${post.id}" title="Share on Twitter"><i class="fab fa-twitter"></i></a>
                            <a href="#" class="share-item copy" data-id="${post.id}" title="Copy Link"><i class="fas fa-link"></i></a>
                        </div>
                    </div>
                </div>
            </div>
        `;
        fragment.appendChild(postElement);
    });
    blogFeed.appendChild(fragment);

    // Add "Unlock More" card for guests if there are more posts available
    if (!currentUser && !append && allPosts.length > 3) {
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
    const shareBtn = e.target.closest('.share-btn');

    // Handle Floating Chat Button (Repurposed for Private Live Chat)
    const openDmBtn = e.target.closest('#open-dm-btn');
    if (openDmBtn) {
        const liveChatTabBtn = document.getElementById('live-chat-tab-btn');
        if (liveChatTabBtn) {
            liveChatTabBtn.click();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    // Handle Read More Toggle
    if (readMoreBtn) {
        const toggleBtn = readMoreBtn;
        const postId = toggleBtn.dataset.id;
        const desc = document.getElementById(`desc-${postId}`);
        const post = allPosts.find(p => p.id === postId);
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

    // Handle Share Toggle
    if (shareBtn) {
        const postId = shareBtn.dataset.postId;
        const menu = document.getElementById(`share-menu-${postId}`);
        document.querySelectorAll('.share-menu.active').forEach(m => {
            if (m !== menu) m.classList.remove('active');
        });
        if (menu) menu.classList.toggle('active');
    }

    // Handle Share Sub-menu Items
    const shareItem = e.target.closest('.share-item');
    if (shareItem) {
        e.preventDefault();
        const postId = shareItem.dataset.id;
        const shareUrl = `${window.location.origin}${window.location.pathname}#post-${postId}`;
        const post = allPosts.find(p => p.id === postId);
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
    }

    // Close menus when clicking outside
    if (!e.target.closest('.share-container')) {
        document.querySelectorAll('.share-menu.active').forEach(m => m.classList.remove('active'));
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
    setupPostStateListeners(filtered);
    
    // Hide sentinel during search to prevent accidental triggers
    if (sentinel) {
        sentinel.style.display = term === "" ? 'block' : 'none';
    }
});

// --- Live Chatting (User's Matters) ---
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

    if (!message) {
        alert("Please enter your message.");
        return;
    }

    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Sending...';

    // Strictly separate identity logic: 
    // 1. If logged in, use account name (ignore input)
    // 2. If guest, use input name (fallback to "Guest")
    const fullName = `${currentUserData.firstName || ''} ${currentUserData.lastName || ''}`.trim();
    const finalName = currentUser 
        ? (fullName || currentUser.email.split('@')[0]) 
        : (name || "Guest");

    try {
        await addDoc(collection(db, "chats"), {
            userName: finalName,
            message: message,
            userId: currentUser ? currentUser.uid : "guest",
            postId: null, // General chat identifier
            replyTo: clientCommunityReplyingTo,
            createdAt: Date.now(),
            status: "unread"
        });

        alert("Thank you! Your message has been sent to the community.");
        document.getElementById('community-reply-preview-bar').style.display = 'none';
        clientCommunityReplyingTo = null;
        if (document.getElementById('community-chat-modal')) document.getElementById('community-chat-modal').style.display = 'none';
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

    chatDiv.innerHTML = "<h4>Recent Conversations</h4><div class='conversation-stream'></div>";
    const stream = chatDiv.querySelector('.conversation-stream');

    let repliedCount = 0;
    chats.forEach((chat) => {
        if(chat.reply) { // Ensure there's an author reply to display in this section
            repliedCount++;
            const item = document.createElement('div');
            item.className = 'stream-item';
            item.innerHTML = `
                <div class="stream-header">
                    <span class="stream-author">${chat.userName || "Anonymous"}</span>
                    <span class="stream-date">${chat.createdAt?.toDate ? chat.createdAt.toDate().toLocaleDateString() : 'Just now'}</span>
                </div>
                <div class="user-msg-slide slide-wrapper">
                    <div class="slide-reply-indicator"><i class="fas fa-reply"></i> REPLY</div>
                    <div class="slide-content">
                        ${chat.replyTo ? `<div class="reply-preview-in-msg"><strong>${chat.replyTo.name}</strong>: ${chat.replyTo.text}</div>` : ''}
                        <p class="stream-text">${chat.message}</p>
                    </div>
                </div>
                <div class="author-reply-slide slide-wrapper">
                    <div class="slide-reply-indicator"><i class="fas fa-reply"></i> REPLY</div>
                    <div class="slide-content">
                        <div class="stream-author-reply">
                            <span class="reply-badge">Author</span>
                            ${chat.reply}
                        </div>
                    </div>
                </div>
            `;
            stream.appendChild(item);
            initSlideToReply(item.querySelector('.user-msg-slide'), chat.userName || "Anonymous", chat.message);
            initSlideToReply(item.querySelector('.author-reply-slide'), "Author", chat.reply);
        }
    });

    if (repliedCount === 0) {
        stream.innerHTML = "<p style='color: var(--gray); font-style: italic; font-size: 0.9rem; padding: 1rem;'>No community conversations have been replied to yet. Check back soon!</p>";
    }

    if (hasMore) {
        const btn = document.createElement('button');
        btn.className = 'load-more-chats secondary-btn';
        btn.textContent = 'Load More Conversations';
        chatDiv.appendChild(btn);
    }
}

/**
 * Initializes the "Slide to Reply" gesture logic
 */
function initSlideToReply(wrapper, userName, message) {
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

        // Detect if user is trying to scroll or slide
        if (!isSliding && !isScrolling) {
            if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
                isSliding = true;
            } else if (Math.abs(dy) > 10) {
                isScrolling = true;
            }
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
            triggerReply(userName, message);
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

function triggerReply(name, text) {
    const modal = document.getElementById('community-chat-modal');
    const textarea = document.getElementById('modal-user-question');
    const bar = document.getElementById('community-reply-preview-bar');
    const previewText = document.getElementById('community-reply-preview-text');

    if (modal && textarea && bar) {
        clientCommunityReplyingTo = { name, text };
        previewText.textContent = `Replying to ${name}: "${text.substring(0, 40)}..."`;
        bar.style.display = 'flex';
        modal.style.display = 'flex';
        textarea.value = '';
        textarea.focus();
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
    if (currentPostRepliesListener) {
        currentPostRepliesListener();
        currentPostRepliesListener = null;
    }
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

    // Clear existing listener if we are reloading or switching posts
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

    const fullName = `${currentUserData.firstName || ''} ${currentUserData.lastName || ''}`.trim() || currentUser.email.split('@')[0];
    const userName = fullName || "User";
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
            createdAt: Date.now(), 
            status: "unread" // Consistent status for admin filtering
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

setupTabs();
loadPosts();
loadChats();