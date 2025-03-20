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

// Jump action (for both key and touch)
function jump() {
    if (!gameOver) {
        // Reset upward velocity to jumpStrength
        bird.velocity = bird.jumpStrength;
    }
}

// Listen for key press (SPACE)
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        jump();
        // Prevent default actions like scrolling
        e.preventDefault();
    }
});

// Listen for touch events (mobile)
canvas.addEventListener('touchstart', (e) => {
    jump();
    e.preventDefault();
});

// Update game physics and objects
function update() {
    // Apply gravity to bird's velocity
    bird.velocity += gravity;
    // Cap the falling speed
    if (bird.velocity > bird.maxFallSpeed) {
        bird.velocity = bird.maxFallSpeed;
    }
    bird.y += bird.velocity;

    // Check for collisions with the ceiling
    if (bird.y < 0) {
        bird.y = 0;
        bird.velocity = 0;
    }

    // Check for collision with the ground
    if (bird.y + bird.height > canvas.height) {
        bird.y = canvas.height - bird.height;
        gameOver = true;
    }

    // Spawn pipes at intervals
    if (frameCount % pipeSpawnInterval === 0) {
        // Random gap position between 100 and canvas.height - 200
        const gapY = Math.floor(Math.random() * (canvas.height - 300)) + 100;
        pipes.push({
            x: canvas.width,
            top: gapY,
            bottom: canvas.height - gapY - pipeGap,
            width: pipeWidth,
            passed: false
        });
    }

    // Update pipes positions and check collisions
    for (let i = pipes.length - 1; i >= 0; i--) {
        pipes[i].x -= gameSpeed;

        // Remove off-screen pipes
        if (pipes[i].x + pipeWidth < 0) {
            pipes.splice(i, 1);
            continue;
        }

        // Collision check:
        // If bird is within pipe's x-range and (above gap or below gap)
        if (
            bird.x < pipes[i].x + pipeWidth &&
            bird.x + bird.width > pipes[i].x &&
            (bird.y < pipes[i].top || bird.y + bird.height > canvas.height - pipes[i].bottom)
        ) {
            gameOver = true;
        }

        // Increase score if bird passes the pipe
        if (!pipes[i].passed && pipes[i].x + pipeWidth < bird.x) {
            pipes[i].passed = true;
            score++;
            // Update score display
            document.getElementById('playerScore').textContent = `Score: ${score}`;
        }
    }

    frameCount++;
}

// Draw game elements
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw bird
    ctx.fillStyle = 'yellow';
    ctx.fillRect(bird.x, bird.y, bird.width, bird.height);

    // Draw pipes
    ctx.fillStyle = 'green';
    pipes.forEach(pipe => {
        // Top pipe
        ctx.fillRect(pipe.x, 0, pipe.width, pipe.top);
        // Bottom pipe
        ctx.fillRect(pipe.x, canvas.height - pipe.bottom, pipe.width, pipe.bottom);
    });

    // Draw game over screen
    if (gameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '48px Arial';
        ctx.fillText('Game Over', canvas.width / 2 - 120, canvas.height / 2);
        ctx.font = '24px Arial';
        ctx.fillText('Final Score: ' + score, canvas.width / 2 - 80, canvas.height / 2 + 40);
        
        // Show game over screen
        document.getElementById('gameOverScreen').style.display = 'block';
        document.getElementById('finalScore').textContent = `Final Score: ${score}`;
    }
}

// Main game loop
function gameLoop() {
    if (!gameOver) {
        update();
        draw();
        requestAnimationFrame(gameLoop);
    }
}

// Initialize game when window loads
window.onload = function() {
    // Hide menu and show game canvas
    document.getElementById('menu').style.display = 'none';
    document.getElementById('gameCanvas').style.display = 'block';
    document.getElementById('playerInfo').style.display = 'block';
    document.getElementById('gameRoomId').textContent = 'Single Player';
    
    // Start the game loop
    gameLoop();
}; 