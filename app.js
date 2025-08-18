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
const messagesDiv = document.getElementById("messages");
const dmForm = document.getElementById("dm-form");
const dmEmailInput = document.getElementById("dm-email");
const dmListDiv = document.getElementById("dm-list");
const userProfile = document.getElementById("user-profile");
const viewDmsBtn = document.getElementById("view-dms");

let currentDMId = null;

// --- Login / Logout ---
loginBtn.addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

// --- Auth State ---
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
  }
});

// --- Render message ---
function renderMessage(msg){
  let content = `<strong>${msg.name}:</strong> ${msg.text||""}`;
  if(msg.fileData){
    if(msg.fileType.startsWith("image/")) content += `<br><img src='${msg.fileData}' width='200'>`;
    else if(msg.fileType.startsWith("video/")) content += `<br><video src='${msg.fileData}' width='300' controls></video>`;
    else content += `<br><a href='${msg.fileData}' download='file'>📎 Download File</a>`;
  }
  return `<div class='message'><img src='${msg.photoURL}' width='25' style='border-radius:50%; vertical-align:middle; margin-right:5px;'>${content}</div>`;
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

// --- DM Autocomplete ---
let allUsers = [];
dmEmailInput.addEventListener("input", async e => {
  const val = e.target.value.toLowerCase();
  if(allUsers.length === 0){
    const usersSnap = await getDocs(collection(db,"users"));
    allUsers = usersSnap.docs.map(d=>d.data()).filter(u=>u.uid !== auth.currentUser.uid);
  }
  const suggestions = allUsers.filter(u => u.email.toLowerCase().startsWith(val));
  // Clear previous suggestions
  const dropdownId = "autocomplete-list";
  let dropdown = document.getElementById(dropdownId);
  if(dropdown) dropdown.remove();

  if(suggestions.length === 0) return;

  dropdown = document.createElement("div");
  dropdown.id = dropdownId;
  dropdown.style.border = "1px solid #ccc";
  dropdown.style.position = "absolute";
  dropdown.style.background = "#fff";
  suggestions.forEach(u=>{
    const item = document.createElement("div");
    item.style.padding = "4px";
    item.style.cursor = "pointer";
    item.innerHTML = `<img src="${u.photoURL}" width="25" style="border-radius:50%; margin-right:5px;">${u.email}`;
    item.addEventListener("click", ()=>{ dmEmailInput.value = u.email; dropdown.remove(); });
    dropdown.appendChild(item);
  });
  dmEmailInput.parentNode.appendChild(dropdown);
});

// --- Start DM ---
dmForm.addEventListener("submit", async e => {
  e.preventDefault();
  const user = auth.currentUser;
  if(!user) return alert("Login first!");

  const email = dmEmailInput.value.trim();
  const otherUser = allUsers.find(u=>u.email===email);
  if(!otherUser) return alert("User not found!");

  const chatId = [user.uid,otherUser.uid].sort().join("_");
  currentDMId = chatId;

  const dmRef = collection(db,"privateMessages",chatId,"messages");
  const dmQuery = query(dmRef, orderBy("createdAt","asc"));

  onSnapshot(dmQuery, snapshot=>{
    messagesDiv.innerHTML="";
    snapshot.forEach(doc=>{messagesDiv.innerHTML+=renderMessage(doc.data());});
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });

  dmEmailInput.value = "";
});

// --- View DMs ---
viewDmsBtn.addEventListener("click", async ()=>{
  const user = auth.currentUser;
  if(!user) return;

  // Fetch all private chats
  const dmSnap = await getDocs(collection(db, "privateMessages"));
  dmListDiv.innerHTML = "";
  dmSnap.forEach(doc => {
    const chatId = doc.id;
    if(chatId.includes(user.uid)){
      const otherUid = chatId.replace(user.uid,"").replace("_","");
      const otherUser = allUsers.find(u=>u.uid===otherUid);
      if(otherUser){
        const btn = document.createElement("button");
        btn.textContent = otherUser.email;
        btn.style.width = "100%";
        btn.style.marginBottom = "2px";
        btn.onclick = ()=> openPrivateChatById(chatId);
        dmListDiv.appendChild(btn);
      }
    }
  });
  dmListDiv.style.display = "block";
});

// --- Open Private Chat ---
function openPrivateChatById(chatId){
  currentDMId = chatId;
  const dmRef = collection(db,"privateMessages",chatId,"messages");
  const dmQuery = query(dmRef, orderBy("createdAt","asc"));

  onSnapshot(dmQuery, snapshot=>{
    messagesDiv.innerHTML="";
    snapshot.forEach(doc=>{messagesDiv.innerHTML+=renderMessage(doc.data());});
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

// --- Send Message ---
messageForm.addEventListener("submit", async e=>{
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
    await addDoc(collection(db,"messages"),msgData);
  }

  messageInput.value=""; fileInput.value="";
});
