import { auth, firebaseAuth } from "./firebase.js";

const form = document.getElementById("loginForm");
const message = document.getElementById("authMessage");
const button = document.getElementById("signInButton");
let submitting = false;
const requested = new URLSearchParams(location.search).get("next") || "/index.html";
const destination = (() => {
  if (!requested.startsWith("/") || requested.startsWith("//")) return "/index.html";
  const target = new URL(requested, location.origin);
  return target.origin === location.origin ? target.pathname + target.search + target.hash : "/index.html";
})();

firebaseAuth.onAuthStateChanged(auth, (user) => {
  if (user && !submitting) location.replace(destination);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitting = true;
  button.disabled = true;
  message.classList.remove("success");
  message.textContent = "Signing in…";
  try {
    await firebaseAuth.setPersistence(auth, firebaseAuth.browserLocalPersistence);
    const values = Object.fromEntries(new FormData(form));
    await firebaseAuth.signInWithEmailAndPassword(auth, values.email.trim(), values.password);
    location.replace(destination);
  } catch (error) {
    submitting = false;
    button.disabled = false;
    const messages = {
      "auth/invalid-credential": "Email or password is incorrect.",
      "auth/invalid-email": "Enter a valid email address.",
      "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
      "auth/network-request-failed": "Could not connect to Firebase. Check your internet connection.",
    };
    message.textContent = messages[error.code] || "Sign in failed. Check Firebase Authentication is enabled for this project.";
  }
});

document.getElementById("resetPassword").addEventListener("click", async () => {
  const email = form.elements.email.value.trim();
  if (!email) {
    message.classList.remove("success");
    message.textContent = "Enter your email above, then choose Forgot password.";
    form.elements.email.focus();
    return;
  }
  try {
    await firebaseAuth.sendPasswordResetEmail(auth, email);
    message.classList.add("success");
    message.textContent = "Password reset instructions have been emailed if this account exists.";
  } catch {
    message.classList.remove("success");
    message.textContent = "Could not send the reset email. Check the address and Firebase Authentication settings.";
  }
});
