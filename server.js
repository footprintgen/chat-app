const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors'); // Add this

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: [
            "https://footprintgen.github.io",
            "http://localhost:3000",
            "http://127.0.0.1:5500",
            "*"  // Allow all origins for testing
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Add CORS middleware
app.use(cors());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Add JSON middleware
app.use(express.json());

// Store message history and active users
let messageHistory = [];
let activeUsers = new Map();

// ROUTES - Define these OUTSIDE of socket connection
// Redirect root to index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve admin.html explicitly
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API endpoint for debugging
app.get('/api/messages', (req, res) => {
    res.json({
        count: messageHistory.length,
        messages: messageHistory,
        activeUsers: Array.from(activeUsers.values())
    });
});

app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'Server is running', 
        messageCount: messageHistory.length,
        userCount: activeUsers.size 
    });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);
    
    // Handle user joining
    socket.on('user-join', (username) => {
        // Validate username
        const finalUsername = username?.trim() || `User${Math.floor(Math.random() * 1000)}`;
        
        activeUsers.set(socket.id, {
            id: socket.id,
            username: finalUsername,
            joinedAt: new Date()
        });
        
        // Send message history to newly connected user
        socket.emit('message-history', messageHistory);
        
        // Create and store join message
        const joinMessage = {
            id: Date.now() + Math.random(),
            text: `${finalUsername} joined the chat`,
            username: 'System',
            timestamp: new Date().toISOString(),
            isSystemMessage: true
        };
        
        messageHistory.push(joinMessage);
        if (messageHistory.length > 100) {
            messageHistory.shift();
        }
        
        // Notify all users about new user
        io.emit('new-message', joinMessage);
        
        // Send updated user list to all clients
        io.emit('users-update', Array.from(activeUsers.values()));
    });

    // Admin functions
    socket.on('admin-request-messages', () => {
        console.log('🔧 Admin requested messages');
        console.log(`📊 Current message count: ${messageHistory.length}`);
        
        // Send messages to admin - using correct variable name
        socket.emit('admin-messages-data', messageHistory);
        console.log('✉️ Sent messages to admin');
    });
    
    // Clear all messages
    socket.on('admin-clear-messages', () => {
        console.log('🗑️ Admin clearing messages');
        console.log(`Before clear: ${messageHistory.length} messages`);
        messageHistory = [];
        console.log(`After clear: ${messageHistory.length} messages`);
        
        // Notify admin panel
        socket.emit('admin-clear-success');
        
        // Notify all chat clients to clear their messages
        io.emit('messages-cleared');
    });
    
    // Handle incoming messages
    socket.on('send-message', (data) => {
        console.log('📨 Received message:', data);
        
        // Handle different message types
        if (data.isVideo) {
            // Video messages - don't store but broadcast
            const videoMessage = {
                id: Date.now() + Math.random(),
                isVideo: true,
                videoUrl: data.videoUrl,
                username: activeUsers.get(socket.id)?.username || 'Anonymous',
                userId: socket.id,
                timestamp: new Date().toISOString()
            };
            io.emit('new-message', videoMessage);
            return;
        }
        
        // Validate text message
        if (!data.text || data.text.trim() === '') {
            return; // Don't process empty messages
        }
        
        const user = activeUsers.get(socket.id);
        const message = {
            id: Date.now() + Math.random(),
            text: data.text.trim(),
            username: user ? user.username : 'Anonymous',
            userId: socket.id,
            timestamp: new Date().toISOString()
        };
        
        // Add to history (keep last 100 messages)
        messageHistory.push(message);
        if (messageHistory.length > 100) {
            messageHistory.shift();
        }
        
        console.log(`💾 Stored message. Total messages: ${messageHistory.length}`);
        
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
            
            // Create leave message
            const leaveMessage = {
                id: Date.now() + Math.random(),
                text: `${user.username} left the chat`,
                username: 'System',
                timestamp: new Date().toISOString(),
                isSystemMessage: true
            };
            
            messageHistory.push(leaveMessage);
            if (messageHistory.length > 100) {
                messageHistory.shift();
            }
            
            io.emit('new-message', leaveMessage);
            io.emit('users-update', Array.from(activeUsers.values()));
        }
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 Access chat at: http://localhost:${PORT}`);
    console.log(`🔧 Access admin at: http://localhost:${PORT}/admin`);
    console.log(`📊 API test at: http://localhost:${PORT}/api/test`);
});