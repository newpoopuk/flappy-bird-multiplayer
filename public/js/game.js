// Connect to the Socket.IO server
const socket = io();

// Game variables
let canvas, ctx;
let roomId, playerId;
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

// Bird colors for different players
const birdColors = ['yellow', 'red'];

// DOM Elements
const menuScreen = document.getElementById('menu');
const joinMenuScreen = document.getElementById('joinMenu');
const waitingScreen = document.getElementById('waitingScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const roomCodeDisplay = document.getElementById('roomCode');
const roomIdInput = document.getElementById('roomIdInput');
const playerInfoDisplay = document.getElementById('playerInfo');
const playerScoreDisplay = document.getElementById('playerScore');
const finalScoreDisplay = document.getElementById('finalScore');
const gameCanvasElement = document.getElementById('gameCanvas');

// Button event listeners
document.getElementById('createRoomBtn').addEventListener('click', createRoom);
document.getElementById('joinRoomBtn').addEventListener('click', showJoinMenu);
document.getElementById('joinGameBtn').addEventListener('click', joinRoom);
document.getElementById('backToMenuBtn').addEventListener('click', backToMainMenu);
document.getElementById('cancelWaitingBtn').addEventListener('click', backToMainMenu);
document.getElementById('playAgainBtn').addEventListener('click', resetGame);
document.getElementById('mainMenuBtn').addEventListener('click', backToMainMenu);

// Initialize the game canvas
function initCanvas() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    canvas.width = 800;
    canvas.height = 600;
}

// Create a new game room
function createRoom() {
    socket.emit('createRoom');
    menuScreen.style.display = 'none';
    waitingScreen.style.display = 'block';
}

// Show join menu
function showJoinMenu() {
    menuScreen.style.display = 'none';
    joinMenuScreen.style.display = 'block';
}

// Join an existing room
function joinRoom() {
    const roomIdToJoin = roomIdInput.value.trim().toUpperCase();
    if (roomIdToJoin) {
        socket.emit('joinRoom', roomIdToJoin);
    }
}

// Back to main menu
function backToMainMenu() {
    // Hide all screens
    menuScreen.style.display = 'block';
    joinMenuScreen.style.display = 'none';
    waitingScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';
    gameCanvasElement.style.display = 'none';
    playerInfoDisplay.style.display = 'none';
    
    // Reset game state
    resetGameState();
    
    // Leave the room
    if (roomId) {
        // No need for a socket event here since the server handles disconnects
        roomId = null;
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
    gameCanvasElement.style.display = 'block';
    resetGameState();
    // Let server know we're ready to start again
    if (roomId) {
        socket.emit('gameReset', { roomId });
    }
}

// Start game
function startGame() {
    initCanvas();
    gameCanvasElement.style.display = 'block';
    playerInfoDisplay.style.display = 'block';
    waitingScreen.style.display = 'none';
    joinMenuScreen.style.display = 'none';
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
            roomId,
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
        if (players.length > 0 && players[0].id === playerId) {
            // Only host player generates pipes
            const gapPosition = Math.floor(Math.random() * (canvas.height - 300)) + 100;
            const newPipe = {
                x: canvas.width,
                top: gapPosition,
                bottom: canvas.height - gapPosition - pipeGap,
                width: pipeWidth,
                passed: false
            };
            
            pipes.push(newPipe);
            socket.emit('generatePipe', { roomId, pipe: newPipe });
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
    if (players.length > 0 && players[0].id === playerId) {
        socket.emit('movePipes', { roomId, pipes });
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
    
    // Draw players' birds
    players.forEach((player, index) => {
        const color = birdColors[index % birdColors.length];
        ctx.fillStyle = color;
        ctx.fillRect(player.x, player.y, 40, 30);
    });
}

// Handle game over
function handleGameOver() {
    if (gameOver) return;
    
    gameOver = true;
    socket.emit('gameOver', { roomId });
    
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
    
    myBird.velocity = -8;
    socket.emit('playerJump', { roomId });
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
socket.on('roomCreated', (data) => {
    roomId = data.roomId;
    playerId = data.playerId;
    roomCodeDisplay.textContent = roomId;
});

socket.on('roomJoined', (data) => {
    roomId = data.roomId;
    playerId = data.playerId;
    joinMenuScreen.style.display = 'none';
    waitingScreen.style.display = 'block';
    roomCodeDisplay.textContent = roomId;
});

socket.on('joinError', (data) => {
    alert(data.message);
});

socket.on('playerJoined', (data) => {
    players = data.players;
});

socket.on('gameStart', (data) => {
    players = data.players;
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
    if (players.length > 0 && players[0].id !== playerId) {
        pipes = data.pipes;
    }
});

socket.on('newPipe', (data) => {
    // Only add if not host (host generates pipes locally)
    if (players.length > 0 && players[0].id !== playerId) {
        pipes.push(data.pipe);
    }
});

socket.on('pipesUpdated', (data) => {
    // Only update if not host (host updates pipes locally)
    if (players.length > 0 && players[0].id !== playerId) {
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