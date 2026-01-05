# Connect4 Project

This project is a full-stack Connect4 game with a Node.js backend and a React frontend. It supports real-time gameplay using WebSockets and Kafka for event streaming.

---


## Features
- Play Connect4 in real-time
- Bot logic for single-player mode
- WebSocket support for live updates
- Kafka integration for event streaming
- Modular backend and frontend code

---


## Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- [PostgreSQL](https://www.postgresql.org/) (required for backend database)
- [Kafka](https://kafka.apache.org/) (for event streaming, optional for local dev)

---

## Project Structure
```
railpack.toml
backend/
  package.json
  src/
    db.js
    server.js
    setup-db.js
    store.js
    websocket.js
    game/
      botLogic.js
      createGame.js
      gameState.js
      rules.js
      test.js
    kafka/
      consumer.js
      producer.js
frontend/
  package.json
  src/
    App.jsx
    gameBoard.jsx
    main.jsx
    socket.js
    ...
```

---

## Setup Instructions

### 1. Clone the Repository
```sh
git clone <your-repo-url>
cd connect4
```

### 2. Backend Setup
```sh
cd backend
npm install
```


#### Kafka Setup (Local Only)
- **Note:** Kafka analytics are implemented and fully functional in local development environments only.
- Due to cloud Kafka providers requiring a paid subscription, the deployed version does not include Kafka analytics.
- For local development, Kafka can be run using Docker and Windows Subsystem for Linux (WSL).
- Default Kafka configs are in `src/kafka/producer.js` and `src/kafka/consumer.js`.
- To use analytics, start a local Kafka instance (e.g., via Docker Compose) before running the backend.

**Message for Recruiters:**
> Kafka integration for game analytics is implemented and works locally with Docker/WSL. Cloud deployment was not possible due to paid Kafka service requirements. Please test analytics locally to see full functionality.


#### PostgreSQL Database Setup
- Install and start PostgreSQL on your machine. [Download PostgreSQL](https://www.postgresql.org/download/)
- Create a database for the project (e.g., `connect4`):
  ```sh
  createdb connect4
  ```
- Set the `DATABASE_URL` environment variable to your PostgreSQL connection string. Example:
  ```sh
  # On Windows (PowerShell)
  $env:DATABASE_URL = "postgresql://username:password@localhost:5432/connect4"
  # On Linux/macOS
  export DATABASE_URL="postgresql://username:password@localhost:5432/connect4"
  ```
- The backend uses PostgreSQL via the `pg` package (see `src/db.js`).
- To initialize the required tables, run:
  ```sh
  node src/setup-db.js
  ```

### 3. Frontend Setup
```sh
cd ../frontend
npm install
```

---

## Running the Application

### 1. Start the Backend Server
```sh
cd backend
npm start
```
- The backend server will start on the default port (check `src/server.js`).

### 2. Start the Frontend (React)
```sh
cd frontend
npm run dev
```
- The frontend will be available at [http://localhost:5173](http://localhost:5173) (default Vite port).

---

## Development
- **Backend:** All server logic is in `backend/src/`.
- **Frontend:** React components are in `frontend/src/`.
- **WebSocket:** Communication logic is in `backend/src/websocket.js` and `frontend/src/socket.js`.
- **Kafka:** Event streaming logic is in `backend/src/kafka/`.

---


## Troubleshooting
- **Port Conflicts:** Make sure ports used by backend and frontend are free.
- **PostgreSQL Issues:**
  - Ensure PostgreSQL is running and accessible.
  - Check that your `DATABASE_URL` is correct and the database exists.
  - If you see connection errors, verify your username, password, and host.
- **Kafka Issues:** If not using Kafka, comment out Kafka-related code in backend.
- **DB Issues:** If tables fail to initialize, check your PostgreSQL permissions and logs.
- **WebSocket Issues:** Ensure backend is running before starting frontend.

---




