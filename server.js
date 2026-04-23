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
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

// ===============================
// MEMORY
// ===============================
const users = {};
const randomQueue = [];
const activeRooms = {};

// ===============================
app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

// ===============================
io.on("connection", (socket) => {
  console.log("🟢 CONNECTED:", socket.id);

  // ===============================
  // JOIN
  // ===============================
  socket.on("join", (username) => {
    if (!username) return;

    users[socket.id] = { username };
    socket.join("global");

    console.log(`👤 JOINED: ${username} (${socket.id})`);
    console.log("👥 ONLINE USERS:", Object.keys(users));

    io.emit("onlineUsers", users);
  });

  // ===============================
  // GLOBAL MESSAGE
  // ===============================
  socket.on("sendGlobalMessage", (message) => {
    const user = users[socket.id];
    if (!user) return;

    console.log("🌍 GLOBAL MSG:", {
      from: user.username,
      message,
    });

    io.to("global").emit("receiveGlobalMessage", {
      user: user.username,
      message,
      time: new Date(),
    });
  });

  // ===============================
  // FIND PARTNER
  // ===============================
  socket.on("findPartner", () => {
    console.log("🔍 FIND PARTNER:", socket.id);

    if (randomQueue.includes(socket.id)) {
      console.log("⛔ Already in queue:", socket.id);
      return;
    }

    if (randomQueue.length > 0) {
      const partnerId = randomQueue.shift();

      console.log("🤝 TRY MATCH:", socket.id, "WITH", partnerId);

      const partnerSocket = io.sockets.sockets.get(partnerId);

      if (!partnerSocket) {
        console.log("❌ Partner disconnected:", partnerId);
        return;
      }

      const roomId = `room-${socket.id}-${partnerId}`;

      socket.join(roomId);
      partnerSocket.join(roomId);

      activeRooms[roomId] = [socket.id, partnerId];

      console.log("🎉 MATCHED ROOM:", roomId);
      console.log("🏠 ROOM USERS:", activeRooms[roomId]);

      io.to(roomId).emit("matched", {
        roomId,
        users: activeRooms[roomId],
      });
    } else {
      randomQueue.push(socket.id);
      console.log("⏳ ADDED TO QUEUE:", socket.id);
      console.log("📦 QUEUE SIZE:", randomQueue.length);
    }
  });

  // ===============================
  // RANDOM MESSAGE
  // ===============================
  socket.on("randomMessage", ({ roomId, message }) => {
    const user = users[socket.id];

    console.log("💬 RANDOM MESSAGE EVENT:");
    console.log("   FROM:", socket.id);
    console.log("   USER:", user?.username);
    console.log("   ROOM:", roomId);
    console.log("   MESSAGE:", message);

    if (!user || !roomId || !message) {
      console.log("❌ INVALID MESSAGE PAYLOAD");
      return;
    }

    const payload = {
      user: user.username,
      message,
      time: new Date(),
    };

    console.log("📤 SENDING TO ROOM:", roomId);
    console.log("📨 PAYLOAD:", payload);

    socket.to(roomId).emit("randomMessage", payload);
  });

  // ===============================
  // LEAVE
  // ===============================
  socket.on("leaveRandom", (roomId) => {
    console.log("🚪 LEAVE ROOM:", roomId);

    if (!activeRooms[roomId]) return;

    const roomUsers = activeRooms[roomId];
    const partner = roomUsers.find((id) => id !== socket.id);

    socket.leave(roomId);

    if (partner) {
      console.log("📢 NOTIFY PARTNER LEFT:", partner);
      io.to(partner).emit("partnerLeft");
    }

    delete activeRooms[roomId];
  });

  // ===============================
  // DISCONNECT
  // ===============================
  socket.on("disconnect", () => {
    console.log("🔴 DISCONNECTED:", socket.id);

    delete users[socket.id];

    const index = randomQueue.indexOf(socket.id);
    if (index !== -1) randomQueue.splice(index, 1);

    for (let roomId in activeRooms) {
      if (activeRooms[roomId].includes(socket.id)) {
        const partner = activeRooms[roomId].find(
          (id) => id !== socket.id
        );

        console.log("❌ CLEANING ROOM:", roomId);

        if (partner) {
          io.to(partner).emit("partnerLeft");
        }

        delete activeRooms[roomId];
      }
    }

    console.log("👥 ONLINE USERS AFTER DROP:", Object.keys(users));
  });
});

// ===============================
const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
