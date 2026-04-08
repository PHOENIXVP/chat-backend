const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// ===============================
// 🔥 In-memory storage (NO DB)
// ===============================
const users = {}; // socketId -> { username }
const randomQueue = []; // waiting users
const activeRooms = {}; // roomId -> [socketIds]

// ===============================
// 🟢 Health Check Route
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

    if (!user) return;

    io.to("global").emit("receiveGlobalMessage", {
      user: user.username,
      message,
      time: new Date(),
    });
  });

  // ===============================
  // 💬 PRIVATE MESSAGE (DM)
  // ===============================
  socket.on("privateMessage", ({ to, message }) => {
    const user = users[socket.id];

    if (!user || !users[to]) return;

    const payload = {
      from: socket.id,
      user: user.username,
      message,
      time: new Date(),
    };

    // Send to receiver
    io.to(to).emit("privateMessage", payload);

    // Send back to sender (for UI sync)
    socket.emit("privateMessage", payload);
  });

  // ===============================
  // 🎲 RANDOM MATCH
  // ===============================
  socket.on("findPartner", () => {
    console.log("🔍 Finding partner for", socket.id);

    // If someone waiting → match
    if (randomQueue.length > 0) {
      const partnerId = randomQueue.shift();

      const roomId = `room-${socket.id}-${partnerId}`;

      socket.join(roomId);
      io.sockets.sockets.get(partnerId)?.join(roomId);

      activeRooms[roomId] = [socket.id, partnerId];

      console.log("🎉 Matched:", roomId);

      io.to(roomId).emit("matched", {
        roomId,
        users: activeRooms[roomId],
      });
    } else {
      // Add to queue
      randomQueue.push(socket.id);
      console.log("⏳ Added to queue:", socket.id);
    }
  });

  // ===============================
  // 🎲 RANDOM CHAT MESSAGE
  // ===============================
  socket.on("randomMessage", ({ roomId, message }) => {
    const user = users[socket.id];
    if (!user) return;

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
    socket.leave(roomId);

    if (activeRooms[roomId]) {
      const partner = activeRooms[roomId].find((id) => id !== socket.id);

      io.to(partner).emit("partnerLeft");

      delete activeRooms[roomId];
    }
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
    if (index !== -1) randomQueue.splice(index, 1);

    // Remove from rooms
    for (let roomId in activeRooms) {
      if (activeRooms[roomId].includes(socket.id)) {
        const partner = activeRooms[roomId].find(
          (id) => id !== socket.id
        );

        io.to(partner).emit("partnerLeft");

        delete activeRooms[roomId];
      }
    }

    io.emit("onlineUsers", users);
  });
});

// ===============================
// 🚀 START SERVER
// ===============================
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
