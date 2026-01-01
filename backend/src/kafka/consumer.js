require("dotenv").config();

// Early exit if Kafka is not configured
if (!process.env.KAFKA_BROKERS) {
  console.log("Kafka consumer disabled (no brokers configured)");
  module.exports = {
    startConsumer: async () => {}
  };
  return;
}

const { Kafka } = require("kafkajs");
const pool = require("../db");

const kafka = new Kafka({
  clientId: "connect4-analytics",
  brokers: process.env.KAFKA_BROKERS.split(",")
});

const consumer = kafka.consumer({ groupId: "analytics-group" });

async function startConsumer() {
  try {
    await consumer.connect();
    await consumer.subscribe({
      topic: "game-events",
      fromBeginning: false
    });

    console.log("analytics consumer up");

    await consumer.run({
      eachMessage: async ({ message }) => {
        try {
          const evt = JSON.parse(message.value.toString());
          if (evt.type !== "GAME_ENDED") return;

          const { payload, timestamp } = evt;
          const ts = new Date(timestamp);
          const day = ts.toISOString().slice(0, 10);
          const hour = ts.getHours();
          const duration = payload.durationMs || 0;

          // daily
          await pool.query(
            `
            INSERT INTO analytics_games_daily (day, games_count, total_duration_ms)
            VALUES ($1, 1, $2)
            ON CONFLICT (day)
            DO UPDATE SET
              games_count = analytics_games_daily.games_count + 1,
              total_duration_ms = analytics_games_daily.total_duration_ms + $2
            `,
            [day, duration]
          );

          // hourly
          await pool.query(
            `
            INSERT INTO analytics_games_hourly (day, hour, games_count)
            VALUES ($1, $2, 1)
            ON CONFLICT (day, hour)
            DO UPDATE SET
              games_count = analytics_games_hourly.games_count + 1
            `,
            [day, hour]
          );

          // winner
          if (payload.winner && payload.winner !== "Rose") {
            await pool.query(
              `
              INSERT INTO analytics_players
                (player, wins, losses, total_duration_ms, games_played)
              VALUES ($1, 1, 0, $2, 1)
              ON CONFLICT (player)
              DO UPDATE SET
                wins = analytics_players.wins + 1,
                total_duration_ms = analytics_players.total_duration_ms + $2,
                games_played = analytics_players.games_played + 1
              `,
              [payload.winner, duration]
            );
          }

          // loser
          if (payload.loser && payload.loser !== "Rose") {
            await pool.query(
              `
              INSERT INTO analytics_players
                (player, wins, losses, total_duration_ms, games_played)
              VALUES ($1, 0, 1, $2, 1)
              ON CONFLICT (player)
              DO UPDATE SET
                losses = analytics_players.losses + 1,
                total_duration_ms = analytics_players.total_duration_ms + $2,
                games_played = analytics_players.games_played + 1
              `,
              [payload.loser, duration]
            );
          }

          // draw
          if (!payload.winner && payload.players) {
            for (const p of payload.players) {
              if (p === "Rose") continue;

              await pool.query(
                `
                INSERT INTO analytics_players
                  (player, wins, losses, draws, total_duration_ms, games_played)
                VALUES ($1, 0, 0, 1, $2, 1)
                ON CONFLICT (player)
                DO UPDATE SET
                  draws = analytics_players.draws + 1,
                  total_duration_ms = analytics_players.total_duration_ms + $2,
                  games_played = analytics_players.games_played + 1
                `,
                [p, duration]
              );
            }
          }

          console.log(`stats updated: ${payload.gameId}`);
        } catch (e) {
          console.error("analytics error:", e.message);
        }
      }
    });
  } catch (e) {
    console.error(" consumer start failed:", e.message);
    console.log(" Kafka down, analytics skipped");
  }
}

module.exports = { startConsumer };
