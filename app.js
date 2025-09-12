// app.js - complete integrated chat with DMs, groups, audio, YouTube, etc.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, setDoc, doc, serverTimestamp,
  query, orderBy, onSnapshot, getDocs, where
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// ---------- CONFIG ----------
const firebaseConfig = {
  apiKey: "AIzaSyAusTICWuGMBJr5suC0KJtn29AlILkin7U",
  authDomain: "school-chatroom-f10a6.firebaseapp.com",
  projectId: "school-chatroom-f10a6",
  storageBucket: "school-chatroom-f10a6.firebasestorage.app",
  messagingSenderId: "1088030798418",
  appId: "1:1088030798418:web:b6c9b3e2b40851e9cae58b",
  measurementId: "G-B3SPD5R7N1"
};
const YOUTUBE_API_KEY = "AIzaSyBh-x2mtmrpESpVtper5iE0DGKXBcbDdPM"; // your key

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- DOM ----------
const loginBtn = document.getElementById("login");
const logoutBtn = document.getElementById("logout");
const userProfile = document.getElementById("user-profile");

const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const fileInput = document.getElementById("file-input");
const fileBtn = document.getElementById("file-btn");
const youtubeBtn = document.getElementById("youtube-btn");
const micBtn = document.getElementById("mic-btn");

const messagesDiv = document.getElementById("messages");

const dmForm = document.getElementById("dm-form");
const dmEmailInput = document.getElementById("dm-email");
const dmListReceived = document.getElementById("dm-list-received");
const dmListSent = document.getElementById("dm-list-sent");

const backPublicBtn = document.getElementById("back-public-btn");

// group controls
const createGroupBtn = document.getElementById("create-group-btn");
const viewGroupsBtn = document.getElementById("view-groups-btn");
const backToDmsBtn = document.getElementById("back-to-dms-btn");
const groupList = document.getElementById("group-list");

// YouTube modal
const youtubeModal = document.getElementById("youtube-modal");
const closeModal = document.getElementById("close-modal");
const youtubeSearch = document.getElementById("youtube-search");
const youtubeSearchBtn = document.getElementById("youtube-search-btn");
const youtubeResults = document.getElementById("youtube-results");

// ---------- State ----------
let currentDMId = null;       // if viewing a DM -> chatId (uid_uid)
let currentGroupId = null;    // if viewing a group -> groupId
let unsubscribeListener = null;
let mediaRecorder = null;
let audioChunks = [];

// ---------- Auth handlers ----------
loginBtn && (loginBtn.onclick = async () => {
  await signInWithPopup(auth, new GoogleAuthProvider());
});
logoutBtn && (logoutBtn.onclick = async () => {
  await signOut(auth);
});

// ---------- Utils ----------
function formatTimestamp(ts){
  if(!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = (Date.now() - date.getTime())/1000;
  if(diff < 60) return "just now";
  if(diff < 3600) return Math.floor(diff/60) + " min ago";
  if(diff < 86400) return Math.floor(diff/3600) + " hr ago";
  return date.toLocaleString();
}

function safeHTML(str){
  if(!str) return "";
  // very small sanitizer - keep simple (you can expand)
  return String(str).replaceAll("<","&lt;").replaceAll(">","&gt;");
}

// ---------- Render message (supports text, audio, image, video, file, youtube) ----------
function renderMessage(msg){
  // Accept different field names:
  const name = msg.name || msg.senderName || "Unknown";
  const photo = msg.photoURL || msg.senderPhoto || "";
  const createdAt = msg.createdAt || msg.createdAt;
  let header = `
    <div class="msg-header">
      <img src='${photo || "https://www.gravatar.com/avatar/?d=mp"}' width='32' class='avatar'>
      <strong>${safeHTML(name)}</strong>
      <span class="meta">${formatTimestamp(createdAt)}</span>
    </div>`;
  let body = "";
  if (msg.text) body += `<div class="msg-text">${safeHTML(msg.text)}</div>`;

  // files: audio first
  if (msg.fileData && msg.fileType?.startsWith("audio/")) {
    body += `<audio controls src='${msg.fileData}'></audio>`;
  } else if (msg.fileData && msg.fileType?.startsWith("image/")) {
    body += `<img src='${msg.fileData}' class='msg-img'>`;
  } else if (msg.fileData && msg.fileType?.startsWith("video/")) {
    body += `<video src='${msg.fileData}' width='240' controls></video>`;
  } else if (msg.fileData) {
    body += `<a href='${msg.fileData}' download>📎 Download File</a>`;
  }

  // YouTube
  if (msg.youtubeEmbed) {
    body += `<iframe src="https://www.youtube.com/embed/${msg.youtubeEmbed}" width="240" height="180" frameborder="0" allowfullscreen></iframe>`;
  }

  return `<div class='message'>${header}${body}</div>`;
}

// ---------- Public chat ----------
const publicMessagesRef = collection(db, "messages");
const publicQuery = query(publicMessagesRef, orderBy("createdAt", "asc"));

function loadPublicMessages(){
  currentDMId = null;
  currentGroupId = null;
  backPublicBtn && (backPublicBtn.style.display = "none");

  if (unsubscribeListener) unsubscribeListener();
  unsubscribeListener = onSnapshot(publicQuery, snapshot => {
    messagesDiv.innerHTML = "";
    snapshot.forEach(docSnap => {
      messagesDiv.innerHTML += renderMessage(docSnap.data());
    });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });

  // restore messageForm submit to public send
  setupMessageFormForPublic();
}

// ---------- DM handling ----------
dmForm && (dmForm.onsubmit = async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  const email = dmEmailInput.value.trim();
  if(!user) return alert("Login first!");
  if(!email) return;

  // lookup other user by email
  const usersSnap = await getDocs(collection(db,"users"));
  let otherUser = null;
  usersSnap.forEach(d => { if (d.data().email === email) otherUser = d.data(); });

  if(!otherUser) return alert("User not found");

  const chatId = [user.uid, otherUser.uid].sort().join("_");
  currentDMId = chatId;
  currentGroupId = null;

  // unsubscribe previous
  if (unsubscribeListener) unsubscribeListener();

  const dmRef = collection(db, "privateMessages", chatId, "messages");
  const dmQuery = query(dmRef, orderBy("createdAt", "asc"));

  unsubscribeListener = onSnapshot(dmQuery, snapshot => {
    messagesDiv.innerHTML = "";
    snapshot.forEach(docSnap => messagesDiv.innerHTML += renderMessage(docSnap.data()));
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });

  backPublicBtn && (backPublicBtn.style.display = "block");
  updateDMLists();
});

// ---------- Send message helper (handles public / DM / group) ----------
async function sendMessagePayload(payload){
  // payload already contains uid, name, photoURL, text, fileData, fileType, youtubeEmbed maybe
  if(currentGroupId){
    // send to groupMessages
    await addDoc(collection(db, "groupMessages"), { ...payload, groupId: currentGroupId, createdAt: serverTimestamp() });
  } else if (currentDMId){
    const dmRef = collection(db, "privateMessages", currentDMId, "messages");
    await addDoc(dmRef, { ...payload, createdAt: serverTimestamp() });
  } else {
    await addDoc(publicMessagesRef, { ...payload, createdAt: serverTimestamp() });
  }
}

function setupMessageFormForPublic(){
  // ensure messageForm submit attaches to public send (safe restore)
  messageForm.onsubmit = async e => {
    e.preventDefault();
    const user = auth.currentUser;
    if(!user) return alert("Login first!");

    // file handling
    let fileBase64 = null, fileType = null;
    if(fileInput.files.length > 0){
      const file = fileInput.files[0];
      fileType = file.type;
      fileBase64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
    }

    const payload = {
      uid: user.uid,
      name: user.displayName,
      photoURL: user.photoURL,
      text: messageInput.value || null,
      fileData: fileBase64,
      fileType: fileType || null,
      youtubeEmbed: null
    };

    await sendMessagePayload(payload);
    messageInput.value = "";
    fileInput.value = "";
    updateDMLists();
  };
}

// set initial message handler
setupMessageFormForPublic();

// ---------- File / YouTube / Mic buttons ----------
fileBtn && (fileBtn.onclick = () => fileInput.click());

youtubeBtn && (youtubeBtn.onclick = () => {
  if(youtubeModal) { youtubeModal.style.display = "flex"; youtubeSearch && youtubeSearch.focus(); }
});
closeModal && (closeModal.onclick = () => { youtubeModal.style.display = "none"; youtubeResults && (youtubeResults.innerHTML = ""); });

youtubeSearchBtn && (youtubeSearchBtn.onclick = async () => {
  const q = youtubeSearch.value.trim();
  if(!q) return;
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=6&q=${encodeURIComponent(q)}&key=${YOUTUBE_API_KEY}`);
    const data = await res.json();
    youtubeResults.innerHTML = "";
    if(!data.items) return;
    data.items.forEach(item => {
      const div = document.createElement("div");
      div.className = "youtube-item";
      div.innerHTML = `<img src="${item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default.url}"><span>${item.snippet.title}</span>`;
      div.onclick = async () => {
        const user = auth.currentUser;
        if(!user) return alert("Login first!");
        const payload = {
          uid: user.uid, name: user.displayName, photoURL: user.photoURL,
          text: null, fileData: null, fileType: null,
          youtubeEmbed: item.id.videoId
        };
        await sendMessagePayload(payload);
        youtubeModal.style.display = "none";
        youtubeResults.innerHTML = "";
      };
      youtubeResults.appendChild(div);
    });
  } catch(err){
    console.error("YouTube fetch error:", err);
    alert("YouTube API error. Check console and your API key/quota.");
  }
});

// ---------- Microphone recording ----------
if(micBtn){
  micBtn.onclick = async () => {
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return alert("Your browser does not support audio recording.");
    if(!mediaRecorder || mediaRecorder.state === "inactive"){
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = async () => {
          const user = auth.currentUser;
          if(!user) return alert("Login first!");
          const payload = {
            uid: user.uid, name: user.displayName, photoURL: user.photoURL,
            text: null, fileData: reader.result, fileType: "audio/webm", youtubeEmbed: null
          };
          await sendMessagePayload(payload);
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorder.start();
      micBtn.textContent = "⏹️";
    } else if(mediaRecorder.state === "recording"){
      mediaRecorder.stop();
      micBtn.textContent = "🎤";
    }
  };
}

// ---------- Auth state observer ----------
onAuthStateChanged(auth, async (user) => {
  if(user){
    loginBtn && (loginBtn.style.display = "none");
    logoutBtn && (logoutBtn.style.display = "block");
    messageForm && (messageForm.style.display = "flex");
    dmForm && (dmForm.style.display = "flex");
    userProfile && (userProfile.innerHTML = `<img src='${user.photoURL}' width='40' style='border-radius:50%'> <span>${user.displayName}</span>`);

    await setDoc(doc(db,"users",user.uid), {
      uid: user.uid, displayName: user.displayName, email: user.email, photoURL: user.photoURL
    }, { merge: true });

    loadPublicMessages();
    updateDMLists(); // populate DM sidebar
  } else {
    loginBtn && (loginBtn.style.display = "block");
    logoutBtn && (logoutBtn.style.display = "none");
    messageForm && (messageForm.style.display = "none");
    dmForm && (dmForm.style.display = "none");
    messagesDiv && (messagesDiv.innerHTML = "<p>Login to see messages</p>");
    userProfile && (userProfile.innerHTML = "");
    dmListReceived && (dmListReceived.innerHTML = "");
    dmListSent && (dmListSent.innerHTML = "");
    groupList && (groupList.innerHTML = "");
    if(unsubscribeListener) unsubscribeListener();
  }
});

// ---------- DM sidebar logic with duplicate prevention + unread counts ----------
async function updateDMLists(){
  const user = auth.currentUser;
  if(!user) return;

  const usersSnap = await getDocs(collection(db, "users"));
  const usersArr = [];
  usersSnap.forEach(d => { if(d.id !== user.uid) usersArr.push(d.data()); });

  dmListReceived && (dmListReceived.innerHTML = "");
  dmListSent && (dmListSent.innerHTML = "");

  const addedReceived = new Set();
  const addedSent = new Set();

  for(const otherUser of usersArr){
    const chatId = [user.uid, otherUser.uid].sort().join("_");
    const dmRef = collection(db, "privateMessages", chatId, "messages");
    const dmQuerySnap = await getDocs(query(dmRef, orderBy("createdAt", "asc")));

    if(dmQuerySnap.empty) continue;

    let unread = 0, lastMessage = null;
    dmQuerySnap.forEach(d => {
      const data = d.data();
      lastMessage = { ...data, id: d.id };
      if(data.uid !== user.uid && !data.readBy?.includes(user.uid)) unread++;
    });

    // Skip duplicates by uid set
    if(lastMessage?.uid === user.uid){
      if(addedSent.has(otherUser.uid)) continue;
    } else {
      if(addedReceived.has(otherUser.uid)) continue;
    }

    const item = document.createElement("div");
    item.className = "dm-item";
    item.innerHTML = `
      <img src="${otherUser.photoURL}" alt="pfp">
      <span class="name">${otherUser.displayName}</span>
      ${unread > 0 ? `<span class="unread">${unread}</span>` : ""}
    `;

    item.onclick = async () => {
      // unsubscribe any previous
      if(unsubscribeListener) unsubscribeListener();

      // set email & trigger dmForm submit (which sets up onSnapshot properly)
      dmEmailInput.value = otherUser.email;
      dmForm.dispatchEvent(new Event("submit"));

      // show back button
      backPublicBtn && (backPublicBtn.style.display = "block");

      // mark as read in DB (for existing messages)
      dmQuerySnap.forEach(async docSnap => {
        const data = docSnap.data();
        if(!data.readBy) data.readBy = [];
        if(!data.readBy.includes(user.uid)){
          data.readBy.push(user.uid);
          await setDoc(doc(db,"privateMessages",chatId,"messages",docSnap.id), data, { merge: true });
        }
      });

      // update sidebar after marking read
      updateDMLists();
    };

    if(lastMessage?.uid === user.uid){
      dmListSent && dmListSent.appendChild(item);
      addedSent.add(otherUser.uid);
    } else {
      dmListReceived && dmListReceived.appendChild(item);
      addedReceived.add(otherUser.uid);
    }
  }
}

// ---------- Back to public button ----------
backPublicBtn && (backPublicBtn.onclick = () => {
  currentDMId = null;
  currentGroupId = null;
  if(unsubscribeListener) unsubscribeListener();
  loadPublicMessages();
  backPublicBtn.style.display = "none";
});

// ---------- Groups: create / view / load ----------
if(createGroupBtn){
  createGroupBtn.onclick = async () => {
    const name = prompt("Group name:");
    if(!name) return;
    const emailsStr = prompt("Add member emails (comma separated):\n(leave blank to only include yourself)");
    const members = emailsStr ? emailsStr.split(",").map(s => s.trim()).filter(Boolean) : [];
    // ensure the creator is in members (use email)
    const me = auth.currentUser ? auth.currentUser.email : null;
    if(me && !members.includes(me)) members.push(me);

    await addDoc(collection(db, "groups"), {
      name,
      createdBy: auth.currentUser.uid,
      members,
      createdAt: serverTimestamp()
    });
    alert("Group created.");
  };
}

if(viewGroupsBtn){
  viewGroupsBtn.onclick = () => {
    // hide DM lists (if present) and show groupList
    dmListReceived && (dmListReceived.style.display = "none");
    dmListSent && (dmListSent.style.display = "none");
    groupList && (groupList.style.display = "block");
    backToDmsBtn && (backToDmsBtn.style.display = "inline-block");

    // unsubscribe previous
    if(unsubscribeListener) unsubscribeListener();

    // query groups where current user is member (by email)
    const q = query(collection(db, "groups"), where("members", "array-contains", auth.currentUser.email));
    unsubscribeListener = onSnapshot(q, snapshot => {
      groupList.innerHTML = "";
      snapshot.forEach(docSnap => {
        const grp = docSnap.data();
        const div = document.createElement("div");
        div.className = "dm-item";
        div.innerHTML = `<span class="name">${grp.name}</span> <small style="margin-left:8px;color:#666">(${grp.members?.length||0})</small>`;
        div.onclick = () => {
          loadGroupMessages(docSnap.id, grp.name);
        };
        groupList.appendChild(div);
      });
    });
  };
}

if(backToDmsBtn){
  backToDmsBtn.onclick = () => {
    groupList && (groupList.style.display = "none");
    dmListReceived && (dmListReceived.style.display = "block");
    dmListSent && (dmListSent.style.display = "block");
    backToDmsBtn.style.display = "none";
    if(unsubscribeListener) unsubscribeListener();
    updateDMLists();
  };
}

// ---------- Load group messages ----------
function loadGroupMessages(groupId, groupName){
  currentGroupId = groupId;
  currentDMId = null;
  backPublicBtn && (backPublicBtn.style.display = "block");

  if(unsubscribeListener) unsubscribeListener();

  const q = query(collection(db, "groupMessages"), where("groupId", "==", groupId), orderBy("createdAt", "asc"));
  unsubscribeListener = onSnapshot(q, snapshot => {
    messagesDiv.innerHTML = `<h3 style="margin:0 0 8px 0">${safeHTML(groupName)}</h3>`;
    snapshot.forEach(docSnap => messagesDiv.innerHTML += renderMessage(docSnap.data()));
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });

  // override send handler to send to group
  messageForm.onsubmit = async e => {
    e.preventDefault();
    const user = auth.currentUser;
    if(!user) return alert("Login first!");

    let fileBase64 = null, fileType = null;
    if(fileInput.files.length > 0){
      const file = fileInput.files[0];
      fileType = file.type;
      fileBase64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
    }

    const payload = {
      uid: user.uid, name: user.displayName, photoURL: user.photoURL,
      text: messageInput.value || null,
      fileData: fileBase64, fileType: fileType || null,
      youtubeEmbed: null, groupId
    };

    await addDoc(collection(db, "groupMessages"), { ...payload, createdAt: serverTimestamp() });
    messageInput.value = "";
    fileInput.value = "";
  };
}

// ---------- Export for external scripts ----------
export { auth, db };
