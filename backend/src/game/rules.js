const { ROWS } = require("./gameState");

function dropDisc(board, col, player) {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][col] === null) {
      board[row][col] = player;
      return { row, col };
    }
  }
  return null; 
}

module.exports = {
  dropDisc
};

function checkWin(board, player) {
  const directions = [
    [0, 1],   
    [1, 0],   
    [1, 1],   
    [1, -1],  
  ];

  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 7; c++) {
      if (board[r][c] !== player) continue;

      for (let [dr, dc] of directions) {
        let count = 0;

        for (let i = 0; i < 4; i++) {
          const nr = r + dr * i;
          const nc = c + dc * i;

          if (
            nr >= 0 && nr < 6 &&
            nc >= 0 && nc < 7 &&
            board[nr][nc] === player
          ) {
            count++;
          }
        }

        if (count === 4) return true;
      }
    }
  }
  return false;
}

function checkDraw(board) {
  return board[0].every(cell => cell !== null);
}

module.exports = {
  dropDisc,
  checkWin,
  checkDraw
};

