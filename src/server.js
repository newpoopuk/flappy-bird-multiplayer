const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

// Setup Express app
const app = express();
const server = http.createServer(app);

// Configure Socket.IO with improved settings for Render
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    path: '/socket.io/',
    pingInterval: 10000,
    pingTimeout: 5000
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

// Debug endpoint to view room state
app.get('/room-debug', (req, res) => {
    res.json(gameRooms);
});

// Game state management
const gameRooms = {};

// Game constants
const BIRD_WIDTH = 40;
const BIRD_HEIGHT = 30;
const PIPE_WIDTH = 80;
const PIPE_GAP = 200;
const GAME_SPEED = 3;
const PIPE_SPAWN_INTERVAL = 90;

// Default player positions with more separation
const PLAYER_POSITIONS = {
    host: { x: 100, y: 250 },
    guest: { x: 100, y: 350 }
};

// Initialize a new room
function initializeRoom(roomId) {
    if (!gameRooms[roomId]) {
        gameRooms[roomId] = {
            players: [],
            pipes: [],
            frameCount: 0,
            gameStarted: false,
            lastUpdateTime: Date.now()
        };
    }
    return gameRooms[roomId];
}

// Reset room state
function resetRoom(roomId) {
    const room = gameRooms[roomId];
    if (!room) return;

    room.pipes = [];
    room.frameCount = 0;
    room.gameStarted = false;
    
    // Reset player positions and states
    room.players.forEach((player, index) => {
        const position = index === 0 ? PLAYER_POSITIONS.host : PLAYER_POSITIONS.guest;
        player.x = position.x;
        player.y = position.y;
        player.velocity = 0;
        player.score = 0;
        player.dead = false;
    });
    
    console.log(`Room ${roomId} reset with ${room.players.length} players:`, room.players);
}

// Game loop function
function gameLoop() {
    const currentTime = Date.now();
    
    // Process each active room
    for (const roomId in gameRooms) {
        const room = gameRooms[roomId];
        
        // Skip inactive rooms or rooms with less than 2 players
        if (!room.gameStarted || room.players.length < 2) {
            continue;
        }
        
        // Calculate delta time for smooth updates
        const deltaTime = currentTime - room.lastUpdateTime;
        if (deltaTime < 16) continue; // Cap at ~60 FPS
        
        room.lastUpdateTime = currentTime;
        room.frameCount++;
        
        // Update pipe positions
        room.pipes.forEach(pipe => {
            pipe.x -= GAME_SPEED;
        });
        
        // Remove pipes that are off screen
        room.pipes = room.pipes.filter(pipe => pipe.x + pipe.width > 0);
        
        // Spawn new pipes
        if (room.frameCount % PIPE_SPAWN_INTERVAL === 0) {
            const gap = PIPE_GAP;
            const minTop = 50;
            const maxTop = 300;
            const top = Math.floor(Math.random() * (maxTop - minTop + 1)) + minTop;
            
            room.pipes.push({
                x: 800,
                top: top,
                bottom: 600 - (top + gap),
                width: PIPE_WIDTH,
                passed: false
            });
        }
        
        // Update player positions and check collisions
        room.players.forEach(player => {
            if (player.dead) return;
            
            // Apply gravity
            player.velocity += 0.5;
            player.y += player.velocity;
            
            // Check collisions
            const playerBox = {
                x: player.x,
                y: player.y,
                width: BIRD_WIDTH,
                height: BIRD_HEIGHT
            };
            
            // Ground collision
            if (player.y + BIRD_HEIGHT > 600) {
                player.dead = true;
                player.y = 600 - BIRD_HEIGHT;
            }
            
            // Ceiling collision
            if (player.y < 0) {
                player.y = 0;
                player.velocity = 0;
            }
            
            // Pipe collisions
            room.pipes.forEach(pipe => {
                if (checkCollision(playerBox, pipe)) {
                    player.dead = true;
                }
                
                // Score points
                if (!pipe.passed && player.x > pipe.x + pipe.width) {
                    pipe.passed = true;
                    player.score++;
                }
            });
        });
        
        // Broadcast game state to all players in the room
        const gameState = {
            players: room.players,
            pipes: room.pipes,
            frameCount: room.frameCount
        };
        
        console.log(`Room ${roomId} update:`, {
            playerCount: room.players.length,
            pipeCount: room.pipes.length,
            frame: room.frameCount
        });
        
        io.to(roomId).emit('gameUpdate', gameState);
        
        // Check if game should end (all players dead)
        if (room.players.every(player => player.dead)) {
            room.gameStarted = false;
            io.to(roomId).emit('gameOver', {
                players: room.players
            });
        }
    }
}

// Broadcast room status to all connected clients
function broadcastRoomStatus() {
    const roomStatus = {};
    for (const roomId in gameRooms) {
        roomStatus[roomId] = {
            players: gameRooms[roomId].players.length,
            maxPlayers: 2,
            gameStarted: gameRooms[roomId].gameStarted
        };
    }
    io.emit('roomStatus', roomStatus);
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    // Send initial room status
    socket.on('getRoomStatus', () => {
        const roomStatus = {};
        for (const roomId in gameRooms) {
            roomStatus[roomId] = {
                players: gameRooms[roomId].players.length,
                maxPlayers: 2,
                gameStarted: gameRooms[roomId].gameStarted
            };
        }
        socket.emit('roomStatus', roomStatus);
        console.log('Sent room status:', roomStatus);
    });

    // Join room handler
    socket.on('joinRoom', (roomId) => {
        console.log(`Player ${socket.id} attempting to join room ${roomId}`);
        
        let room = gameRooms[roomId];
        if (!room) {
            room = initializeRoom(roomId);
        }
        
        if (room.players.length >= 2) {
            console.log(`Room ${roomId} is full`);
            socket.emit('joinError', { message: 'Room is full' });
            return;
        }
        
        // Remove player from other rooms first
        for (const id in gameRooms) {
            const r = gameRooms[id];
            r.players = r.players.filter(p => p.id !== socket.id);
        }
        
        // Add player to the room
        const isFirstPlayer = room.players.length === 0;
        const position = isFirstPlayer ? PLAYER_POSITIONS.host : PLAYER_POSITIONS.guest;
        
        const newPlayer = {
            id: socket.id,
            x: position.x,
            y: position.y,
            velocity: 0,
            score: 0,
            dead: false,
            isHost: isFirstPlayer
        };
        
        room.players.push(newPlayer);
        socket.join(roomId);
        
        console.log(`Player ${socket.id} joined room ${roomId}. Players:`, room.players);
        
        // Handle game start when second player joins
        if (room.players.length === 2) {
            resetRoom(roomId);
            room.gameStarted = true;
            room.lastUpdateTime = Date.now();
            
            io.to(roomId).emit('gameStart', {
                players: room.players,
                pipes: room.pipes,
                frameCount: room.frameCount
            });
            
            console.log(`Game started in room ${roomId}`);
        } else {
            socket.emit('roomJoined', {
                roomId,
                playerId: socket.id,
                isHost: isFirstPlayer,
                players: room.players
            });
        }
        
        // Broadcast updated room status
        broadcastRoomStatus();
    });

    // Player jump handler
    socket.on('jump', (roomId) => {
        const room = gameRooms[roomId];
        if (!room) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (player && !player.dead) {
            player.velocity = -8;
            console.log(`Player ${socket.id} jumped in room ${roomId}`);
        }
    });

    // Disconnect handler
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Remove player from all rooms
        for (const roomId in gameRooms) {
            const room = gameRooms[roomId];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                console.log(`Player ${socket.id} removed from room ${roomId}`);
                
                if (room.players.length === 0) {
                    delete gameRooms[roomId];
                    console.log(`Room ${roomId} deleted - no players remaining`);
                } else {
                    // Reset room if game was in progress
                    if (room.gameStarted) {
                        resetRoom(roomId);
                        io.to(roomId).emit('playerLeft', {
                            playerId: socket.id,
                            players: room.players
                        });
                    }
                }
                
                broadcastRoomStatus();
            }
        }
    });
});

// Start game loop
setInterval(gameLoop, 16); // ~60 FPS

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 