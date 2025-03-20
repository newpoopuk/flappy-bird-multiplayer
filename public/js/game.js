// Connect to Socket.IO server
const socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
});

// Game canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

// Bird settings
const bird = {
    x: 100,
    y: 300,
    width: 40,
    height: 30,
    velocity: 0,
    jumpStrength: -8,  // upward force when jumping
    maxFallSpeed: 12   // maximum downward velocity
};

// Physics settings
const gravity = 0.3;  // gravitational acceleration

// Pipe settings
const pipeGap = 150;
const pipeWidth = 80;
const pipeSpawnInterval = 90; // in frames
const gameSpeed = 3;
let pipes = [];

// Game state
let frameCount = 0;
let score = 0;
let gameOver = false;
let isSinglePlayer = false;
let currentRoom = null;
let isHost = false;
let playerId = null;
let players = [];
let myPlayer = null;

// Bird colors with better contrast
const BIRD_COLORS = ['#FFD700', '#FF4444', '#4444FF', '#44FF44'];

// Connection status indicator
const connectionIndicator = document.createElement('div');
connectionIndicator.id = 'connection-status';
connectionIndicator.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    padding: 5px 10px;
    border-radius: 5px;
    font-size: 12px;
    font-weight: bold;
    color: white;
    background-color: gray;
`;
document.body.appendChild(connectionIndicator);

// DOM Elements
const menuScreen = document.getElementById('menu');
const waitingScreen = document.getElementById('waitingScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const playerInfoDisplay = document.getElementById('playerInfo');
const playerScoreDisplay = document.getElementById('playerScore');
const finalScoreDisplay = document.getElementById('finalScore');
const gameCanvasElement = canvas;
const gameRoomId = document.getElementById('gameRoomId');
const currentRoomId = document.getElementById('currentRoomId');
const roomList = document.getElementById('roomList');

// Debug logging
function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

// Initialize game when page loads
window.onload = function() {
    log('Window loaded');
    setupEventListeners();
    setupSocketEventHandlers();
    updateRoomStatus();
    setInterval(updateRoomStatus, 3000); // Update room status every 3 seconds
};

// Setup event listeners
function setupEventListeners() {
    log('Setting up event listeners');
    
    // Button listeners
    document.getElementById('singlePlayerBtn').onclick = startSinglePlayer;
    document.getElementById('cancelWaitingBtn').onclick = backToMainMenu;
    document.getElementById('playAgainBtn').onclick = resetGame;
    document.getElementById('mainMenuBtn').onclick = backToMainMenu;

    // Space key for jump
    document.addEventListener('keydown', function(e) {
        if (e.code === 'Space') {
            e.preventDefault();
            jump();
        }
    });

    // Touch event for mobile
    canvas.addEventListener('touchstart', function(e) {
        e.preventDefault();
        jump();
    });
}

// Setup Socket.IO event handlers
function setupSocketEventHandlers() {
    // Connection events
    socket.on('connect', () => {
        log('Connected to server with ID: ' + socket.id);
        connectionIndicator.textContent = 'Connected';
        connectionIndicator.style.backgroundColor = '#4CAF50';
        updateRoomStatus(); // Request room status immediately on connect
    });
    
    socket.on('disconnect', () => {
        log('Disconnected from server');
        connectionIndicator.textContent = 'Disconnected';
        connectionIndicator.style.backgroundColor = '#F44336';
    });
    
    socket.on('connect_error', (error) => {
        log('Connection error: ' + error);
        connectionIndicator.textContent = 'Connection Error';
        connectionIndicator.style.backgroundColor = '#FF9800';
    });

    // Game events
    socket.on('roomStatus', (status) => {
        log('Room status received: ' + JSON.stringify(status));
        createRoomCards(status);
    });

    socket.on('roomJoined', (data) => {
        log('Joined room: ' + data.roomId);
        currentRoom = data.roomId;
        playerId = data.playerId;
        isHost = data.isHost;
        gameRoomId.textContent = `Room ${currentRoom}`;
        
        if (data.players) {
            players = data.players;
            log('Players in room: ' + players.length);
        }
    });

    socket.on('playerJoined', (data) => {
        log('Player joined, total players: ' + data.players.length);
        players = data.players;
    });

    socket.on('gameStart', (data) => {
        log('Game starting with ' + data.players.length + ' players');
        players = data.players;
        pipes = data.pipes || [];
        frameCount = data.frameCount || 0;
        
        // Find and store my player reference
        myPlayer = players.find(p => p.id === playerId);
        if (myPlayer) {
            bird.x = myPlayer.x;
            bird.y = myPlayer.y;
            bird.velocity = myPlayer.velocity;
        }
        
        resetLocalState();
        startGame();
    });

    socket.on('playerJumped', (data) => {
        // Update the player who jumped
        const player = players.find(p => p.id === data.playerId);
        if (player) {
            player.velocity = data.velocity;
        }
    });

    socket.on('gameUpdate', (data) => {
        // Update all game state from server
        if (isSinglePlayer) return;
        
        players = data.players;
        pipes = data.pipes;
        
        // Update local player state
        myPlayer = players.find(p => p.id === playerId);
        if (myPlayer) {
            // Smooth position update
            bird.x = myPlayer.x;
            bird.y = myPlayer.y;
            bird.velocity = myPlayer.velocity;
            
            score = myPlayer.score;
            updateScoreDisplay();
            
            if (myPlayer.dead && !gameOver) {
                gameOver = true;
                handleGameOver();
            }
        }
    });

    socket.on('gameEnded', (data) => {
        log('Game ended');
        gameOver = true;
        if (data && data.players) {
            players = data.players;
            const myPlayer = players.find(p => p.id === playerId);
            if (myPlayer) {
                score = myPlayer.score;
            }
        }
        handleGameOver();
    });

    socket.on('playerLeft', (data) => {
        log('Player left, remaining players: ' + data.players.length);
        players = data.players;
        if (!isSinglePlayer && currentRoom) {
            handleGameOver();
        }
    });

    socket.on('roomFull', () => {
        log('Room is full');
        alert('This room is full. Please try another room.');
        backToMainMenu();
    });
}

function resetLocalState() {
    frameCount = 0;
    score = 0;
    gameOver = false;
    bird.y = 300;
    bird.velocity = 0;
}

// Game functions
function startSinglePlayer() {
    log('Starting single player mode');
    isSinglePlayer = true;
    currentRoom = 'single';
    resetLocalState();
    pipes = [];
    
    menuScreen.style.display = 'none';
    canvas.style.display = 'block';
    playerInfoDisplay.style.display = 'block';
    gameRoomId.textContent = 'Single Player';
    updateScoreDisplay();
    
    // Create a player object for single player mode
    players = [{
        id: 'local',
        x: bird.x,
        y: bird.y,
        score: 0,
        velocity: 0,
        dead: false
    }];
    
    startGame();
}

function joinRoom(roomId) {
    log('Attempting to join room: ' + roomId);
    socket.emit('joinRoom', roomId);
    menuScreen.style.display = 'none';
    waitingScreen.style.display = 'block';
    currentRoomId.textContent = roomId;
}

function backToMainMenu() {
    log('Returning to main menu');
    menuScreen.style.display = 'block';
    waitingScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';
    canvas.style.display = 'none';
    playerInfoDisplay.style.display = 'none';
    
    if (!isSinglePlayer && currentRoom) {
        socket.emit('leaveRoom', { roomId: currentRoom });
    }
    
    resetLocalState();
    pipes = [];
    players = [];
    currentRoom = null;
    isSinglePlayer = false;
}

function resetGame() {
    log('Resetting game');
    gameOverScreen.style.display = 'none';
    
    if (isSinglePlayer) {
        startSinglePlayer();
    } else {
        joinRoom(currentRoom);
    }
}

function startGame() {
    log('Starting game');
    waitingScreen.style.display = 'none';
    canvas.style.display = 'block';
    playerInfoDisplay.style.display = 'block';
    gameLoop();
}

function jump() {
    if (gameOver) return;
    
    if (isSinglePlayer) {
        bird.velocity = bird.jumpStrength;
        players[0].velocity = bird.velocity;
    } else {
        // Find my player
        const myPlayer = players.find(p => p.id === playerId);
        if (myPlayer && !myPlayer.dead) {
            myPlayer.velocity = bird.jumpStrength;
            socket.emit('playerJump', {
                roomId: currentRoom,
                velocity: bird.jumpStrength
            });
        }
    }
}

// Single player game update
function singlePlayerUpdate() {
    if (gameOver) return;
    
    // Bird physics
    bird.velocity += gravity;
    if (bird.velocity > bird.maxFallSpeed) {
        bird.velocity = bird.maxFallSpeed;
    }
    bird.y += bird.velocity;
    
    // Update the player object position
    players[0].y = bird.y;
    players[0].velocity = bird.velocity;
    
    // Check collisions
    if (bird.y < 0) {
        bird.y = 0;
        bird.velocity = 0;
        players[0].y = bird.y;
        players[0].velocity = bird.velocity;
    }
    
    if (bird.y + bird.height > canvas.height) {
        bird.y = canvas.height - bird.height;
        handleGameOver();
        return;
    }
    
    // Spawn pipes
    if (frameCount % pipeSpawnInterval === 0) {
        const gapY = Math.floor(Math.random() * (canvas.height - 300)) + 100;
        pipes.push({
            x: canvas.width,
            top: gapY,
            bottom: canvas.height - gapY - pipeGap,
            width: pipeWidth,
            passed: false
        });
    }
    
    // Update pipes
    for (let i = pipes.length - 1; i >= 0; i--) {
        pipes[i].x -= gameSpeed;
        
        // Remove off-screen pipes
        if (pipes[i].x + pipeWidth < 0) {
            pipes.splice(i, 1);
            continue;
        }
        
        // Collision check
        if (
            bird.x < pipes[i].x + pipeWidth &&
            bird.x + bird.width > pipes[i].x &&
            (bird.y < pipes[i].top || bird.y + bird.height > canvas.height - pipes[i].bottom)
        ) {
            handleGameOver();
            return;
        }
        
        // Score points
        if (!pipes[i].passed && pipes[i].x + pipeWidth < bird.x) {
            pipes[i].passed = true;
            score++;
            players[0].score = score;
            updateScoreDisplay();
        }
    }
    
    frameCount++;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw sky background
    ctx.fillStyle = '#70c5ce';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw pipes
    ctx.fillStyle = 'green';
    pipes.forEach(pipe => {
        // Draw pipe body
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(pipe.x, 0, pipe.width, pipe.top);
        ctx.fillRect(pipe.x, canvas.height - pipe.bottom, pipe.width, pipe.bottom);
        
        // Draw pipe edges
        ctx.fillStyle = '#27ae60';
        const edgeWidth = 3;
        ctx.fillRect(pipe.x - edgeWidth, 0, edgeWidth, pipe.top);
        ctx.fillRect(pipe.x + pipe.width, 0, edgeWidth, pipe.top);
        ctx.fillRect(pipe.x - edgeWidth, canvas.height - pipe.bottom, edgeWidth, pipe.bottom);
        ctx.fillRect(pipe.x + pipe.width, canvas.height - pipe.bottom, edgeWidth, pipe.bottom);
    });
    
    // Draw birds with improved visuals
    players.forEach((player, index) => {
        if (!player || player.dead) return;
        
        const isMe = player.id === playerId || (isSinglePlayer && index === 0);
        const colorIndex = isMe ? 0 : (index % (BIRD_COLORS.length - 1)) + 1;
        
        // Draw bird body
        ctx.fillStyle = BIRD_COLORS[colorIndex];
        ctx.beginPath();
        ctx.ellipse(
            player.x + bird.width/2,
            player.y + bird.height/2,
            bird.width/2,
            bird.height/2,
            0, 0, Math.PI * 2
        );
        ctx.fill();
        
        // Draw wing
        const wingOffset = Math.sin(frameCount * 0.3) * 5;
        ctx.beginPath();
        ctx.ellipse(
            player.x + bird.width/3,
            player.y + bird.height/2 + wingOffset,
            bird.width/4,
            bird.height/4,
            0, 0, Math.PI * 2
        );
        ctx.fill();
        
        // Draw player label with better visibility
        ctx.fillStyle = 'black';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        const label = isMe ? 'You' : 'Player ' + (index + 1);
        ctx.strokeText(label, player.x + bird.width/2, player.y - 15);
        ctx.fillText(label, player.x + bird.width/2, player.y - 15);
    });
    
    // Draw score with shadow for better visibility
    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.fillText(`Score: ${score}`, 10, 30);
    ctx.shadowBlur = 0;
}

function gameLoop() {
    if (gameOver) return;
    
    if (isSinglePlayer) {
        singlePlayerUpdate();
    }
    
    draw();
    requestAnimationFrame(gameLoop);
}

function handleGameOver() {
    log('Game over');
    gameOver = true;
    
    finalScoreDisplay.textContent = `Final Score: ${score}`;
    
    // Delay showing game over screen slightly for better user experience
    setTimeout(() => {
        canvas.style.display = 'none';
        playerInfoDisplay.style.display = 'none';
        gameOverScreen.style.display = 'block';
    }, 500);
}

function updateScoreDisplay() {
    playerScoreDisplay.textContent = `Score: ${score}`;
}

function updateRoomStatus() {
    log('Requesting room status');
    socket.emit('getRoomStatus');
}

function createRoomCards(roomStatus) {
    log('Creating room cards');
    roomList.innerHTML = '';
    
    for (const roomId in roomStatus) {
        const room = roomStatus[roomId];
        const card = document.createElement('div');
        card.className = 'room-card';
        if (room.players >= 2) card.className += ' full';
        if (room.gameStarted) card.className += ' active';
        
        card.innerHTML = `
            <h2>Room ${roomId}</h2>
            <div class="player-count">${room.players}/2</div>
            <div class="room-status">
                ${room.gameStarted ? 'Game in Progress' : 'Waiting for Players'}
            </div>
        `;
        
        if (room.players < 2 && !room.gameStarted) {
            card.onclick = () => joinRoom(roomId);
        }
        
        roomList.appendChild(card);
    }
} 