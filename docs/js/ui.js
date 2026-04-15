// --- Typing Effect ---
const text = "Latest Stories 🔥";
const typingElement = document.getElementById("typing-text");
if (typingElement) {
    typingElement.textContent = text;
}

// --- Cookie Banner Logic ---
document.addEventListener("DOMContentLoaded", () => {
    const banner = document.getElementById("cookie-banner");
    const acceptBtn = document.getElementById("accept-cookies");
    const declineBtn = document.getElementById("decline-cookies");

    if (banner && acceptBtn && declineBtn) {
        const hideBanner = () => {
            banner.style.transition = "opacity 0.4s ease";
            banner.style.opacity = "0";
            setTimeout(() => banner.style.display = "none", 400);
        };

        if (localStorage.getItem("cookieChoice")) {
            banner.style.display = "none";
        }

        acceptBtn.addEventListener("click", () => {
            localStorage.setItem("cookieChoice", "accepted");
            hideBanner();
        });

        declineBtn.addEventListener("click", () => {
            localStorage.setItem("cookieChoice", "declined");
            hideBanner();
        });
    }
});

// --- Image Slider Functionality ---
let slideIndex = 1;
let slideInterval;

function showSlides(n) {
    const slides = document.querySelectorAll('.slide');
    const dots = document.querySelectorAll('.dot');
    if (!slides.length) return;

    if (n > slides.length) slideIndex = 1;
    if (n < 1) slideIndex = slides.length;

    slides.forEach(s => s.classList.remove('active'));
    dots.forEach(d => d.classList.remove('active'));

    slides[slideIndex - 1].classList.add('active');
    if (dots[slideIndex - 1]) dots[slideIndex - 1].classList.add('active');
}

window.currentSlide = (n) => {
    clearInterval(slideInterval);
    showSlides(slideIndex = n);
    startSlider();
};

const startSlider = () => {
    slideInterval = setInterval(() => {
        slideIndex++;
        showSlides(slideIndex);
    }, 5000);
};

document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.slider')) {
        showSlides(slideIndex);
        startSlider();
    }
});

// --- Background Music Toggle ---
const music = document.getElementById("bg-music");
const musicBtn = document.getElementById("music-toggle");
const volumeSlider = document.getElementById("volume-slider");
let playing = false;

if (music && musicBtn) {
    // 0.5 (50%) volume is a good middle ground for testing
    music.volume = 0.5; 

    if (volumeSlider) {
        volumeSlider.addEventListener("input", (e) => {
            music.volume = e.target.value;
        });
    }

    if (localStorage.getItem("music") === "on") {
        // Only change the icon/state if the browser actually allows the music to play
        music.play().then(() => {
            musicBtn.textContent = "⏸";
            playing = true;
        }).catch(() => console.log("Autoplay blocked: Click the button to start music."));
    }

    musicBtn.addEventListener("click", () => {
        if (!playing) {
            music.play().then(() => {
                musicBtn.textContent = "⏸";
                localStorage.setItem("music", "on");
                playing = true;
            }).catch(err => {
                alert("Could not play music. Please check if 'music/cecilwinas1.mp3' exists in your folder.");
            });
        } else {
            music.pause();
            musicBtn.textContent = "🎧";
            localStorage.setItem("music", "off");
            playing = false;
        }
    });
}

// --- Back to Top Button Logic ---
const backToTopBtn = document.getElementById("back-to-top");

window.addEventListener("scroll", () => {
    if (window.pageYOffset > 400) {
        if (backToTopBtn) backToTopBtn.style.display = "flex";
    } else {
        if (backToTopBtn) backToTopBtn.style.display = "none";
    }
});

backToTopBtn?.addEventListener("click", () => {
    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
});

// --- Login Background Parallax ---
window.addEventListener("scroll", () => {
    const loginSection = document.getElementById('login-section');
    if (loginSection && window.getComputedStyle(loginSection).display !== 'none') {
        const scrolled = window.pageYOffset;
        // Adjust the 0.15 value to make the effect more or less subtle
        loginSection.style.setProperty('--parallax-y', (scrolled * 0.15) + 'px');
    }
});