// CoScene relay server
// Sits between collaborators and shuffles scene changes around. It has no idea
// what's inside the messages and doesn't need to. All it does:
//   - make a room when someone wants to host
//   - let people join by code
//   - take whatever a client sends and pass it to everyone else in the room
//   - clean up when people leave (host leaves = room dies)

const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8080;

// All rooms live here in memory. key = room code, value = { hostId, clients }.
// Restart the server and they're gone. Totally fine for v1. If this ever runs on
// more than one instance you'd move this to Redis, but that's a future-me problem.
const rooms = new Map();
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 5;

function generateRoomCode() {
  let code;
  // ~33 million codes so collisions basically never happen, but check
  // anyway because "basically never" isn't "never".
  do {
    code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

// Each socket gets one of these so we can tell people apart in a room and avoid
// echoing a message back to whoever sent it.
let nextClientId = 1;
function generateClientId() {
  return "client-" + nextClientId++;
}

// Fire a message at one socket. Bail if it's not open (it might've died between
// us deciding to send and actually sending).
function send(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

// Same thing but to the whole room, skipping excludeId if you pass one (usually
// the sender, since they already know what they just did).
function broadcast(roomCode, obj, excludeId) {
  const room = rooms.get(roomCode);
  if (!room) return;
  for (const [clientId, clientWs] of room.clients) {
    if (clientId === excludeId) continue;
    send(clientWs, obj);
  }
}

// Pull a client out of their room and deal with the aftermath.
function removeClient(ws) {
  const { roomCode, clientId } = ws.meta;
  if (!roomCode) return;

  const room = rooms.get(roomCode);
  if (!room) return;

  room.clients.delete(clientId);

  if (room.hostId === clientId) {
    // Host bailed, so the whole thing's over. Let everyone know, kick them, nuke
    // the room.
    broadcast(roomCode, { type: "session_ended", reason: "host_left" });
    for (const [, clientWs] of room.clients) {
      // 4000-4999 is the app-defined close code range. Using 4000 so the Unity
      // side can tell "host ended it" apart from a real crash.
      clientWs.close(4000, "Host ended the session");
    }
    rooms.delete(roomCode);
    console.log(`Room ${roomCode} closed (host left)`);
  } else {
    // Just a regular person leaving. Tell the rest so they can drop them from
    // the user list and clear their camera marker.
    broadcast(roomCode, { type: "leave", clientId });
    console.log(`Client ${clientId} left room ${roomCode}`);
  }
}

// WebSocket server rides on top of a plain HTTP server. The HTTP side gives us a
// free /health route, which is what Render hits to check we're still breathing.
const httpServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("CoScene relay server is running.");
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  // Stash a little metadata on the socket so we always know who this is and what
  // room they're in.
  ws.meta = { clientId: generateClientId(), roomCode: null };
  console.log(`Socket connected: ${ws.meta.clientId}`);

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      // Got something that isn't JSON. Tell them off, don't die over it.
      send(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    switch (msg.type) {
      case "host": {
        // Start a fresh session.
        const roomCode = generateRoomCode();
        rooms.set(roomCode, {
          hostId: ws.meta.clientId,
          clients: new Map([[ws.meta.clientId, ws]]),
        });
        ws.meta.roomCode = roomCode;
        send(ws, {
          type: "hosted",
          roomCode,
          clientId: ws.meta.clientId,
        });
        console.log(`Room ${roomCode} created by ${ws.meta.clientId}`);
        break;
      }

      case "join": {
        // Hop into an existing room by code. uppercase it so codes aren't
        // case-sensitive for whoever's typing.
        const roomCode = (msg.roomCode || "").toUpperCase();
        const room = rooms.get(roomCode);

        if (!room) {
          send(ws, { type: "error", message: "Room not found" });
          return;
        }

        room.clients.set(ws.meta.clientId, ws);
        ws.meta.roomCode = roomCode;

        // Confirm they're in and hand over who's already here so their user list
        // isn't empty on arrival.
        send(ws, {
          type: "joined",
          roomCode,
          clientId: ws.meta.clientId,
          peers: [...room.clients.keys()].filter((id) => id !== ws.meta.clientId),
        });

        // And let everyone else know someone showed up.
        broadcast(roomCode, { type: "join", clientId: ws.meta.clientId }, ws.meta.clientId);
        console.log(`Client ${ws.meta.clientId} joined room ${roomCode}`);
        break;
      }

      case "leave": {
        // They asked to leave. Treat it exactly like a disconnect.
        removeClient(ws);
        ws.meta.roomCode = null;
        break;
      }

      default: {
        // Everything else (transforms, presence, whatever you add later) is just
        // payload the server doesn't care about. Slap the sender id on it and
        // pass it along. This is why adding new message types later needs zero
        // server changes.
        if (!ws.meta.roomCode) {
          send(ws, { type: "error", message: "Not in a room" });
          return;
        }
        msg.senderId = ws.meta.clientId;
        broadcast(ws.meta.roomCode, msg, ws.meta.clientId);
        break;
      }
    }
  });

  ws.on("close", () => {
    console.log(`Socket disconnected: ${ws.meta.clientId}`);
    removeClient(ws);
  });

  ws.on("error", (err) => {
    // Just log it and let the close handler clean up. One flaky socket shouldn't
    // be able to take the whole server down.
    console.error(`Socket error for ${ws.meta.clientId}:`, err.message);
  });
});

httpServer.listen(PORT, () => {
  console.log(`CoScene relay server listening on port ${PORT}`);
});
