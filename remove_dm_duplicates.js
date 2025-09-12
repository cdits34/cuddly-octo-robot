// Runs every 1 second to clean DM list duplicates
setInterval(() => {
  const lists = ['dm-list-sent', 'dm-list-received'];

  lists.forEach(listId => {
    const list = document.getElementById(listId);
    if (!list) return;

    const seen = new Set();
    const items = Array.from(list.querySelectorAll('.dm-item'));

    items.forEach(item => {
      const nameSpan = item.querySelector('.name');
      if (!nameSpan) return;

      const name = nameSpan.textContent.trim();
      if (seen.has(name)) {
        item.remove(); // duplicate found, remove it
      } else {
        seen.add(name);
      }
    });
  });
}, 1); // check every 1 second
