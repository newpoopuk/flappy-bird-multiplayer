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

// Multiple game rooms
const gameRooms = {
    "1": { id: "1", players: [], pipes: [], gameStarted: false },
    "2": { id: "2", players: [], pipes: [], gameStarted: false },
    "3": { id: "3", players: [], pipes: [], gameStarted: false },
    "4": { id: "4", players: [], pipes: [], gameStarted: false }
};

// Game constants
const BIRD_WIDTH = 40;
const BIRD_HEIGHT = 30;
const PIPE_WIDTH = 80;
const PIPE_GAP = 150;
const GAME_SPEED = 3;
const PIPE_SPAWN_INTERVAL = 90;

// Default player positions
const PLAYER_POSITIONS = {
    host: { x: 100, y: 300 },
    guest: { x: 150, y: 350 }
};

// Game loop function - run on the server for each room
function gameLoop() {
    // Process each active room
    for (const roomId in gameRooms) {
        const room = gameRooms[roomId];
        
        // Skip inactive rooms
        if (!room.gameStarted || room.players.length < 2) {
            continue;
        }
        
        // Update pipe positions
        for (let i = room.pipes.length - 1; i >= 0; i--) {
            room.pipes[i].x -= GAME_SPEED;
            
            // Remove pipes that are off-screen
            if (room.pipes[i].x + PIPE_WIDTH < 0) {
                room.pipes.splice(i, 1);
                continue;
            }
            
            // Check for collisions and score updates for each player
            room.players.forEach(player => {
                // Check pipe collision
                if (
                    player.x < room.pipes[i].x + PIPE_WIDTH &&
                    player.x + BIRD_WIDTH > room.pipes[i].x &&
                    (player.y < room.pipes[i].top || player.y + BIRD_HEIGHT > 600 - room.pipes[i].bottom)
                ) {
                    player.dead = true;
                }
                
                // Check for scoring
                if (!room.pipes[i].passed && room.pipes[i].x + PIPE_WIDTH < player.x) {
                    room.pipes[i].passed = true;
                    if (!player.dead) {
                        player.score++;
                    }
                }
            });
        }
        
        // Generate new pipes at intervals
        if (room.frameCount % PIPE_SPAWN_INTERVAL === 0) {
            const gapPosition = Math.floor(Math.random() * (600 - 300)) + 100;
            room.pipes.push({
                x: 800, // Canvas width
                top: gapPosition,
                bottom: 600 - gapPosition - PIPE_GAP,
                width: PIPE_WIDTH,
                passed: false
            });
        }
        
        // Apply gravity to each player
        room.players.forEach(player => {
            if (!player.dead) {
                player.velocity += 0.3; // Gravity
                if (player.velocity > 12) player.velocity = 12; // Max fall speed
                player.y += player.velocity;
                
                // Check for floor/ceiling collisions
                if (player.y < 0) {
                    player.y = 0;
                    player.velocity = 0;
                }
                
                if (player.y + BIRD_HEIGHT > 600) {
                    player.y = 600 - BIRD_HEIGHT;
                    player.dead = true;
                }
            }
        });
        
        // Check if all players are dead
        const allDead = room.players.every(player => player.dead);
        if (allDead && room.players.length > 0) {
            // Send game over to all clients in the room
            io.to(roomId).emit('gameEnded', {
                players: room.players
            });
            
            // Reset the game state after a delay
            setTimeout(() => {
                resetRoom(roomId);
                // Broadcast updated room status
                broadcastRoomStatus();
            }, 3000);
        } else {
            // Send game update to all clients in the room
            io.to(roomId).emit('gameUpdate', {
                players: room.players,
                pipes: room.pipes
            });
        }
        
        // Increment frame counter
        room.frameCount = (room.frameCount || 0) + 1;
    }
}

// Reset a room to initial state
function resetRoom(roomId) {
    const room = gameRooms[roomId];
    if (room) {
        room.pipes = [];
        room.gameStarted = false;
        room.frameCount = 0;
        room.players.forEach(player => {
            player.y = 300;
            player.velocity = 0;
            player.score = 0;
            player.dead = false;
        });
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

// Start the game loop (20 FPS)
setInterval(gameLoop, 50);

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
        
        // Remove player from any other rooms first
        leaveAllRooms(socket);
        
        // Add player to the room with safe starting position
        const isFirstPlayer = room.players.length === 0;
        const position = isFirstPlayer ? PLAYER_POSITIONS.host : PLAYER_POSITIONS.guest;
        
        const newPlayer = { 
            id: socket.id, 
            x: position.x,
            y: position.y,
            score: 0,
            velocity: 0,
            dead: false
        };
        
        room.players.push(newPlayer);
        
        // Join the Socket.IO room
        socket.join(roomId);
        
        // Reset game state when second player joins
        if (room.players.length === 2) {
            resetRoom(roomId);
            room.gameStarted = true;
            
            // Notify all players in the room about game start with initial state
            io.to(roomId).emit('gameStart', { 
                players: room.players,
                pipes: room.pipes,
                frameCount: room.frameCount
            });
        } else {
            // Notify the player they've joined
            socket.emit('roomJoined', { 
                roomId: roomId, 
                playerId: socket.id, 
                isHost: isFirstPlayer,
                player: newPlayer,
                players: room.players
            });
            
            // Notify other players about the new player
            socket.to(roomId).emit('playerJoined', { 
                players: room.players 
            });
        }
        
        // Broadcast updated room status
        broadcastRoomStatus();
    });

    // Player jump event
    socket.on('playerJump', ({ roomId, velocity }) => {
        const room = gameRooms[roomId];
        if (!room || !room.gameStarted) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (player && !player.dead) {
            player.velocity = velocity;
            
            // Broadcast to all players in the room (including the sender)
            io.to(roomId).emit('playerJumped', { 
                playerId: socket.id,
                velocity: velocity
            });
        }
    });
    
    // Handle client-side update
    socket.on('updatePosition', ({ roomId, y, velocity }) => {
        // We handle this on the server side now, so this is just for validation
        // or client-side prediction if needed
    });
    
    // Leave room event
    socket.on('leaveRoom', ({ roomId }) => {
        leaveRoom(socket, roomId);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Remove player from all rooms
        leaveAllRooms(socket);
    });
    
    // Helper function to leave a specific room
    function leaveRoom(socket, roomId) {
        const room = gameRooms[roomId];
        if (!room) return;
        
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
            // Remove player
            room.players.splice(playerIndex, 1);
            
            // Leave the socket.io room
            socket.leave(roomId);
            
            // If game was started, end it
            if (room.gameStarted) {
                room.gameStarted = false;
                io.to(roomId).emit('playerLeft', {
                    players: room.players
                });
                resetRoom(roomId);
            }
            
            // Broadcast updated room status
            broadcastRoomStatus();
        }
    }
    
    // Helper function to leave all rooms
    function leaveAllRooms(socket) {
        for (const roomId in gameRooms) {
            leaveRoom(socket, roomId);
        }
    }
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 