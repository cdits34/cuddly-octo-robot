import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, doc, serverTimestamp, query, orderBy, onSnapshot, getDocs, where } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyAusTICWuGMBJr5suC0KJtn29AlILkin7U",
  authDomain: "school-chatroom-f10a6.firebaseapp.com",
  projectId: "school-chatroom-f10a6",
  storageBucket: "school-chatroom-f10a6.firebasestorage.app",
  messagingSenderId: "1088030798418",
  appId: "1:1088030798418:web:b6c9b3e2b40851e9cae58b",
  measurementId: "G-B3SPD5R7N1"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const loginBtn = document.getElementById("login");
const logoutBtn = document.getElementById("logout");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const fileInput = document.getElementById("file-input");
const youtubeBtn = document.getElementById("youtube-btn");
const messagesDiv = document.getElementById("messages");
const dmForm = document.getElementById("dm-form");
const dmEmailInput = document.getElementById("dm-email");
const userProfile = document.getElementById("user-profile");

// Modal Elements
const youtubeModal = document.getElementById("youtube-modal");
const closeModal = document.getElementById("close-modal");
const youtubeSearch = document.getElementById("youtube-search");
const youtubeSearchBtn = document.getElementById("youtube-search-btn");
const youtubeResults = document.getElementById("youtube-results");

let currentDMId = null;
let unsubscribeListener = null;

// Login / Logout
loginBtn.addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
});
logoutBtn.addEventListener("click", async () => { await signOut(auth); });

// Auth State
onAuthStateChanged(auth, async user => {
  if(user){
    loginBtn.style.display = "none";
    logoutBtn.style.display = "block";
    messageForm.style.display = "flex";
    dmForm.style.display = "flex";
    userProfile.innerHTML = `<img src='${user.photoURL}' width='40' style='border-radius:50%'> <span>${user.displayName}</span>`;

    // Register user in Firestore
    const userRef = doc(db, "users", user.uid);
    await setDoc(userRef, { uid:user.uid, displayName:user.displayName, email:user.email, photoURL:user.photoURL }, { merge:true });

    loadPublicMessages();
  } else {
    loginBtn.style.display = "block";
    logoutBtn.style.display = "none";
    messageForm.style.display = "none";
    dmForm.style.display = "none";
    messagesDiv.innerHTML = "<p>Login to see messages</p>";
    userProfile.innerHTML = "";
    if (unsubscribeListener) unsubscribeListener();
  }
});

// Timestamp formatting
function formatTimestamp(ts) {
  if (!ts) return "";
  const now = new Date();
  const date = ts.toDate();
  const diff = (now - date) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + " minutes ago";
  if (diff < 86400) return Math.floor(diff / 3600) + " hours ago";
  return date.toLocaleString();
}

// Render message
function renderMessage(msg){
  let header = `
    <div class="msg-header">
      <img src='${msg.photoURL}' width='25' class='avatar'>
      <strong>${msg.name}</strong>
      <span class="timestamp">${formatTimestamp(msg.createdAt)}</span>
    </div>`;

  let body = "";
  if (msg.text) body += `<div class="msg-text">${msg.text}</div>`;

  if (msg.fileData) {
    if (msg.fileType?.startsWith("image/")) body += `<img src='${msg.fileData}' class='msg-img'>`;
    else if (msg.fileType?.startsWith("video/")) body += `<video src='${msg.fileData}' width='300' controls></video>`;
    else body += `<a href='${msg.fileData}' download>📎 Download File</a>`;
  }

  if (msg.youtubeId) {
    body += `<iframe width="240" height="180" src="https://www.youtube.com/embed/${msg.youtubeId}" frameborder="0" allowfullscreen></iframe>`;
  }

  return `<div class="message">${header}${body}</div>`;
}

// Public Chat
const publicMessagesRef = collection(db,"messages");
const publicQuery = query(publicMessagesRef, orderBy("createdAt","asc"));
function loadPublicMessages(){
  currentDMId = null;
  if (unsubscribeListener) unsubscribeListener();
  unsubscribeListener = onSnapshot(publicQuery, snapshot => {
    let html = "";
    snapshot.forEach(doc=>{html += renderMessage(doc.data());});
    messagesDiv.innerHTML = html;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

// Send Message
messageForm.addEventListener("submit", async e => {
  e.preventDefault();
  const user = auth.currentUser;
  if(!user) return alert("Login first!");

  let fileBase64 = null; let fileType = null;
  if(fileInput.files.length>0){
    const file = fileInput.files[0];
    fileType = file.type;
    fileBase64 = await new Promise((resolve,reject)=>{
      const reader = new FileReader();
      reader.onload = ()=>resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const msgData = { 
    uid:user.uid, 
    name:user.displayName, 
    photoURL:user.photoURL, 
    text:messageInput.value||null, 
    fileData:fileBase64, 
    fileType:fileType, 
    youtubeId:null,
    createdAt:serverTimestamp() 
  };

  await addDoc(publicMessagesRef,msgData);
  messageInput.value=""; fileInput.value="";
});

/* ---------------- YouTube Modal ---------------- */
// Open modal
youtubeBtn.addEventListener("click", () => {
  youtubeModal.style.display = "block";
});
// Close modal
closeModal.addEventListener("click", () => {
  youtubeModal.style.display = "none";
});
window.addEventListener("click", e => {
  if (e.target === youtubeModal) youtubeModal.style.display = "none";
});

// YouTube Search (using API v3 or a mock – replace with your API key if needed)
youtubeSearchBtn.addEventListener("click", async () => {
  const term = youtubeSearch.value.trim();
  if (!term) return;

  // Simple demo: embed fake results (replace with real YouTube API call if you have a key)
  youtubeResults.innerHTML = `
    <div class="youtube-item" data-id="dQw4w9WgXcQ">
      <img src="https://img.youtube.com/vi/dQw4w9WgXcQ/0.jpg">
      <span>Example Video Result</span>
    </div>
  `;
});

// Send selected video
youtubeResults.addEventListener("click", async e => {
  const item = e.target.closest(".youtube-item");
  if (!item) return;
  const videoId = item.dataset.id;

  const user = auth.currentUser;
  if (!user) return alert("Login first!");

  const msgData = {
    uid: user.uid,
    name: user.displayName,
    photoURL: user.photoURL,
    text: null,
    fileData: null,
    fileType: null,
    youtubeId: videoId,
    createdAt: serverTimestamp()
  };

  await addDoc(publicMessagesRef, msgData);

  youtubeModal.style.display = "none";
  youtubeSearch.value = "";
  youtubeResults.innerHTML = "";
});
