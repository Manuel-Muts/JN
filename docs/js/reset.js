import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { firebaseConfig } from "./config.js";
try {
    app = getApp();
} catch (e) {
    app = initializeApp(firebaseConfig);
}
const auth = getAuth(app);

document.getElementById('forgot-password-link').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();

    if (!email) {
        showToast
    }
    try {
        showToast("Password reset email sent! Check your inbox.", "success");
    } catch (err) {h
    }
});