const ROWS = 6;
const COLS = 7;

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () =>
    Array(COLS).fill(null)
  );
}

module.exports = {
  ROWS,
  COLS,
  createEmptyBoard
};
