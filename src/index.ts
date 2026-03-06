import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { config } from "./config/index.js";
import { GameManager } from "./services/gameManager.js";
import { SocketHandlers } from "./socket/handlers.js";
import { RoomHandlers } from "./socket/roomHandlers.js";
async function startServer(): Promise<void> {
  try {
    // Connect to database
    await connectDatabase();

    // Create Express app
    const app = createApp();

    // Create HTTP server
    const httpServer = createServer(app);

    // Setup Socket.io
    const io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.corsOrigin,
        credentials: true,
      },
    });

    // Initialize game manager
    const gameManager = new GameManager();

    // Setup Socket handlers
    const socketHandlers = new SocketHandlers(gameManager);
    socketHandlers.registerHandlers(io);

    const roomHandlers = new RoomHandlers(gameManager);
    roomHandlers.registerHandlers(io);
    // Store instances for use in routes
    app.set("io", io);
    app.set("gameManager", gameManager);

    // Start listening
    httpServer.listen(config.port, () => {
      console.log(
        `[Server] Running on port ${config.port} in ${config.nodeEnv} mode`,
      );
    });

    // Graceful shutdown
    process.on("SIGINT", async () => {
      console.log("[Server] Shutting down gracefully...");
      gameManager.shutdown();
      httpServer.close(() => {
        console.log("[Server] HTTP server closed");
        process.exit(0);
      });
    });
  } catch (error) {
    console.error("[Server] Failed to start:", error);
    process.exit(1);
  }
}

startServer();
