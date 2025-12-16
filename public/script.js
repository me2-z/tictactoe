// public/script.js
(() => {
  const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';

  // DOM Elements
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

  // Board configuration
  const SIZE = 110; // Cell size
  const GAP = 16;   // Gap between cells
  canvas.width = SIZE * 3 + GAP * 2;
  canvas.height = SIZE * 3 + GAP * 2;
  const ctx = canvas.getContext('2d');

  // Game state
  let ws = null;
  let roomId = null;
  let myId = null;
  let mySymbol = null;
  let board = Array(9).fill(null);
  let turn = 'X';
  let status = 'idle';
  let isAnimating = false;

  // Helper: Set message with color
  function setMsg(text, isError = false) {
    msgEl.textContent = text || '';
    msgEl.style.color = isError ? '#ef4444' : '#0f172a';
    
    if (text) {
      msgEl.style.transform = 'scale(1.05)';
      setTimeout(() => {
        msgEl.style.transform = 'scale(1)';
      }, 200);
    }
  }

  // Render the game board
  function renderBoard() {
    boardEl.innerHTML = '';
    
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.i = i;
      
      if (board[i]) {
        cell.textContent = board[i];
        cell.dataset.symbol = board[i];
      }
      
      cell.onclick = () => tryMove(i);
      boardEl.appendChild(cell);
    }

    // Update UI labels
    meLabel.textContent = nameInput.value || '—';
    symbolLabel.textContent = mySymbol || '—';
    turnLabel.textContent = turn || '—';
    statusEl.textContent = 'Status: ' + (status || 'idle');
  }

  // Animate winning line with smooth drawing
  function animateWinLine(line) {
    if (!line || isAnimating) return;
    isAnimating = true;

    // Highlight winning cells
    line.forEach(i => {
      const el = boardEl.querySelector(`.cell[data-i="${i}"]`);
      if (el) el.classList.add('win');
    });

    // Calculate line coordinates
    const coords = line.map(i => {
      const row = Math.floor(i / 3);
      const col = i % 3;
      return {
        x: col * (SIZE + GAP) + SIZE / 2,
        y: row * (SIZE + GAP) + SIZE / 2
      };
    });

    const startPoint = coords[0];
    const endPoint = coords[2];
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Animation parameters
    let progress = 0;
    const duration = 600; // milliseconds
    const startTime = performance.now();

    // Smooth easing function (easeOutCubic)
    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function drawLine(timestamp) {
      const elapsed = timestamp - startTime;
      progress = Math.min(elapsed / duration, 1);
      
      const easedProgress = easeOutCubic(progress);
      
      // Clear and redraw
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw glow effect
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#fbbf24';
      
      // Draw the line
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineWidth = 12;
      ctx.strokeStyle = '#fbbf24';
      ctx.moveTo(startPoint.x, startPoint.y);
      
      const currentX = startPoint.x + (endPoint.x - startPoint.x) * easedProgress;
      const currentY = startPoint.y + (endPoint.y - startPoint.y) * easedProgress;
      
      ctx.lineTo(currentX, currentY);
      ctx.stroke();
      
      // Continue animation
      if (progress < 1) {
        requestAnimationFrame(drawLine);
      } else {
        isAnimating = false;
        createConfetti();
      }
    }

    requestAnimationFrame(drawLine);
  }

  // Create confetti effect for winner
  function createConfetti() {
    const colors = ['#f43f5e', '#3b82f6', '#fbbf24', '#8b5cf6', '#10b981'];
    const confettiCount = 50;

    for (let i = 0; i < confettiCount; i++) {
      setTimeout(() => {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = Math.random() * 0.5 + 's';
        confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
        document.body.appendChild(confetti);

        setTimeout(() => confetti.remove(), 5000);
      }, i * 30);
    }
  }

  // Clear canvas
  function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Try to make a move
  function tryMove(index) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return setMsg('Not connected', true);
    }
    if (!mySymbol || mySymbol === 'spectator') {
      return setMsg('You are spectating', true);
    }
    if (status === 'finished') {
      return setMsg('Game finished. Click Reset to play again', true);
    }
    if (turn !== mySymbol) {
      return setMsg('Not your turn', true);
    }
    if (board[index]) {
      return setMsg('Cell already taken', true);
    }

    // Send move to server
    ws.send(JSON.stringify({ type: 'move', index }));
  }

  // Join room button handler
  joinBtn.onclick = () => {
    const name = (nameInput.value || 'Player').trim();
    if (!name) {
      return setMsg('Enter your name first', true);
    }

    // Get room ID from URL parameter or prompt
    const urlParams = new URLSearchParams(location.search);
    const urlRoomId = urlParams.get('room');
    
    if (urlRoomId) {
      roomId = urlRoomId;
    } else {
      const input = prompt('Paste room ID or full URL from the room creator:');
      if (!input) return;
      
      // Extract room ID from URL if full URL was pasted
      if (input.includes('room=')) {
        try {
          roomId = new URL(input).searchParams.get('room');
        } catch (e) {
          roomId = input;
        }
      } else {
        roomId = input;
      }
    }

    roomLabel.textContent = 'Room: ' + roomId;
    connectWebSocket(roomId, name);
  };

  // Reset game button handler
  resetBtn.onclick = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return setMsg('Not connected', true);
    }
    
    clearCanvas();
    ws.send(JSON.stringify({ type: 'reset' }));
    setMsg('Game reset');
  };

  // Connect to WebSocket server
  function connectWebSocket(room, name) {
    if (ws) {
      ws.close();
    }

    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      setMsg('Connected — joining room...');
      ws.send(JSON.stringify({ 
        type: 'join', 
        roomId: room, 
        name 
      }));
    };

    ws.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (e) {
        console.error('Failed to parse message:', e);
        return;
      }
      handleMessage(message);
    };

    ws.onclose = () => {
      setMsg('Disconnected from server', true);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setMsg('Connection error', true);
    };
  }

  // Handle incoming WebSocket messages
  function handleMessage(msg) {
    switch (msg.type) {
      case 'joined':
        myId = msg.playerId;
        mySymbol = msg.symbol;
        board = msg.board || board;
        turn = msg.turn || turn;
        status = msg.status || status;
        
        setMsg(`Joined as ${mySymbol}`);
        renderBoard();
        break;

      case 'player-joined':
        setMsg(`${msg.name} joined as ${msg.symbol}`);
        break;

      case 'player-left':
        setMsg(`Player ${msg.name} left the game`);
        break;

      case 'update':
        board = msg.board || board;
        turn = msg.turn || turn;
        status = msg.status || status;
        
        renderBoard();

        if (msg.winner) {
          if (msg.winner === 'draw') {
            setMsg('🤝 It\'s a draw!');
            clearCanvas();
          } else {
            setMsg(`🎉 ${msg.winner} wins!`);
            if (msg.winLine) {
              animateWinLine(msg.winLine);
            }
          }
        } else {
          clearCanvas();
          setMsg('');
        }
        break;

      case 'error':
        setMsg(msg.message, true);
        break;

      default:
        console.log('Unknown message type:', msg.type);
    }
  }

  // Initialize board on page load
  renderBoard();

  // Responsive canvas resizing
  window.addEventListener('resize', () => {
    if (window.innerWidth <= 640) {
      const mobileSize = 90;
      const mobileGap = 12;
      canvas.width = mobileSize * 3 + mobileGap * 2;
      canvas.height = mobileSize * 3 + mobileGap * 2;
    }
  });
})();
