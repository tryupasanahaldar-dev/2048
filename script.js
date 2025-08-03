/*
 * 2048 Fun Game
 *
 * This implementation is inspired by the original 2048 game by Gabriele Cirulli (MIT).
 * It uses a simple data model to track the board state, handle moves, spawn new
 * tiles and check for game over conditions. The interface is updated by
 * manipulating DOM elements representing each tile. Scores are stored in
 * localStorage so that the best score persists between sessions.
 */

// Board size (4x4 grid)
const SIZE = 4;

// DOM elements
const scoreContainer = document.querySelector('.score-container');
const bestContainer = document.querySelector('.best-container');
// Screens
const homeScreen = document.getElementById('home-screen');
const settingsScreen = document.getElementById('settings-screen');
const gameScreen = document.getElementById('game-screen');
// Buttons
const newGameBtn = document.getElementById('new-game-btn');
const timedGameBtn = document.getElementById('timed-game-btn');
const settingsBtn = document.getElementById('settings-btn');
const backBtn = document.getElementById('back-btn');
const resumeGameBtn = document.getElementById('resume-game-btn');
const homeBtn = document.getElementById('home-btn');
const exitBtn = document.getElementById('exit-btn');
const customTimeInput = document.getElementById('custom-time-input');
const customTimeBtn = document.getElementById('custom-time-btn');
// Settings controls
const themeSelect = document.getElementById('theme-select');
const soundToggle = document.getElementById('sound-toggle');
const vibrationToggle = document.getElementById('vibration-toggle');
// Undo button
const undoBtn = document.getElementById('undo-btn');
// Timer
const timerContainer = document.querySelector('.timer-container');
const timerDisplay = document.getElementById('timer-display');
// Containers for tiles and messages
const tileContainer = document.querySelector('.tile-container');
const messageContainer = document.querySelector('.game-message');
const messageText = messageContainer.querySelector('p');
const retryButton = document.querySelector('.retry-button');
const keepPlayingButton = document.querySelector('.keep-playing-button');

// Game state
let board = [];
let score = 0;
let bestScore = 0;
let won = false;

// History stack for undo functionality. Each entry stores a deep copy of the board,
// the score and remaining time (for timed games). The game allows up to three undos.
let historyStack = [];
let undosRemaining = 3;

// Confetti animation variables
let confettiCanvas = null;
let confettiAnimationId = null;

// Gameplay options
let isTimedGame = false;
let timeRemaining = 300; // seconds for timed game
let timerInterval = null;

// User preferences (theme, sound, vibration)
let currentTheme = 'default';
let soundEnabled = false;
let vibrationEnabled = false;

// Initialize localStorage for best score
function initStorage() {
  const storedBest = localStorage.getItem('bestScore');
  if (storedBest) {
    bestScore = parseInt(storedBest, 10);
  } else {
    bestScore = 0;
  }
  updateScoreDisplay();
}

// Initialize the game
function initGame() {
  board = createEmptyBoard();
  score = 0;
  won = false;
  spawnTile();
  spawnTile();
  renderBoard();
  hideMessage();
  updateScoreDisplay();
  // Save the freshly initialized game state so it can be resumed if the user leaves
  saveGameState();
  // Reset history and undo counter for a new game
  historyStack = [];
  undosRemaining = 3;
  updateUndoButton();
}

// Start a new game based on selected mode
function startGame(timed, customMinutes) {
  // Starting a fresh game clears any saved state
  clearGameState();
  // Update resume button visibility when starting a fresh game
  checkSavedGame();
  isTimedGame = timed;
  // Show game screen, hide other screens
  homeScreen.classList.add('hidden');
  settingsScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  initGame();
  if (isTimedGame) {
    // If a custom number of minutes is provided, convert to seconds; otherwise undefined uses default
    const seconds = typeof customMinutes === 'number' && !isNaN(customMinutes) && customMinutes > 0
      ? Math.floor(customMinutes * 60)
      : undefined;
    startTimer(seconds);
  } else {
    stopTimer();
  }
  // After starting a new game, ensure the undo button reflects fresh state
  updateUndoButton();
}

// Preferences: load from localStorage
function loadPreferences() {
  // Theme
  const storedTheme = localStorage.getItem('theme');
  currentTheme = storedTheme || 'default';
  applyTheme(currentTheme);
  themeSelect.value = currentTheme;
  // Sound
  const storedSound = localStorage.getItem('sound');
  soundEnabled = storedSound === 'true';
  soundToggle.checked = soundEnabled;
  // Vibration
  const storedVibration = localStorage.getItem('vibration');
  vibrationEnabled = storedVibration === 'true';
  vibrationToggle.checked = vibrationEnabled;
}

function savePreferences() {
  localStorage.setItem('theme', currentTheme);
  localStorage.setItem('sound', soundEnabled);
  localStorage.setItem('vibration', vibrationEnabled);
}

function applyTheme(theme) {
  if (theme === 'stealth') {
    document.body.classList.add('stealth');
  } else {
    document.body.classList.remove('stealth');
  }
}

// Update the undo button's label and disabled state based on remaining undos and history
function updateUndoButton() {
  if (!undoBtn) return;
  // Show the remaining count in the button text
  undoBtn.textContent = `Undo (${undosRemaining})`;
  // Disable when no history or no undos remaining
  if (historyStack.length === 0 || undosRemaining <= 0) {
    undoBtn.disabled = true;
  } else {
    undoBtn.disabled = false;
  }
}

// Push the current board state into the history stack before making a move.
function pushCurrentState() {
  const snapshot = {
    board: board.map(row => row.slice()),
    score: score,
    timeRemaining: isTimedGame ? timeRemaining : null,
    isTimedGame: isTimedGame
  };
  historyStack.push(snapshot);
  // Only keep the last three states
  if (historyStack.length > 3) {
    historyStack.shift();
  }
}

// Undo the last move, restoring the previous board, score, and timer.
function undoMove() {
  if (historyStack.length === 0 || undosRemaining <= 0) {
    return;
  }
  const lastState = historyStack.pop();
  undosRemaining--;
  // Restore board deep copy
  board = lastState.board.map(row => row.slice());
  score = lastState.score;
  // If the game was timed, restore remaining time and restart timer
  if (lastState.isTimedGame) {
    isTimedGame = true;
    timeRemaining = lastState.timeRemaining !== null ? lastState.timeRemaining : timeRemaining;
    // Restart timer
    startTimer(timeRemaining);
  }
  // Re-render board and update score
  renderBoard();
  updateScoreDisplay();
  updateTimerDisplay();
  // Persist current state so resuming works after undo
  saveGameState();
  updateUndoButton();
}

// Save current game state to localStorage so it can be resumed later.
function saveGameState() {
  try {
    const state = {
      board,
      score,
      bestScore,
      isTimedGame,
      timeRemaining,
      won,
      // Persist history and undo count so the user can resume with available undos
      historyStack: historyStack.map(item => ({
        board: item.board.map(row => row.slice()),
        score: item.score,
        timeRemaining: item.timeRemaining,
        isTimedGame: item.isTimedGame
      })),
      undosRemaining
    };
    localStorage.setItem('gameState', JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save game state:', e);
  }
}

// Remove saved game state when starting a fresh game or finishing.
function clearGameState() {
  localStorage.removeItem('gameState');
}

// Check whether a saved game exists and show/hide the resume button.
function checkSavedGame() {
  const saved = localStorage.getItem('gameState');
  if (saved) {
    resumeGameBtn.classList.remove('hidden');
  } else {
    resumeGameBtn.classList.add('hidden');
  }
}

// Resume a previously saved game.
function resumeGame() {
  const saved = localStorage.getItem('gameState');
  if (!saved) return;
  try {
    const state = JSON.parse(saved);
    board = Array.isArray(state.board)
      ? state.board.map(row => row.map(cell => (cell === null ? null : cell)))
      : createEmptyBoard();
    score = typeof state.score === 'number' ? state.score : 0;
    // restore best score from saved state if larger than current
    bestScore = typeof state.bestScore === 'number' ? state.bestScore : bestScore;
    isTimedGame = !!state.isTimedGame;
    timeRemaining = typeof state.timeRemaining === 'number' ? state.timeRemaining : 300;
    won = !!state.won;
    // Restore history and undo counter if present
    if (Array.isArray(state.historyStack)) {
      historyStack = state.historyStack.map(item => ({
        board: item.board.map(row => row.slice()),
        score: item.score,
        timeRemaining: item.timeRemaining,
        isTimedGame: item.isTimedGame
      }));
    } else {
      historyStack = [];
    }
    undosRemaining = typeof state.undosRemaining === 'number' ? state.undosRemaining : 3;
    // Show game screen
    homeScreen.classList.add('hidden');
    settingsScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    // Render board and scores
    renderBoard();
    updateScoreDisplay();
    hideMessage();
    // Start or stop timer based on mode
    if (isTimedGame) {
      startTimer(timeRemaining);
    } else {
      stopTimer();
    }
    // Update the undo button after restoring
    updateUndoButton();
  } catch (e) {
    console.warn('Could not resume game:', e);
  }
}

// Create empty board (2D array filled with null values)
function createEmptyBoard() {
  const arr = [];
  for (let r = 0; r < SIZE; r++) {
    arr[r] = [];
    for (let c = 0; c < SIZE; c++) {
      arr[r][c] = null;
    }
  }
  return arr;
}

// Spawn a new tile (2 or 4) at a random empty position
function spawnTile() {
  const emptyCells = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === null) {
        emptyCells.push({ r, c });
      }
    }
  }
  if (emptyCells.length === 0) return;
  const { r, c } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  board[r][c] = Math.random() < 0.9 ? 2 : 4;
}

// Render the board by updating DOM. Optionally accept a previous board
// state so that merge animations can be applied to newly doubled tiles.
function renderBoard(prevBoard = null) {
  // Clear existing tiles
  tileContainer.innerHTML = '';
  // Compute tile size based on the inner grid background's width. This avoids
  // misalignment when the container height changes (e.g. due to scrolling).
  const gridWrapper = tileContainer.parentElement; // .grid-container
  const gap = 15;
  // Use the width of the background grid to compute tile size
  const gridBg = gridWrapper.querySelector('.grid-background');
  const gridWidth = gridBg ? gridBg.clientWidth : (gridWrapper.clientWidth - 2 * 15);
  const tileSize = (gridWidth - gap * (SIZE - 1)) / SIZE;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const value = board[r][c];
      if (value !== null) {
        const tile = document.createElement('div');
        tile.classList.add('tile');
        tile.classList.add(`tile-${value > 2048 ? 'super' : value}`);
        tile.textContent = value;
        // Set tile dimensions
        tile.style.width = `${tileSize}px`;
        tile.style.height = `${tileSize}px`;
        // Compute translation positions
        const x = c * (tileSize + gap);
        const y = r * (tileSize + gap);
        // Expose x and y as CSS variables for animation keyframes
        tile.style.setProperty('--x', `${x}px`);
        tile.style.setProperty('--y', `${y}px`);
        // Base transform (translation only)
        tile.style.transform = `translate(${x}px, ${y}px)`;
        // Determine if this tile results from a merge and should be animated
        if (prevBoard) {
          const prevVal = prevBoard[r][c];
          // If the cell previously existed and the value doubled, apply animation for values >= 8
          if (prevVal !== null && value === prevVal * 2 && value >= 8) {
            // Choose animation based on the magnitude of the new value
            let animName;
            if (value <= 16) {
              animName = 'merge-small';
            } else if (value <= 64) {
              animName = 'merge-medium';
            } else {
              animName = 'merge-large';
            }
            tile.style.animation = `${animName} 0.3s ease`;
          }
        }
        tileContainer.appendChild(tile);
      }
    }
  }
}

// Update the score display
function updateScoreDisplay() {
  scoreContainer.textContent = score;
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem('bestScore', bestScore);
  }
  bestContainer.textContent = bestScore;
}

// Move functions return true if the board changed
function moveLeft() {
  let changed = false;
  for (let r = 0; r < SIZE; r++) {
    let row = board[r];
    let newRow = slideAndCombine(row);
    if (!arraysEqual(row, newRow)) {
      board[r] = newRow;
      changed = true;
    }
  }
  return changed;
}

function moveRight() {
  let changed = false;
  for (let r = 0; r < SIZE; r++) {
    let row = board[r].slice().reverse();
    let newRow = slideAndCombine(row);
    newRow.reverse();
    if (!arraysEqual(board[r], newRow)) {
      board[r] = newRow;
      changed = true;
    }
  }
  return changed;
}

function moveUp() {
  let changed = false;
  for (let c = 0; c < SIZE; c++) {
    let column = [];
    for (let r = 0; r < SIZE; r++) column.push(board[r][c]);
    let newColumn = slideAndCombine(column);
    for (let r = 0; r < SIZE; r++) {
      if (board[r][c] !== newColumn[r]) {
        board[r][c] = newColumn[r];
        changed = true;
      }
    }
  }
  return changed;
}

function moveDown() {
  let changed = false;
  for (let c = 0; c < SIZE; c++) {
    let column = [];
    for (let r = 0; r < SIZE; r++) column.push(board[r][c]);
    column.reverse();
    let newColumn = slideAndCombine(column);
    newColumn.reverse();
    for (let r = 0; r < SIZE; r++) {
      if (board[r][c] !== newColumn[r]) {
        board[r][c] = newColumn[r];
        changed = true;
      }
    }
  }
  return changed;
}

// Slide and combine a one-dimensional row/column (array of SIZE)
function slideAndCombine(array) {
  // Remove nulls
  let arr = array.filter(x => x !== null);
  // Combine adjacent equal numbers
  for (let i = 0; i < arr.length - 1; i++) {
    if (arr[i] === arr[i + 1]) {
      arr[i] *= 2;
      score += arr[i];
      arr[i + 1] = null;
      // Play sound and vibration if enabled
      playBeep();
      doVibrate();
      if (arr[i] === 2048 && !won) {
        won = true;
        showMessage('You win!');
      }
    }
  }
  // Remove nulls again and pad with nulls to maintain size
  let newArr = arr.filter(x => x !== null);
  while (newArr.length < SIZE) {
    newArr.push(null);
  }
  return newArr;
}

// Helper to compare two arrays for equality
function arraysEqual(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Play a short beep sound if enabled
function playBeep() {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(440, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.08);
  } catch (e) {
    console.warn('AudioContext error', e);
  }
}

// Vibrate the device briefly if enabled and supported
/**
 * Trigger a short vibration on supported devices when the player combines tiles.
 *
 * The original implementation only checked for the existence of the `vibrate`
 * property on the `navigator` object. Some browsers expose the API on
 * `window.navigator` instead, and older devices require the vibration pattern
 * to be passed as an array. This helper performs a more robust detection and
 * attempts both invocation forms to maximise compatibility.
 */
function doVibrate() {
  if (!vibrationEnabled) return;
  // Prefer the spec-compliant navigator.vibrate if available
  const nav = navigator || window.navigator;
  if (nav && typeof nav.vibrate === 'function') {
    // Try with a single number first; if that fails, try an array fallback
    const vibrated = nav.vibrate(50);
    if (!vibrated) {
      nav.vibrate([50]);
    }
  }
}

/**
 * Trigger a longer vibration pattern used for celebration (e.g. when the player
 * reaches the 2048 tile). Many platforms interpret an array of durations and
 * pauses as a vibration pattern. If vibration is disabled or unsupported,
 * nothing happens.
 */
function doLongVibrate() {
  if (!vibrationEnabled) return;
  const nav = navigator || window.navigator;
  if (nav && typeof nav.vibrate === 'function') {
    // Long vibration pattern: vibrate and pause repeatedly
    const pattern = [200, 100, 200, 100, 200, 100, 200];
    nav.vibrate(pattern);
  }
}

// Timer functions for timed game mode
function startTimer(initial) {
  // If an initial time is provided, use it; otherwise default to 5 minutes (300s)
  stopTimer();
  if (typeof initial === 'number') {
    timeRemaining = initial;
  } else {
    timeRemaining = 300;
  }
  updateTimerDisplay();
  timerContainer.classList.remove('hidden');
  timerInterval = setInterval(() => {
    timeRemaining--;
    updateTimerDisplay();
    // Persist remaining time so it can be resumed
    saveGameState();
    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      showMessage("Time's up! Game Over");
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerContainer.classList.add('hidden');
}

function updateTimerDisplay() {
  const mins = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
  const secs = (timeRemaining % 60).toString().padStart(2, '0');
  if (timerDisplay) {
    timerDisplay.textContent = `${mins}:${secs}`;
  }
}

// Check if no moves left
function isGameOver() {
  // If any cell empty => not over
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === null) return false;
    }
  }
  // Check moves left: if any adjacent equal numbers exist => not over
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      let current = board[r][c];
      if (r < SIZE - 1 && board[r + 1][c] === current) return false;
      if (c < SIZE - 1 && board[r][c + 1] === current) return false;
    }
  }
  return true;
}

// Display message overlay
function showMessage(text) {
  messageText.textContent = text;
  // Stop timer only if it's not a win message
  if (isTimedGame && !/win/i.test(text)) {
    stopTimer();
  }
  // Clear saved game state if the game is over (not a win). We don't want to resume finished games.
  if (!/win/i.test(text)) {
    clearGameState();
  }
  // Display overlay
  messageContainer.style.display = 'flex';
  if (text.includes('win')) {
    keepPlayingButton.style.display = 'inline-block';
    // Celebrate the win with a longer vibration pattern and confetti
    doLongVibrate();
    startConfetti();
  } else {
    keepPlayingButton.style.display = 'none';
  }
}

function hideMessage() {
  // Hide overlay completely
  messageContainer.style.display = 'none';
}

// Handle keyboard input
function handleKey(e) {
  if (messageContainer && messageContainer.style.display !== 'none') return;
  let moved = false;
  // Prepare a snapshot of the current state for undo before performing a move
  let snapshot = {
    board: board.map(row => row.slice()),
    score: score,
    timeRemaining: isTimedGame ? timeRemaining : null,
    isTimedGame: isTimedGame
  };
  switch (e.key) {
    case 'ArrowLeft':
      moved = moveLeft();
      break;
    case 'ArrowRight':
      moved = moveRight();
      break;
    case 'ArrowUp':
      moved = moveUp();
      break;
    case 'ArrowDown':
      moved = moveDown();
      break;
  }
  if (moved) {
    // Save snapshot to history for undo
    historyStack.push(snapshot);
    if (historyStack.length > 3) {
      historyStack.shift();
    }
    // After a successful move, spawn a new tile
    spawnTile();
    // Re-render board with previous board passed for animations
    renderBoard(snapshot.board);
    updateScoreDisplay();
    // Persist the current game state
    saveGameState();
    // Update undo button state after saving
    updateUndoButton();
    if (isGameOver()) {
      showMessage('Game Over');
    }
  }
}

// Handle touch events for mobile swipes
let touchStartX = 0;
let touchStartY = 0;
function handleTouchStart(e) {
  if (e.touches.length > 0) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    // Prevent page scroll when interacting with the active game
    const gameActive = !gameScreen.classList.contains('hidden');
    const messageVisible = messageContainer && messageContainer.style.display !== 'none';
    if (gameActive && !messageVisible) {
      e.preventDefault();
    }
  }
}

function handleTouchEnd(e) {
  if (messageContainer && messageContainer.style.display !== 'none') return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  let moved = false;
  if (Math.max(absDx, absDy) > 20) { // minimum swipe distance
    // Capture current state for undo
    const snapshot = {
      board: board.map(row => row.slice()),
      score: score,
      timeRemaining: isTimedGame ? timeRemaining : null,
      isTimedGame: isTimedGame
    };
    if (absDx > absDy) {
      moved = dx > 0 ? moveRight() : moveLeft();
    } else {
      moved = dy > 0 ? moveDown() : moveUp();
    }
    if (moved) {
      // Save snapshot to history
      historyStack.push(snapshot);
      if (historyStack.length > 3) {
        historyStack.shift();
      }
      spawnTile();
      // Use snapshot board for animations
      renderBoard(snapshot.board);
      updateScoreDisplay();
      // Save the state after each move so it can be resumed
      saveGameState();
      updateUndoButton();
      if (isGameOver()) {
        showMessage('Game Over');
      }
    }
  }
}

/**
 * Create and animate a simple confetti/fireworks effect on the page. The effect
 * draws colourful circles falling from the top of the viewport. It runs for a
 * limited time and then cleans itself up. If called multiple times while the
 * animation is already running, subsequent calls will be ignored.
 */
function startConfetti() {
  // Prevent multiple concurrent confetti animations
  if (confettiCanvas) return;
  // Create a full-screen canvas
  confettiCanvas = document.createElement('canvas');
  confettiCanvas.style.position = 'fixed';
  confettiCanvas.style.left = '0';
  confettiCanvas.style.top = '0';
  confettiCanvas.style.width = '100%';
  confettiCanvas.style.height = '100%';
  confettiCanvas.style.pointerEvents = 'none';
  confettiCanvas.style.zIndex = '999';
  document.body.appendChild(confettiCanvas);
  const ctx = confettiCanvas.getContext('2d');
  // Adjust canvas size to the viewport
  function resizeCanvas() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  }
  resizeCanvas();
  // Listen for resize events
  window.addEventListener('resize', resizeCanvas);
  // Generate particles
  const particleCount = 150;
  const particles = [];
  const colours = ['#ff5e5e', '#ffc15e', '#59c9a5', '#5dade2', '#af7ac5', '#f5b041'];
  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * confettiCanvas.width,
      y: Math.random() * -confettiCanvas.height,
      radius: Math.random() * 6 + 2,
      colour: colours[Math.floor(Math.random() * colours.length)],
      speedX: Math.random() * 4 - 2,
      speedY: Math.random() * 3 + 2,
      tilt: Math.random() * Math.PI
    });
  }
  // Animation loop
  function drawConfetti() {
    if (!ctx) return;
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    particles.forEach(p => {
      ctx.beginPath();
      // Draw as rectangles with tilt to mimic confetti pieces
      const tilt = Math.sin(p.tilt);
      ctx.moveTo(p.x + tilt, p.y);
      ctx.lineTo(p.x + p.radius + tilt, p.y);
      ctx.lineTo(p.x + p.radius, p.y + p.radius);
      ctx.lineTo(p.x, p.y + p.radius);
      ctx.closePath();
      ctx.fillStyle = p.colour;
      ctx.fill();
      // Update position
      p.x += p.speedX;
      p.y += p.speedY;
      p.tilt += 0.1;
      // Reset when off-screen
      if (p.y > confettiCanvas.height) {
        p.y = -p.radius;
        p.x = Math.random() * confettiCanvas.width;
      }
      if (p.x > confettiCanvas.width) p.x = 0;
      if (p.x < 0) p.x = confettiCanvas.width;
    });
    confettiAnimationId = requestAnimationFrame(drawConfetti);
  }
  drawConfetti();
  // Stop and clean up after 5 seconds
  setTimeout(() => {
    if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId);
    confettiAnimationId = null;
    window.removeEventListener('resize', resizeCanvas);
    if (confettiCanvas) {
      confettiCanvas.remove();
      confettiCanvas = null;
    }
  }, 5000);
}

// Prevent the page from scrolling when swiping on the game board. Without this
// handler mobile browsers may interpret swipe gestures as page scrolling,
// causing the screen to jump left, right, up or down while playing. We only
// suppress the default behaviour when the game screen is visible and no
// overlay message is shown to ensure that other pages or screens (e.g. the
// home or settings screen) remain scrollable.
function handleTouchMove(e) {
  // If the game screen is active and there is no game message overlay, block
  // the default touchmove to prevent page scrolling. Use classList.contains
  // rather than style checks for better reliability.
  const gameActive = !gameScreen.classList.contains('hidden');
  const messageVisible = messageContainer && messageContainer.style.display !== 'none';
  if (gameActive && !messageVisible) {
    e.preventDefault();
  }
}

// Game input listeners
window.addEventListener('keydown', handleKey);
// Use passive: false on touchstart so that handleTouchStart can call preventDefault() when needed
window.addEventListener('touchstart', handleTouchStart, { passive: false });
window.addEventListener('touchend', handleTouchEnd, { passive: true });
// Using { passive: false } here allows handleTouchMove to call preventDefault().
window.addEventListener('touchmove', handleTouchMove, { passive: false });

// PWA: register service worker if supported
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(err => {
      console.error('Service worker registration failed:', err);
    });
  });
}

// Page initialization
// Wait for DOM content loaded before accessing elements and adding event listeners.
document.addEventListener('DOMContentLoaded', () => {
  // Initialize best score storage and user preferences
  initStorage();
  loadPreferences();

  // Check for a saved game and toggle the resume button
  checkSavedGame();

  // Show the home screen on initial load
  homeScreen.classList.remove('hidden');
  settingsScreen.classList.add('hidden');
  gameScreen.classList.add('hidden');

  // Home screen buttons
  newGameBtn.addEventListener('click', () => {
    startGame(false);
  });

  timedGameBtn.addEventListener('click', () => {
    startGame(true);
  });

  // Start a timed game with a custom number of minutes from the input
  customTimeBtn.addEventListener('click', () => {
    const mins = parseFloat(customTimeInput.value);
    if (!isNaN(mins) && mins > 0) {
      startGame(true, mins);
    }
  });

  // Resume previously saved game if available
  resumeGameBtn.addEventListener('click', () => {
    resumeGame();
  });

  settingsBtn.addEventListener('click', () => {
    // Show settings screen and hide others
    homeScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    settingsScreen.classList.remove('hidden');
    // Refresh UI controls with current values
    themeSelect.value = currentTheme;
    soundToggle.checked = soundEnabled;
    vibrationToggle.checked = vibrationEnabled;
  });

  backBtn.addEventListener('click', () => {
    // Hide settings and return to home
    settingsScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
    gameScreen.classList.add('hidden');
    // Update resume button based on saved state
    checkSavedGame();
  });

  // Home button inside game screen: return to home without clearing game state
  homeBtn.addEventListener('click', () => {
    // Save state before leaving
    saveGameState();
    // Pause timer if in timed mode
    if (isTimedGame) {
      stopTimer();
    }
    gameScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
    settingsScreen.classList.add('hidden');
    checkSavedGame();
  });

  // Exit button on home screen: clear saved state and attempt to close the window
  exitBtn.addEventListener('click', () => {
    clearGameState();
    // Some browsers will not allow scripts to close windows not opened by them
    window.close();
  });

  // Settings controls
  themeSelect.addEventListener('change', () => {
    currentTheme = themeSelect.value;
    applyTheme(currentTheme);
    savePreferences();
  });

  soundToggle.addEventListener('change', () => {
    soundEnabled = soundToggle.checked;
    savePreferences();
  });

  vibrationToggle.addEventListener('change', () => {
    vibrationEnabled = vibrationToggle.checked;
    savePreferences();
  });

  // Retry button in the game message overlay: restart current game mode
  retryButton.addEventListener('click', () => {
    startGame(isTimedGame);
  });

  // Keep playing: hide message overlay but continue if timed game
  keepPlayingButton.addEventListener('click', () => {
    hideMessage();
    // If timed game, resume timer display if it was hidden for win overlay
    if (isTimedGame && timerInterval === null) {
      // Resume counting down with remaining time
      timerContainer.classList.remove('hidden');
      timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        if (timeRemaining <= 0) {
          clearInterval(timerInterval);
          timerInterval = null;
          showMessage("Time's up! Game Over");
        }
      }, 1000);
    }
  });

  // Undo button: restore the previous move
  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      undoMove();
    });
  }

  // Do not automatically start a game on load; wait for user selection from home screen.
});