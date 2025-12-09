// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { nanoid } = require('nanoid');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Serve static frontend from /public
app.use(express.static(path.join(__dirname, 'public')));

// In-memory rooms store
// rooms[roomId] = { id, board, turn, status, players: [{id,name,symbol,connected}], createdAt }
const rooms = {};

function createRoom(name) {
  const id = nanoid(7);
  const room = {
    id,
    board: Array(9).fill(null),
    turn: 'X',
    status: 'waiting',
    players: [], // will push when websocket join
    createdAt: Date.now()
  };
  rooms[id] = room;
  return room;
}

function getRoom(id) {
  return rooms[id];
}

// API: create a room (returns roomId)
app.post('/create-room', (req, res) => {
  const name = (req.body && req.body.name) ? String(req.body.name).slice(0,48) : 'Player';
  const room = createRoom(name);
  return res.json({ roomId: room.id });
});

// API: get room info (optional)
app.get('/room/:id', (req, res) => {
  const r = getRoom(req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  const players = r.players.map(p => ({ id: p.id, name: p.name, symbol: p.symbol, connected: !!p.connected }));
  return res.json({ id: r.id, board: r.board, turn: r.turn, status: r.status, players });
});

// create http server and websocket server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// broadcast to room
function broadcastToRoom(room, msg, exceptWs = null) {
  room.players.forEach(p => {
    try {
      if (p.ws && p.ws.readyState === WebSocket.OPEN && p.ws !== exceptWs) {
        p.ws.send(JSON.stringify(msg));
      }
    } catch (e) {}
  });
}

function checkWinner(board) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (const line of lines) {
    const [a,b,c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { winner: board[a], line };
  }
  if (board.every(Boolean)) return { winner: 'draw', line: null };
  return { winner: null, line: null };
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
    const { type } = msg;

    if (type === 'join') {
      // { type:'join', roomId, name }
      const { roomId, name } = msg;
      if (!roomId) return ws.send(JSON.stringify({ type:'error', message:'roomId required' }));
      let room = getRoom(roomId);
      if (!room) {
        // optional: create on demand
        room = createRoom(name || 'Player');
      }

      // assign symbol X or O or spectator
      const taken = new Set(room.players.map(p => p.symbol));
      let symbol = null;
      if (!taken.has('X')) symbol = 'X';
      else if (!taken.has('O')) symbol = 'O';
      else symbol = 'spectator';

      const pid = nanoid(9);
      const player = { id: pid, name: name || 'Player', symbol, ws, connected: true };
      room.players.push(player);

      // update status
      const active = room.players.filter(p => p.symbol === 'X' || p.symbol === 'O');
      room.status = (active.length === 2) ? 'playing' : 'waiting';

      // send joined ack to this client
      ws.send(JSON.stringify({
        type: 'joined',
        roomId: room.id,
        playerId: pid,
        symbol,
        board: room.board,
        turn: room.turn,
        status: room.status,
        players: room.players.map(p => ({ id: p.id, name: p.name, symbol: p.symbol }))
      }));

      // broadcast new player to others
      broadcastToRoom(room, { type:'player-joined', id: pid, name: player.name, symbol: player.symbol }, ws);
      return;
    }

    // other actions require the ws to be associated with a room/player
    // find player/room
    const playerEntry = (() => {
      for (const r of Object.values(rooms)) {
        const p = r.players.find(px => px.ws === ws);
        if (p) return { room: r, player: p };
      }
      return null;
    })();
    if (!playerEntry) {
      return ws.send(JSON.stringify({ type:'error', message:'not joined' }));
    }
    const { room, player } = playerEntry;

    if (type === 'move') {
      // { index }
      const { index } = msg;
      if (typeof index !== 'number' || index < 0 || index > 8) return ws.send(JSON.stringify({ type:'error', message:'bad index' }));
      if (room.status !== 'playing' && room.status !== 'waiting') return ws.send(JSON.stringify({ type:'error', message:'game not active' }));
      if (room.turn !== player.symbol) return ws.send(JSON.stringify({ type:'error', message:'not your turn' }));
      if (room.board[index]) return ws.send(JSON.stringify({ type:'error', message:'cell taken' }));

      room.board[index] = player.symbol;
      room.turn = (player.symbol === 'X') ? 'O' : 'X';
      const w = checkWinner(room.board);
      if (w.winner) room.status = 'finished';
      else if (room.board.every(Boolean)) room.status = 'finished';
      else room.status = 'playing';

      broadcastToRoom(room, { type:'update', board: room.board, turn: room.turn, status: room.status, winner: w.winner || null, winLine: w.line || null });
      return;
    }

    if (type === 'reset') {
      room.board = Array(9).fill(null);
      room.turn = 'X';
      room.status = 'playing';
      broadcastToRoom(room, { type:'update', board: room.board, turn: room.turn, status: room.status, winner: null });
      return;
    }

    // unknown type
    return;
  });

  ws.on('close', () => {
    // remove player's ws & mark disconnected
    for (const r of Object.values(rooms)) {
      const idx = r.players.findIndex(p => p.ws === ws);
      if (idx !== -1) {
        const left = r.players.splice(idx,1)[0];
        // broadcast leave
        broadcastToRoom(r, { type:'player-left', id: left.id, name: left.name, symbol: left.symbol });
        // cleanup empty room after a minute
        if (r.players.length === 0) {
          setTimeout(() => {
            if (rooms[r.id] && rooms[r.id].players.length === 0) delete rooms[r.id];
          }, 60*1000);
        } else {
          // update status
          const act = r.players.filter(p => p.symbol === 'X' || p.symbol === 'O');
          r.status = (act.length === 2) ? 'playing' : 'waiting';
        }
        break;
      }
    }
  });

});

// health ping
setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

const PORT = process.env.PORT || 7777;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
