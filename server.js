const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

// ✅ Important for Render + stability
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

// ===============================
// 🔥 In-memory storage (NO DB)
// ===============================
const users = {}; // socketId -> { username }
const randomQueue = []; // waiting users
const activeRooms = {}; // roomId -> [socketIds]

// ===============================
// 🟢 Health Check
// ===============================
app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

// ===============================
// 🔌 Socket Connection
// ===============================
io.on("connection", (socket) => {
  console.log("✅ Connected:", socket.id);

  // ===============================
  // 👤 JOIN USER
  // ===============================
  socket.on("join", (username) => {
    if (!username) return;

    users[socket.id] = { username };

    socket.join("global");

    console.log(`👤 ${username} joined`);

    io.emit("onlineUsers", users);
  });

  // ===============================
  // 🌍 GLOBAL CHAT
  // ===============================
  socket.on("sendGlobalMessage", (message) => {
    const user = users[socket.id];
    if (!user || !message) return;

    io.to("global").emit("receiveGlobalMessage", {
      user: user.username,
      message,
      time: new Date(),
    });
  });

  // ===============================
  // 💬 PRIVATE MESSAGE
  // ===============================
  socket.on("privateMessage", ({ to, message }) => {
    const user = users[socket.id];

    if (!user || !users[to] || !message) return;

    const payload = {
      from: socket.id,
      user: user.username,
      message,
      time: new Date(),
    };

    // Send to receiver
    io.to(to).emit("privateMessage", payload);

    // Send back to sender
    socket.emit("privateMessage", payload);
  });

  // ===============================
  // 🎲 RANDOM MATCH
  // ===============================
  socket.on("findPartner", () => {
    console.log("🔍 Finding partner for", socket.id);

    // ❗ Prevent duplicate queue entries
    if (randomQueue.includes(socket.id)) return;

    // If someone waiting → match
    if (randomQueue.length > 0) {
      const partnerId = randomQueue.shift();

      // ❗ Skip if partner disconnected
      if (!io.sockets.sockets.get(partnerId)) {
        return;
      }

      const roomId = `room-${socket.id}-${partnerId}`;

      socket.join(roomId);
      io.sockets.sockets.get(partnerId).join(roomId);

      activeRooms[roomId] = [socket.id, partnerId];

      console.log("🎉 Matched:", roomId);

      io.to(roomId).emit("matched", {
        roomId,
        users: activeRooms[roomId],
      });
    } else {
      randomQueue.push(socket.id);
      console.log("⏳ Added to queue:", socket.id);
    }
  });

  // ===============================
  // 🎲 RANDOM CHAT MESSAGE
  // ===============================
  socket.on("randomMessage", ({ roomId, message }) => {
    const user = users[socket.id];
    if (!user || !roomId || !message) return;

    socket.to(roomId).emit("randomMessage", {
      user: user.username,
      message,
      time: new Date(),
    });
  });

  // ===============================
  // ❌ LEAVE RANDOM CHAT
  // ===============================
  socket.on("leaveRandom", (roomId) => {
    if (!activeRooms[roomId]) return;

    const roomUsers = activeRooms[roomId];
    const partner = roomUsers.find((id) => id !== socket.id);

    socket.leave(roomId);

    if (partner) {
      io.to(partner).emit("partnerLeft");
    }

    delete activeRooms[roomId];
  });

  // ===============================
  // 🔌 DISCONNECT
  // ===============================
  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);

    // Remove user
    delete users[socket.id];

    // Remove from queue
    const index = randomQueue.indexOf(socket.id);
    if (index !== -1) {
      randomQueue.splice(index, 1);
    }

    // Handle active rooms
    for (let roomId in activeRooms) {
      if (activeRooms[roomId].includes(socket.id)) {
        const partner = activeRooms[roomId].find(
          (id) => id !== socket.id
        );

        if (partner) {
          io.to(partner).emit("partnerLeft");
        }

        delete activeRooms[roomId];
      }
    }

    io.emit("onlineUsers", users);
  });
});

// ===============================
// 🚀 START SERVER (Render-safe)
// ===============================
const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
