// Connect to the Socket.IO server
const socket = io();

// Game variables
let canvas, ctx;
let playerId;
let isHost = false;
let players = [];
let pipes = [];
let gameStarted = false;
let score = 0;
let myBird;
let gravity = 0.3;
let gameSpeed = 3;
let pipeGap = 150;
let pipeWidth = 80;
let pipeSpawnInterval = 90;
let frameCount = 0;
let gameOver = false;
let currentRoom = null;
let roomStatus = {};
let isSinglePlayer = false;
let singlePlayerGameLoop;

// Bird colors for different players
const birdColors = ['yellow', 'red'];

// DOM Elements
const menuScreen = document.getElementById('menu');
const waitingScreen = document.getElementById('waitingScreen');
const fullScreen = document.getElementById('fullScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const playerInfoDisplay = document.getElementById('playerInfo');
const playerScoreDisplay = document.getElementById('playerScore');
const finalScoreDisplay = document.getElementById('finalScore');
const gameCanvasElement = document.getElementById('gameCanvas');
const gameRoomId = document.getElementById('gameRoomId');
const currentRoomId = document.getElementById('currentRoomId');
const roomList = document.getElementById('roomList');
const singlePlayerBtn = document.getElementById('singlePlayerBtn');

// Initialize game when page loads
window.onload = function() {
    console.log("Window loaded");
    initCanvas();
    setupEventListeners();
    updateRoomStatus();
    setInterval(updateRoomStatus, 3000);
    setupSocketEventDebugging();
};

// Setup event listeners
function setupEventListeners() {
    console.log("Setting up event listeners");
    
    // Single player button
    if (singlePlayerBtn) {
        console.log("Single player button found");
        singlePlayerBtn.onclick = startSinglePlayer;
    } else {
        console.error("Single player button not found!");
    }
    
    // Other button listeners
    document.getElementById('cancelWaitingBtn').addEventListener('click', backToMainMenu);
    document.getElementById('backToMenuBtn').addEventListener('click', backToMainMenu);
    document.getElementById('playAgainBtn').addEventListener('click', resetGame);
    document.getElementById('mainMenuBtn').addEventListener('click', backToMainMenu);
    
    // Space key for jump
    document.addEventListener('keydown', function(e) {
        if (e.code === 'Space') {
            e.preventDefault(); // Prevent scrolling
            jump();
        }
    });
    
    // Add touch event for mobile
    document.addEventListener('touchstart', function(e) {
        e.preventDefault();
        jump();
    }, { passive: false });
    
    console.log("Event listeners set up");
}

// Single player mode - completely independent from multiplayer
function startSinglePlayer() {
    console.log("Starting single player mode");
    isSinglePlayer = true;
    currentRoom = "single";
    
    // Reset state
    score = 0;
    pipes = [];
    frameCount = 0;
    gameOver = false;
    
    // Initialize canvas if not already done
    if (!canvas) {
        initCanvas();
    }
    
    // Create player bird
    myBird = {
        id: 'player',
        x: 100,
        y: 300,
        velocity: 0
    };
    
    // Show game UI
    menuScreen.style.display = 'none';
    gameCanvasElement.style.display = 'block';
    playerInfoDisplay.style.display = 'block';
    gameRoomId.textContent = "Single Player";
    playerScoreDisplay.textContent = "Score: 0";
    
    // Start game loop
    gameStarted = true;
    if (singlePlayerGameLoop) {
        cancelAnimationFrame(singlePlayerGameLoop);
    }
    singlePlayerGameLoop = requestAnimationFrame(singlePlayerGameUpdate);
    
    console.log("Single player mode started");
}

// Initialize the game canvas
function initCanvas() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    canvas.width = 800;
    canvas.height = 600;
}

// Join the game
function joinGame() {
    socket.emit('joinGame');
    menuScreen.style.display = 'none';
    waitingScreen.style.display = 'block';
}

// Back to main menu
function backToMainMenu() {
    // Hide all screens
    menuScreen.style.display = 'block';
    waitingScreen.style.display = 'none';
    fullScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';
    gameCanvasElement.style.display = 'none';
    playerInfoDisplay.style.display = 'none';
    
    // Cancel any game loops
    if (singlePlayerGameLoop) {
        cancelAnimationFrame(singlePlayerGameLoop);
    }
    
    // Reset game state
    resetGameState();
    isSinglePlayer = false;
    currentRoom = null;
    
    if (!isSinglePlayer) {
        // Force disconnect and reconnect for multiplayer
        socket.disconnect();
        socket.connect();
    }
}

// Reset game state
function resetGameState() {
    players = [];
    pipes = [];
    gameStarted = false;
    score = 0;
    frameCount = 0;
    gameOver = false;
    updateScoreDisplay();
}

// Reset game to play again
function resetGame() {
    gameOverScreen.style.display = 'none';
    
    if (isSinglePlayer) {
        startSinglePlayer();
    } else {
        resetGameState();
        joinRoom(currentRoom);
    }
}

// Start game
function startGame() {
    initCanvas();
    gameCanvasElement.style.display = 'block';
    playerInfoDisplay.style.display = 'block';
    waitingScreen.style.display = 'none';
    gameStarted = true;
    
    // Find my bird
    myBird = players.find(player => player.id === playerId);
    
    // Start the game loop
    gameLoop();
}

// Game loop
function gameLoop() {
    if (gameOver) return;
    
    update();
    draw();
    frameCount++;
    
    requestAnimationFrame(gameLoop);
}

// Update game state
function update() {
    if (!gameStarted) return;
    
    // Update my bird
    if (myBird) {
        myBird.velocity = myBird.velocity || 0;
        myBird.velocity += gravity;
        myBird.y += myBird.velocity;
        
        // Send position update to server
        socket.emit('updatePosition', {
            roomId: currentRoom,
            x: myBird.x,
            y: myBird.y
        });
        
        // Check if my bird went off screen (ceiling or floor)
        if (myBird.y <= 0 || myBird.y >= canvas.height - 30) {
            handleGameOver();
        }
    }
    
    // Generate new pipe
    if (frameCount % pipeSpawnInterval === 0 && !gameOver) {
        if (isHost || isSinglePlayer) {
            // Only host player or single player generates pipes
            const gapPosition = Math.floor(Math.random() * (canvas.height - 300)) + 100;
            const newPipe = {
                x: canvas.width,
                top: gapPosition,
                bottom: canvas.height - gapPosition - pipeGap,
                width: pipeWidth,
                passed: false
            };
            
            pipes.push(newPipe);
            socket.emit('generatePipe', { 
                roomId: currentRoom,
                pipe: newPipe 
            });
        }
    }
    
    // Update pipes
    for (let i = pipes.length - 1; i >= 0; i--) {
        pipes[i].x -= gameSpeed;
        
        // Remove off-screen pipes
        if (pipes[i].x + pipeWidth < 0) {
            pipes.splice(i, 1);
            continue;
        }
        
        // Check if pipe was passed for scoring
        if (!pipes[i].passed && pipes[i].x + pipeWidth < myBird.x) {
            pipes[i].passed = true;
            score++;
            updateScoreDisplay();
        }
        
        // Check collision with pipes
        if (myBird && 
            myBird.x < pipes[i].x + pipeWidth &&
            myBird.x + 40 > pipes[i].x &&
            (myBird.y < pipes[i].top || myBird.y + 30 > canvas.height - pipes[i].bottom)) {
            handleGameOver();
        }
    }
    
    // Send updated pipes to server (only if host)
    if (isHost) {
        socket.emit('movePipes', { pipes });
    }
}

// Draw game elements
function draw() {
    if (!gameStarted) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background (simple sky color)
    ctx.fillStyle = '#70c5ce';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw pipes
    ctx.fillStyle = 'green';
    pipes.forEach(pipe => {
        ctx.fillRect(pipe.x, 0, pipe.width, pipe.top);
        ctx.fillRect(pipe.x, canvas.height - pipe.bottom, pipe.width, pipe.bottom);
    });
    
    // Draw players' birds with labels
    players.forEach((player, index) => {
        const color = birdColors[index % birdColors.length];
        ctx.fillStyle = color;
        ctx.fillRect(player.x, player.y, 40, 30);
        
        // Draw player label
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        const label = player.id === playerId ? 'You' : 'Other Player';
        ctx.fillText(label, player.x + 20, player.y - 10);
        
        // Add outline to make text more visible
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.strokeText(label, player.x + 20, player.y - 10);
    });
    
    // Show player info
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Room ${currentRoom} - ${isHost ? 'Host' : 'Guest'}`, 10, 30);
}

// Handle game over
function handleGameOver() {
    if (gameOver) return;
    
    gameOver = true;
    socket.emit('gameOver', { roomId: currentRoom });
    
    finalScoreDisplay.textContent = `Your Score: ${score}`;
    gameCanvasElement.style.display = 'none';
    playerInfoDisplay.style.display = 'none';
    gameOverScreen.style.display = 'block';
}

// Update score display
function updateScoreDisplay() {
    playerScoreDisplay.textContent = `Score: ${score}`;
}

// Handle player jump
function jump() {
    if (!gameStarted || gameOver || !myBird) return;
    
    if (isSinglePlayer && myBird) {
        myBird.velocity = -8;
    } else if (myBird) {
        myBird.velocity = -8;
        socket.emit('playerJump', { roomId: currentRoom });
    }
}

// Listen for space bar to make the bird jump
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        jump();
        e.preventDefault(); // Prevent scrolling
    }
});

// For mobile: touch to jump
gameCanvasElement.addEventListener('touchstart', (e) => {
    jump();
    e.preventDefault(); // Prevent scrolling
});

// Socket event handlers
socket.on('gameJoined', (data) => {
    playerId = data.playerId;
    isHost = data.isHost;
});

socket.on('roomFull', (data) => {
    waitingScreen.style.display = 'none';
    fullScreen.style.display = 'block';
});

socket.on('playerJoined', (data) => {
    players = data.players;
});

socket.on('gameStart', (data) => {
    players = data.players;
    isSinglePlayer = data.isSinglePlayer || false;
    startGame();
});

socket.on('playerJumped', (data) => {
    const jumpingPlayer = players.find(player => player.id === data.playerId);
    if (jumpingPlayer && jumpingPlayer.id !== playerId) {
        jumpingPlayer.velocity = -8;
    }
});

socket.on('gameUpdate', (data) => {
    const updatedPlayers = data.players;
    
    // Update player positions received from server but keep my bird's position locally
    if (myBird) {
        updatedPlayers.forEach(player => {
            if (player.id !== playerId) {
                const existingPlayer = players.find(p => p.id === player.id);
                if (existingPlayer) {
                    existingPlayer.x = player.x;
                    existingPlayer.y = player.y;
                }
            }
        });
    } else {
        players = updatedPlayers;
    }
    
    // Only update pipes if received from host
    if (!isHost) {
        pipes = data.pipes;
    }
});

socket.on('newPipe', (data) => {
    // Only add if not host (host generates pipes locally)
    if (!isHost) {
        pipes.push(data.pipe);
    }
});

socket.on('pipesUpdated', (data) => {
    // Only update if not host (host updates pipes locally)
    if (!isHost) {
        pipes = data.pipes;
    }
});

socket.on('playerLeft', (data) => {
    players = data.players;
    
    // If other player left, show game over
    if (gameStarted && !gameOver) {
        alert('Other player left the game');
        handleGameOver();
    }
});

socket.on('gameEnded', (data) => {
    handleGameOver();
});

socket.on('gameReset', (data) => {
    console.log('Game reset event received:', data);
    players = data.players;
    pipes = [];
    gameOver = false;
    score = 0;
    updateScoreDisplay();
    
    // Find my bird again
    myBird = players.find(player => player.id === playerId);
    
    // Restart game
    if (!gameStarted) {
        startGame();
    } else {
        gameCanvasElement.style.display = 'block';
        playerInfoDisplay.style.display = 'block';
        gameOverScreen.style.display = 'none';
    }
});

// Update room status display
function updateRoomStatus() {
    if (!isSinglePlayer) {
        socket.emit('getRoomStatus');
    }
}

// Create room cards
function createRoomCards() {
    if (isSinglePlayer) return;

    roomList.innerHTML = '';
    for (let roomId = 1; roomId <= 4; roomId++) {
        const room = roomStatus[roomId] || { players: 0, gameStarted: false };
        const card = document.createElement('div');
        card.className = `room-card ${room.players >= 2 ? 'full' : ''} ${room.gameStarted ? 'active' : ''}`;
        card.innerHTML = `
            <h2>Room ${roomId}</h2>
            <div class="player-count">${room.players}/2</div>
            <div class="room-status">${room.gameStarted ? 'Game in Progress' : 'Waiting for Players'}</div>
        `;
        
        if (room.players < 2) {
            card.onclick = () => joinRoom(roomId);
        }
        
        roomList.appendChild(card);
    }
}

// Join a specific room
function joinRoom(roomId) {
    isSinglePlayer = false;
    currentRoom = roomId;
    currentRoomId.textContent = roomId;
    gameRoomId.textContent = roomId;
    
    resetGameState();
    
    socket.emit('joinRoom', roomId);
    menuScreen.style.display = 'none';
    waitingScreen.style.display = 'block';
}

// Setup socket event debugging
function setupSocketEventDebugging() {
    // Listen for socket connection events
    socket.on('connect', () => {
        console.log('Socket connected with ID:', socket.id);
    });
    
    socket.on('disconnect', () => {
        console.log('Socket disconnected');
    });
    
    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
    });
    
    // Debug specific game events
    socket.on('roomJoined', (data) => {
        console.log('Room joined event received:', data);
        playerId = data.playerId;
        isHost = data.isHost;
        currentRoom = data.roomId;
        isSinglePlayer = data.isSinglePlayer || false;
        
        // If it's a regular room, show room ID
        if (!isSinglePlayer) {
            gameRoomId.textContent = currentRoom;
        } else {
            // For single player, show "Single Player" instead
            gameRoomId.textContent = "Single Player";
        }
    });
    
    socket.on('gameStart', (data) => {
        console.log('Game start event received:', data);
        players = data.players;
        isSinglePlayer = data.isSinglePlayer || false;
        startGame();
    });
    
    socket.on('gameReset', (data) => {
        console.log('Game reset event received:', data);
        players = data.players;
        pipes = [];
        gameOver = false;
        score = 0;
        updateScoreDisplay();
        
        // Find my bird again
        myBird = players.find(player => player.id === playerId);
        
        // Restart game
        if (!gameStarted) {
            startGame();
        } else {
            gameCanvasElement.style.display = 'block';
            playerInfoDisplay.style.display = 'block';
            gameOverScreen.style.display = 'none';
        }
    });
    
    socket.on('roomStatus', (status) => {
        console.log('Room status update received:', status);
        roomStatus = status;
        createRoomCards();
    });
}

// Single player game loop
function singlePlayerGameUpdate() {
    if (gameOver || !isSinglePlayer) return;
    
    // Update bird physics
    myBird.velocity += gravity;
    myBird.y += myBird.velocity;
    
    // Check collisions with floor/ceiling
    if (myBird.y <= 0 || myBird.y >= canvas.height - 30) {
        singlePlayerGameOver();
        return;
    }
    
    // Generate new pipes
    if (frameCount % pipeSpawnInterval === 0) {
        const gapPosition = Math.floor(Math.random() * (canvas.height - 300)) + 100;
        const newPipe = {
            x: canvas.width,
            top: gapPosition,
            bottom: canvas.height - gapPosition - pipeGap,
            width: pipeWidth,
            passed: false
        };
        pipes.push(newPipe);
    }
    
    // Update pipes
    for (let i = pipes.length - 1; i >= 0; i--) {
        pipes[i].x -= gameSpeed;
        
        // Remove off-screen pipes
        if (pipes[i].x + pipeWidth < 0) {
            pipes.splice(i, 1);
            continue;
        }
        
        // Score points when passing pipes
        if (!pipes[i].passed && pipes[i].x + pipeWidth < myBird.x) {
            pipes[i].passed = true;
            score++;
            playerScoreDisplay.textContent = `Score: ${score}`;
        }
        
        // Check collision with pipes
        if (myBird.x < pipes[i].x + pipeWidth &&
            myBird.x + 40 > pipes[i].x &&
            (myBird.y < pipes[i].top || myBird.y + 30 > canvas.height - pipes[i].bottom)) {
            singlePlayerGameOver();
            return;
        }
    }
    
    // Draw everything
    singlePlayerDraw();
    
    frameCount++;
    singlePlayerGameLoop = requestAnimationFrame(singlePlayerGameUpdate);
}

// Draw single player game
function singlePlayerDraw() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background
    ctx.fillStyle = '#70c5ce';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw pipes
    ctx.fillStyle = 'green';
    pipes.forEach(pipe => {
        ctx.fillRect(pipe.x, 0, pipe.width, pipe.top);
        ctx.fillRect(pipe.x, canvas.height - pipe.bottom, pipe.width, pipe.bottom);
    });
    
    // Draw player bird
    ctx.fillStyle = 'yellow';
    ctx.fillRect(myBird.x, myBird.y, 40, 30);
}

// Handle game over for single player
function singlePlayerGameOver() {
    gameOver = true;
    cancelAnimationFrame(singlePlayerGameLoop);
    
    finalScoreDisplay.textContent = `Your Score: ${score}`;
    gameCanvasElement.style.display = 'none';
    playerInfoDisplay.style.display = 'none';
    gameOverScreen.style.display = 'block';
} 