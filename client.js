const socket = io();

// DOM Elements
const messagesDiv = document.getElementById('chat-messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const usernameModal = document.getElementById('username-modal');
const usernameForm = document.getElementById('username-form');
const usernameInput = document.getElementById('username-input');
const usersList = document.getElementById('users-list');
const transcriptionToggleBtn = document.getElementById('transcription-toggle'); // Ensure this element exists in your HTML

// Audio streaming state
let mediaRecorder = null;
let audioStream = null;
let isTranscribing = false;

// Username state
let username;

// Audio configuration
const audioConfig = {
    sampleRate: 16000,
    channelCount: 1,
    mimeType: 'audio/webm;codecs=opus'
};

// Initialize audio streaming
async function initializeAudioStreaming() {
    try {
        // Request microphone permissions
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: audioConfig.channelCount,
                sampleRate: audioConfig.sampleRate
            }
        });

        // Create and configure MediaRecorder
        mediaRecorder = new MediaRecorder(audioStream, {
            mimeType: audioConfig.mimeType
        });

        // Handle audio data
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && isTranscribing) {
                console.log('Sending audio data, size:', event.data.size);
                socket.emit('audio-data', event.data);
            }
        };

        // Start recording
        mediaRecorder.start(250); // Send audio data every 250ms

        console.log('Audio streaming initialized successfully');
        return true;

    } catch (error) {
        console.error('Error initializing audio streaming:', error);
        showNotification('Error accessing microphone. Please check permissions.');
        return false;
    }
}

// Start transcription
async function startTranscription() {
    if (!mediaRecorder) {
        const initialized = await initializeAudioStreaming();
        if (!initialized) return;
    }

    isTranscribing = true;
    socket.emit('start-audio-stream');
    showNotification('Voice transcription started');
}

// Stop transcription
function stopTranscription() {
    isTranscribing = false;
    socket.emit('stop-audio-stream');
    showNotification('Voice transcription stopped');
}

// Cleanup audio resources
function cleanupAudio() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
    }
    mediaRecorder = null;
    audioStream = null;
    isTranscribing = false;
}

// Show notification in chat
function showNotification(message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'notification');
    messageElement.textContent = message;
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Handle username submission
usernameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    username = usernameInput.value.trim();
    if (username) {
        socket.emit('new-user', username);
        usernameModal.style.display = 'none';
        messageInput.focus();
        
        // Initialize audio streaming after username is set
        await initializeAudioStreaming();
    }
});

// Handle sending messages
messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = messageInput.value.trim();
    if (message) {
        socket.emit('chat-message', message);
        messageInput.value = '';
    }
});

// Transcription toggle button click handler
if (transcriptionToggleBtn) {
    transcriptionToggleBtn.addEventListener('click', () => {
        if (isTranscribing) {
            stopTranscription();
            transcriptionToggleBtn.textContent = 'Start Transcription';
        } else {
            startTranscription();
            transcriptionToggleBtn.textContent = 'Stop Transcription';
        }
    });
}

// Socket event handlers
socket.on('chat-message', (data) => {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(data.username === username ? 'sent' : 'received');
    
    messageElement.innerHTML = `
        <div class="username">${data.username}</div>
        <div class="content">${data.message}</div>
        <div class="time">${data.time}</div>
    `;
    
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

socket.on('transcription-result', (data) => {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'transcription');
    messageElement.classList.add(data.username === username ? 'sent' : 'received');
    
    messageElement.innerHTML = `
        <div class="username">${data.username} (transcribed)</div>
        <div class="content">${data.transcript}</div>
        <div class="time">${data.time}</div>
    `;
    
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    console.log(data);
});

socket.on('transcription-error', (error) => {
    console.error('Transcription error:', error);
    showNotification(`Transcription error: ${error}`);
    stopTranscription();
});

socket.on('transcription-ready', () => {
    console.log('Transcription service ready');
    if (mediaRecorder && mediaRecorder.state === 'inactive') {
        mediaRecorder.start(250);
    }
});

socket.on('user-connected', (user) => {
    showNotification(`${user} joined the chat`);
});

socket.on('user-disconnected', (user) => {
    showNotification(`${user} left the chat`);
});

socket.on('user-list', (users) => {
    usersList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user;
        usersList.appendChild(li);
    });
});

// Clean up resources when the page is closed
window.addEventListener('beforeunload', () => {
    cleanupAudio();
});

// Add keyboard shortcuts for transcription control
document.addEventListener('keydown', (e) => {
    // Start/stop transcription with Ctrl+Shift+Space
    if (e.ctrlKey && e.shiftKey && e.code === 'Space') {
        e.preventDefault();
        if (isTranscribing) {
            stopTranscription();
        } else {
            startTranscription();
        }
    }
});