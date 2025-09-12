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

// YouTube API Key
const YOUTUBE_API_KEY = "AIzaSyBh-x2mtmrpESpVtper5iE0DGKXBcbDdPM";

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
const micBtn = document.getElementById("mic-btn");

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
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    messageForm.classList.remove("hidden");
    dmForm.classList.remove("hidden");
    userProfile.innerHTML = `<img src='${user.photoURL}' width='40' style='border-radius:50%'> <span>${user.displayName}</span>`;

    const userRef = doc(db, "users", user.uid);
    await setDoc(userRef, { uid:user.uid, displayName:user.displayName, email:user.email, photoURL:user.photoURL }, { merge:true });

    loadPublicMessages();
  } else {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    messageForm.classList.add("hidden");
    dmForm.classList.add("hidden");
    messagesDiv.innerHTML = "<p>Login to see messages</p>";
    userProfile.innerHTML = "";
    if(unsubscribeListener) unsubscribeListener();
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
      <img src='${msg.photoURL}' width='32' class='avatar'>
      <strong>${msg.name}</strong>
      <span class="meta">${formatTimestamp(msg.createdAt)}</span>
    </div>`;

  let body = "";
  if (msg.text) body += `<div class="msg-text">${msg.text}</div>`;
  if (msg.fileData) {
    if (msg.fileType?.startsWith("image/")) body += `<img src='${msg.fileData}' class='msg-img'>`;
    else if (msg.fileType?.startsWith("video/")) body += `<video src='${msg.fileData}' width='240' controls></video>`;
    else body += `<a href='${msg.fileData}' download>📎 Download File</a>`;
  }
  if (msg.youtubeEmbed) body += `<iframe src="https://www.youtube.com/embed/${msg.youtubeEmbed}" width="240" height="180" frameborder="0" allowfullscreen></iframe>`;

  return `<div class='message'>${header}${body}</div>`;
}

// Public Chat
const publicMessagesRef = collection(db,"messages");
const publicQuery = query(publicMessagesRef, orderBy("createdAt","asc"));
function loadPublicMessages(){
  currentDMId = null;
  if(unsubscribeListener) unsubscribeListener();
  unsubscribeListener = onSnapshot(publicQuery, snapshot => {
    messagesDiv.innerHTML = "";
    snapshot.forEach(doc=>{messagesDiv.innerHTML+=renderMessage(doc.data());});
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

// Private DM Form
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

  if(unsubscribeListener) unsubscribeListener();
  unsubscribeListener = onSnapshot(dmQuery,snapshot=>{
    messagesDiv.innerHTML="";
    snapshot.forEach(doc=>{messagesDiv.innerHTML+=renderMessage(doc.data());});
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
});

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
    createdAt:serverTimestamp()
  };

  if(currentDMId){
    const dmRef = collection(db,"privateMessages",currentDMId,"messages");
    await addDoc(dmRef,msgData);
  } else {
    await addDoc(publicMessagesRef,msgData);
  }

  messageInput.value=""; fileInput.value="";
});

// File button
document.getElementById("file-btn").addEventListener("click", ()=>fileInput.click());

// YouTube Modal
youtubeBtn.addEventListener("click", ()=>{ youtubeModal.style.display="flex"; youtubeSearch.focus(); });
closeModal.addEventListener("click", ()=>youtubeModal.style.display="none");
window.addEventListener("click",(e)=>{ if(e.target==youtubeModal) youtubeModal.style.display="none"; });

// YouTube Search
youtubeSearchBtn.addEventListener("click", fetchYouTube);
youtubeSearch.addEventListener("keydown",(e)=>{ if(e.key==="Enter") fetchYouTube(); });

let mediaRecorder;
let audioChunks = [];

micBtn.addEventListener("click", async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return alert("Your browser does not support audio recording.");
  }

  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.addEventListener("dataavailable", event => {
      audioChunks.push(event.data);
    });

    mediaRecorder.addEventListener("stop", async () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      const reader = new FileReader();
      reader.onload = async () => {
        const fileBase64 = reader.result;
        const user = auth.currentUser;
        if (!user) return alert("Login first!");
        const msgData = {
          uid: user.uid,
          name: user.displayName,
          photoURL: user.photoURL,
          fileData: fileBase64,
          fileType: "audio/webm",
          createdAt: serverTimestamp()
        };

        if (currentDMId) {
          const dmRef = collection(db, "privateMessages", currentDMId, "messages");
          await addDoc(dmRef, msgData);
        } else {
          await addDoc(publicMessagesRef, msgData);
        }
      };
      reader.readAsDataURL(audioBlob);
    });

    mediaRecorder.start();
    micBtn.textContent = "⏹️"; // Change button to stop
  } else if (mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    micBtn.textContent = "🎤"; // Reset button
  }
});

async function fetchYouTube(){
  const q = youtubeSearch.value.trim();
  if(!q) return;
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&key=${YOUTUBE_API_KEY}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    displayYouTubeResults(data.items);
  } catch(e){ console.error(e); }
}

function displayYouTubeResults(videos){
  youtubeResults.innerHTML="";
  videos.forEach(v=>{
    const div = document.createElement("div");
    div.classList.add("youtube-item");
    div.innerHTML = `<img src="${v.snippet.thumbnails.medium.url}"><span>${v.snippet.title}</span>`;
    div.addEventListener("click", async ()=>{
      const user = auth.currentUser;
      if(!user) return alert("Login first!");
      const msgData = {
        uid:user.uid,
        name:user.displayName,
        photoURL:user.photoURL,
        youtubeEmbed:v.id.videoId,
        createdAt:serverTimestamp()
      };
      if(currentDMId){
        const dmRef = collection(db,"privateMessages",currentDMId,"messages");
        await addDoc(dmRef,msgData);
      } else {
        await addDoc(publicMessagesRef,msgData);
      }
      youtubeModal.style.display="none";
      youtubeSearch.value="";
    });
    youtubeResults.appendChild(div);
  });
}
