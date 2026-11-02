const input = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesContainer = document.getElementById('messages');
const searchInput = document.getElementById('searchInput');
const pinnedBlock = document.getElementById('pinnedBlock');
const pinnedText = document.getElementById('pinnedText');
const unpinBtn = document.getElementById('unpinBtn');
const favoritesBtn = document.getElementById('favoritesBtn');
const favoritesModal = document.getElementById('favoritesModal');
const closeFavorites = document.getElementById('closeFavorites');
const favoritesList = document.getElementById('favoritesList');
const attachmentsBtn = document.getElementById('attachmentsBtn');
const attachmentsModal = document.getElementById('attachmentsModal');
const closeAttachments = document.getElementById('closeAttachments');
const attachmentsList = document.getElementById('attachmentsList');

const myClientId = Math.random().toString(36).substr(2, 9);
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${protocol}//${window.location.host}`);

let loadedCount = 0; 
let isLoading = false; 
let hasMore = true; 

ws.onopen = () => {
    console.log('WebSocket подключен');
    loadMessages(); 
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'new_message') {
        if (data.data.clientId === myClientId) return;
        if (document.querySelector(`[data-id="${data.data.id}"]`)) return;
        renderMessage(data.data, false);
    } else if (data.type === 'pin_update') {
        updatePinnedUI(data.data);
    } else if (data.type === 'favorite_update') {
        const msgEl = document.querySelector(`[data-id="${data.data.id}"]`);
        if (msgEl) {
            const favBtn = msgEl.querySelector('.fav-btn');
            if (favBtn) {
                favBtn.classList.toggle('active', data.data.isFavorite);
            }
        }
    }
};

ws.onerror = (error) => console.error('Ошибка WebSocket:', error);

// --- Закрепление ---
function updatePinnedUI(msg) {
    if (!msg) {
        pinnedBlock.style.display = 'none';
    } else {
        pinnedBlock.style.display = 'flex';
        pinnedText.textContent = msg.text.length > 50 ? msg.text.slice(0, 50) + '...' : msg.text;
    }
}

async function pinMessage(id) {
    try {
        await fetch('/api/pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
    } catch (error) {
        console.error('Ошибка закрепления:', error);
    }
}

unpinBtn.addEventListener('click', async () => {
    try {
        await fetch('/api/pin', { method: 'DELETE' });
    } catch (error) {
        console.error('Ошибка открепления:', error);
    }
});

// --- Избранное ---
async function toggleFavorite(id) {
    try {
        await fetch('/api/favorite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
    } catch (error) {
        console.error('Ошибка избранного:', error);
    }
}

favoritesBtn.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/favorites');
        const favs = await response.json();
        
        favoritesList.innerHTML = '';
        if (favs.length === 0) {
            favoritesList.innerHTML = '<p>Пока ничего нет в избранном.</p>';
        } else {
            favs.forEach(msg => {
                const item = document.createElement('div');
                item.className = 'favorite-item';
                item.textContent = msg.text;
                favoritesList.appendChild(item);
            });
        }
        favoritesModal.style.display = 'flex';
    } catch (error) {
        console.error('Ошибка загрузки избранного:', error);
    }
});

closeFavorites.addEventListener('click', () => {
    favoritesModal.style.display = 'none';
});

// --- Вложения ---
attachmentsBtn.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/attachments');
        const data = await response.json();
        
        attachmentsList.innerHTML = '';

        const createCategory = (title, files) => {
            if (files.length === 0) return;
            
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'attachment-category';
            
            const h3 = document.createElement('h3');
            h3.textContent = `${title} (${files.length})`;
            categoryDiv.appendChild(h3);

            files.forEach(file => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'attachment-item';

                if (title === 'Изображения') {
                    const img = document.createElement('img');
                    img.src = file.fileUrl;
                    itemDiv.appendChild(img);
                }

                const link = document.createElement('a');
                link.href = file.fileUrl;
                link.download = file.fileName;
                link.textContent = file.fileName;
                itemDiv.appendChild(link);

                categoryDiv.appendChild(itemDiv);
            });
            
            attachmentsList.appendChild(categoryDiv);
        };

        createCategory('Изображения', data.images);
        createCategory('Видео', data.videos);
        createCategory('Другие файлы', data.others);

        if (data.images.length === 0 && data.videos.length === 0 && data.others.length === 0) {
            attachmentsList.innerHTML = '<p>Пока нет загруженных файлов.</p>';
        }

        attachmentsModal.style.display = 'flex';
    } catch (error) {
        console.error('Ошибка загрузки вложений:', error);
    }
});

closeAttachments.addEventListener('click', () => {
    attachmentsModal.style.display = 'none';
});

fetch('/api/pinned').then(r => r.json()).then(data => {
    updatePinnedUI(data.pinned);
});

// --- Загрузка сообщений ---
async function loadMessages() {
    if (isLoading || !hasMore) return;
    isLoading = true;

    try {
        const response = await fetch(`/api/messages?limit=10&offset=${loadedCount}`);
        const data = await response.json();

        if (loadedCount === 0) messagesContainer.innerHTML = '';

        const oldScrollHeight = messagesContainer.scrollHeight;

        for (let i = data.messages.length - 1; i >= 0; i--) {
            const msg = data.messages[i];
            const el = createMessageElement(msg);
            messagesContainer.prepend(el);
        }

        loadedCount += data.messages.length;
        hasMore = data.hasMore;
        messagesContainer.scrollTop = messagesContainer.scrollHeight - oldScrollHeight;

        console.log(`Загружено ${loadedCount} из ${data.total}`);
    } catch (error) {
        console.error('Ошибка загрузки:', error);
    } finally {
        isLoading = false;
    }
}

function createMessageElement(msg) {
    const isUser = msg.clientId === myClientId;
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
    messageDiv.dataset.id = msg.id;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    if (msg.type === 'file') {
        const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(msg.fileName);
        if (isImage) {
            const img = document.createElement('img');
            img.src = msg.fileUrl;
            img.style.maxWidth = '200px';
            img.style.borderRadius = '10px';
            img.style.display = 'block';
            contentDiv.appendChild(img);
        }
        const link = document.createElement('a');
        link.href = msg.fileUrl;
        link.download = msg.fileName;
        link.textContent = `Скачать ${msg.fileName}`;
        link.style.display = 'block';
        link.style.marginTop = '5px';
        link.style.color = '#0088cc';
        contentDiv.appendChild(link);
    } else {
        contentDiv.textContent = msg.text;
    }

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';

    const pinBtn = document.createElement('button');
    pinBtn.className = 'action-btn';
    pinBtn.textContent = '📌';
    pinBtn.title = 'Закрепить';
    pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        pinMessage(msg.id);
    });

    const favBtn = document.createElement('button');
    favBtn.className = `action-btn fav-btn ${msg.isFavorite ? 'active' : ''}`;
    favBtn.textContent = '⭐';
    favBtn.title = 'В избранное';
    favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(msg.id);
    });

    actionsDiv.appendChild(pinBtn);
    actionsDiv.appendChild(favBtn);

    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(actionsDiv);
    return messageDiv;
}

function renderMessage(msg, isUser) {
    const el = createMessageElement(msg);
    messagesContainer.appendChild(el);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    const tempMsg = { text, clientId: myClientId, type: 'text' };
    renderMessage(tempMsg, true);
    input.value = '';

    try {
        await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, clientId: myClientId })
        });
    } catch (error) {
        console.error(error);
    }
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('clientId', myClientId);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (data.status === 'ok') renderMessage(data.message, true);
    } catch (error) {
        console.error('Ошибка загрузки файла:', error);
    }
}

const chatContainer = document.querySelector('.chat-container');

chatContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    chatContainer.style.border = '2px dashed #0088cc';
});

chatContainer.addEventListener('dragleave', (e) => {
    e.preventDefault();
    chatContainer.style.border = 'none';
});

chatContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    chatContainer.style.border = 'none';
    const files = e.dataTransfer.files;
    if (files.length > 0) uploadFile(files[0]);
});

messagesContainer.addEventListener('scroll', () => {
    if (messagesContainer.scrollTop === 0) loadMessages();
});

searchInput.addEventListener('input', async (e) => {
    const query = e.target.value.trim();
    
    if (!query) {
        messagesContainer.innerHTML = '';
        loadedCount = 0;
        hasMore = true;
        loadMessages();
        return;
    }

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const results = await response.json();
        
        messagesContainer.innerHTML = '';
        results.forEach(msg => {
            const el = createMessageElement(msg);
            messagesContainer.appendChild(el);
        });
    } catch (error) {
        console.error('Ошибка поиска:', error);
    }
});

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});