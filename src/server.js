const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

// Setup Express app
const app = express();
const server = http.createServer(app);

// Configure Socket.IO with CORS
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    path: '/socket.io/'
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Add CORS headers for all routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Add a health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Add a socket.io test endpoint
app.get('/socket-test', (req, res) => {
    res.send(`
        <html>
            <body>
                <h1>Socket.IO Test</h1>
                <div id="status">Connecting...</div>
                <script src="/socket.io/socket.io.js"></script>
                <script>
                    const socket = io({
                        transports: ['websocket', 'polling']
                    });
                    
                    socket.on('connect', () => {
                        document.getElementById('status').textContent = 'Connected! Socket ID: ' + socket.id;
                    });
                    
                    socket.on('connect_error', (error) => {
                        document.getElementById('status').textContent = 'Error: ' + error;
                    });
                </script>
            </body>
        </html>
    `);
});

// Multiple game rooms
const gameRooms = {
    "1": { id: "1", players: [], pipes: [], gameStarted: false },
    "2": { id: "2", players: [], pipes: [], gameStarted: false },
    "3": { id: "3", players: [], pipes: [], gameStarted: false },
    "4": { id: "4", players: [], pipes: [], gameStarted: false }
};

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Get room status for the room list
    socket.on('getRoomStatus', () => {
        console.log('Client requested room status');
        const roomStatus = {};
        for (const roomId in gameRooms) {
            roomStatus[roomId] = {
                players: gameRooms[roomId].players.length,
                maxPlayers: 2,
                gameStarted: gameRooms[roomId].gameStarted
            };
        }
        console.log('Sending room status:', roomStatus);
        socket.emit('roomStatus', roomStatus);
    });

    // Join a specific room
    socket.on('joinRoom', (roomId) => {
        console.log(`Player ${socket.id} attempting to join room ${roomId}`);
        const room = gameRooms[roomId];
        
        if (!room) {
            console.log(`Room ${roomId} not found`);
            socket.emit('joinError', { message: 'Room not found' });
            return;
        }
        
        if (room.players.length >= 2) {
            console.log(`Room ${roomId} is full`);
            socket.emit('roomFull', { message: 'Room is full' });
            return;
        }
        
        const isFirstPlayer = room.players.length === 0;
        const playerX = isFirstPlayer ? 100 : 150;
        
        room.players.push({ 
            id: socket.id, 
            x: playerX, 
            y: 300, 
            score: 0,
            velocity: 0
        });
        
        socket.join(roomId);
        
        socket.emit('roomJoined', { 
            roomId: roomId, 
            playerId: socket.id, 
            isHost: isFirstPlayer 
        });
        
        io.to(roomId).emit('playerJoined', { 
            players: room.players 
        });
        
        if (room.players.length === 2) {
            room.gameStarted = true;
            room.pipes = [];
            io.to(roomId).emit('gameStart', { 
                players: room.players,
                pipes: room.pipes
            });
        }
        
        // Broadcast updated room status
        io.emit('roomStatus', Object.fromEntries(
            Object.entries(gameRooms).map(([id, room]) => [
                id,
                {
                    players: room.players.length,
                    maxPlayers: 2,
                    gameStarted: room.gameStarted
                }
            ])
        ));
    });

    // Handle player actions
    socket.on('playerJump', ({ roomId, velocity }) => {
        const room = gameRooms[roomId];
        if (!room || !room.gameStarted) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.velocity = velocity;
            io.to(roomId).emit('playerJumped', { 
                playerId: socket.id,
                velocity: velocity
            });
        }
    });
    
    socket.on('updatePosition', ({ roomId, x, y, velocity }) => {
        const room = gameRooms[roomId];
        if (!room || !room.gameStarted) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.x = x;
            player.y = y;
            player.velocity = velocity;
            
            io.to(roomId).emit('gameUpdate', {
                players: room.players,
                pipes: room.pipes
            });
        }
    });
    
    socket.on('generatePipe', ({ roomId, pipe }) => {
        const room = gameRooms[roomId];
        if (!room || !room.gameStarted) return;
        
        room.pipes.push(pipe);
        io.to(roomId).emit('newPipe', { pipe });
    });
    
    socket.on('gameOver', ({ roomId }) => {
        const room = gameRooms[roomId];
        if (!room) return;
        
        io.to(roomId).emit('gameEnded');
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Remove player from their room
        for (const roomId in gameRooms) {
            const room = gameRooms[roomId];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                room.gameStarted = false;
                
                // Notify remaining players
                io.to(roomId).emit('playerLeft', {
                    players: room.players
                });
                
                // Broadcast updated room status
                io.emit('roomStatus', Object.fromEntries(
                    Object.entries(gameRooms).map(([id, room]) => [
                        id,
                        {
                            players: room.players.length,
                            maxPlayers: 2,
                            gameStarted: room.gameStarted
                        }
                    ])
                ));
                
                break;
            }
        }
    });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 