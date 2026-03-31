// State management
const state = {
    mainThread: [],
    bubbles: new Map()
};

let bubbleIdCounter = 0;

// DOM elements
const mainMessages = document.getElementById('mainMessages');
const mainInput = document.getElementById('mainInput');
const mainSend = document.getElementById('mainSend');
const searchBtn = document.getElementById('searchBtn');
const bubblesContainer = document.getElementById('bubbles');

// Initialize
mainSend.addEventListener('click', () => sendMessage('main'));
mainInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage('main');
    }
});

searchBtn.addEventListener('click', handleSearch);

// Send message
async function sendMessage(threadId) {
    const isMain = threadId === 'main';
    const input = isMain ? mainInput : document.querySelector(`[data-bubble-id="${threadId}"] .bubble-input`);
    const content = input.value.trim();

    if (!content) return;

    // Add user message
    const userMsg = { role: 'user', content };
    if (isMain) {
        state.mainThread.push(userMsg);
        appendMessage(mainMessages, 'user', content);
    } else {
        const bubbleThread = state.bubbles.get(threadId);
        bubbleThread.push(userMsg);
        const messagesDiv = document.querySelector(`[data-bubble-id="${threadId}"] .bubble-messages`);
        appendMessage(messagesDiv, 'user', content);
    }

    input.value = '';

    // Call backend with streaming
    try {
        const messages = isMain ? state.mainThread : state.bubbles.get(threadId);
        const container = isMain ? mainMessages : document.querySelector(`[data-bubble-id="${threadId}"] .bubble-messages`);

        // Create message div for streaming
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant';
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
                    messageDiv.textContent = fullContent;
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
            messageDiv.appendChild(bubbleBtn);
        }

        // Save to state
        const assistantMsg = { role: 'assistant', content: fullContent };
        if (isMain) {
            state.mainThread.push(assistantMsg);
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
    div.textContent = content;

    // Main thread AI replies can create bubbles
    if (canCreateBubble) {
        const bubbleBtn = document.createElement('button');
        bubbleBtn.className = 'create-bubble';
        bubbleBtn.textContent = '+';
        bubbleBtn.onclick = () => createBubble(content);
        div.appendChild(bubbleBtn);
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
            state.mainThread.push({ role: 'user', content: searchMsg });
            appendMessage(mainMessages, 'user', `🔍 ${query}`);

            // Auto-fetch AI response
            const chatResponse = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: state.mainThread })
            });

            const chatData = await chatResponse.json();
            if (chatData.success) {
                state.mainThread.push({ role: 'assistant', content: chatData.message });
                appendMessage(mainMessages, 'assistant', chatData.message, true);
            }
        } else {
            alert('Search failed: ' + data.error);
        }
    } catch (error) {
        alert('Network error: ' + error.message);
    }
}
