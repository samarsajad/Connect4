const waitingPlayer = {
  socket: null,
  username: null,
  timeout: null
};

const games = new Map();
const onlineUsers = new Map();
const friendChallenges = new Map();
const disconnectedPlayers = new Map();

module.exports = {
  waitingPlayer,
  games,
  onlineUsers,
  friendChallenges,
  disconnectedPlayers
};
