// --- Firebase Imports & Initialization ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, getDocs, serverTimestamp } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
const db = getFirestore(app);

let allPosts = [];

// --- 1. Fetch and Display Blog Posts ---
async function loadPosts() {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    
    allPosts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderPosts(allPosts);
}

function renderPosts(posts) {
    const blogFeed = document.getElementById('blog-feed');
    blogFeed.innerHTML = "";
    
    if (posts.length === 0) {
        blogFeed.innerHTML = "<p style='text-align: center; grid-column: 1 / -1;'>No stories found matching your search.</p>";
        return;
    }

    posts.forEach((post) => {
        const postElement = document.createElement("div");
        postElement.className = "post-card fade-in";
        postElement.innerHTML = `
            <img src="${post.image || 'https://via.placeholder.com/400'}" alt="Blog Image">
            <div class="post-content">
                <h3>${post.title}</h3>
                <small>${post.createdAt?.toDate ? post.createdAt.toDate().toLocaleDateString() : ''}</small>
                <p>${(post.content || "").substring(0, 100)}...</p>
            </div>
        `;
        blogFeed.appendChild(postElement);
    });
}

document.getElementById('search-bar').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allPosts.filter(post => post.title.toLowerCase().includes(term));
    renderPosts(filtered);
});

// --- 2. Submit Chat/Question ---
document.getElementById("send-chat").addEventListener("click", () => {
    const name = document.getElementById("user-name").value;
    const message = document.getElementById("user-question").value;

    if (!message) return;

    const chatBox = document.getElementById("public-chats");

    // User message
    const userMsg = document.createElement("div");
    userMsg.className = "chat-bubble";
    userMsg.innerHTML = `<strong>${name || "Anonymous"}:</strong> ${message}`;
    chatBox.appendChild(userMsg);

    // Fake typing effect
    setTimeout(() => {
        const reply = document.createElement("div");
        reply.className = "chat-bubble unread-chat";
        reply.innerHTML = `<strong>Author:</strong> Typing...`;
        chatBox.appendChild(reply);

        setTimeout(() => {
            reply.innerHTML = `<strong>Author:</strong> Thanks for sharing 🙌 Stay strong and keep going!`;
            reply.classList.remove("unread-chat");
        }, 1500);

    }, 800);
});

// --- 3. Load Public Replies ---
async function loadChats() {
    const chatDiv = document.getElementById('public-chats');
    const q = query(collection(db, "chats"), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);

    querySnapshot.forEach((doc) => {
        const chat = doc.data();
        if(chat.reply) { // Only show chats that the blogger replied to
            chatDiv.innerHTML += `
                <div class="chat-bubble">
                    <strong>${chat.userName}:</strong> ${chat.message}
                    <div style="margin-top:10px; color: var(--primary);">
                        <strong>Author Reply:</strong> ${chat.reply}
                    </div>
                </div>
            `;
        }
    });
}

loadPosts();
loadChats();

// --- Image Slider Functionality ---
let slideIndex = 0;
let slides = [];
let slideInterval;

function showSlides(n) {
    const sliderContainer = document.querySelector('.image-slider-container');
    if (!sliderContainer) {
        console.warn("Slider container not found. Skipping slider initialization.");
        return;
    }

    slides = document.querySelectorAll('.slide');
    if (slides.length === 0) {
        console.warn("No slides found. Skipping slider functionality.");
        return;
    }

    const dots = document.querySelectorAll('.dot');

    if (n !== undefined) {
        slideIndex = n;
    } else {
        slideIndex++;
    }

    if (slideIndex > slides.length) { slideIndex = 1; }
    if (slideIndex < 1) { slideIndex = slides.length; }

    slides.forEach(slide => slide.classList.remove('active'));
    dots.forEach(dot => dot.classList.remove('active'));

    slides[slideIndex - 1].classList.add('active');
    if (dots.length > 0) dots[slideIndex - 1].classList.add('active');

    // Update "Read More" button link for the active slide
    const activeSlide = slides[slideIndex - 1];
    const readMoreBtn = activeSlide.querySelector('.read-more-btn');
    if (readMoreBtn) {
        const postId = readMoreBtn.dataset.postId;
        if (postId && !["YOUR_POST_ID_1","YOUR_POST_ID_2","YOUR_POST_ID_3"].includes(postId)) {
            readMoreBtn.href = `post.html?id=${postId}`;
        }
    }
}

function plusSlides(n) {
    resetTimer();
    showSlides(slideIndex + n);
}

window.currentSlide = function(n) {
    resetTimer();
    showSlides(n);
};

function resetTimer() {
    clearInterval(slideInterval);
    slideInterval = setInterval(() => showSlides(), 5000);
}

document.addEventListener('DOMContentLoaded', () => {
    slideIndex = 0;
    showSlides(); 
    resetTimer();

    document.querySelector('.prev-slide')?.addEventListener('click', () => plusSlides(-1));
    document.querySelector('.next-slide')?.addEventListener('click', () => plusSlides(1));
});

// --- Scroll Nav Effect ---
window.addEventListener("scroll", () => {
    const nav = document.querySelector("nav");
    if (window.scrollY > 50) {
        nav.classList.add("scrolled");
    } else {
        nav.classList.remove("scrolled");
    }
});

// --- Background Music Toggle ---
const music = document.getElementById("bg-music");
const musicBtn = document.getElementById("music-toggle");
let playing = false;

music.volume = 0.03; // Set a low volume for a subtle effect

// Load saved state
if (localStorage.getItem("music") === "on") {
    music.play();
    musicBtn.textContent = "⏸";
    playing = true;
}

// Unified click listener
musicBtn.addEventListener("click", () => {
    if (!playing) {
        music.play();
        musicBtn.textContent = "⏸";
        localStorage.setItem("music", "on");
    } else {
        music.pause();
        musicBtn.textContent = "🎧";
        localStorage.setItem("music", "off");
    }
    playing = !playing;
});