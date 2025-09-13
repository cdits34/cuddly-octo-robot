
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, doc, serverTimestamp, getDoc, getDocs, query, where, orderBy, onSnapshot, updateDoc, arrayUnion, arrayRemove, limit } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

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

// DOM references
const loginBtn = document.getElementById("login");
const logoutBtn = document.getElementById("logout");
const messagesDiv = document.getElementById("messages");
const dmListSent = document.getElementById("dm-list-sent");
const dmListReceived = document.getElementById("dm-list-received");
const addPersonBtn = document.getElementById("add-person-btn");
const addPersonModal = document.getElementById("add-person-modal");
const addPersonSearch = document.getElementById("add-person-search");
const addPersonResults = document.getElementById("add-person-results");
const addPersonCancel = document.getElementById("add-person-cancel");
const chatTitle = document.getElementById("chat-title");

let currentUser = null;
let currentChatId = null;
let currentChatData = null;
let groupCounter = 1; // used for naming Group Chat 1, 2...

// Simple helper to create elements
function el(tag, attrs={}, text='') {
  const e = document.createElement(tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text) e.textContent = text;
  return e;
}

// AUTH
loginBtn.onclick = async () => {
  await signInWithPopup(auth, new GoogleAuthProvider());
};
logoutBtn.onclick = async () => {
  await signOut(auth);
};

// Listen for auth changes
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = { uid: user.uid, displayName: user.displayName, email: user.email };
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
    loadChats();
  } else {
    currentUser = null;
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
    dmListSent.innerHTML = "";
    dmListReceived.innerHTML = "";
    messagesDiv.innerHTML = "<p>Please log in.</p>";
  }
});


// Load chats (both sent/received) and label groups
async function loadChats() {
  dmListSent.innerHTML = "";
  dmListReceived.innerHTML = "";
  groupCounter = 1;

  // fetch chats where current user is a member
  const chatsRef = collection(db, "chats");
  const q = query(chatsRef, where("members", "array-contains", currentUser.uid));
  const snap = await getDocs(q);
  snap.forEach(docSnap => {
    const chat = docSnap.data();
    const id = docSnap.id;
    const li = el("div", {"class":"dm-item"});
    // Determine display name
    if (chat.type === "group" || (chat.members && chat.members.length > 2)) {
      li.textContent = `Group Chat ${groupCounter++}`;
    } else {
      // 1-on-1: show the other user's displayName or email
      const otherId = chat.members.find(m => m !== currentUser.uid);
      li.textContent = otherId || "Unknown";
    }
    li.onclick = () => openChat(id);
    // For simplicity place all in received
    dmListReceived.appendChild(li);
  });
}


// Open a chat
async function openChat(chatId) {
  currentChatId = chatId;
  const chatRef = doc(db, "chats", chatId);
  const chatSnap = await getDoc(chatRef);
  if (!chatSnap.exists()) {
    messagesDiv.innerHTML = "<p>Chat not found.</p>";
    return;
  }
  currentChatData = chatSnap.data();
  renderChatHeader();
  // Load messages (if you have a subcollection 'messages' keep your existing logic)
  messagesDiv.innerHTML = "<p>Chat loaded. Messages should appear here (this demo shows add/remove functionality).</p>";
  // Show Add Person button only if members < 4 and current user hasn't already added someone
  updateAddPersonButtonVisibility();
}

// Render chat header (title + add person button)
function renderChatHeader() {
  if (!currentChatData) return;
  if (currentChatData.type === "group" || currentChatData.members.length > 2) {
    chatTitle.textContent = `Group Chat (${currentChatData.members.length} members)`;
  } else {
    // find other user's displayName if available in a users collection (simple fallback to id)
    const other = currentChatData.members.find(m => m !== currentUser.uid) || "Unknown";
    chatTitle.textContent = `DM: ${other}`;
  }
  addPersonBtn.style.display = "inline-block";
}

// Update visibility/disabled state of Add Person button
function updateAddPersonButtonVisibility() {
  if (!currentChatData) { addPersonBtn.style.display = "none"; return; }
  if (currentChatData.members.length >= 4) {
    addPersonBtn.disabled = true;
    addPersonBtn.textContent = "Max 4 people";
    return;
  }
  // Check if current user already added someone (addedBy structure)
  const addedBy = currentChatData.addedBy || {};
  const myAdded = (addedBy[currentUser.uid] || []).length;
  if (myAdded >= 1) {
    addPersonBtn.disabled = true;
    addPersonBtn.textContent = "You already added 1 person";
  } else {
    addPersonBtn.disabled = false;
    addPersonBtn.textContent = "➕ Add Person";
  }
}

// Open add person modal
addPersonBtn.onclick = async () => {
  addPersonModal.style.display = "block";
  addPersonSearch.value = "";
  addPersonResults.innerHTML = "<p>Loading users...</p>";
  await populateUserSearch("");
  addPersonSearch.focus();
};

// Cancel
addPersonCancel.onclick = () => {
  addPersonModal.style.display = "none";
};

// Search input
addPersonSearch.oninput = async (e) => {
  await populateUserSearch(e.target.value);
};

// Populate user search results excluding current chat members
async function populateUserSearch(qText) {
  addPersonResults.innerHTML = "";
  // query users collection - expecting documents with fields { uid, displayName, email }
  const usersRef = collection(db, "users");
  let q;
  if (!qText) {
    q = query(usersRef, orderBy("displayName"), limit(50));
  } else {
    // For simplicity query by where('displayName', '>=', qText) ... Firestore doesn't support contains; this is a best-effort
    q = query(usersRef, orderBy("displayName"), limit(50));
  }
  const snaps = await getDocs(q);
  snaps.forEach(s => {
    const u = s.data();
    if (!u.uid) return;
    if (currentChatData.members && currentChatData.members.includes(u.uid)) return; // exclude existing members
    const row = el("div", {"class":"user-row"});
    row.textContent = u.displayName ? `${u.displayName} (${u.email||u.uid})` : (u.email||u.uid);
    const addBtn = el("button", {}, "Add");
    addBtn.onclick = async (ev) => {
      ev.stopPropagation();
      await addPersonToChat(currentChatId, u.uid);
      addPersonModal.style.display = "none";
    };
    row.appendChild(addBtn);
    addPersonResults.appendChild(row);
  });
  if (addPersonResults.innerHTML.trim() === "") {
    addPersonResults.innerHTML = "<p>No users found.</p>";
  }
}

// Add person to chat (enforce rules: max 4, each user can add max 1)
async function addPersonToChat(chatId, newUserId) {
  const chatRef = doc(db, "chats", chatId);
  const chatSnap = await getDoc(chatRef);
  if (!chatSnap.exists()) return alert("Chat not found.");
  const chat = chatSnap.data();
  if (chat.members && chat.members.length >= 4) return alert("Chat already has 4 members.");
  const addedBy = chat.addedBy || {};
  const myAdded = (addedBy[currentUser.uid] || []).length;
  if (myAdded >= 1) return alert("You can only add 1 person to this chat.");
  // perform update
  await updateDoc(chatRef, {
    members: arrayUnion(newUserId),
    [`addedBy.${currentUser.uid}`]: arrayUnion(newUserId),
    type: "group"
  });
  // refresh local data
  const refreshed = await getDoc(chatRef);
  currentChatData = refreshed.data();
  renderChatHeader();
  updateAddPersonButtonVisibility();
  alert("Person added to the chat.");
}

// Remove person (only allowed to remove someone you added)
// We'll add a helper function that can be called from UI you implement for member list.
async function removePersonFromChat(chatId, removeUserId) {
  const chatRef = doc(db, "chats", chatId);
  const chatSnap = await getDoc(chatRef);
  if (!chatSnap.exists()) return alert("Chat not found.");
  const chat = chatSnap.data();
  const addedBy = chat.addedBy || {};
  const myAddedList = addedBy[currentUser.uid] || [];
  if (!myAddedList.includes(removeUserId)) {
    return alert("You can only remove people you added.");
  }
  await updateDoc(chatRef, {
    members: arrayRemove(removeUserId),
    [`addedBy.${currentUser.uid}`]: arrayRemove(removeUserId)
  });
  const refreshed = await getDoc(chatRef);
  currentChatData = refreshed.data();
  renderChatHeader();
  updateAddPersonButtonVisibility();
  alert("Person removed.");
}

// Expose removePersonFromChat to global so it can be called from console or other UI
window.removePersonFromChat = removePersonFromChat;

// Initial hint
messagesDiv.innerHTML = "<p>Welcome — after login open an existing DM to use Add Person feature. Group chats will be labeled in the sidebar as Group Chat 1, Group Chat 2, etc.</p>";
