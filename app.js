const YOUTUBE_API_KEY = 'AIzaSyBh-x2mtmrpESpVtper5iE0DGKXBcbDdPM'; // Replace with your YouTube Data API v3 key

// DOM Elements
const youtubeModal = document.getElementById('youtube-modal');
const youtubeSearchInput = document.getElementById('youtube-search');
const youtubeSearchBtn = document.getElementById('youtube-search-btn');
const youtubeResults = document.getElementById('youtube-results');
const closeModal = document.getElementById('close-modal');
const youtubeBtn = document.getElementById('youtube-btn');

// Event Listeners
youtubeBtn.addEventListener('click', openModal);
closeModal.addEventListener('click', closeModalHandler);
youtubeSearchBtn.addEventListener('click', fetchYouTubeVideos);
youtubeSearchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchYouTubeVideos();
});

// Functions
function openModal() {
  youtubeModal.style.display = 'flex';
  youtubeSearchInput.focus();
}

function closeModalHandler() {
  youtubeModal.style.display = 'none';
}

async function fetchYouTubeVideos() {
  const query = youtubeSearchInput.value.trim();
  if (!query) return;

  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    displayYouTubeResults(data.items);
  } catch (error) {
    console.error('Error fetching YouTube videos:', error);
  }
}

function displayYouTubeResults(videos) {
  youtubeResults.innerHTML = '';
  videos.forEach(video => {
    const videoElement = document.createElement('div');
    videoElement.classList.add('youtube-item');
    videoElement.innerHTML = `
      <img src="${video.snippet.thumbnails.medium.url}" alt="${video.snippet.title}">
      <span>${video.snippet.title}</span>
    `;
    videoElement.addEventListener('click', () => {
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/${video.id.videoId}`;
      iframe.width = '100%';
      iframe.height = '315';
      youtubeResults.innerHTML = '';
      youtubeResults.appendChild(iframe);
    });
    youtubeResults.appendChild(videoElement);
  });
}
