const { v4: uuidv4 } = require("uuid");
const { createEmptyBoard } = require("./gameState");

function createGame(player1, player2) {
  return {
    id: uuidv4(),
    board: createEmptyBoard(),
    players: {
      P1: player1,
      P2: player2
    },
    turn: "P1",
    createdAt: Date.now()
  };
}

module.exports = createGame;
