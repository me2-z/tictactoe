# 🎮 Multiplayer Tic Tac Toe (WebSocket)

A simple yet professional **multiplayer Tic Tac Toe game** built with **Node.js**, **Express**, and **WebSockets**. Players can create or join rooms, play in real time, track scores, and even join as spectators.

---

## ✨ Features

* 🔴 Real-time multiplayer gameplay using WebSockets
* 🏠 Create & join game rooms with short IDs
* 👥 Automatic player assignment (X / O / Spectator)
* 🧠 Win, draw & score tracking
* 🔄 Game reset without restarting the server
* 🌐 REST APIs for room creation & status
* ♻️ Auto cleanup of empty rooms

---

## 🛠 Tech Stack

* **Node.js** (v18+)
* **Express.js** – REST APIs & static file serving
* **ws** – WebSocket communication
* **NanoID** – Unique room & player IDs
* **Nodemon** – Development auto-reload

---

## 📂 Project Structure

```
├── server.js          # Main server & WebSocket logic
├── package.json       # Project metadata & scripts
├── package-lock.json  # Dependency lock file
├── public/            # Frontend files (if any)
└── README.md          # Project documentation
```

---

## 🚀 Getting Started

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/me2-z/tictactoe.git
cd tictactoe-game
```

### 2️⃣ Install Dependencies

```bash
npm install
```

### 3️⃣ Run the Server

**Development mode (with auto-restart):**

```bash
npm run dev
```

**Production mode:**

```bash
npm start
```

Server will start on:

```
http://localhost:7777
```

WebSocket endpoint:

```
ws://localhost:7777/ws
```

---

## 🔌 API Endpoints

### ➕ Create Room

```
POST /create-room
```

**Response:**

```json
{ "roomId": "ABC123" }
```

### 📄 Get Room Info

```
GET /room/:id
```

Returns board state, players, turn, status, and scores.

---

## 📡 WebSocket Events (Overview)

* `join` – Join a room
* `move` – Make a move
* `reset` – Restart the game
* `update` – Game state updates
* `player-joined` / `player-left`

---

## ⚙️ Environment Requirements

* Node.js **24.x or higher**
* npm

---

## 📜 License

This project is licensed under the **MIT License**.

---

## 🙌 Author

Developed by **Meet Zanzmera**

If you like this project, don’t forget to ⭐ the repository!
