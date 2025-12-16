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

  // Board configuration - Larger cells
  const SIZE = 140; // Larger cell size
  const GAP = 20;   // Gap between cells
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
  let autoJoinAttempted = false;

  // Helper: Set message with color
  function setMsg(text, isError = false) {
    msgEl.textContent = text || '';
    msgEl.style.color = isError ? '#FF6B8B' : '#CCDBE2';
    msgEl.style.borderColor = isError ? '#FF6B8B' : '#697773';
    
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
    const playerName = nameInput.value.trim() || 'Guest';
    meLabel.textContent = playerName.length > 12 ? playerName.substring(0, 12) + '...' : playerName;
    symbolLabel.textContent = mySymbol || '—';
    turnLabel.textContent = turn || '—';
    statusEl.textContent = 'Status: ' + (status || 'idle');
  }

  // Animate winning line
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

    let progress = 0;
    const duration = 800;
    const startTime = performance.now();

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function drawLine(timestamp) {
      const elapsed = timestamp - startTime;
      progress = Math.min(elapsed / duration, 1);
      
      const easedProgress = easeOutCubic(progress);
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Glow effect
      ctx.shadowBlur = 30;
      ctx.shadowColor = '#FFD166';
      
      // Draw the line
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineWidth = 16;
      ctx.strokeStyle = '#FFD166';
      ctx.moveTo(startPoint.x, startPoint.y);
      
      const currentX = startPoint.x + (endPoint.x - startPoint.x) * easedProgress;
      const currentY = startPoint.y + (endPoint.y - startPoint.y) * easedProgress;
      
      ctx.lineTo(currentX, currentY);
      ctx.stroke();
      
      if (progress < 1) {
        requestAnimationFrame(drawLine);
      } else {
        isAnimating = false;
        createConfetti();
      }
    }

    requestAnimationFrame(drawLine);
  }

  // Create confetti effect
  function createConfetti() {
    const colors = ['#FF6B8B', '#4ECDC4', '#FFD166', '#697773', '#CCDBE2'];
    const confettiCount = 60;

    for (let i = 0; i < confettiCount; i++) {
      setTimeout(() => {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = Math.random() * 0.5 + 's';
        confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
        confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
        document.body.appendChild(confetti);

        setTimeout(() => confetti.remove(), 5000);
      }, i * 20);
    }
  }

  // Clear canvas
  function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Remove win animation from cells
    document.querySelectorAll('.cell.win').forEach(cell => {
      cell.classList.remove('win');
    });
  }

  // Try to make a move
  function tryMove(index) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return setMsg('Not connected to game server', true);
    }
    if (!mySymbol || mySymbol === 'spectator') {
      return setMsg('You are spectating. Players only can move', true);
    }
    if (status === 'finished') {
      return setMsg('Game finished. Click Reset to play again', true);
    }
    if (turn !== mySymbol) {
      return setMsg('Wait for your turn', true);
    }
    if (board[index]) {
      return setMsg('Cell already taken', true);
    }

    ws.send(JSON.stringify({ type: 'move', index }));
  }

  // Extract room ID from URL
  function getRoomIdFromURL() {
    const urlParams = new URLSearchParams(location.search);
    return urlParams.get('room');
  }

  // Join room automatically if URL has room parameter
  function tryAutoJoin() {
    const urlRoomId = getRoomIdFromURL();
    if (urlRoomId && !autoJoinAttempted) {
      roomId = urlRoomId;
      roomLabel.textContent = 'Room: ' + roomId;
      setMsg('Room detected. Enter your name to join...');
      
      // Focus on name input
      nameInput.focus();
      
      // Auto-join when user types name and presses Enter
      nameInput.addEventListener('keypress', function autoJoinOnEnter(e) {
        if (e.key === 'Enter') {
          const name = nameInput.value.trim();
          if (name) {
            autoJoinAttempted = true;
            connectWebSocket(roomId, name);
            nameInput.removeEventListener('keypress', autoJoinOnEnter);
          }
        }
      });
      
      // Also auto-join after 2 seconds if name is already entered
      if (nameInput.value.trim()) {
        setTimeout(() => {
          if (!autoJoinAttempted && nameInput.value.trim()) {
            autoJoinAttempted = true;
            connectWebSocket(roomId, nameInput.value.trim());
          }
        }, 2000);
      }
    }
  }

  // Join room button handler
  joinBtn.onclick = () => {
    const name = (nameInput.value || 'Player').trim();
    if (!name) {
      nameInput.focus();
      return setMsg('Please enter your name first', true);
    }

    if (!roomId) {
      roomId = getRoomIdFromURL();
    }

    if (!roomId) {
      // Ask for room ID if not in URL
      const input = prompt('Enter room ID or paste the full game URL:');
      if (!input) return;
      
      // Extract room ID from URL
      let extractedId = input;
      try {
        if (input.includes('room=')) {
          extractedId = new URL(input).searchParams.get('room');
        }
      } catch (e) {
        // If URL parsing fails, use input as-is
      }
      
      roomId = extractedId;
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
    setMsg('Game reset. Starting fresh!');
  };

  // Connect to WebSocket server
  function connectWebSocket(room, name) {
    if (ws) {
      ws.close();
    }

    ws = new WebSocket(WS_URL);
    joinBtn.disabled = true;
    joinBtn.textContent = 'Connecting...';

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
      joinBtn.disabled = false;
      joinBtn.textContent = 'Join Room';
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setMsg('Connection error. Try again', true);
      joinBtn.disabled = false;
      joinBtn.textContent = 'Join Room';
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
        
        const roleMsg = mySymbol === 'spectator' ? 'as Spectator' : `as ${mySymbol}`;
        setMsg(`✅ Joined ${roleMsg}`);
        
        if (mySymbol === 'spectator') {
          setMsg('You are spectating. Watch the game!');
        }
        
        renderBoard();
        joinBtn.disabled = true;
        joinBtn.textContent = 'Joined ✓';
        break;

      case 'player-joined':
        setMsg(`👤 ${msg.name} joined as ${msg.symbol}`);
        break;

      case 'player-left':
        setMsg(`👋 ${msg.name} left the game`);
        break;

      case 'update':
        board = msg.board || board;
        turn = msg.turn || turn;
        status = msg.status || status;
        
        renderBoard();

        if (msg.winner) {
          if (msg.winner === 'draw') {
            setMsg('🤝 Game Draw!');
            clearCanvas();
          } else {
            const winnerMsg = mySymbol === msg.winner ? '🎉 You win!' : `🎉 ${msg.winner} wins!`;
            setMsg(winnerMsg);
            if (msg.winLine) {
              animateWinLine(msg.winLine);
            }
          }
        } else {
          clearCanvas();
          setMsg(turn === mySymbol ? '✅ Your turn!' : '⏳ Waiting for opponent...');
        }
        break;

      case 'error':
        setMsg(msg.message, true);
        joinBtn.disabled = false;
        joinBtn.textContent = 'Join Room';
        break;

      default:
        console.log('Unknown message type:', msg.type);
    }
  }

  // Initialize on page load
  function init() {
    renderBoard();
    
    // Try auto-join if room ID in URL
    tryAutoJoin();
    
    // Auto-focus name input
    nameInput.focus();
    
    // Allow Enter key in name input to trigger join
    nameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const name = nameInput.value.trim();
        if (name) {
          if (roomId) {
            connectWebSocket(roomId, name);
          } else {
            joinBtn.click();
          }
        }
      }
    });
  }

  // Start initialization
  init();

  // Responsive canvas resizing
  window.addEventListener('resize', () => {
    if (window.innerWidth <= 768) {
      const mobileSize = 100;
      const mobileGap = 16;
      canvas.width = mobileSize * 3 + mobileGap * 2;
      canvas.height = mobileSize * 3 + mobileGap * 2;
    } else if (window.innerWidth <= 480) {
      const mobileSize = 80;
      const mobileGap = 12;
      canvas.width = mobileSize * 3 + mobileGap * 2;
      canvas.height = mobileSize * 3 + mobileGap * 2;
    } else {
      canvas.width = SIZE * 3 + GAP * 2;
      canvas.height = SIZE * 3 + GAP * 2;
    }
  });
})();
