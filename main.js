// Firebase config'iniz
const firebaseConfig = {
    apiKey: "AIzaSyBP78KB0fZiLqGc4L-DZtA2Llgzv0_NGhs",
    authDomain: "evet-3d487.firebaseapp.com",
    projectId: "evet-3d487",
    databaseURL: "https://evet-3d487-default-rtdb.firebaseio.com",
    storageBucket: "evet-3d487.appspot.com",
    messagingSenderId: "215902499756",
    appId: "1:215902499756:web:56ea6711e960d16d898009",
    measurementId: "G-4TNJL8PTC1"
};

// Firebase'i başlat
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let newsListener = null;

async function renderNews(newsArr) {
    const container = document.querySelector('.container');
    container.innerHTML = '';
    for (const item of newsArr) {
        const newsCard = document.createElement('div');
        newsCard.className = 'news-card';
        const votedKey = `voted_${item.id}`;
        const upvotes = item.upvotes || 0;
        const downvotes = item.downvotes || 0;
        // Yorum sayısını çek
        let commentCount = 0;
        const commentsSnap = await db.ref('news/' + item.id + '/comments').once('value');
        commentCount = commentsSnap.exists() ? commentsSnap.numChildren() : 0;
        newsCard.innerHTML = `
            <img src="${item.imageUrl}" class="news-image" alt="${item.title}" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend', '<div class=\\'news-image\\'>RESİM</div>');">
            <div class="news-bottom">
                <div class="news-info">
                    <div class="news-title">${item.title}</div>
                    <div class="news-desc">${item.description}</div>
                    <div class="news-author">Ekleyen: ${item.authorName}</div>
                    <div class="comment-count-footer">💬 ${commentCount} yorum</div>
                </div>
                <div class="vote-section">
                    <button class="vote-btn up" id="up-btn-${item.id}" onclick="event.stopPropagation(); vote('${item.id}', 1)">
                      <svg class="vote-icon" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#1eae60"/><path d="M6 10.5l3 3 5-5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    <span class="vote-count" id="upvote-count-${item.id}" style="color:#1eae60;font-weight:bold;">+${upvotes}</span>
                    <button class="vote-btn down" id="down-btn-${item.id}" onclick="event.stopPropagation(); vote('${item.id}', -1)">
                      <svg class="vote-icon" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#e53e3e"/><path d="M7 7l6 6M13 7l-6 6" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>
                    </button>
                    <span class="vote-count" id="downvote-count-${item.id}" style="color:#e53e3e;font-weight:bold;">-${downvotes}</span>
                </div>
            </div>
        `;
        newsCard.onclick = () => {
            window.location.href = `haber.html?id=${item.id}`;
        };
        container.appendChild(newsCard);
        updateVoteButtons(item.id);
    }
}

function loadNews() {
    // Eski listener'ı kaldır
    if (newsListener) {
        newsListener.off();
    }
    const ref = db.ref('news').orderByChild('timestamp');
    newsListener = ref;
    ref.on('value', async (snapshot) => {
        const news = [];
        snapshot.forEach((childSnapshot) => {
            const data = childSnapshot.val();
            if (data.approved) {
                news.unshift({
                    id: childSnapshot.key,
                    ...data
                });
            }
        });
        await renderNews(news);
    });
}

// IP adresini cache'le
let cachedIP = null;
async function getUserIP() {
  if (cachedIP) return cachedIP;
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    cachedIP = data.ip;
    return cachedIP;
  } catch (e) {
    showToast('IP adresi alınamadı, oy kullanılamaz.', 'error');
    throw e;
  }
}

// IP tabanlı oy ver / geri çek / geçiş yap (upvotes/downvotes ayrı sayaç)
async function vote(newsId, value) {
  const ip = await getUserIP();
  const ipKey = ip.replace(/\./g, '_');
  const newsRef = db.ref('news/' + newsId);
  // Optimistic UI: butonları hemen güncelle
  updateVoteButtons(newsId, value === 1 ? 'up' : 'down');
  await newsRef.transaction(news => {
    if (!news) return news;
    if (!news.votesByIP) news.votesByIP = {};
    if (typeof news.upvotes !== 'number') news.upvotes = 0;
    if (typeof news.downvotes !== 'number') news.downvotes = 0;
    const currentVote = news.votesByIP[ipKey] || null;
    if (value === 1) {
      if (currentVote === 'up') {
        // Oyunu geri çek
        news.votesByIP[ipKey] = null;
        news.upvotes -= 1;
      } else if (currentVote === 'down') {
        news.votesByIP[ipKey] = 'up';
        news.upvotes += 1;
        news.downvotes -= 1;
      } else {
        news.votesByIP[ipKey] = 'up';
        news.upvotes += 1;
      }
    } else if (value === -1) {
      if (currentVote === 'down') {
        news.votesByIP[ipKey] = null;
        news.downvotes -= 1;
      } else if (currentVote === 'up') {
        news.votesByIP[ipKey] = 'down';
        news.downvotes += 1;
        news.upvotes -= 1;
      } else {
        news.votesByIP[ipKey] = 'down';
        news.downvotes += 1;
      }
    }
    return news;
  });
  setTimeout(() => updateVoteButtons(newsId), 100);
}

// Butonları IP'ye göre güncelle (Reddit mantığı: aynı anda sadece bir oy aktif)
async function updateVoteButtons(newsId, optimisticVote) {
  const ip = await getUserIP();
  const ipKey = ip.replace(/\./g, '_');
  const ipRef = db.ref('news/' + newsId + '/votesByIP/' + ipKey);
  let currentVote = null;
  if (typeof optimisticVote !== 'undefined') {
    currentVote = optimisticVote;
  } else {
    const snapshot = await ipRef.once('value');
    currentVote = snapshot.val(); // 'up', 'down' veya null
  }
  const upBtn = document.getElementById('up-btn-' + newsId);
  const downBtn = document.getElementById('down-btn-' + newsId);
  if (!upBtn || !downBtn) return;
  // Önce her iki butondan da active class'ı kaldır
  upBtn.classList.remove('active');
  downBtn.classList.remove('active');
  if (currentVote === 'up') {
    upBtn.classList.add('active');
  } else if (currentVote === 'down') {
    downBtn.classList.add('active');
  }
}

// Modal işlemleri
function openModal() {
    document.getElementById('newsModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('newsModal').style.display = 'none';
}

// Cloudinary'ye dosya yükleme fonksiyonu
async function uploadToCloudinary(file, uploadPreset = 'unsigned_preset') {
    const url = `https://api.cloudinary.com/v1_1/dbr3vyfbr/image/upload`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);

    const response = await fetch(url, {
        method: 'POST',
        body: formData
    });
    const data = await response.json();
    return data.secure_url; // Yüklenen görselin linki
}


async function submitNews(event) {
    console.log('submitNews çalıştı');
    event.preventDefault();
    const submitBtn = document.querySelector('#newsForm .submit-btn');
    const oldBtnHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span>Ekleniyor...';
    const authorName = document.getElementById('authorName').value;
    const title = document.getElementById('newsTitle').value;
    const desc = document.getElementById('newsDesc').value;
    const mainImageFile = document.getElementById('newsMainImage').files[0];
    const galleryFiles = Array.from(document.getElementById('newsGalleryImages').files);

    if (!mainImageFile) {
        showToast('Başlık fotoğrafı seçmelisiniz!', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = oldBtnHtml;
        return;
    }

    try {
        // 1. Başlık fotoğrafını Cloudinary'ye yükle
        const mainImageUrl = await uploadToCloudinary(mainImageFile, 'unsigned_preset');

        // 2. Galeri fotoğraflarını Cloudinary'ye yükle
        let galleryImageUrls = [];
        for (const file of galleryFiles) {
            const url = await uploadToCloudinary(file, 'unsigned_preset');
            galleryImageUrls.push(url);
        }
        // Ana görseli de galeriye ekle (tekrarı önle)
        if (!galleryImageUrls.includes(mainImageUrl)) {
            galleryImageUrls.unshift(mainImageUrl);
        }

        // 3. Haberi veritabanına kaydet (Firebase)
        const newsRef = db.ref('news').push();
        await newsRef.set({
            authorName: authorName,
            title: title,
            description: desc,
            imageUrl: mainImageUrl,
            galleryImages: galleryImageUrls,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            votes: 0,
            approved: false
        });
        showToast('Başarıyla eklendi!');
        closeModal();
        document.getElementById('newsForm').reset();
    } catch (error) {
        showToast('Eklenirken bir hata oluştu: ' + error.message, 'error');
    }
    submitBtn.disabled = false;
    submitBtn.innerHTML = oldBtnHtml;
}

// Sadece bir kez çağır!
loadNews();

function showToast(message, type = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ' ' + type : '');
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 2500);
} 