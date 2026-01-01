const pool = require('./db');

async function setup() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS friend_requests (
        id SERIAL PRIMARY KEY,
        from_user VARCHAR(100) NOT NULL,
        to_user VARCHAR(100) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(from_user, to_user)
      );

      CREATE TABLE IF NOT EXISTS friends (
        id SERIAL PRIMARY KEY,
        user1 VARCHAR(100) NOT NULL,
        user2 VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user1, user2)
      );
    `);
    console.log(' Tables created: friend_requests, friends');
  } catch (err) {
    console.error(' Error:', err.message);
  }
}

module.exports = setup;

if (require.main === module) {
  setup().then(() => pool.end());
}
