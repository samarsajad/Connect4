const { createEmptyBoard } = require("./gameState");
const { dropDisc, checkWin } = require("./rules");

const board = createEmptyBoard();

dropDisc(board, 0, "P1");
dropDisc(board, 1, "P1");
dropDisc(board, 2, "P1");
dropDisc(board, 3, "P1");

console.log(board);
console.log("P1 won?", checkWin(board, "P1"));
