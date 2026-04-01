// State management
const state = {
    currentChatId: null,
    chats: new Map(), // chatId -> { mainThread: [], bubbles: Map }
    bubbles: new Map()
};

let bubbleIdCounter = 0;
let chatIdCounter = 0;

// DOM elements
const mainMessages = document.getElementById('mainMessages');
const mainInput = document.getElementById('mainInput');
const mainSend = document.getElementById('mainSend');
const searchBtn = document.getElementById('searchBtn');
const bubblesContainer = document.getElementById('bubbles');
const newChatBtn = document.getElementById('newChatBtn');
const chatHistory = document.getElementById('chatHistory');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');

// File attachment state
let pendingAttachment = null;

// Initialize
loadChatsFromStorage();
if (!state.currentChatId) {
    createNewChat();
}

newChatBtn.addEventListener('click', createNewChat);
mainSend.addEventListener('click', () => sendMessage('main'));
mainInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage('main');
    }
});

searchBtn.addEventListener('click', handleSearch);

// File upload handlers
attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);

async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            pendingAttachment = data;
            mainInput.placeholder = `File attached: ${file.name} (Press Enter to send)`;
        } else {
            alert('Upload failed: ' + data.error);
        }
    } catch (error) {
        alert('Upload error: ' + error.message);
    }

    fileInput.value = '';
}

// Create new chat
function createNewChat() {
    const chatId = `chat-${chatIdCounter++}`;
    state.chats.set(chatId, {
        mainThread: [],
        bubbles: new Map(),
        title: 'New chat',
        timestamp: Date.now()
    });
    switchToChat(chatId);
    saveChatsToStorage();
}

// Switch to chat
function switchToChat(chatId) {
    state.currentChatId = chatId;
    const chat = state.chats.get(chatId);

    // Clear and reload main thread
    mainMessages.innerHTML = '';
    chat.mainThread.forEach(msg => {
        appendMessage(mainMessages, msg.role, msg.content, msg.role === 'assistant');
    });

    // Update history UI
    updateHistoryUI();
}

// Update history sidebar
function updateHistoryUI() {
    chatHistory.innerHTML = '';
    const sortedChats = Array.from(state.chats.entries())
        .sort((a, b) => b[1].timestamp - a[1].timestamp);

    sortedChats.forEach(([chatId, chat]) => {
        const item = document.createElement('div');
        item.className = 'history-item' + (chatId === state.currentChatId ? ' active' : '');
        item.textContent = chat.title;
        item.onclick = () => switchToChat(chatId);
        chatHistory.appendChild(item);
    });
}

// Save/load from localStorage
function saveChatsToStorage() {
    const data = {
        chats: Array.from(state.chats.entries()),
        currentChatId: state.currentChatId,
        chatIdCounter
    };
    localStorage.setItem('tangent_chats', JSON.stringify(data));
}

function loadChatsFromStorage() {
    const saved = localStorage.getItem('tangent_chats');
    if (saved) {
        const data = JSON.parse(saved);
        state.chats = new Map(data.chats);
        state.currentChatId = data.currentChatId;
        chatIdCounter = data.chatIdCounter || 0;
        updateHistoryUI();
    }
}

// Send message
async function sendMessage(threadId) {
    const isMain = threadId === 'main';
    const input = isMain ? mainInput : document.querySelector(`[data-bubble-id="${threadId}"] .bubble-input`);
    const content = input.value.trim();

    if (!content) return;

    const currentChat = state.chats.get(state.currentChatId);

    // Update chat title from first message
    if (isMain && currentChat.mainThread.length === 0) {
        currentChat.title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
        currentChat.timestamp = Date.now();
        updateHistoryUI();
        saveChatsToStorage();
    }

    // Build user message with attachment if present
    let userMsg;
    if (pendingAttachment && isMain) {
        if (pendingAttachment.type === 'image') {
            userMsg = {
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: pendingAttachment.media_type,
                            data: pendingAttachment.data
                        }
                    },
                    { type: 'text', text: content }
                ]
            };
        } else {
            userMsg = {
                role: 'user',
                content: pendingAttachment.content + '\n\n' + content
            };
        }
        pendingAttachment = null;
        mainInput.placeholder = 'Message Claude...';
    } else {
        userMsg = { role: 'user', content };
    }

    if (isMain) {
        currentChat.mainThread.push(userMsg);
        appendMessage(mainMessages, 'user', typeof userMsg.content === 'string' ? userMsg.content : content);
    } else {
        const bubbleThread = state.bubbles.get(threadId);
        bubbleThread.push(userMsg);
        const messagesDiv = document.querySelector(`[data-bubble-id="${threadId}"] .bubble-messages`);
        appendMessage(messagesDiv, 'user', content);
    }

    input.value = '';

    // Call backend with streaming
    try {
        const messages = isMain ? currentChat.mainThread : state.bubbles.get(threadId);
        const container = isMain ? mainMessages : document.querySelector(`[data-bubble-id="${threadId}"] .bubble-messages`);

        // Create message div for streaming
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant';
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        messageDiv.appendChild(contentDiv);
        container.appendChild(messageDiv);

        let fullContent = '';

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const text = line.slice(6);
                    fullContent += text;
                    contentDiv.textContent = fullContent;
                    container.scrollTop = container.scrollHeight;
                }
            }
        }

        // Add create bubble button for main thread
        if (isMain) {
            const bubbleBtn = document.createElement('button');
            bubbleBtn.className = 'create-bubble';
            bubbleBtn.textContent = '+';
            bubbleBtn.onclick = () => createBubble(fullContent);
            contentDiv.appendChild(bubbleBtn);
        }

        // Save to state
        const assistantMsg = { role: 'assistant', content: fullContent };
        if (isMain) {
            currentChat.mainThread.push(assistantMsg);
            saveChatsToStorage();
        } else {
            state.bubbles.get(threadId).push(assistantMsg);
        }
    } catch (error) {
        alert('Network error: ' + error.message);
    }
}

// Append message to UI
function appendMessage(container, role, content, canCreateBubble = false) {
    const div = document.createElement('div');
    div.className = `message ${role}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;
    div.appendChild(contentDiv);

    // Main thread AI replies can create bubbles
    if (canCreateBubble) {
        const bubbleBtn = document.createElement('button');
        bubbleBtn.className = 'create-bubble';
        bubbleBtn.textContent = '+';
        bubbleBtn.onclick = () => createBubble(content);
        contentDiv.appendChild(bubbleBtn);
    }

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// Create bubble thread
function createBubble(contextMessage) {
    const bubbleId = `bubble-${bubbleIdCounter++}`;

    // Create bubble thread with initial context from clicked message
    state.bubbles.set(bubbleId, [
        { role: 'user', content: contextMessage }
    ]);

    // Clone template
    const template = document.getElementById('bubbleTemplate');
    const bubble = template.content.cloneNode(true);
    const bubbleDiv = bubble.querySelector('.bubble');
    bubbleDiv.dataset.bubbleId = bubbleId;

    // Close button
    bubble.querySelector('.close-bubble').addEventListener('click', () => {
        state.bubbles.delete(bubbleId);
        bubbleDiv.remove();
    });

    // Send button
    const sendBtn = bubble.querySelector('.bubble-send');
    const input = bubble.querySelector('.bubble-input');

    sendBtn.addEventListener('click', () => sendMessage(bubbleId));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(bubbleId);
        }
    });

    // Display initial context
    const messagesDiv = bubble.querySelector('.bubble-messages');
    appendMessage(messagesDiv, 'user', contextMessage);

    bubblesContainer.appendChild(bubble);
}

// Web search
async function handleSearch() {
    const query = prompt('What do you want to search?');
    if (!query) return;

    const currentChat = state.chats.get(state.currentChatId);

    try {
        const response = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const data = await response.json();

        if (data.success) {
            // Add search results as system message to main thread
            const searchMsg = `[Search Results]\n${data.context}\n\nBased on the above information, please answer: ${query}`;
            currentChat.mainThread.push({ role: 'user', content: searchMsg });
            appendMessage(mainMessages, 'user', `🔍 ${query}`);

            // Auto-fetch AI response
            const chatResponse = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: currentChat.mainThread })
            });

            const reader = chatResponse.body.getReader();
            const decoder = new TextDecoder();

            const messageDiv = document.createElement('div');
            messageDiv.className = 'message assistant';
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            messageDiv.appendChild(contentDiv);
            mainMessages.appendChild(messageDiv);

            let fullContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const text = line.slice(6);
                        fullContent += text;
                        contentDiv.textContent = fullContent;
                        mainMessages.scrollTop = mainMessages.scrollHeight;
                    }
                }
            }

            const bubbleBtn = document.createElement('button');
            bubbleBtn.className = 'create-bubble';
            bubbleBtn.textContent = '+';
            bubbleBtn.onclick = () => createBubble(fullContent);
            contentDiv.appendChild(bubbleBtn);

            currentChat.mainThread.push({ role: 'assistant', content: fullContent });
            saveChatsToStorage();
        } else {
            alert('Search failed: ' + data.error);
        }
    } catch (error) {
        alert('Network error: ' + error.message);
    }
}
