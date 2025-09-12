// app.js - full integrated chat (public, DMs, groups) using your Firebase config + YouTube API

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, setDoc, doc, serverTimestamp,
  query, orderBy, onSnapshot, getDocs, where
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* ---------------- CONFIG ---------------- */
const firebaseConfig = {
  apiKey: "AIzaSyAusTICWuGMBJr5suC0KJtn29AlILkin7U",
  authDomain: "school-chatroom-f10a6.firebaseapp.com",
  projectId: "school-chatroom-f10a6",
  storageBucket: "school-chatroom-f10a6.firebasestorage.app",
  messagingSenderId: "1088030798418",
  appId: "1:1088030798418:web:b6c9b3e2b40851e9cae58b",
  measurementId: "G-B3SPD5R7N1"
};
const YOUTUBE_API_KEY = "AIzaSyBh-x2mtmrpESpVtper5iE0DGKXBcbDdPM";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------------- DOM ---------------- */
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
const dmItemsContainer = document.getElementById("dm-items"); // optional alt

const backPublicBtn = document.getElementById("back-public-btn");

// Group controls
const createGroupBtn = document.getElementById("create-group-btn");
const viewGroupsBtn = document.getElementById("view-groups-btn");
const backToDmsBtn = document.getElementById("back-to-dms-btn");
const groupList = document.getElementById("group-list");
const groupItemsContainer = document.getElementById("group-items"); // optional alt

// YouTube modal elements
const youtubeModal = document.getElementById("youtube-modal");
const closeModal = document.getElementById("close-modal");
const youtubeSearch = document.getElementById("youtube-search");
const youtubeSearchBtn = document.getElementById("youtube-search-btn");
const youtubeResults = document.getElementById("youtube-results");

/* ---------------- State ---------------- */
let currentDMId = null;
let currentGroupId = null;
let unsubscribeListener = null; // single active listener (public / dm / group)
let mediaRecorder = null;
let audioChunks = [];

/* ---------------- Helpers ---------------- */
function safeHTML(s){
  if(!s) return "";
  return String(s)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}
function formatTimestamp(ts){
  if(!ts) return "";
  const date = (ts && ts.toDate) ? ts.toDate() : new Date(ts);
  const diff = (Date.now() - date.getTime())/1000;
  if(diff < 60) return "just now";
  if(diff < 3600) return Math.floor(diff/60) + " min ago";
  if(diff < 86400) return Math.floor(diff/3600) + " hr ago";
  return date.toLocaleString();
}

/* ---------------- Render message ---------------- */
function renderMessage(msg){
  const name = msg.name || msg.senderName || "Unknown";
  const photo = msg.photoURL || msg.senderPhoto || "";
  const createdAt = msg.createdAt || null;
  let html = `
    <div class="message">
      <div class="msg-header">
        <img src="${photo || 'https://www.gravatar.com/avatar/?d=mp'}" width="32" class="avatar">
        <strong>${safeHTML(name)}</strong>
        <span class="meta">${formatTimestamp(createdAt)}</span>
      </div>
  `;
  if(msg.text) html += `<div class="msg-text">${safeHTML(msg.text)}</div>`;

  // Files: audio first
  if(msg.fileData && msg.fileType?.startsWith("audio/")){
    html += `<audio controls src="${msg.fileData}"></audio>`;
  } else if(msg.fileData && msg.fileType?.startsWith("image/")){
    html += `<img src="${msg.fileData}" class="msg-img">`;
  } else if(msg.fileData && msg.fileType?.startsWith("video/")){
    html += `<video src="${msg.fileData}" width="240" controls></video>`;
  } else if(msg.fileData){
    html += `<a href="${msg.fileData}" download>📎 Download File</a>`;
  }

  if(msg.youtubeEmbed){
    html += `<iframe src="https://www.youtube.com/embed/${safeHTML(msg.youtubeEmbed)}" width="240" height="180" frameborder="0" allowfullscreen></iframe>`;
  }

  html += `</div>`;
  return html;
}

/* ---------------- Public chat ---------------- */
const publicMessagesRef = collection(db, "messages");
const publicQuery = query(publicMessagesRef, orderBy("createdAt","asc"));

function loadPublicMessages(){
  currentDMId = null;
  currentGroupId = null;
  if(backPublicBtn) backPublicBtn.style.display = "none";

  if(unsubscribeListener) unsubscribeListener();
  unsubscribeListener = onSnapshot(publicQuery, snapshot => {
    if(!messagesDiv) return;
    messagesDiv.innerHTML = "";
    snapshot.forEach(docSnap => messagesDiv.innerHTML += renderMessage(docSnap.data()));
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

/* ---------------- Send message (public / dm / group) ---------------- */
async function sendMessagePayload(payload){
  // payload: { uid, name, photoURL, text, fileData, fileType, youtubeEmbed }
  if(currentGroupId){
    await addDoc(collection(db, "groupMessages"), { ...payload, groupId: currentGroupId, createdAt: serverTimestamp() });
  } else if(currentDMId){
    const dmRef = collection(db, "privateMessages", currentDMId, "messages");
    await addDoc(dmRef, { ...payload, createdAt: serverTimestamp() });
  } else {
    await addDoc(publicMessagesRef, { ...payload, createdAt: serverTimestamp() });
  }
}

/* attach single message form handler that uses currentDMId/currentGroupId when sending */
function setupMessageFormHandler(){
  if(!messageForm) return;
  messageForm.onsubmit = async e => {
    e.preventDefault();
    const user = auth.currentUser;
    if(!user) return alert("Login first");

    let fileBase64 = null, fileType = null;
    if(fileInput && fileInput.files && fileInput.files.length > 0){
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
      text: (messageInput && messageInput.value) ? messageInput.value : null,
      fileData: fileBase64,
      fileType: fileType || null,
      youtubeEmbed: null
    };

    await sendMessagePayload(payload);

    if(messageInput) messageInput.value = "";
    if(fileInput) fileInput.value = "";
    // refresh DM list to update unread badges / sorting
    updateDMLists();
  };
}
setupMessageFormHandler();

/* ---------------- Microphone (audio) ---------------- */
if(micBtn){
  micBtn.onclick = async () => {
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return alert("Audio recording not supported");
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
          if(!user) return alert("Login first");
          const payload = {
            uid: user.uid,
            name: user.displayName,
            photoURL: user.photoURL,
            text: null,
            fileData: reader.result,
            fileType: "audio/webm",
            youtubeEmbed: null
          };
          await sendMessagePayload(payload);
          updateDMLists();
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

/* ---------------- YouTube modal ---------------- */
if(youtubeBtn){
  youtubeBtn.onclick = () => {
    if(youtubeModal) { youtubeModal.style.display = "flex"; if(youtubeSearch) youtubeSearch.focus(); }
  };
}
if(closeModal) closeModal.onclick = () => { if(youtubeModal) youtubeModal.style.display = "none"; if(youtubeResults) youtubeResults.innerHTML = ""; };

if(youtubeSearchBtn){
  youtubeSearchBtn.onclick = async () => {
    const q = youtubeSearch?.value?.trim();
    if(!q) return;
    try {
      const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=6&q=${encodeURIComponent(q)}&key=${YOUTUBE_API_KEY}`);
      const data = await res.json();
      if(!youtubeResults) return;
      youtubeResults.innerHTML = "";
      (data.items||[]).forEach(item => {
        const div = document.createElement("div");
        div.className = "youtube-item";
        div.innerHTML = `<img src="${item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default.url}"><span>${item.snippet.title}</span>`;
        div.onclick = async () => {
          const user = auth.currentUser;
          if(!user) return alert("Login first");
          const payload = {
            uid: user.uid, name: user.displayName, photoURL: user.photoURL,
            text: null, fileData: null, fileType: null, youtubeEmbed: item.id.videoId
          };
          await sendMessagePayload(payload);
          if(youtubeModal) youtubeModal.style.display = "none";
          youtubeResults.innerHTML = "";
          updateDMLists();
        };
        youtubeResults.appendChild(div);
      });
    } catch(err){
      console.error("YouTube API error:", err);
      alert("YouTube API error (check console / key & quota).");
    }
  };
}

/* ---------------- Auth state ---------------- */
onAuthStateChanged(auth, async user => {
  if(user){
    if(loginBtn) loginBtn.style.display = "none";
    if(logoutBtn) logoutBtn.style.display = "block";
    if(messageForm) messageForm.style.display = "flex";
    if(dmForm) dmForm.style.display = "flex";
    if(userProfile) userProfile.innerHTML = `<img src='${user.photoURL}' width='40' style='border-radius:50%'> <span>${user.displayName}</span>`;
    // ensure user doc exists
    await setDoc(doc(db,"users",user.uid), {
      uid: user.uid, displayName: user.displayName, email: user.email, photoURL: user.photoURL
    }, { merge: true });

    loadPublicMessages();
    updateDMLists();
    startDMListInterval(); // begin periodic refresh
  } else {
    if(loginBtn) loginBtn.style.display = "block";
    if(logoutBtn) logoutBtn.style.display = "none";
    if(messageForm) messageForm.style.display = "none";
    if(dmForm) dmForm.style.display = "none";
    if(messagesDiv) messagesDiv.innerHTML = "<p>Login to see messages</p>";
    if(userProfile) userProfile.innerHTML = "";
    if(dmListReceived) dmListReceived.innerHTML = "";
    if(dmListSent) dmListSent.innerHTML = "";
    if(groupList) groupList.innerHTML = "";
    if(unsubscribeListener) unsubscribeListener();
    stopDMListInterval();
  }
});

/* ---------------- DM sidebar (lists, unread, duplicate prevention) ---------------- */
let dmListIntervalHandle = null;
function startDMListInterval(){
  if(dmListIntervalHandle) return;
  dmListIntervalHandle = setInterval(updateDMLists, 3000); // refresh every 3s
}
function stopDMListInterval(){
  if(dmListIntervalHandle) clearInterval(dmListIntervalHandle);
  dmListIntervalHandle = null;
}

async function updateDMLists(){
  const user = auth.currentUser;
  if(!user) return;

  // fetch all other users
  const usersSnap = await getDocs(collection(db,"users"));
  const otherUsers = [];
  usersSnap.forEach(d => {
    const data = d.data();
    if(d.id !== user.uid) otherUsers.push(data);
  });

  // clear containers
  if(dmListReceived) dmListReceived.innerHTML = "";
  if(dmListSent) dmListSent.innerHTML = "";
  if(dmItemsContainer) dmItemsContainer.innerHTML = "";

  const addedReceived = new Set();
  const addedSent = new Set();

  // build list entries in parallel
  await Promise.all(otherUsers.map(async otherUser => {
    const chatId = [user.uid, otherUser.uid].sort().join("_");
    const dmRef = collection(db, "privateMessages", chatId, "messages");
    // get messages
    const msgsSnap = await getDocs(query(dmRef, orderBy("createdAt","asc")));
    if(msgsSnap.empty) return; // no conversation yet
    let unread = 0;
    let lastMessage = null;
    msgsSnap.forEach(d => {
      const data = d.data();
      lastMessage = { ...data, id: d.id };
      if(data.uid !== user.uid && !data.readBy?.includes(user.uid)) unread++;
    });

    // duplicate prevention
    if(lastMessage?.uid === user.uid){
      if(addedSent.has(otherUser.uid)) return;
    } else {
      if(addedReceived.has(otherUser.uid)) return;
    }

    // create item
    const item = document.createElement("div");
    item.className = "dm-item";
    item.innerHTML = `
      <img src="${otherUser.photoURL || ''}" alt="pfp">
      <span class="name">${otherUser.displayName || otherUser.email}</span>
      ${unread > 0 ? `<span class="unread">${unread}</span>` : ""}
    `;
    item.onclick = async () => {
      // unsubscribe previous
      if(unsubscribeListener) unsubscribeListener();

      // open this DM (set currentDMId)
      currentDMId = chatId;
      currentGroupId = null;

      // listen to this DM
      const dmQuery = query(dmRef, orderBy("createdAt","asc"));
      unsubscribeListener = onSnapshot(dmQuery, snapshot => {
        if(!messagesDiv) return;
        messagesDiv.innerHTML = "";
        snapshot.forEach(docSnap => messagesDiv.innerHTML += renderMessage(docSnap.data()));
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      });

      // mark messages read
      const batchReads = [];
      msgsSnap.forEach(async docSnap =>{
        const data = docSnap.data();
        if(!data.readBy) data.readBy = [];
        if(!data.readBy.includes(user.uid)){
          data.readBy.push(user.uid);
          await setDoc(doc(db,"privateMessages",chatId,"messages",docSnap.id), data, { merge: true });
        }
      });

      if(backPublicBtn) backPublicBtn.style.display = "block";
      updateDMLists();
    };

    // append to appropriate container
    if(lastMessage?.uid === user.uid){
      if(dmListSent) dmListSent.appendChild(item);
      if(dmItemsContainer) dmItemsContainer.appendChild(item);
      addedSent.add(otherUser.uid);
    } else {
      if(dmListReceived) dmListReceived.appendChild(item);
      if(dmItemsContainer) dmItemsContainer.appendChild(item);
      addedReceived.add(otherUser.uid);
    }
  }));
}

/* ---------------- Back to public chat ---------------- */
if(backPublicBtn) backPublicBtn.onclick = () => {
  currentDMId = null;
  currentGroupId = null;
  if(unsubscribeListener) unsubscribeListener();
  loadPublicMessages();
  backPublicBtn.style.display = "none";
};

/* ---------------- Groups: create / view / load / open ---------------- */
/* We'll create a small modal UI dynamically (so you don't need to modify HTML) for creating groups.
   The modal searches users by displayName/email and lets you add multiple users (stores members as UIDs).
*/

function createGroupModalIfNeeded(){
  if(document.getElementById("group-create-modal")) return;
  const modal = document.createElement("div");
  modal.id = "group-create-modal";
  modal.style.position = "fixed";
  modal.style.left = "0";
  modal.style.top = "0";
  modal.style.width = "100%";
  modal.style.height = "100%";
  modal.style.display = "none";
  modal.style.justifyContent = "center";
  modal.style.alignItems = "center";
  modal.style.background = "rgba(0,0,0,0.5)";
  modal.innerHTML = `
    <div style="background:white;padding:18px;border-radius:8px;min-width:320px;max-width:640px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="margin:0">Create Group</h3>
        <button id="close-group-modal">✖</button>
      </div>
      <input id="group-name-input" placeholder="Group name" style="width:100%;padding:8px;margin-bottom:8px;border:1px solid #ccc;border-radius:6px;">
      <input id="group-user-search" placeholder="Search users by name or email" style="width:100%;padding:8px;margin-bottom:8px;border:1px solid #ccc;border-radius:6px;">
      <div id="group-user-results" style="max-height:180px;overflow:auto;border:1px solid #eee;padding:6px;border-radius:6px;background:#fafafa;"></div>
      <h4 style="margin:8px 0 6px 0">Selected</h4>
      <div id="group-selected" style="min-height:40px;border:1px solid #eee;padding:6px;border-radius:6px;background:#fff;"></div>
      <div style="margin-top:10px;text-align:right;">
        <button id="save-group-btn" style="padding:8px 12px;background:#1976d2;color:#fff;border:none;border-radius:6px;">Create</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // handlers
  document.getElementById("close-group-modal").onclick = ()=> modal.style.display = "none";
  document.getElementById("group-user-search").addEventListener("input", async (e) => {
    const q = e.target.value.trim().toLowerCase();
    const resultsDiv = document.getElementById("group-user-results");
    resultsDiv.innerHTML = "";
    if(!q) return;
    // fetch users and filter client-side
    const usersSnap = await getDocs(collection(db,"users"));
    usersSnap.forEach(d => {
      const u = d.data();
      const display = (u.displayName || u.email || "").toLowerCase();
      if(display.includes(q) && u.uid !== (auth.currentUser && auth.currentUser.uid)){
        const el = document.createElement("div");
        el.style.padding = "6px";
        el.style.cursor = "pointer";
        el.style.borderBottom = "1px solid #eee";
        el.textContent = `${u.displayName || u.email}`;
        el.onclick = () => {
          addUserToGroupSelection(u);
        };
        resultsDiv.appendChild(el);
      }
    });
  });

  // selection helpers
  const selected = new Map(); // uid -> user obj
  function addUserToGroupSelection(u){
    if(selected.has(u.uid)) return;
    selected.set(u.uid, u);
    renderSelected();
  }
  function removeSelected(uid){
    selected.delete(uid);
    renderSelected();
  }
  function renderSelected(){
    const selDiv = document.getElementById("group-selected");
    selDiv.innerHTML = "";
    selected.forEach(u => {
      const item = document.createElement("div");
      item.style.display = "inline-flex";
      item.style.alignItems = "center";
      item.style.margin = "4px";
      item.style.padding = "4px 8px";
      item.style.border = "1px solid #ddd";
      item.style.borderRadius = "16px";
      item.style.background = "#f4f8ff";
      item.innerHTML = `<img src="${u.photoURL||''}" style="width:20px;height:20px;border-radius:50%;margin-right:6px;"> <span style="margin-right:8px">${u.displayName||u.email}</span> <button style="background:transparent;border:none;cursor:pointer">✖</button>`;
      item.querySelector("button").onclick = ()=> removeSelected(u.uid);
      selDiv.appendChild(item);
    });
  }

  // save group
  document.getElementById("save-group-btn").onclick = async () => {
    const name = document.getElementById("group-name-input").value.trim() || "New Group";
    const memberUids = Array.from(selected.keys());
    if(!auth.currentUser) return alert("Login first");
    // ensure creator is included
    if(!memberUids.includes(auth.currentUser.uid)) memberUids.push(auth.currentUser.uid);

    await addDoc(collection(db,"groups"), {
      name, createdBy: auth.currentUser.uid, members: memberUids, createdAt: serverTimestamp()
    });
    modal.style.display = "none";
    // refresh groups view if open
    if(groupList && groupList.style.display !== "none") viewGroupChats();
  };

  // expose adding helper to outer scope
  createGroupModalIfNeeded.addUserToGroupSelection = addUserToGroupSelection;
}

/* Open create modal when createGroupBtn clicked */
if(createGroupBtn){
  createGroupBtn.onclick = () => {
    createGroupModalIfNeeded();
    const modal = document.getElementById("group-create-modal");
    if(modal) modal.style.display = "flex";
  };
}

/* View group chats in sidebar */
let unsubscribeGroupsListener = null;
function viewGroupChats(){
  // hide DMs, show groups
  if(dmListReceived) dmListReceived.style.display = "none";
  if(dmListSent) dmListSent.style.display = "none";
  if(groupList) groupList.style.display = "block";
  if(backToDmsBtn) backToDmsBtn.style.display = "inline-block";
  if(viewGroupsBtn) viewGroupsBtn.style.display = "none";

  // unsubscribe previous
  if(unsubscribeListener) unsubscribeListener();
  if(unsubscribeGroupsListener) unsubscribeGroupsListener();

  // listen for groups where current user is a member
  const q = query(collection(db,"groups"), where("members", "array-contains", (auth.currentUser && auth.currentUser.uid)));
  unsubscribeGroupsListener = onSnapshot(q, snapshot => {
    if(!groupItemsContainer && groupList) groupItemsContainer = groupList; // fallback
    if(groupItemsContainer) groupItemsContainer.innerHTML = "";
    snapshot.forEach(docSnap => {
      const g = docSnap.data();
      const id = docSnap.id;
      const el = document.createElement("div");
      el.className = "dm-item";
      el.innerHTML = `<span class="name">${g.name}</span> <small style="margin-left:8px;color:#666">(${g.members?.length||0})</small>`;
      el.onclick = () => openGroupMessages(id, g.name);
      if(groupItemsContainer) groupItemsContainer.appendChild(el);
    });
  });
}
if(viewGroupsBtn) viewGroupsBtn.onclick = viewGroupChats;

if(backToDmsBtn){
  backToDmsBtn.onclick = () => {
    if(groupList) groupList.style.display = "none";
    if(dmListReceived) dmListReceived.style.display = "block";
    if(dmListSent) dmListSent.style.display = "block";
    backToDmsBtn.style.display = "none";
    if(viewGroupsBtn) viewGroupsBtn.style.display = "inline-block";
    if(unsubscribeGroupsListener) unsubscribeGroupsListener();
    updateDMLists();
  };
}

/* Open group messages */
function openGroupMessages(groupId, groupName){
  currentGroupId = groupId;
  currentDMId = null;
  if(unsubscribeListener) unsubscribeListener();

  const q = query(collection(db,"groupMessages"), where("groupId","==",groupId), orderBy("createdAt","asc"));
  unsubscribeListener = onSnapshot(q, snapshot => {
    if(!messagesDiv) return;
    messagesDiv.innerHTML = `<h3 style="margin:0 0 8px 0">${safeHTML(groupName)}</h3>`;
    snapshot.forEach(docSnap => messagesDiv.innerHTML += renderMessage(docSnap.data()));
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });

  if(backPublicBtn) backPublicBtn.style.display = "block";
}

/* ---------------- Utility: open DM by chatId (if you have chatId) --------------- */
/* Not required by UI but handy for programmatic open */
async function openDMByChatId(chatId){
  // unsubscribe prev
  if(unsubscribeListener) unsubscribeListener();
  currentDMId = chatId;
  currentGroupId = null;

  const dmRef = collection(db, "privateMessages", chatId, "messages");
  const dmQuery = query(dmRef, orderBy("createdAt","asc"));
  unsubscribeListener = onSnapshot(dmQuery, snapshot => {
    if(!messagesDiv) return;
    messagesDiv.innerHTML = "";
    snapshot.forEach(docSnap => messagesDiv.innerHTML += renderMessage(docSnap.data()));
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });

  if(backPublicBtn) backPublicBtn.style.display = "block";

  // mark read for all messages
  const snap = await getDocs(dmQuery);
  snap.forEach(async docSnap => {
    const data = docSnap.data();
    if(!data.readBy) data.readBy = [];
    if(!data.readBy.includes(auth.currentUser.uid)){
      data.readBy.push(auth.currentUser.uid);
      await setDoc(doc(db,"privateMessages",chatId,"messages",docSnap.id), data, { merge: true });
    }
  });

  updateDMLists();
}

/* Expose helper in case other scripts want to open DM */
window.openDMByChatId = openDMByChatId;

/* ---------------- Start periodic DM update only if logged in ---------------- */
function startDMUpdater(){
  startDMListInterval();
}
function stopDMUpdater(){
  stopDMListInterval();
}

/* ---------------- Export auth & db for other scripts ---------------- */
export { auth, db };
