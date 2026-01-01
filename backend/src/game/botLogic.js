const { dropDisc, checkWin } = require("./rules");

const ROWS = 6;
const COLS = 7;

const copyBoard = board => board.map(r => [...r]);

const dropRow = (board, col) => {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === null) return r;
  }
  return -1;
};

// instant win check
function findWin(board, player) {
  for (let c = 0; c < COLS; c++) {
    if (board[0][c] !== null) continue;
    const tmp = copyBoard(board);
    if (dropDisc(tmp, c, player) && checkWin(tmp, player)) {
      return c;
    }
  }
  return null;
}

function countLine(board, r, c, dr, dc, p) {
  let n = 0;
  r += dr; c += dc;
  while (
    r >= 0 && r < ROWS &&
    c >= 0 && c < COLS &&
    board[r][c] === p
  ) {
    n++;
    r += dr;
    c += dc;
  }
  return n;
}

// loose threat estimate
function pressureScore(board, player) {
  let score = 0;
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== player) continue;
      for (const [dr, dc] of dirs) {
        const cnt = 1 + countLine(board, r, c, dr, dc, player);
        if (cnt >= 3) score += 8;
        else if (cnt === 2) score += 3;
      }
    }
  }
  return score;
}

// avoid gifting a win
function isBlunder(board, col, bot, opp) {
  const r = dropRow(board, col);
  if (r <= 0) return false;

  const tmp = copyBoard(board);
  tmp[r][col] = bot;
  tmp[r - 1][col] = opp;

  return checkWin(tmp, opp);
}

// double-threat setup
function findFork(board, player) {
  for (let c = 0; c < COLS; c++) {
    if (board[0][c] !== null) continue;

    const base = copyBoard(board);
    if (!dropDisc(base, c, player)) continue;

    let wins = 0;
    for (let t = 0; t < COLS; t++) {
      if (base[0][t] !== null) continue;
      const test = copyBoard(base);
      if (dropDisc(test, t, player) && checkWin(test, player)) {
        wins++;
      }
    }
    if (wins >= 2) return c;
  }
  return null;
}

function evalCol(board, col, bot, opp) {
  if (board[0][col] !== null) return -Infinity;

  const r = dropRow(board, col);
  if (r < 0) return -Infinity;

  let score = 0;
  if (isBlunder(board, col, bot, opp)) score -= 800;

  const tmp = copyBoard(board);
  tmp[r][col] = bot;

  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of dirs) {
    const cnt =
      1 +
      countLine(tmp, r, col, dr, dc, bot) +
      countLine(tmp, r, col, -dr, -dc, bot);

    if (cnt >= 4) score += 900;
    else if (cnt === 3) score += 45;
    else if (cnt === 2) score += 12;
  }

  // center bias
  score += (3 - Math.abs(3 - col)) * 2;

  // lower = safer
  score += r * 2;

  score -= pressureScore(tmp, opp);
  return score;
}

function getBotMove(board) {
  const BOT = "P2";
  const HUMAN = "P1";

  const win = findWin(board, BOT);
  if (win !== null) return win;

  const block = findWin(board, HUMAN);
  if (block !== null) return block;

  const fork = findFork(board, BOT);
  if (fork !== null && !isBlunder(board, fork, BOT, HUMAN)) return fork;

  const stopFork = findFork(board, HUMAN);
  if (stopFork !== null && !isBlunder(board, stopFork, BOT, HUMAN)) return stopFork;

  let best = null;
  let bestScore = -Infinity;

  for (let c = 0; c < COLS; c++) {
    const s = evalCol(board, c, BOT, HUMAN);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }

  return best;
}

module.exports = { getBotMove };
