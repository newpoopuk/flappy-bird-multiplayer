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
    socket.emit('roomStatus', roomStatus);
  });

  // Start single player game
  socket.on('startSinglePlayer', () => {
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
    
    socket.join("single");
    
    socket.emit('roomJoined', { 
      roomId: "single", 
      playerId: socket.id, 
      isHost: true,
      isSinglePlayer: true
    });
    
    // Start the game immediately for single player
    room.gameStarted = true;
    socket.emit('gameStart', { 
      players: room.players,
      isSinglePlayer: true
    });
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
      score: 0 
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
      setTimeout(() => {
        room.gameStarted = true;
        io.to(roomId).emit('gameStart', { 
          players: room.players 
        });
        
        // Update room status for all clients
        io.emit('roomStatusUpdate', {
          roomId: roomId,
          players: room.players.length,
          maxPlayers: 2,
          gameStarted: true
        });
      }, 3000);
    }
  });

  // Player jump event
  socket.on('playerJump', ({ roomId }) => {
    const room = gameRooms[roomId];
    if (!room) return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.velocity = -8; // Jump velocity
      io.to(roomId).emit('playerJumped', { playerId: socket.id });
    }
  });
  
  // Update player position
  socket.on('updatePosition', ({ roomId, x, y }) => {
    const room = gameRooms[roomId];
    if (!room) return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.x = x;
      player.y = y;
      io.to(roomId).emit('gameUpdate', { 
        players: room.players, 
        pipes: room.pipes 
      });
    }
  });
  
  // Handle pipe generation
  socket.on('generatePipe', ({ roomId, pipe }) => {
    const room = gameRooms[roomId];
    if (!room) return;
    
    // Only host player generates pipes to avoid duplicates
    const isHost = room.players.length > 0 && room.players[0].id === socket.id;
    if (isHost || room.isSinglePlayer) {
      room.pipes.push(pipe);
      io.to(roomId).emit('newPipe', { pipe });
    }
  });
  
  // Handle pipe movement
  socket.on('movePipes', ({ roomId, pipes }) => {
    const room = gameRooms[roomId];
    if (!room) return;
    
    // Only host player updates pipes
    const isHost = room.players.length > 0 && room.players[0].id === socket.id;
    if (isHost || room.isSinglePlayer) {
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