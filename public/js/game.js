// Connect to Socket.IO server
const socket = io({
    transports: ['websocket', 'polling']
});

// Game canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

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

// DOM Elements
const menuScreen = document.getElementById('menu');
const waitingScreen = document.getElementById('waitingScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const playerInfoDisplay = document.getElementById('playerInfo');
const playerScoreDisplay = document.getElementById('playerScore');
const finalScoreDisplay = document.getElementById('finalScore');
const gameCanvasElement = document.getElementById('gameCanvas');
const gameRoomId = document.getElementById('gameRoomId');
const currentRoomId = document.getElementById('currentRoomId');
const roomList = document.getElementById('roomList');

// Initialize game when page loads
window.onload = function() {
    setupEventListeners();
    updateRoomStatus();
    setInterval(updateRoomStatus, 3000); // Update room status every 3 seconds
};

// Setup event listeners
function setupEventListeners() {
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

// Socket event handlers
socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
});

socket.on('roomStatus', (status) => {
    createRoomCards(status);
});

socket.on('roomJoined', (data) => {
    currentRoom = data.roomId;
    playerId = data.playerId;
    isHost = data.isHost;
    gameRoomId.textContent = `Room ${currentRoom}`;
});

socket.on('playerJoined', (data) => {
    players = data.players;
});

socket.on('gameStart', (data) => {
    players = data.players;
    pipes = data.pipes;
    startGame();
});

socket.on('playerLeft', (data) => {
    players = data.players;
    if (players.length < 2) {
        handleGameOver();
    }
});

socket.on('gameUpdate', (data) => {
    if (!isHost) {
        players = data.players;
        pipes = data.pipes;
    }
});

socket.on('playerJumped', (data) => {
    const jumpingPlayer = players.find(p => p.id === data.playerId);
    if (jumpingPlayer && jumpingPlayer.id !== playerId) {
        jumpingPlayer.velocity = data.velocity;
    }
});

socket.on('newPipe', (data) => {
    if (!isHost) {
        pipes.push(data.pipe);
    }
});

socket.on('gameEnded', () => {
    handleGameOver();
});

// Game functions
function startSinglePlayer() {
    isSinglePlayer = true;
    currentRoom = 'single';
    resetGameState();
    menuScreen.style.display = 'none';
    canvas.style.display = 'block';
    playerInfoDisplay.style.display = 'block';
    gameRoomId.textContent = 'Single Player';
    startGame();
}

function joinRoom(roomId) {
    socket.emit('joinRoom', roomId);
    menuScreen.style.display = 'none';
    waitingScreen.style.display = 'block';
    currentRoomId.textContent = roomId;
}

function backToMainMenu() {
    menuScreen.style.display = 'block';
    waitingScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';
    canvas.style.display = 'none';
    playerInfoDisplay.style.display = 'none';
    resetGameState();
    if (!isSinglePlayer && currentRoom) {
        socket.emit('leaveRoom', { roomId: currentRoom });
    }
    currentRoom = null;
    isSinglePlayer = false;
}

function resetGame() {
    gameOverScreen.style.display = 'none';
    if (isSinglePlayer) {
        startSinglePlayer();
    } else {
        joinRoom(currentRoom);
    }
}

function resetGameState() {
    players = [];
    pipes = [];
    score = 0;
    frameCount = 0;
    gameOver = false;
    bird.y = 300;
    bird.velocity = 0;
    updateScoreDisplay();
}

function startGame() {
    waitingScreen.style.display = 'none';
    canvas.style.display = 'block';
    playerInfoDisplay.style.display = 'block';
    gameLoop();
}

function jump() {
    if (!gameOver) {
        bird.velocity = bird.jumpStrength;
        if (!isSinglePlayer) {
            socket.emit('playerJump', {
                roomId: currentRoom,
                velocity: bird.velocity
            });
        }
    }
}

function update() {
    // Apply gravity
    bird.velocity += gravity;
    if (bird.velocity > bird.maxFallSpeed) {
        bird.velocity = bird.maxFallSpeed;
    }
    bird.y += bird.velocity;

    // Check collisions
    if (bird.y < 0) {
        bird.y = 0;
        bird.velocity = 0;
    }
    if (bird.y + bird.height > canvas.height) {
        bird.y = canvas.height - bird.height;
        handleGameOver();
        return;
    }

    // Generate pipes
    if (frameCount % pipeSpawnInterval === 0 && (isSinglePlayer || isHost)) {
        const gapY = Math.floor(Math.random() * (canvas.height - 300)) + 100;
        const newPipe = {
            x: canvas.width,
            top: gapY,
            bottom: canvas.height - gapY - pipeGap,
            width: pipeWidth,
            passed: false
        };
        pipes.push(newPipe);
        if (!isSinglePlayer) {
            socket.emit('generatePipe', {
                roomId: currentRoom,
                pipe: newPipe
            });
        }
    }

    // Update pipes
    for (let i = pipes.length - 1; i >= 0; i--) {
        pipes[i].x -= gameSpeed;

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
            updateScoreDisplay();
        }
    }

    // Update multiplayer state
    if (!isSinglePlayer) {
        socket.emit('updatePosition', {
            roomId: currentRoom,
            x: bird.x,
            y: bird.y,
            velocity: bird.velocity
        });
    }

    frameCount++;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw pipes
    ctx.fillStyle = 'green';
    pipes.forEach(pipe => {
        ctx.fillRect(pipe.x, 0, pipe.width, pipe.top);
        ctx.fillRect(pipe.x, canvas.height - pipe.bottom, pipe.width, pipe.bottom);
    });

    // Draw birds
    if (isSinglePlayer) {
        ctx.fillStyle = 'yellow';
        ctx.fillRect(bird.x, bird.y, bird.width, bird.height);
    } else {
        players.forEach((player, index) => {
            ctx.fillStyle = player.id === playerId ? 'yellow' : 'red';
            ctx.fillRect(player.x, player.y, bird.width, bird.height);
        });
    }
}

function gameLoop() {
    if (!gameOver) {
        update();
        draw();
        requestAnimationFrame(gameLoop);
    }
}

function handleGameOver() {
    gameOver = true;
    finalScoreDisplay.textContent = `Final Score: ${score}`;
    canvas.style.display = 'none';
    playerInfoDisplay.style.display = 'none';
    gameOverScreen.style.display = 'block';

    if (!isSinglePlayer) {
        socket.emit('gameOver', { roomId: currentRoom });
    }
}

function updateScoreDisplay() {
    playerScoreDisplay.textContent = `Score: ${score}`;
}

function updateRoomStatus() {
    socket.emit('getRoomStatus');
}

function createRoomCards(roomStatus) {
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