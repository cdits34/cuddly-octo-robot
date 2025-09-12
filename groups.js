document.addEventListener("DOMContentLoaded", () => {
  const createGroupBtn = document.getElementById("create-group-btn");
  const viewGroupsBtn = document.getElementById("view-groups-btn");
  const backBtn = document.getElementById("back-to-dms-btn");
  const dmList = document.getElementById("dm-list");
  const groupList = document.getElementById("group-list");

  const groupModal = document.getElementById("group-modal");
  const closeGroupModal = document.getElementById("close-group-modal");
  const searchInput = document.getElementById("search-users");
  const resultsBox = document.getElementById("user-results");
  const selectedBox = document.getElementById("selected-users");
  const saveGroupBtn = document.getElementById("save-group-btn");
  const groupNameInput = document.getElementById("group-name");

  let users = ["Alice", "Bob", "Charlie", "David", "Emma"]; // Replace with real users
  let selectedUsers = [];
  let groups = [];

  // Open group modal
  createGroupBtn.addEventListener("click", () => {
    groupModal.style.display = "flex";
  });

  // Close modal
  closeGroupModal.addEventListener("click", () => {
    groupModal.style.display = "none";
    resetModal();
  });

  // Switch to group view
  viewGroupsBtn.addEventListener("click", () => {
    dmList.style.display = "none";
    groupList.style.display = "block";
    viewGroupsBtn.style.display = "none";
    backBtn.style.display = "inline-block";
    renderGroups();
  });

  // Back to DM view
  backBtn.addEventListener("click", () => {
    dmList.style.display = "block";
    groupList.style.display = "none";
    viewGroupsBtn.style.display = "inline-block";
    backBtn.style.display = "none";
  });

  // Search users
  searchInput.addEventListener("input", () => {
    const query = searchInput.value.toLowerCase();
    resultsBox.innerHTML = "";
    users
      .filter(u => u.toLowerCase().includes(query))
      .forEach(user => {
        if (!selectedUsers.includes(user)) {
          const div = document.createElement("div");
          div.className = "user-result";
          div.textContent = user;
          div.onclick = () => addUser(user);
          resultsBox.appendChild(div);
        }
      });
  });

  // Add user to selected list
  function addUser(user) {
    selectedUsers.push(user);
    renderSelected();
    searchInput.value = "";
    resultsBox.innerHTML = "";
  }

  // Render selected users
  function renderSelected() {
    selectedBox.innerHTML = "";
    selectedUsers.forEach(user => {
      const div = document.createElement("div");
      div.textContent = user;
      div.className = "user-result";
      div.onclick = () => removeUser(user);
      selectedBox.appendChild(div);
    });
  }

  function removeUser(user) {
    selectedUsers = selectedUsers.filter(u => u !== user);
    renderSelected();
  }

  // Save group
  saveGroupBtn.addEventListener("click", () => {
    const name = groupNameInput.value.trim() || "New Group";
    if (selectedUsers.length === 0) return alert("Add at least one user!");

    const group = { name, members: [...selectedUsers] };
    groups.push(group);
    resetModal();
    groupModal.style.display = "none";
    renderGroups();
  });

  // Render group list
  function renderGroups() {
    groupList.innerHTML = "";
    groups.forEach(g => {
      const div = document.createElement("div");
      div.className = "dm-item";
      div.innerHTML = `<span class="name">${g.name}</span> <small>(${g.members.length})</small>`;
      groupList.appendChild(div);
    });
  }

  function resetModal() {
    groupNameInput.value = "";
    searchInput.value = "";
    resultsBox.innerHTML = "";
    selectedBox.innerHTML = "";
    selectedUsers = [];
  }
});
