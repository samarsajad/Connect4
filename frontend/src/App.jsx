import { useState, useEffect, useRef } from "react";
import { connectSocket } from "./socket";
import GameBoard from "./gameBoard";
import "./App.css";

const API_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

let socket;
let playerSymbol;
let currentGameId;

function fetchLeaderboard(setLeaderboard) {
  fetch(`${API_URL}/leaderboard`)
    .then(res => res.ok ? res.json() : Promise.reject())
    .then(data => Array.isArray(data) && setLeaderboard(data))
    .catch(() => {});
}

function fetchAnalytics(setAnalytics) {
  fetch(`${API_URL}/analytics`)
    .then(res => res.ok ? res.json() : Promise.reject())
    .then(data => setAnalytics(data))
    .catch(() => {});
}

function App() {
  const [username, setUsername] = useState("");
  const usernameRef = useRef("");
  const [status, setStatus] = useState("ENTER_NAME");
  const [board, setBoard] = useState(null);
  const [turn, setTurn] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [friends, setFriends] = useState([]);
  const [friendName, setFriendName] = useState("");
  const [friendReq, setfriendReq] = useState([]);
  const [challenge, setChallenge] = useState(null);
  const [challengeStat, setchallengeStat] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [opponentStat, setopponentStat] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  useEffect(() => {
    fetchLeaderboard(setLeaderboard);
    fetchAnalytics(setAnalytics);
  }, []);

  useEffect(() => {
    socket = connectSocket();

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      fetchLeaderboard(setLeaderboard);

      if (data.type === "OPPONENT_DISCONNECTED") {
        setopponentStat("Opponent disconnected. Waiting 30s...");
      }

      if (data.type === "OPPONENT_RECONNECTED") {
        setopponentStat(null);
      }

      if (data.type === "OPPONENT_FORFEITED") {
        setopponentStat(null);
        setGameOver("YOU WIN! (Opponent forfeited)");
        fetchAnalytics(setAnalytics);
      }

      if (data.type === "RECONNECTED") {
        playerSymbol = data.symbol;
        currentGameId = data.gameId;
        setBoard(data.board);
        setTurn(data.turn);
        setStatus(`${usernameRef.current} vs ${data.opponent}`);
        setopponentStat(null);
      }

      if (data.type === "CHALLENGE_RECEIVED") {
        setChallenge({ id: data.challengeId, from: data.from });
      }

      if (data.type === "CHALLENGE_DECLINED") {
        alert(`Challenge declined by ${data.by}`);
        setchallengeStat(null);
      }

      if (data.type === "CHALLENGE_SENT") {
        setchallengeStat(`Challenge sent to ${data.to}!`);
        setTimeout(() => setchallengeStat(null), 3000);
      }

      if (data.type === "ERROR") {
        setchallengeStat(`Error: ${data.message}`);
        setTimeout(() => setchallengeStat(null), 3000);
      }

      if (data.type === "FRIEND_REQUEST_RECEIVED") {
        const currentUsername = usernameRef.current;
        if (currentUsername) {
          fetch(`${API_URL}/friends/requests/${currentUsername}`)
            .then(res => res.json())
            .then(requestsData => setfriendReq(requestsData))
            .catch(() => {});
        }
      }

      if (data.type === "FRIEND_REQUEST_ACCEPTED") {
        const currentUsername = usernameRef.current;
        if (currentUsername) {
          fetch(`${API_URL}/friends/${currentUsername}`)
            .then(res => res.json())
            .then(friendsData => setFriends(friendsData))
            .catch(() => {});
        }
      }



      if (data.type === "WAITING") {
        setStatus("WAITING");
      }

      if (data.type === "MATCH_START") {
        playerSymbol = data.symbol;
        currentGameId = data.gameId;
        setchallengeStat(null);
        setBoard(Array(6).fill(null).map(() => Array(7).fill(null)));
        setTurn("P1");
        setStatus(`${usernameRef.current} vs ${data.opponent}`);
      }

      if (data.type === "BOARD_UPDATE") {
        setBoard(data.board);
        setTurn(data.turn);
      }

      if (data.type === "GAME_OVER") {
        setBoard(data.board);
        setopponentStat(null);
        fetchAnalytics(setAnalytics);
        if (data.winner) {
          setGameOver(data.winner === playerSymbol ? "YOU WIN!" : "YOU LOSE!");
        } else {
          setGameOver("DRAW!");
        }
      }
    };
  }, []);

  const goOnline = () => {
    if (!username) return;
    socket.send(JSON.stringify({ type: "GO_ONLINE", username }));
    setStatus("ONLINE");
  };

  const joinGame = () => {
    socket.send(JSON.stringify({ type: "JOIN", username }));
  };

  const fetchFriends = async () => {
    const res = await fetch(`${API_URL}/friends/${username}`);
    const data = await res.json();
    setFriends(data);
  };

  const challengeFriend = (friend) => {
    socket.send(JSON.stringify({
      type: "CHALLENGE_FRIEND",
      from: username,
      to: friend
    }));
  };

  const acceptChallenge = () => {
    socket.send(JSON.stringify({
      type: "ACCEPT_CHALLENGE",
      challengeId: challenge.id
    }));
    setChallenge(null);
  };

  const declineChallenge = () => {
    socket.send(JSON.stringify({
      type: "DECLINE_CHALLENGE",
      challengeId: challenge.id
    }));
    setChallenge(null);
  };

  const sendFriendReq = async () => {
    if (!username || !friendName) return;
    try {
      const response = await fetch(`${API_URL}/friends/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: username, to: friendName })
      });
      const result = await response.json();
      if (result.error) {
        alert(result.error);
      } else {
        alert(`Friend request sent to ${friendName}!`);
      }
      setFriendName("");
    } catch (err) {
      console.error(err);
    }
  };

  const fetchfriendReq = async () => {
    if (!username) return;
    try {
      const res = await fetch(`${API_URL}/friends/requests/${username}`);
      const data = await res.json();
      setfriendReq(data);
    } catch (err) {
      console.error(err);
    }
  };

  const acceptFriendReq = async (requestId) => {
    try {
      const response = await fetch(`${API_URL}/friends/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId })
      });
      const result = await response.json();
      if (result.success) {
        fetchFriends();
        fetchfriendReq();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const declineFriendReq = async (requestId) => {
    try {
      await fetch(`${API_URL}/friends/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId })
      });
      fetchfriendReq();
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    usernameRef.current = username;
    if (username) {
      fetchFriends();
      fetchfriendReq();
    }
  }, [username]);

  const makeMove = (column) => {
    if (!currentGameId || gameOver) return;
    socket.send(JSON.stringify({
      type: "MOVE",
      gameId: currentGameId,
      column,
      player: playerSymbol
    }));
  };

  const getLeagueClass = (league) => {
    if (league === 'Gold') return 'league-gold';
    if (league === 'Silver') return 'league-silver';
    if (league === 'Bronze') return 'league-bronze';
    return '';
  };

  return (
    <div className="container">
      {challenge && (
        <>
          <div className="modal" />
          <div className="ch-modal">
            <h3>Challenge!</h3>
            <p><strong>{challenge.from}</strong> wants to play!</p>
            <div className="ch-m-btn">
              <button className="btn-success" onClick={acceptChallenge}>Accept</button>
              <button className="btn-danger" onClick={declineChallenge}>Decline</button>
            </div>
          </div>
        </>
      )}

      <div className="main-content">
        <div className="header">
          <h1>Connect 4</h1>
        </div>

        {status === "ENTER_NAME" && (
          <div className="card">
            <h3>Welcome! Enter your username to start</h3>
            <div className="input-group">
              <input
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && username && goOnline()}
              />
              <button className="btn-pri" onClick={goOnline} disabled={!username}>
                Go Online
              </button>
            </div>
          </div>
        )}

        {status === "ONLINE" && (
          <>
            <div className="card welcome-section">
              <h2>Welcome, <span className="welcome-username">{username}</span>!</h2>
              <button className="btn-pri" onClick={joinGame}>Find Random Match</button>
            </div>

            <div className="card">
              <h3>Friends ({friends.length})</h3>
              <div className="input-group">
                <input
                  placeholder="Add friend by username"
                  value={friendName}
                  onChange={(e) => setFriendName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && friendName && sendFriendReq()}
                />
                <button className="btn-sec" onClick={sendFriendReq} disabled={!friendName}>
                  Send Request
                </button>
              </div>

              {friendReq.length > 0 && (
                <div className="fr-sec" style={{ marginBottom: '20px' }}>
                  <h4 style={{ margin: '10px 0' }}>Friend Requests</h4>
                  <ul className="fr-list">
                    {friendReq.map((req) => (
                      <li key={req.id} className="fr-item" style={{ justifyContent: 'space-between' }}>
                        <span className="fr-name">{req.from_user}</span>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <button className="btn-pri btn-small" onClick={() => acceptFriendReq(req.id)}>Accept</button>
                          <button className="btn-sec btn-small" onClick={() => declineFriendReq(req.id)}>Decline</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {challengeStat && (
                <div className={`status-message ${challengeStat.startsWith("Error") ? "status-error" : "status-success"}`}>
                  {challengeStat}
                </div>
              )}

              {friends.length === 0 ? (
                <p style={{ opacity: 0.7 }}>No friends yet. Add someone to play together!</p>
              ) : (
                <ul className="fr-list">
                  {friends.map((f) => (
                    <li key={f} className="fr-item">
                      <div className="fr-name">
                        <span className="online-dot"></span>
                        {f}
                      </div>
                      <button className="btn-pri btn-small" onClick={() => challengeFriend(f)}>
                         Challenge
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {/* Waiting Screen */}
        {status === "WAITING" && (
          <div className="card">
            <div className="status-message status-info">
              <span className="waiting-dots"> Searching for opponent</span>
            </div>
            {friends.length > 0 && (
              <>
                <h3>Or challenge a friend:</h3>
                <ul className="fr-list">
                  {friends.map((f) => (
                    <li key={f} className="fr-item">
                      <div className="fr-name">
                        <span className="online-dot"></span>
                        {f}
                      </div>
                      <button className="btn-pri btn-small" onClick={() => challengeFriend(f)}>
                         Challenge
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {/* Playing Screen */}
        {status.includes(" vs ") && (
          <div className="card">
            <div className="game-info">
              <h2>{status}</h2>
              <p>Your symbol: <strong style={{ color: playerSymbol === 'P1' ? '#ff6b6b' : '#feca57' }}>
                {playerSymbol === 'P1' ? '🔴' : '🟡'}
              </strong></p>
              <p>Turn: <strong style={{ color: turn === 'P1' ? '#ff6b6b' : '#feca57' }}>
                {turn === 'P1' ? '🔴 Red' : '🟡 Yellow'}
              </strong></p>
              {opponentStat && (
                <div className="opponent-status">{opponentStat}</div>
              )}
            </div>
            {gameOver && (
              <div className={`game-result ${gameOver.includes("WIN") ? "win" : gameOver.includes("LOSE") ? "lose" : "draw"}`}>
                {gameOver}
              </div>
            )}
            {board && <GameBoard board={board} onMove={makeMove} />}
          </div>
        )}
      </div>

      {/* Leaderboard */}
      <div className="lb-sb">
        <div className="sb-tabs">
          <button 
            className={!showAnalytics ? 'tab-active' : ''} 
            onClick={() => setShowAnalytics(false)}
          >
            Leaderboard
          </button>
          <button 
            className={showAnalytics ? 'tab-active' : ''} 
            onClick={() => setShowAnalytics(true)}
          >
            Analytics
          </button>
        </div>

        {!showAnalytics ? (
          <>
            <table className="lb-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Pts</th>
                  <th>W</th>
                  <th>League</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', opacity: 0.5 }}>
                      No players yet
                    </td>
                  </tr>
                ) : (
                  leaderboard.map((row, index) => (
                    <tr key={index}>
                      <td className={index < 3 ? `rank-${index + 1}` : ''}>
                        {index + 1}
                      </td>
                      <td>{row.player}</td>
                      <td>{row.total_points}</td>
                      <td>{row.wins}</td>
                      <td className={getLeagueClass(row.league)}>{row.league}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        ) : (
          <div className="analytics-panel">
            {analytics ? (
              <>
                <div style={{background:'#fffbe6',border:'1px solid #ffe58f',padding:'10px',marginBottom:'16px',borderRadius:'6px',color:'#ad8b00'}}>
                  <strong>Note:</strong> Kafka analytics are implemented and work locally with Docker/WSL. Cloud deployment does not include analytics due to paid Kafka service requirements. Please test analytics locally to see full functionality.
                </div>
                <div className="analytics-stat">
                  <span className="stat-label">Total Games</span>
                  <span className="stat-val">{analytics.overallStats?.total_games || 0}</span>
                </div>
                <div className="analytics-stat">
                  <span className="stat-label">Avg Duration</span>
                  <span className="stat-val">{analytics.overallStats?.avg_duration_seconds || 0}s</span>
                </div>

                <h4> Top Winners</h4>
                <table className="lb-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>W</th>
                      <th>L</th>
                      <th>Win%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.topWinners?.length === 0 ? (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', opacity: 0.5 }}>
                          No data yet
                        </td>
                      </tr>
                    ) : (
                      analytics.topWinners?.map((player, index) => (
                        <tr key={index}>
                          <td>{player.player}</td>
                          <td>{player.wins}</td>
                          <td>{player.losses}</td>
                          <td>{player.win_rate}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                <h4> Games Per Hour (Last 7 days)</h4>
                <div className="hour-list">
                  {analytics.gamesPerHour?.length === 0 ? (
                    <p style={{ opacity: 0.5 }}>No data yet</p>
                  ) : (
                    analytics.gamesPerHour?.map((h) => (
                      <div key={h.hour} className="hour-item">
                        <span>{h.hour}:00</span>
                        <span>{h.total_games} games</span>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <p style={{ textAlign: 'center', opacity: 0.5 }}>Loading analytics...</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
