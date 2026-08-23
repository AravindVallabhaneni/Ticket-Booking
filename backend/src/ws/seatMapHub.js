import { WebSocketServer } from 'ws';

const subscribers = new Map();

export function attachSeatHub(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (socket) => {
    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'subscribe' && msg.showId) {
          leave(socket);
          socket.showId = msg.showId;
          if (!subscribers.has(msg.showId)) subscribers.set(msg.showId, new Set());
          subscribers.get(msg.showId).add(socket);
          socket.send(JSON.stringify({ type: 'subscribed', showId: msg.showId }));
        }
      } catch {
        /* ignore */
      }
    });
    socket.on('close', () => leave(socket));
  });
  return wss;
}

function leave(socket) {
  if (!socket.showId) return;
  const set = subscribers.get(socket.showId);
  if (set) {
    set.delete(socket);
    if (!set.size) subscribers.delete(socket.showId);
  }
}

export function broadcastSeatUpdate(showId, seats) {
  const set = subscribers.get(showId);
  if (!set) return;
  const payload = JSON.stringify({
    type: 'seat_update',
    showId,
    seats,
    at: new Date().toISOString(),
  });
  for (const socket of set) {
    if (socket.readyState === 1) socket.send(payload);
  }
}
