require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

if (!DEEPGRAM_API_KEY) {
  console.error('ERROR: Deepgram API key is missing. Please set it in your .env file.');
  process.exit(1);
}

const deepgram = createClient(DEEPGRAM_API_KEY);
//const live = deepgram.listen.live({ model: "nova" });

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log(`User connected with socket ID: ${socket.id}`);
  let deepgramLive = null;
  let isDeepgramReady = false;

  socket.on('new-user', (username) => {
    socket.username = username;
    io.emit('user-connected', username);
    updateUsersList();
  });

  socket.on('chat-message', (message) => {
    const timestamp = new Date().toLocaleTimeString();
    io.emit('chat-message', {
      username: socket.username,
      message: message,
      time: timestamp,
    });
  });

  socket.on('transcription-ready', () => {
    console.log('Transcription service ready');
    if (mediaRecorder && mediaRecorder.state === 'inactive') {
        mediaRecorder.start(250);
    }
  });

  socket.on('connect', () => {
    console.log('Connected to server');
  });

  socket.on('start-audio-stream', async () => {
    console.log('Starting audio stream for transcription');

    if (deepgramLive) {
      console.log('Deepgram connection already exists. Closing existing connection.');
      deepgramLive.finish();
    }

    try {
      deepgramLive = deepgram.listen.live({
        model: "nova",
        punctuate: true,
        interim_results: true,
        encoding: 'linear16',
        sample_rate: 16000,
      });

      deepgramLive.on(LiveTranscriptionEvents.Open, () => {
        console.log('Deepgram live transcription connection established');
        isDeepgramReady = true;
        socket.emit('transcription-ready');
      });
      
      deepgramLive.on(LiveTranscriptionEvents.Transcript, (data) => {
        const transcript = data.channel.alternatives[0]?.transcript;
        if (transcript) {
          const timestamp = new Date().toLocaleTimeString();
          io.emit('transcription-result', {
            username: socket.username,
            transcript,
            time: timestamp,
          });
        }
      });
      
      deepgramLive.on(LiveTranscriptionEvents.Close, () => {
        console.log('Deepgram live transcription connection closed');
        isDeepgramReady = false;
        // Implement reconnection logic here if needed
      });
      
      deepgramLive.on(LiveTranscriptionEvents.Error, (error) => {
        console.error('Deepgram error:', error);
        isDeepgramReady = false;
        socket.emit('transcription-error', error.message);
        // Implement reconnection logic here if needed
      });

      // Add a keep-alive mechanism
      const keepAliveInterval = setInterval(() => {
        if (isDeepgramReady && deepgramLive.getReadyState() === 1) {
          deepgramLive.keepAlive();
        }
      }, 10000);

      socket.on('stop-audio-stream', () => {
        console.log('Stopping audio stream for transcription');
        if (deepgramLive) {
          deepgramLive.finish();
          deepgramLive = null;
          isDeepgramReady = false;
          clearInterval(keepAliveInterval);
        }
      });

      socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        if (deepgramLive) {
          deepgramLive.finish();
          clearInterval(keepAliveInterval);
        }
        updateUsersList();
      });
      
    } catch (error) {
      console.error('Error setting up Deepgram connection:', error);
      socket.emit('transcription-error', 'Failed to initialize transcription service.');
    }
  });

  socket.on('audio-data', (data) => {
    if (isDeepgramReady && deepgramLive.getReadyState() === 1) {
      console.log('Received audio data, size:', data.byteLength);
      // Check if the data is base64 encoded
      if (typeof data === 'string') {
        // If it's a string, assume it's base64 encoded and decode it
        const audioBuffer = Buffer.from(data, 'base64');
        deepgramLive.send(audioBuffer);
      } else {
        // If it's not a string, assume it's already a buffer and send it directly
        deepgramLive.send(data);
      }
    } else {
      console.log('Deepgram not ready:', deepgramLive?.getReadyState());
    }
  });

  function updateUsersList() {
    const users = [];
    for (let [id, socket] of io.of('/').sockets) {
      if (socket.username) {
        users.push(socket.username);
      }
    }
    io.emit('user-list', users);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});