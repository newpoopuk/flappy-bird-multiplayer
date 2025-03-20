const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

// Setup Express app
const app = express();
const server = http.createServer(app);

// Configure Socket.IO with CORS for Vercel
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    path: '/socket.io/',
    addTrailingSlash: true,
    pingTimeout: 60000,
    pingInterval: 25000
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
                        transports: ['websocket', 'polling'],
                        path: '/socket.io/'
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
  "4": { id: "4", players: [], pipes: [], gameStarted: false },
  "single": { id: "single", players: [], pipes: [], gameStarted: false, isSinglePlayer: true }
};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Get room status for the room list
  socket.on('getRoomStatus', () => {
    console.log('Client requested room status');
    const roomStatus = {};
    for (const roomId in gameRooms) {
      // Don't include single player room in the room list
      if (roomId !== "single") {
        roomStatus[roomId] = {
          players: gameRooms[roomId].players.length,
          maxPlayers: 2,
          gameStarted: gameRooms[roomId].gameStarted
        };
      }
    }
    console.log('Sending room status:', roomStatus);
    socket.emit('roomStatus', roomStatus);
    
    // Also broadcast updated room status to all clients
    io.emit('roomStatus', roomStatus);
  });

  // Start single player game
  socket.on('startSinglePlayer', () => {
    console.log('Starting single player mode for:', socket.id);
    
    const room = gameRooms["single"];
    
    // Clean up any existing players in the single player room
    room.players = [];
    room.pipes = [];
    
    // Add the player to the single player room
    room.players.push({ 
      id: socket.id, 
      x: 100, 
      y: 300, 
      score: 0 
    });
    
    console.log('Player added to single player room:', room.players);
    
    socket.join("single");
    
    console.log('Socket joined single player room');
    
    socket.emit('roomJoined', { 
      roomId: "single", 
      playerId: socket.id, 
      isHost: true,
      isSinglePlayer: true
    });
    
    console.log('roomJoined event emitted');
    
    // Start the game immediately for single player
    room.gameStarted = true;
    socket.emit('gameStart', { 
      players: room.players,
      isSinglePlayer: true
    });
    
    console.log('gameStart event emitted');
  });

  // Join a specific room
  socket.on('joinRoom', (roomId) => {
    const room = gameRooms[roomId];
    
    if (!room) {
        socket.emit('joinError', { message: 'Room not found' });
        return;
    }
    
    // Maximum 2 players
    if (room.players.length >= 2) {
        socket.emit('roomFull', { message: 'Room is full. Try another room.' });
        return;
    }
    
    // Add player to the room
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
    
    // Update room status for all clients
    io.emit('roomStatusUpdate', {
        roomId: roomId,
        players: room.players.length,
        maxPlayers: 2,
        gameStarted: room.gameStarted
    });
    
    // If two players, start the game after a countdown
    if (room.players.length === 2) {
        room.gameStarted = true;
        
        // Reset game state
        room.pipes = [];
        room.players.forEach(player => {
            player.score = 0;
            player.y = 300;
            player.velocity = 0;
        });
        
        io.to(roomId).emit('gameStart', { 
            players: room.players,
            pipes: room.pipes
        });
        
        // Update room status for all clients
        io.emit('roomStatusUpdate', {
            roomId: roomId,
            players: room.players.length,
            maxPlayers: 2,
            gameStarted: true
        });
    }
  });

  // Player jump event
  socket.on('playerJump', ({ roomId, velocity }) => {
    const room = gameRooms[roomId];
    if (!room || !room.gameStarted) return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
        player.velocity = velocity;
        // Broadcast jump immediately to all players in the room
        io.to(roomId).emit('playerJumped', { 
            playerId: socket.id,
            velocity: velocity
        });
    }
  });
  
  // Update player position
  socket.on('updatePosition', ({ roomId, x, y, velocity }) => {
    const room = gameRooms[roomId];
    if (!room || !room.gameStarted) return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
        // Update player state
        player.x = x;
        player.y = y;
        player.velocity = velocity;
        
        // Broadcast the update immediately to all players in the room
        io.to(roomId).emit('gameUpdate', { 
            players: room.players,
            pipes: room.pipes
        });
    }
  });
  
  // Handle pipe generation
  socket.on('generatePipe', ({ roomId, pipe }) => {
    const room = gameRooms[roomId];
    if (!room || !room.gameStarted) return;
    
    // Only host player generates pipes
    const isHost = room.players.length > 0 && room.players[0].id === socket.id;
    if (isHost) {
        room.pipes.push(pipe);
        io.to(roomId).emit('newPipe', { pipe });
    }
  });
  
  // Handle pipe movement
  socket.on('movePipes', ({ roomId, pipes }) => {
    const room = gameRooms[roomId];
    if (!room || !room.gameStarted) return;
    
    // Only host player updates pipes
    const isHost = room.players.length > 0 && room.players[0].id === socket.id;
    if (isHost) {
        room.pipes = pipes;
        io.to(roomId).emit('pipesUpdated', { pipes });
    }
  });
  
  // Game over
  socket.on('gameOver', ({ roomId }) => {
    const room = gameRooms[roomId];
    if (!room) return;
    
    io.to(roomId).emit('gameEnded', { message: 'Game Over!' });
    
    // Reset game after 3 seconds
    setTimeout(() => {
      room.pipes = [];
      room.players.forEach(player => {
        player.y = 300;
        player.score = 0;
      });
      
      // For single player, only reset if the player is still connected
      if (room.isSinglePlayer) {
        // Check if the player is still connected
        const playerStillConnected = room.players.some(p => p.id === socket.id);
        if (playerStillConnected) {
          io.to(roomId).emit('gameReset', { players: room.players });
        }
      } else {
        io.to(roomId).emit('gameReset', { players: room.players });
      }
    }, 3000);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Find and clean up rooms where this socket was a player
    for (const roomId in gameRooms) {
      const room = gameRooms[roomId];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        
        // For multiplayer rooms, notify remaining players
        if (!room.isSinglePlayer) {
          // Notify remaining players
          io.to(roomId).emit('playerLeft', { 
            playerId: socket.id,
            players: room.players
          });
          
          // Reset game state if game was in progress
          if (room.gameStarted && room.players.length < 2) {
            room.gameStarted = false;
            room.pipes = [];
          }
          
          // Update room status for all clients
          io.emit('roomStatusUpdate', {
            roomId: roomId,
            players: room.players.length,
            maxPlayers: 2,
            gameStarted: room.gameStarted
          });
        }
      }
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 