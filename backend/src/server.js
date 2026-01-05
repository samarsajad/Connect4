require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const setupWebSocket = require("./websocket");
const pool = require("./db");
const { connectProducer } = require("./kafka/producer");
const { startConsumer } = require("./kafka/consumer");
const { onlineUsers } = require("./store");


const setupDB = require("./setup-db");
setupDB();

const app = express();

/* security */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests" },
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/api/", limiter);

const friendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many friend requests" }
});
app.use("/friends/request", friendLimiter);

const corsOptions = {
  origin:
    process.env.NODE_ENV === "production"
      ? process.env.CORS_ORIGIN
      : [
          "http://localhost:5173",
          "http://localhost:3000",
          "http://127.0.0.1:5173"
        ],
  credentials: true
};

app.use(cors(corsOptions));

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// basic param cleanup
app.use((req, _, next) => {
  if (req.query) {
    for (const k of Object.keys(req.query)) {
      if (Array.isArray(req.query[k])) {
        req.query[k] = req.query[k][0];
      }
    }
  }
  next();
});

const sanitizeUsername = username => {
  if (!username || typeof username !== "string") return null;
  const clean = username
    .trim()
    .slice(0, 20)
    .replace(/[^a-zA-Z0-9_]/g, "");
  return clean || null;
};

app.locals.sanitizeUsername = sanitizeUsername;

app.get("/", (_, res) => {
  res.send("Connect 4 backend running");
});

const server = http.createServer(app);
setupWebSocket(server);

const PORT = process.env.PORT || 3001;

if (process.env.KAFKA_BROKERS) {
  connectProducer();
  startConsumer();
  console.log("Kafka enabled");
} else {
  console.log("Kafka disabled (no brokers configured)");
}


server.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});

/* leaderboard */
app.get("/leaderboard", async (_, res) => {
  try {
    const result = await pool.query(`
      SELECT
        player,
        total_points,
        wins,
        CASE
          WHEN wins = 0 THEN 'Win games to enter a league'
          WHEN total_points >= 25 THEN 'Gold'
          WHEN total_points >= 10 THEN 'Silver'
          ELSE 'Bronze'
        END AS league
      FROM (
        SELECT
          player,
          SUM(points) AS total_points,
          SUM(win_flag) AS wins
        FROM (
          SELECT
            player1 AS player,
            CASE
              WHEN winner = player1 THEN 3
              WHEN winner IS NULL THEN 1
              ELSE 0
            END AS points,
            CASE WHEN winner = player1 THEN 1 ELSE 0 END AS win_flag
          FROM games
          UNION ALL
          SELECT
            player2 AS player,
            CASE
              WHEN winner = player2 THEN 3
              WHEN winner IS NULL THEN 1
              ELSE 0
            END,
            CASE WHEN winner = player2 THEN 1 ELSE 0 END
          FROM games
        ) s
        WHERE player != 'Rose'
        GROUP BY player
      ) l
      ORDER BY total_points DESC
    `);

    res.json(result.rows);
  } catch (e) {
    console.error("leaderboard error:", e.message);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

/* analytics */
app.get("/analytics", async (_, res) => {
  try {
    const gamesPerDay = await pool.query(`
      SELECT
        day,
        games_count,
        ROUND(total_duration_ms::numeric / NULLIF(games_count, 0) / 1000, 1)
          AS avg_duration_seconds
      FROM analytics_games_daily
      ORDER BY day DESC
      LIMIT 30
    `);

    const gamesPerHour = await pool.query(`
      SELECT hour, SUM(games_count) AS total_games
      FROM analytics_games_hourly
      WHERE day >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY hour
      ORDER BY hour
    `);

    const topWinners = await pool.query(`
      SELECT
        player,
        wins,
        losses,
        COALESCE(draws, 0) AS draws,
        games_played,
        ROUND((wins::numeric / NULLIF(games_played, 0)) * 100, 1) AS win_rate,
        ROUND(total_duration_ms::numeric / NULLIF(games_played, 0) / 1000, 1)
          AS avg_game_duration_seconds
      FROM analytics_players
      WHERE player != 'Rose'
      ORDER BY wins DESC
      LIMIT 10
    `);

    const overall = await pool.query(`
      SELECT
        COALESCE(SUM(games_count), 0) AS total_games,
        ROUND(SUM(total_duration_ms)::numeric / NULLIF(SUM(games_count), 0) / 1000, 1)
          AS avg_duration_seconds
      FROM analytics_games_daily
    `);

    res.json({
      gamesPerDay: gamesPerDay.rows,
      gamesPerHour: gamesPerHour.rows,
      topWinners: topWinners.rows,
      overallStats: overall.rows[0] || {}
    });
  } catch (e) {
    console.error("analytics error:", e.message);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

/* friends */
app.post("/friends/request", async (req, res) => {
  let { from, to } = req.body;
  from = sanitizeUsername(from);
  to = sanitizeUsername(to);

  if (!from || !to || from === to) {
    return res.status(400).json({ error: "Invalid request" });
  }

  try {
    const exists = await pool.query(
      `SELECT 1 FROM friends WHERE user1 = $1 AND user2 = $2`,
      [from, to]
    );
    if (exists.rows.length) {
      return res.status(400).json({ error: "Already friends" });
    }

    await pool.query(
      `
      INSERT INTO friend_requests (from_user, to_user, status)
      VALUES ($1, $2, 'pending')
      ON CONFLICT DO NOTHING
      `,
      [from, to]
    );

    const sock = onlineUsers.get(to);
    if (sock) {
      sock.send(
        JSON.stringify({ type: "FRIEND_REQUEST_RECEIVED", from })
      );
    }

    res.json({ success: true });
  } catch (e) {
    console.error("friend request error:", e.message);
    res.status(500).json({ error: "Server error: " + e.message });
  }
});

app.get("/friends/requests/:username", async (req, res) => {
  const { username } = req.params;
  if (!username) return res.json([]);

  try {
    const result = await pool.query(
      `SELECT id, from_user, created_at FROM friend_requests WHERE to_user = $1 AND status = 'pending'`,
      [username]
    );
    res.json(result.rows);
  } catch (e) {
    console.error("fetch requests error:", e.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/friends/accept", async (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return res.status(400).json({ error: "Missing requestId" });

  try {
    // Get request details
    const reqResult = await pool.query(
      `SELECT from_user, to_user FROM friend_requests WHERE id = $1 AND status = 'pending'`,
      [requestId]
    );
    if (reqResult.rows.length === 0) {
      return res.status(404).json({ error: "Request not found or already handled" });
    }
    const { from_user, to_user } = reqResult.rows[0];

    // Update request status
    await pool.query(`UPDATE friend_requests SET status = 'accepted' WHERE id = $1`, [requestId]);

    
    const u1 = from_user < to_user ? from_user : to_user;
    const u2 = from_user < to_user ? to_user : from_user;

    await pool.query(
      `INSERT INTO friends (user1, user2) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [u1, u2]
    );

    // Notify sender
    const sock = onlineUsers.get(from_user);
    if (sock) {
      sock.send(JSON.stringify({ type: "FRIEND_REQUEST_ACCEPTED", from: to_user }));
    }

    res.json({ success: true });
  } catch (e) {
    console.error("accept friend error:", e.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/friends/decline", async (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return res.status(400).json({ error: "Missing requestId" });

  try {
    await pool.query(`UPDATE friend_requests SET status = 'declined' WHERE id = $1`, [requestId]);
    res.json({ success: true });
  } catch (e) {
    console.error("decline friend error:", e.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/friends/:username", async (req, res) => {
  const { username } = req.params;
  if (!username) return res.json([]);

  try {
    const result = await pool.query(
      `
      SELECT user2 AS friend FROM friends WHERE user1 = $1
      UNION
      SELECT user1 AS friend FROM friends WHERE user2 = $1
      `,
      [username]
    );
    res.json(result.rows.map(r => r.friend));
  } catch (e) {
    console.error("fetch friends error:", e.message);
    res.status(500).json({ error: "Server error" });
  }
});

