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
      )
    `);
    console.log(' friend_requests table created');
  } catch (err) {
    console.error(' Error:', err.message);
  } finally {
    pool.end();
  }
}

setup();
