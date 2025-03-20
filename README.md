# Flappy Bird Multiplayer

A real-time multiplayer version of the classic Flappy Bird game using Socket.IO.

## Features

- Real-time multiplayer gameplay
- Room-based game sessions
- Share room codes with friends to play together
- Responsive design works on both desktop and mobile
- Scorekeeping and game over detection

## Technologies

- HTML5 Canvas for game rendering
- JavaScript for game logic
- Node.js with Express for the backend server
- Socket.IO for real-time communication

## How to Play

1. Start the game and create a new room
2. Share the room code with a friend
3. When your friend joins, the game will automatically start
4. Press the space bar (or tap the screen on mobile) to make your bird jump
5. Avoid the pipes and try to score as many points as possible

## How to Run

### Prerequisites

- Node.js (v12 or higher)
- npm (Node Package Manager)

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/your-username/flappy-bird-multiplayer.git
   cd flappy-bird-multiplayer
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Start the development server
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:3000`

### Deployment

For production deployment:

```bash
npm start
```

## Deploy to Online Platform

This game can be easily deployed to platforms like Heroku, Vercel, or Netlify for online multiplayer gameplay.

## License

This project is licensed under the ISC License. 