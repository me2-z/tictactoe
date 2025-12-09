// public/script.js
(() => {
  const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';

  // DOM
  const nameInput = document.getElementById('name');
  const joinBtn = document.getElementById('joinBtn');
  const resetBtn = document.getElementById('resetBtn');
  const boardEl = document.getElementById('board');
  const roomLabel = document.getElementById('roomLabel');
  const statusEl = document.getElementById('status');
  const meLabel = document.getElementById('meLabel');
  const symbolLabel = document.getElementById('symbolLabel');
  const turnLabel = document.getElementById('turnLabel');
  const msgEl = document.getElementById('msg');
  const canvas = document.getElementById('lineCanvas');

  const SIZE = 90;
  const GAP = 14;
  canvas.width = SIZE*3 + GAP*2;
  canvas.height = SIZE*3 + GAP*2;
  const ctx = canvas.getContext('2d');

  let ws = null;
  let roomId = null;
  let myId = null;
  let mySymbol = null;
  let board = Array(9).fill(null);
  let turn = 'X';
  let status = 'idle';

  function setMsg(t, err=false) { msgEl.textContent = t || ''; msgEl.style.color = err ? '#ef4444' : '#0f172a'; }
  function renderBoard(){
    boardEl.innerHTML = '';
    for (let i=0;i<9;i++){
      const c = document.createElement('div');
      c.className = 'cell';
      c.dataset.i = i;
      c.textContent = board[i] || '';
      c.onclick = () => tryMove(i);
      boardEl.appendChild(c);
    }
    meLabel.textContent = nameInput.value || '—';
    symbolLabel.textContent = mySymbol || '—';
    turnLabel.textContent = turn || '—';
    statusEl.textContent = 'Status: ' + (status || 'idle');
  }

  function findWin(b) {
    const lines = [
      [0,1,2],[3,4,5],[6,7,8],
      [0,3,6],[1,4,7],[2,5,8],
      [0,4,8],[2,4,6]
    ];
    for (const line of lines) {
      const [a,b1,c] = line;
      if (b[a] && b[a] === b[b1] && b[a] === b[c]) return { winner: b[a], line };
    }
    if (b.every(Boolean)) return { winner: 'draw', line: null };
    return { winner: null, line: null };
  }

  function animateWinLine(line) {
    if (!line) return;
    line.forEach(i=>{
      const el = boardEl.querySelector('.cell[data-i="'+i+'"]');
      if (el) el.classList.add('win');
    });
    const coords = line.map(i => {
      const r = Math.floor(i/3), c = i%3;
      return { x: c*(SIZE+GAP) + SIZE/2, y: r*(SIZE+GAP) + SIZE/2 };
    });
    const start = coords[0], end = coords[2];
    ctx.clearRect(0,0,canvas.width,canvas.height);
    let t=0, steps=24;
    function step(){
      t++;
      const p = Math.min(1, t/steps);
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#ef4444';
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(start.x + (end.x - start.x)*p, start.y + (end.y - start.y)*p);
      ctx.stroke();
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function clearCanvas(){ ctx.clearRect(0,0,canvas.width,canvas.height); }

  function tryMove(i) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return setMsg('Not connected', true);
    if (!mySymbol || mySymbol === 'spectator') return setMsg('No symbol assigned', true);
    if (turn !== mySymbol) return setMsg('Not your turn', true);
    if (board[i]) return setMsg('Cell taken', true);
    ws.send(JSON.stringify({ type:'move', index: i }));
  }

  joinBtn.onclick = () => {
    const name = (nameInput.value || 'Player').trim();
    if (!name) return setMsg('Enter name first', true);
    // get room from URL param or prompt
    const q = new URLSearchParams(location.search).get('room');
    if (q) roomId = q;
    else {
      const r = prompt('Paste room id or full URL (from creator).');
      if (!r) return;
      if (r.includes('room=')) {
        try { roomId = new URL(r).searchParams.get('room'); } catch(e) { roomId = r; }
      } else roomId = r;
    }
    roomLabel.textContent = 'Room: ' + roomId;
    connectWS(roomId, name);
  };

  resetBtn.onclick = ()=> {
    if (!ws || ws.readyState !== WebSocket.OPEN) return setMsg('Not connected', true);
    ws.send(JSON.stringify({ type:'reset' }));
  };

  function connectWS(room, name) {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      setMsg('Connected — joining room...');
      ws.send(JSON.stringify({ type:'join', roomId: room, name }));
    };
    ws.onmessage = (evt) => {
      let m;
      try { m = JSON.parse(evt.data); } catch(e){ return; }
      handleMsg(m);
    };
    ws.onclose = () => setMsg('Disconnected', true);
    ws.onerror = (e) => setMsg('WebSocket error', true);
  }

  function handleMsg(m) {
    if (m.type === 'joined') {
      myId = m.playerId;
      mySymbol = m.symbol;
      board = m.board || board;
      turn = m.turn || turn;
      status = m.status || status;
      setMsg('Joined as ' + mySymbol);
      renderBoard();
    } else if (m.type === 'player-joined') {
      setMsg(`${m.name} joined as ${m.symbol}`);
    } else if (m.type === 'player-left') {
      setMsg('Player left');
    } else if (m.type === 'update') {
      board = m.board || board;
      turn = m.turn || turn;
      status = m.status || status;
      renderBoard();
      if (m.winner) {
        if (m.winner === 'draw') setMsg('Draw!');
        else setMsg(`${m.winner} wins!`);
        if (m.winLine) animateWinLine(m.winLine);
      } else {
        clearCanvas();
      }
    } else if (m.type === 'error') {
      setMsg(m.message, true);
    }
  }

  // build initial board
  renderBoard();

})();
