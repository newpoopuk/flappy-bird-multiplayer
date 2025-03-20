const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

// Setup Express app
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Game rooms storage
const rooms = {};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Create a new game room
  socket.on('createRoom', () => {
    const roomId = generateRoomId();
    rooms[roomId] = {
      players: [{ id: socket.id, x: 100, y: 300, score: 0 }],
      pipes: [],
      gameStarted: false
    };
    
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, playerId: socket.id });
    console.log(`Room created: ${roomId}`);
  });

  // Join an existing room
  socket.on('joinRoom', (roomId) => {
    const room = rooms[roomId];
    
    if (!room) {
      socket.emit('joinError', { message: 'Room not found' });
      return;
    }
    
    if (room.players.length >= 2) {
      socket.emit('joinError', { message: 'Room is full' });
      return;
    }
    
    room.players.push({ id: socket.id, x: 150, y: 300, score: 0 });
    socket.join(roomId);
    
    socket.emit('roomJoined', { roomId, playerId: socket.id });
    io.to(roomId).emit('playerJoined', { players: room.players });
    
    // If two players, start the game after a countdown
    if (room.players.length === 2) {
      setTimeout(() => {
        room.gameStarted = true;
        io.to(roomId).emit('gameStart', { players: room.players });
      }, 3000);
    }
  });

  // Player jump event
  socket.on('playerJump', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.velocity = -8; // Jump velocity
      io.to(roomId).emit('playerJumped', { playerId: socket.id });
    }
  });
  
  // Update player position
  socket.on('updatePosition', ({ roomId, x, y }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.x = x;
      player.y = y;
      io.to(roomId).emit('gameUpdate', { players: room.players, pipes: room.pipes });
    }
  });
  
  // Handle pipe generation
  socket.on('generatePipe', ({ roomId, pipe }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    // Only host player generates pipes to avoid duplicates
    if (room.players[0].id === socket.id) {
      room.pipes.push(pipe);
      io.to(roomId).emit('newPipe', { pipe });
    }
  });
  
  // Handle pipe movement
  socket.on('movePipes', ({ roomId, pipes }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    // Only host player updates pipes
    if (room.players[0].id === socket.id) {
      room.pipes = pipes;
      io.to(roomId).emit('pipesUpdated', { pipes });
    }
  });
  
  // Game over
  socket.on('gameOver', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    io.to(roomId).emit('gameEnded', { message: 'Game Over!' });
    
    // Reset game after 3 seconds
    setTimeout(() => {
      if (rooms[roomId]) {
        rooms[roomId].pipes = [];
        rooms[roomId].players.forEach(player => {
          player.y = 300;
          player.score = 0;
        });
        io.to(roomId).emit('gameReset', { players: rooms[roomId].players });
      }
    }, 3000);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Find and clean up rooms where this socket was a player
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        
        if (room.players.length === 0) {
          // Delete room if empty
          delete rooms[roomId];
          console.log(`Room ${roomId} deleted (empty)`);
        } else {
          // Notify remaining players
          io.to(roomId).emit('playerLeft', { 
            playerId: socket.id,
            players: room.players
          });
        }
      }
    }
  });
});

// Generate a random room ID
function generateRoomId() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 