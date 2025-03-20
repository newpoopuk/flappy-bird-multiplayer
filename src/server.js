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

// Single game room
const gameRoom = {
  id: 'flappy-bird',
  players: [],
  pipes: [],
  gameStarted: false
};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Join the single game room
  socket.on('joinGame', () => {
    // Maximum 2 players
    if (gameRoom.players.length >= 2) {
      socket.emit('roomFull', { message: 'Game room is full. Try again later.' });
      return;
    }
    
    // Add player to the room
    const isFirstPlayer = gameRoom.players.length === 0;
    const playerX = isFirstPlayer ? 100 : 150;
    
    gameRoom.players.push({ 
      id: socket.id, 
      x: playerX, 
      y: 300, 
      score: 0 
    });
    
    socket.join(gameRoom.id);
    
    socket.emit('gameJoined', { 
      roomId: gameRoom.id, 
      playerId: socket.id, 
      isHost: isFirstPlayer 
    });
    
    io.to(gameRoom.id).emit('playerJoined', { 
      players: gameRoom.players 
    });
    
    // If two players, start the game after a countdown
    if (gameRoom.players.length === 2) {
      setTimeout(() => {
        gameRoom.gameStarted = true;
        io.to(gameRoom.id).emit('gameStart', { 
          players: gameRoom.players 
        });
      }, 3000);
    }
  });

  // Player jump event
  socket.on('playerJump', () => {
    const player = gameRoom.players.find(p => p.id === socket.id);
    if (player) {
      player.velocity = -8; // Jump velocity
      io.to(gameRoom.id).emit('playerJumped', { playerId: socket.id });
    }
  });
  
  // Update player position
  socket.on('updatePosition', ({ x, y }) => {
    const player = gameRoom.players.find(p => p.id === socket.id);
    if (player) {
      player.x = x;
      player.y = y;
      io.to(gameRoom.id).emit('gameUpdate', { 
        players: gameRoom.players, 
        pipes: gameRoom.pipes 
      });
    }
  });
  
  // Handle pipe generation
  socket.on('generatePipe', ({ pipe }) => {
    // Only host player generates pipes to avoid duplicates
    const isHost = gameRoom.players.length > 0 && gameRoom.players[0].id === socket.id;
    if (isHost) {
      gameRoom.pipes.push(pipe);
      io.to(gameRoom.id).emit('newPipe', { pipe });
    }
  });
  
  // Handle pipe movement
  socket.on('movePipes', ({ pipes }) => {
    // Only host player updates pipes
    const isHost = gameRoom.players.length > 0 && gameRoom.players[0].id === socket.id;
    if (isHost) {
      gameRoom.pipes = pipes;
      io.to(gameRoom.id).emit('pipesUpdated', { pipes });
    }
  });
  
  // Game over
  socket.on('gameOver', () => {
    io.to(gameRoom.id).emit('gameEnded', { message: 'Game Over!' });
    
    // Reset game after 3 seconds
    setTimeout(() => {
      gameRoom.pipes = [];
      gameRoom.players.forEach(player => {
        player.y = 300;
        player.score = 0;
      });
      io.to(gameRoom.id).emit('gameReset', { players: gameRoom.players });
    }, 3000);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    const playerIndex = gameRoom.players.findIndex(p => p.id === socket.id);
    
    if (playerIndex !== -1) {
      gameRoom.players.splice(playerIndex, 1);
      
      // Notify remaining players
      io.to(gameRoom.id).emit('playerLeft', { 
        playerId: socket.id,
        players: gameRoom.players
      });
      
      // Reset game state if game was in progress
      if (gameRoom.gameStarted && gameRoom.players.length < 2) {
        gameRoom.gameStarted = false;
        gameRoom.pipes = [];
      }
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 