import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, doc, serverTimestamp, query, orderBy, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

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
const fileBtn = document.getElementById("file-btn");
const videoBtn = document.getElementById("video-btn");
const messagesDiv = document.getElementById("messages");
const dmForm = document.getElementById("dm-form");
const dmEmailInput = document.getElementById("dm-email");
const userProfile = document.getElementById("user-profile");

const videoPopup = document.getElementById("video-popup");
const closePopup = document.getElementById("close-popup");
const videoSearchInput = document.getElementById("video-search-input");
const videoSearchBtn = document.getElementById("video-search-btn");
const videoResults = document.getElementById("video-results");

let currentDMId = null;

// --- Utils ---
function timeAgo(timestamp) {
  if (!timestamp) return "";
  const now = new Date();
  const diff = (now - timestamp.toDate()) / 1000; // seconds
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff/60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)} hours ago`;
  return timestamp.toDate().toLocaleString();
}

// --- Auth ---
loginBtn.addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
});
logoutBtn.addEventListener("click", async () => { await signOut(auth); });

onAuthStateChanged(auth, async user => {
  if(user){
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    messageForm.classList.remove("hidden");
    dmForm.classList.remove("hidden");
    userProfile.innerHTML = `<img src='${user.photoURL}' width='40' class='avatar'> <span>${user.displayName}</span>`;
    await setDoc(doc(db,"users",user.uid),{uid:user.uid,displayName:user.displayName,email:user.email,photoURL:user.photoURL},{merge:true});
    loadPublicMessages();
  } else {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    messageForm.classList.add("hidden");
    dmForm.classList.add("hidden");
    messagesDiv.innerHTML = "<p>Login to see messages</p>";
    userProfile.innerHTML = "";
  }
});

// --- Render Message ---
function renderMessage(msg){
  let content = `<strong>${msg.name}</strong> <span class="meta">${timeAgo(msg.createdAt)}</span><br>${msg.text||""}`;

  if(msg.fileData){
    if(msg.fileType?.startsWith("image/")) content += `<br><img src='${msg.fileData}' width='200'>`;
    else if(msg.fileType?.startsWith("video/")) content += `<br><video src='${msg.fileData}' width='300' controls></video>`;
    else content += `<br><a href='${msg.fileData}' download='file'>📎 Download File</a>`;
  }

  if(msg.youtubeId){
    content += `<br><iframe width="240" height="180" src="https://www.youtube.com/embed/${msg.youtubeId}" frameborder="0" allowfullscreen></iframe>`;
  }

  return `<div class='message'><img src='${msg.photoURL}' class='avatar'> ${content}</div>`;
}

// --- Public Chat ---
const publicMessagesRef = collection(db,"messages");
const publicQuery = query(publicMessagesRef, orderBy("createdAt","asc"));
function loadPublicMessages(){
  currentDMId = null;
  onSnapshot(publicQuery, snapshot => {
    messagesDiv.innerHTML = "";
    snapshot.forEach(doc=>{messagesDiv.innerHTML+=renderMessage(doc.data());});
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

// --- DM ---
dmForm.addEventListener("submit", async e => {
  e.preventDefault();
  const user = auth.currentUser;
  const email = dmEmailInput.value.trim();
  if(!email) return;
  const usersSnap = await getDocs(collection(db,"users"));
  let otherUser = null;
  usersSnap.forEach(doc=>{if(doc.data().email===email) otherUser = doc.data();});
  if(!otherUser) return alert("User not found!");
  const chatId = [user.uid,otherUser.uid].sort().join("_");
  currentDMId = chatId;
  const dmRef = collection(db,"privateMessages",chatId,"messages");
  const dmQuery = query(dmRef, orderBy("createdAt","asc"));
  onSnapshot(dmQuery,snapshot=>{
    messagesDiv.innerHTML="";
    snapshot.forEach(doc=>{messagesDiv.innerHTML+=renderMessage(doc.data());});
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
});

// --- Send Message ---
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
  const msgData = { uid:user.uid, name:user.displayName, photoURL:user.photoURL, text:messageInput.value||null, fileData:fileBase64, fileType:fileType, createdAt:serverTimestamp() };
  const targetRef = currentDMId ? collection(db,"privateMessages",currentDMId,"messages") : publicMessagesRef;
  await addDoc(targetRef,msgData);
  messageInput.value=""; fileInput.value="";
});

// --- File Picker Button ---
fileBtn.addEventListener("click", ()=> fileInput.click());

// --- Video Popup Logic ---
videoBtn.addEventListener("click", ()=> videoPopup.classList.remove("hidden"));
closePopup.addEventListener("click", ()=> videoPopup.classList.add("hidden"));

videoSearchBtn.addEventListener("click", async ()=>{
  const q = videoSearchInput.value.trim();
  if(!q) return;
  // Fetch from YouTube API (replace with your API key)
  const apiKey = "YOUR_YOUTUBE_API_KEY";
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(q)}&key=${apiKey}`);
  const data = await res.json();
  videoResults.innerHTML = "";
  data.items.forEach(item=>{
    const div = document.createElement("div");
    div.innerHTML = `<img src="${item.snippet.thumbnails.default.url}" style="vertical-align:middle;"> ${item.snippet.title}`;
    div.addEventListener("click", async ()=>{
      const user = auth.currentUser;
      if(!user) return alert("Login first!");
      const msgData = { uid:user.uid, name:user.displayName, photoURL:user.photoURL, youtubeId:item.id.videoId, createdAt:serverTimestamp() };
      const targetRef = currentDMId ? collection(db,"privateMessages",currentDMId,"messages") : publicMessagesRef;
      await addDoc(targetRef,msgData);
      videoPopup.classList.add("hidden");
    });
    videoResults.appendChild(div);
  });
});
