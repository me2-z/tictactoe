// server.js - Updated for auto-restart and scores
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { nanoid } = require('nanoid');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Serve static frontend from /public folder
app.use(express.static(path.join(__dirname, 'public')));

// In-memory rooms storage
// rooms[roomId] = { id, board, turn, status, players: [{id,name,symbol,ws,connected}], scores: {X, O, draw}, createdAt }
const rooms = {};

// Create a new game room
function createRoom() {
  const id = nanoid(6); // Shorter ID
  const room = {
    id,
    board: Array(9).fill(null),
    turn: 'X',
    status: 'waiting',
    players: [],
    scores: { X: 0, O: 0, draw: 0 },
    createdAt: Date.now()
  };
  rooms[id] = room;
  console.log(`Created room ${id}`);
  return room;
}

// Get room by ID
function getRoom(id) {
  return rooms[id];
}

// API: Create a new room
app.post('/create-room', (req, res) => {
  try {
    const room = createRoom();
    return res.json({ roomId: room.id });
  } catch (error) {
    console.error('Error creating room:', error);
    return res.status(500).json({ error: 'Failed to create room' });
  }
});

// API: Get room information
app.get('/room/:id', (req, res) => {
  const room = getRoom(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  const players = room.players.map(p => ({
    id: p.id,
    name: p.name,
    symbol: p.symbol,
    connected: !!p.connected
  }));
  
  return res.json({
    id: room.id,
    board: room.board,
    turn: room.turn,
    status: room.status,
    players,
    scores: room.scores
  });
});

// Create HTTP server and WebSocket server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// Broadcast message to all players in a room
function broadcastToRoom(room, message, exceptWs = null) {
  const messageStr = JSON.stringify(message);
  room.players.forEach(player => {
    try {
      if (player.ws && 
          player.ws.readyState === WebSocket.OPEN && 
          player.ws !== exceptWs) {
        player.ws.send(messageStr);
      }
    } catch (error) {
      console.error('Error broadcasting to player:', error);
    }
  });
}

// Check for winner
function checkWinner(board) {
  const winningLines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6]             // Diagonals
  ];

  for (const line of winningLines) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }

  // Check for draw
  if (board.every(cell => cell !== null)) {
    return { winner: 'draw', line: null };
  }

  return { winner: null, line: null };
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');
  ws.isAlive = true;
  
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (rawMessage) => {
    let message;
    try {
      message = JSON.parse(rawMessage.toString());
    } catch (error) {
      console.error('Failed to parse message:', error);
      return;
    }

    const { type } = message;

    // Handle JOIN request
    if (type === 'join') {
      const { roomId, name } = message;
      
      if (!roomId) {
        return ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Room ID required' 
        }));
      }

      let room = getRoom(roomId);
      
      // Create room on demand if it doesn't exist
      if (!room) {
        room = createRoom();
        console.log(`Created room on demand: ${room.id}`);
      }

      // Assign symbol (X, O, or spectator)
      const takenSymbols = new Set(room.players.map(p => p.symbol));
      let symbol = null;
      
      if (!takenSymbols.has('X')) {
        symbol = 'X';
      } else if (!takenSymbols.has('O')) {
        symbol = 'O';
      } else {
        symbol = 'spectator';
      }

      // Generate random name if not provided
      const playerName = name || `Player${Math.floor(Math.random() * 1000)}`;
      
      // Create player
      const playerId = nanoid(8);
      const player = {
        id: playerId,
        name: playerName,
        symbol,
        ws,
        connected: true
      };
      
      room.players.push(player);

      // Update room status
      const activePlayers = room.players.filter(
        p => p.symbol === 'X' || p.symbol === 'O'
      );
      room.status = (activePlayers.length === 2) ? 'playing' : 'waiting';

      console.log(`Player ${player.name} joined room ${room.id} as ${symbol}`);

      // Send joined confirmation to this player
      ws.send(JSON.stringify({
        type: 'joined',
        roomId: room.id,
        playerId,
        symbol,
        board: room.board,
        turn: room.turn,
        status: room.status,
        players: room.players.map(p => ({
          id: p.id,
          name: p.name,
          symbol: p.symbol
        })),
        scores: room.scores
      }));

      // Broadcast to other players
      broadcastToRoom(room, {
        type: 'player-joined',
        players: room.players.map(p => ({
          id: p.id,
          name: p.name,
          symbol: p.symbol
        }))
      }, ws);

      return;
    }

    // Find player and room for other message types
    const playerEntry = (() => {
      for (const room of Object.values(rooms)) {
        const player = room.players.find(p => p.ws === ws);
        if (player) return { room, player };
      }
      return null;
    })();

    if (!playerEntry) {
      return ws.send(JSON.stringify({
        type: 'error',
        message: 'Not joined to any room'
      }));
    }

    const { room, player } = playerEntry;

    // Handle MOVE request
    if (type === 'move') {
      const { index } = message;

      // Validation
      if (typeof index !== 'number' || index < 0 || index > 8) {
        return ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid cell index'
        }));
      }

      if (room.status !== 'playing') {
        return ws.send(JSON.stringify({
          type: 'error',
          message: 'Game not active'
        }));
      }

      if (room.turn !== player.symbol) {
        return ws.send(JSON.stringify({
          type: 'error',
          message: 'Not your turn'
        }));
      }

      if (room.board[index]) {
        return ws.send(JSON.stringify({
          type: 'error',
          message: 'Cell already taken'
        }));
      }

      // Make the move
      room.board[index] = player.symbol;
      room.turn = (player.symbol === 'X') ? 'O' : 'X';

      // Check for winner
      const result = checkWinner(room.board);
      
      if (result.winner) {
        room.status = 'finished';
        // Update scores
        if (result.winner === 'draw') {
          room.scores.draw++;
        } else {
          room.scores[result.winner]++;
        }
      } else {
        room.status = 'playing';
      }

      console.log(`Move made in room ${room.id}: ${player.symbol} at position ${index}`);

      // Broadcast update to ALL players including the one who made the move
      const updateMessage = {
        type: 'update',
        board: room.board,
        turn: room.turn,
        status: room.status,
        winner: result.winner || null,
        winLine: result.line || null,
        scores: room.scores
      };

      // Send to all players (not excluding the sender)
      room.players.forEach(p => {
        try {
          if (p.ws && p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify(updateMessage));
          }
        } catch (error) {
          console.error('Error sending update:', error);
        }
      });

      return;
    }

    // Handle RESET request
    if (type === 'reset') {
      room.board = Array(9).fill(null);
      room.turn = 'X';
      room.status = 'playing';

      console.log(`Game reset in room ${room.id}`);

      // Broadcast reset to all players
      const resetMessage = {
        type: 'update',
        board: room.board,
        turn: room.turn,
        status: room.status,
        winner: null,
        winLine: null,
        scores: room.scores
      };

      room.players.forEach(p => {
        try {
          if (p.ws && p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify(resetMessage));
          }
        } catch (error) {
          console.error('Error sending reset:', error);
        }
      });

      return;
    }

    // Unknown message type
    console.log('Unknown message type:', type);
  });

  // Handle WebSocket close
  ws.on('close', () => {
    console.log('WebSocket connection closed');
    
    // Find and remove player
    for (const room of Object.values(rooms)) {
      const playerIndex = room.players.findIndex(p => p.ws === ws);
      
      if (playerIndex !== -1) {
        const leftPlayer = room.players.splice(playerIndex, 1)[0];
        
        console.log(`Player ${leftPlayer.name} left room ${room.id}`);

        // Broadcast player left
        broadcastToRoom(room, {
          type: 'player-left',
          players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            symbol: p.symbol
          }))
        });

        // Clean up empty rooms after 1 minute
        if (room.players.length === 0) {
          setTimeout(() => {
            if (rooms[room.id] && rooms[room.id].players.length === 0) {
              delete rooms[room.id];
              console.log(`Deleted empty room ${room.id}`);
            }
          }, 60 * 1000);
        } else {
          // Update room status
          const activePlayers = room.players.filter(
            p => p.symbol === 'X' || p.symbol === 'O'
          );
          room.status = (activePlayers.length === 2) ? 'playing' : 'waiting';
        }
        
        break;
      }
    }
  });

  // Handle WebSocket errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Health check ping every 30 seconds
setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

// Start server
const PORT = process.env.PORT || 7777;
server.listen(PORT, () => {
  console.log(`🎮 Tic Tac Toe server running on port ${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}/ws`);
});
