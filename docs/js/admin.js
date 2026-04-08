import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, getDocs, updateDoc, doc, onSnapshot, deleteDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
        alert("Login failed: " + err.message);
        // Reset button state only on failure (success hides the section)
        loginBtn.disabled = false;
        loginBtn.innerText = "Login to Dashboard";
    }
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
    const loginSec = document.getElementById('login-section');
    const adminPanel = document.getElementById('admin-panel');
    if (user) {
        loginSec.style.display = "none";
        adminPanel.style.display = "block";
        setupChatListener();
        loadExistingPosts(); // Load posts when logged in
    } else {
        loginSec.style.display = "block";
        adminPanel.style.display = "none";
    }
});

// --- 2. Cloudinary Upload ---
const myWidget = cloudinary.createUploadWidget({
    cloudName: 'YOUR_CLOUD_NAME', 
    uploadPreset: 'YOUR_UNSIGNED_PRESET'
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
        loadExistingPosts(); // Refresh post list after publishing
        clearPostForm(); // Clear the form after action
    } catch (err) {
        alert("Failed to publish: " + err.message);
        submitBtn.disabled = false;
        submitBtn.innerText = "Publish Post";
    }
});

// --- 4. Chat Management (Real-time) ---
function setupChatListener() {
    const q = query(collection(db, "chats"), orderBy("timestamp", "desc"));
    
    // Use onSnapshot for real-time dashboard updates
    onSnapshot(q, (snapshot) => {
        const chatsList = document.getElementById('chats-list');
        const summary = document.getElementById('interactions-summary');
        let unreadCount = 0;
        
        chatsList.innerHTML = "";
        snapshot.forEach((chatDoc) => {
            const chat = chatDoc.data();
            const id = chatDoc.id;
            if (chat.status === "unread") unreadCount++;

            const card = document.createElement('div');
            card.className = `chat-bubble ${chat.status === 'unread' ? 'unread-chat' : ''}`;
            card.innerHTML = `
                <p><strong>${chat.userName}:</strong> ${chat.message}</p>
                ${chat.reply ? `<p style="color: var(--primary)"><strong>My Reply:</strong> ${chat.reply}</p>` : `
                    <textarea id="reply-input-${id}" placeholder="Type your reply..."></textarea>
                    <button onclick="window.sendReply('${id}')">Send Reply</button>
                `}
            `;
            chatsList.appendChild(card);
        });

        summary.innerHTML = `<h3>You have ${unreadCount} unread questions.</h3>`;
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
            status: "read"
        });
    } catch (err) {
        console.error("Error replying:", err);
    }
};

// --- 5. Manage Existing Posts ---
async function loadExistingPosts() {
    const existingPostsDiv = document.getElementById('existing-posts');
    existingPostsDiv.innerHTML = '<p>Loading posts...</p>'; // Loading indicator

    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    
    existingPostsDiv.innerHTML = ""; // Clear loading indicator

    if (querySnapshot.empty) {
        existingPostsDiv.innerHTML = '<p>No posts published yet.</p>';
        return;
    }

    querySnapshot.forEach((postDoc) => {
        const post = postDoc.data();
        const postId = postDoc.id;

        const postCard = document.createElement('div');
        postCard.className = 'post-card'; // Re-use existing post-card style
        postCard.innerHTML = `
            <img src="${post.image || 'https://via.placeholder.com/400'}" alt="Post Image">
            <div class="post-content">
                <h3>${post.title}</h3>
                <small>Published: ${post.createdAt?.toDate ? post.createdAt.toDate().toLocaleDateString() : 'N/A'}</small>
                ${post.updatedAt ? `<small>Updated: ${post.updatedAt.toDate().toLocaleDateString()}</small>` : ''}
                <p>${post.content.substring(0, 100)}...</p>
                <button class="edit-post-btn" data-id="${postId}" style="background-color: var(--primary); margin-right: 0.5rem;">Edit Post</button>
                <button class="delete-post-btn" data-id="${postId}" style="background-color: #ef4444; margin-top: 1rem;">Delete Post</button>
            </div>
        `;
        existingPostsDiv.appendChild(postCard);
    });

    // Attach event listeners to delete buttons
    existingPostsDiv.querySelectorAll('.delete-post-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            const postIdToDelete = e.target.dataset.id;
            if (confirm("Are you sure you want to delete this post?")) {
                await deleteDoc(doc(db, "posts", postIdToDelete));
                loadExistingPosts(); // Refresh the list after deletion
            }
        });
    });
}

// --- 6. Edit Post Functionality ---
document.getElementById('existing-posts').addEventListener('click', async (e) => {
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
            window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll to top to see the form
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