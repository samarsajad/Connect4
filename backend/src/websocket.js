const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");

const pool = require("./db");
const { waitingPlayer, games, onlineUsers, disconnectedPlayers } = require("./store");

const { createEmptyBoard } = require("./game/gameState");
const createGame = require("./game/createGame");
const { dropDisc, checkWin, checkDraw } = require("./game/rules");
const { getBotMove } = require("./game/botLogic");

const { emitEvent } = require("./kafka/producer");

// validation helpers
function sanitizeUsername(username) {
  if (!username || typeof username !== "string") return null;
  const sanitized = username.trim().slice(0, 20).replace(/[^a-zA-Z0-9_]/g, "");
  return sanitized.length >= 1 ? sanitized : null;
}

function isValidUUID(id) {
  if (!id || typeof id !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// rate limit: 10 messages per second per user
const rateLimits = new Map();
function checkRateLimit(username) {
  if (!username) return true;
  const now = Date.now();
  const limit = rateLimits.get(username);
  
  if (!limit || now > limit.resetTime) {
    rateLimits.set(username, { count: 1, resetTime: now + 1000 });
    return true;
  }
  if (limit.count >= 10) return false;
  limit.count++;
  return true;
}

// save game to db and emit kafka event
async function endGame(game, winner) {
  const payload = JSON.stringify({
    type: "GAME_OVER",
    winner,
    board: game.board
  });

  if (game.players.P1.socket) game.players.P1.socket.send(payload);
  if (game.players.P2.socket) game.players.P2.socket.send(payload);

  try {
    await pool.query(
      `INSERT INTO games (id, player1, player2, winner, created_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        game.id,
        game.players.P1.username,
        game.players.P2.username,
        winner === "P1" ? game.players.P1.username
          : winner === "P2" ? game.players.P2.username
          : null,
        new Date(game.createdAt)
      ]
    );
    console.log("Game saved:", game.id);
  } catch (err) {
    console.error("DB save failed:", err.message);
  }

  emitEvent("GAME_ENDED", {
    gameId: game.id,
    winner: winner === "P1" ? game.players.P1.username
      : winner === "P2" ? game.players.P2.username
      : null,
    loser: winner === "P1" ? game.players.P2.username
      : winner === "P2" ? game.players.P1.username
      : null,
    players: [game.players.P1.username, game.players.P2.username],
    durationMs: Date.now() - game.createdAt
  });

  games.delete(game.id);
}

// Reconnection logic
async function forfeitGame(gameId, disconnectedSymbol) {
  const game = games.get(gameId);
  if (!game) return;

  const winnerSymbol = disconnectedSymbol === "P1" ? "P2" : "P1";
  console.log(`Forfeit: ${game.players[disconnectedSymbol].username} didn't reconnect`);
  
  const winnerSocket = game.players[winnerSymbol].socket;
  if (winnerSocket && winnerSocket.readyState === WebSocket.OPEN) {
    winnerSocket.send(JSON.stringify({
      type: "OPPONENT_FORFEITED",
      message: "Opponent disconnected. You win!"
    }));
  }

  await endGame(game, winnerSymbol);
}

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws) => {
    console.log("New client connected");
    let currentUsername = null;

    ws.on("message", async (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch (e) {
        ws.send(JSON.stringify({ type: "ERROR", message: "Invalid message format" }));
        return;
      }

      if (!checkRateLimit(currentUsername)) {
        ws.send(JSON.stringify({ type: "ERROR", message: "Too many messages, slow down!" }));
        return
      }

      // GO_ONLINE 
      if (msg.type === "GO_ONLINE") {
        const username = sanitizeUsername(msg.username);
        if (!username) {
          ws.send(JSON.stringify({ type: "ERROR", message: "Invalid username" }));
          return;
        }
        currentUsername = username;
        onlineUsers.set(username, ws);
        console.log(`${username} is online`);
        
        // check for reconnection
        const disconnectInfo = disconnectedPlayers.get(username);
        if (disconnectInfo) {
          const game = games.get(disconnectInfo.gameId);
          if (game) {
            clearTimeout(disconnectInfo.timeout);
            disconnectedPlayers.delete(username);
            game.players[disconnectInfo.symbol].socket = ws;
            
            console.log(`${username} reconnected to game`);
            
            ws.send(JSON.stringify({
              type: "RECONNECTED",
              gameId: disconnectInfo.gameId,
              symbol: disconnectInfo.symbol,
              opponent: game.players[disconnectInfo.symbol === "P1" ? "P2" : "P1"].username,
              board: game.board,
              turn: game.turn
            }));
            
            const opponentSymbol = disconnectInfo.symbol === "P1" ? "P2" : "P1";
            const opponentSocket = game.players[opponentSymbol].socket;
            if (opponentSocket && opponentSocket.readyState === WebSocket.OPEN) {
              opponentSocket.send(JSON.stringify({
                type: "OPPONENT_RECONNECTED",
                message: "Opponent has reconnected!"
              }));
            }
            return;
          }
        }
        
        ws.send(JSON.stringify({ type: "ONLINE", username }));
        return;
      }

      // JOIN 
      if (msg.type === "JOIN") {
        const username = sanitizeUsername(msg.username);
        if (!username) {
          ws.send(JSON.stringify({ type: "ERROR", message: "Invalid username" }));
          return;
        }
        currentUsername = username;
        onlineUsers.set(username, ws);
        console.log(`${username} joining matchmaking`);

        // no one waiting - start waiting
        if (!waitingPlayer.socket) {
          waitingPlayer.socket = ws;
          waitingPlayer.username = username;

          // Bot match after 10s
          waitingPlayer.timeout = setTimeout(() => {
            const gameId = uuidv4();
            const game = {
              id: gameId,
              board: createEmptyBoard(),
              players: {
                P1: { socket: ws, username },
                P2: { socket: null, username: "Rose" }
              },
              turn: "P1",
              isBot: true,
              createdAt: Date.now()
            };

            games.set(gameId, game);

            ws.send(JSON.stringify({
              type: "MATCH_START",
              gameId,
              opponent: "Rose",
              symbol: "P1"
            }));

            ws.send(JSON.stringify({
              type: "BOARD_UPDATE",
              board: game.board,
              turn: game.turn
            }));

            emitEvent("GAME_STARTED", {
              gameId,
              players: [username, "Rose"],
              startedAt: game.createdAt
            });

            waitingPlayer.socket = null;
            waitingPlayer.username = null;
            waitingPlayer.timeout = null;

            console.log("Bot game started:", gameId);
          }, 10000);

          ws.send(JSON.stringify({
            type: "WAITING",
            message: "Waiting for opponent..."
          }));

          return;
        }

        // Matching logic
        clearTimeout(waitingPlayer.timeout);

        const player1 = { socket: waitingPlayer.socket, username: waitingPlayer.username };
        const player2 = { socket: ws, username };

        const game = createGame(player1, player2);
        games.set(game.id, game);

        player1.socket.send(JSON.stringify({
          type: "MATCH_START",
          gameId: game.id,
          opponent: username,
          symbol: "P1"
        }));

        player2.socket.send(JSON.stringify({
          type: "MATCH_START",
          gameId: game.id,
          opponent: player1.username,
          symbol: "P2"
        }));

        const initialState = JSON.stringify({
          type: "BOARD_UPDATE",
          board: game.board,
          turn: game.turn
        });
        player1.socket.send(initialState);
        player2.socket.send(initialState);

        emitEvent("GAME_STARTED", {
          gameId: game.id,
          players: [player1.username, player2.username],
          startedAt: game.createdAt
        });

        waitingPlayer.socket = null;
        waitingPlayer.username = null;
        waitingPlayer.timeout = null;

        console.log("Human game started:", game.id);
        return;
      }

      // CHALLENGE_FRIEND
      if (msg.type === "CHALLENGE_FRIEND") {
        const { from, to } = msg;
        if (!from || !to || typeof from !== 'string' || typeof to !== 'string') {
          ws.send(JSON.stringify({ type: "ERROR", message: "Invalid challenge data" }));
          return;
        }
        
        const sanitizedFrom = sanitizeUsername(from);
        const sanitizedTo = sanitizeUsername(to);
        
        if (!sanitizedFrom || !sanitizedTo || sanitizedFrom === sanitizedTo) {
          ws.send(JSON.stringify({ type: "ERROR", message: "Invalid usernames" }));
          return;
        }
        
        console.log(`Challenge: ${sanitizedFrom} -> ${sanitizedTo}`);

        const opponentSocket = onlineUsers.get(sanitizedTo);
        if (!opponentSocket) {
          ws.send(JSON.stringify({
            type: "ERROR",
            message: "Friend is offline"
          }));
          return;
        }

        const challengeId = uuidv4();
        const { friendChallenges } = require("./store");
        friendChallenges.set(challengeId, { from: sanitizedFrom, to: sanitizedTo });

        opponentSocket.send(JSON.stringify({
          type: "CHALLENGE_RECEIVED",
          challengeId,
          from: sanitizedFrom
        }));

        ws.send(JSON.stringify({ type: "CHALLENGE_SENT", to: sanitizedTo }));
        return;
      }

      // ACCEPT CHALLENGE
      if (msg.type === "ACCEPT_CHALLENGE") {
        const { challengeId } = msg;
        if (!challengeId || !isValidUUID(challengeId)) {
          ws.send(JSON.stringify({ type: "ERROR", message: "Invalid challenge" }));
          return;
        }

        const { friendChallenges } = require("./store");
        const challenge = friendChallenges.get(challengeId);
        if (!challenge) return;

        const { from, to } = challenge;
        const p1Socket = onlineUsers.get(from);
        const p2Socket = onlineUsers.get(to);

        if (!p1Socket || !p2Socket) return;

        const game = createGame(
          { socket: p1Socket, username: from },
          { socket: p2Socket, username: to }
        );
        games.set(game.id, game);

        p1Socket.send(JSON.stringify({
          type: "MATCH_START",
          gameId: game.id,
          opponent: to,
          symbol: "P1"
        }));

        p2Socket.send(JSON.stringify({
          type: "MATCH_START",
          gameId: game.id,
          opponent: from,
          symbol: "P2"
        }));

        const initialState = JSON.stringify({
          type: "BOARD_UPDATE",
          board: game.board,
          turn: game.turn
        });
        p1Socket.send(initialState);
        p2Socket.send(initialState);

        emitEvent("GAME_STARTED", {
          gameId: game.id,
          players: [from, to],
          startedAt: game.createdAt
        });

        friendChallenges.delete(challengeId);
        console.log(`Friend game started: ${from} vs ${to}`);
        return;
      }

      // DECLINE CHALLENGE
      if (msg.type === "DECLINE_CHALLENGE") {
        const { challengeId } = msg;
        if (!challengeId || !isValidUUID(challengeId)) return;

        const { friendChallenges } = require("./store");
        const challenge = friendChallenges.get(challengeId);
        if (!challenge) return;

        const challengerSocket = onlineUsers.get(challenge.from);
        if (challengerSocket) {
          challengerSocket.send(JSON.stringify({
            type: "CHALLENGE_DECLINED",
            by: challenge.to
          }));
        }

        friendChallenges.delete(challengeId);
        return;
      }

      // MOVE
      if (msg.type === "MOVE") {
        const { gameId, column, player } = msg;
        
        if (!gameId || !isValidUUID(gameId)) {
          ws.send(JSON.stringify({ type: "ERROR", message: "Invalid game" }));
          return;
        }
        if (typeof column !== 'number' || column < 0 || column > 6 || !Number.isInteger(column)) {
          ws.send(JSON.stringify({ type: "ERROR", message: "Invalid column" }));
          return;
        }
        if (player !== "P1" && player !== "P2") {
          ws.send(JSON.stringify({ type: "ERROR", message: "Invalid player" }));
          return;
        }
        
        const game = games.get(gameId);
        if (!game || game.turn !== player) return;

        const move = dropDisc(game.board, column, player);
        if (!move) return;

        if (checkWin(game.board, player)) {
          await endGame(game, player);
          return;
        }

        if (checkDraw(game.board)) {
          await endGame(game, null);
          return;
        }

        game.turn = player === "P1" ? "P2" : "P1";

        // bot game
        if (game.isBot) {
          game.players.P1.socket.send(JSON.stringify({
            type: "BOARD_UPDATE",
            board: game.board,
            turn: game.turn
          }));

          setTimeout(async () => {
            const botCol = getBotMove(game.board);
            if (botCol == null) return;

            dropDisc(game.board, botCol, "P2");

            if (checkWin(game.board, "P2")) {
              await endGame(game, "P2");
              return;
            }

            if (checkDraw(game.board)) {
              await endGame(game, null);
              return;
            }

            game.turn = "P1";
            game.players.P1.socket.send(JSON.stringify({
              type: "BOARD_UPDATE",
              board: game.board,
              turn: game.turn
            }));
          }, 500);
          return;
        }

        // human game
        const payload = JSON.stringify({
          type: "BOARD_UPDATE",
          board: game.board,
          turn: game.turn
        });
        game.players.P1.socket.send(payload);
        game.players.P2.socket.send(payload);
      }
    });

    // Disconnect
    ws.on("close", () => {
      if (!currentUsername) return;
      
      onlineUsers.delete(currentUsername);
      console.log(`${currentUsername} went offline`);

      for (const [gameId, game] of games.entries()) {
        if (game.isBot) continue;

        let playerSymbol = null;
        if (game.players.P1.username === currentUsername) playerSymbol = "P1";
        else if (game.players.P2.username === currentUsername) playerSymbol = "P2";

        if (playerSymbol) {
          console.log(`${currentUsername} disconnected. 30s to reconnect...`);
          
          const opponentSymbol = playerSymbol === "P1" ? "P2" : "P1";
          const opponentSocket = game.players[opponentSymbol].socket;
          if (opponentSocket && opponentSocket.readyState === WebSocket.OPEN) {
            opponentSocket.send(JSON.stringify({
              type: "OPPONENT_DISCONNECTED",
              message: "Opponent disconnected. Waiting 30s..."
            }));
          }

          const forfeitTimeout = setTimeout(() => {
            forfeitGame(gameId, playerSymbol);
            disconnectedPlayers.delete(currentUsername);
          }, 30000);

          disconnectedPlayers.set(currentUsername, {
            gameId,
            symbol: playerSymbol,
            disconnectedAt: Date.now(),
            timeout: forfeitTimeout
          });

          game.players[playerSymbol].socket = null;
          break;
        }
      }
    });
  });
}

module.exports = setupWebSocket;
