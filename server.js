const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: [
            "https://footprintgen.github.io",
            "http://localhost:3000",
            "http://127.0.0.1:5500"  // For VS Code Live Server
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Serve static files
app.use(express.static('public'));

// Store message history and active users
let messageHistory = [];
let activeUsers = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);
    
    // Handle user joining
    socket.on('user-join', (username) => {
        activeUsers.set(socket.id, {
            id: socket.id,
            username: username || `User${Math.floor(Math.random() * 1000)}`,
            joinedAt: new Date()
        });
        
        // Send message history to newly connected user
        socket.emit('message-history', messageHistory);
        
        // Notify others about new user
        socket.broadcast.emit('user-joined', {
            username: activeUsers.get(socket.id).username,
            timestamp: new Date().toISOString()
        });
        
        // Send updated user list to all clients
        io.emit('users-update', Array.from(activeUsers.values()));
    });
    
    // Handle incoming messages
    socket.on('send-message', (data) => {
        const user = activeUsers.get(socket.id);
        const message = {
            id: Date.now() + Math.random(),
            text: data.text,
            username: user ? user.username : 'Anonymous',
            userId: socket.id,
            timestamp: new Date().toISOString()
        };
        
        // Add to history (keep last 100 messages)
        messageHistory.push(message);
        if (messageHistory.length > 100) {
            messageHistory.shift();
        }
        
        // Broadcast to all clients including sender
        io.emit('new-message', message);
    });
    
    // Handle typing indicators
    socket.on('typing', (isTyping) => {
        const user = activeUsers.get(socket.id);
        if (user) {
            socket.broadcast.emit('user-typing', {
                userId: socket.id,
                username: user.username,
                isTyping: isTyping
            });
        }
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
        const user = activeUsers.get(socket.id);
        if (user) {
            activeUsers.delete(socket.id);
            io.emit('users-update', Array.from(activeUsers.values()));
            io.emit('user-left', {
                username: user.username,
                timestamp: new Date().toISOString()
            });
        }
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});