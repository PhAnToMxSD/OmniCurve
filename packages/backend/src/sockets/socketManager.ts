import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';

let io: Server;

export const initializeSocket = (server: HttpServer) => {
  io = new Server(server, {
    cors: {
      origin: '*', // Adjust for production environments
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    // Allow clients to subscribe to specific market updates
    socket.on('joinMarket', (marketId: string) => {
      socket.join(marketId);
      console.log(`[Socket.io] Client ${socket.id} joined market: ${marketId}`);
    });

    socket.on('leaveMarket', (marketId: string) => {
      socket.leave(marketId);
      console.log(`[Socket.io] Client ${socket.id} left market: ${marketId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

/**
 * Broadcasts market state updates to all clients subscribed to the specific market's room
 */
export const broadcastMarketUpdate = (
  marketId: string, 
  newData: { currentMu: number; currentSigma: number; totalLiquidity: number }
) => {
  if (io) {
    io.to(marketId).emit('marketStateUpdated', newData);
  } else {
    console.warn('[Socket.io] Socket server not initialized yet');
  }
};

/**
 * Broadcasts a market resolution event to all clients in the market's room
 */
export const broadcastMarketResolved = (
  marketId: string,
  data: { winningTokenId: string }
) => {
  if (io) {
    io.to(marketId).emit('marketResolved', data);
  } else {
    console.warn('[Socket.io] Socket server not initialized yet');
  }
};
