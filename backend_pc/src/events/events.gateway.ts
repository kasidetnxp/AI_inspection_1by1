import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server as SocketIoServer, Socket } from 'socket.io';
import * as WebSocket from 'ws';
import { Server as HttpServer } from 'http';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server: SocketIoServer;

  private wss: WebSocket.Server | null = null;
  private wsClients: Set<WebSocket> = new Set();

  initRawWebSocketServer(httpServer: any) {
    if (!httpServer || this.wss) return;
    try {
      this.wss = new WebSocket.Server({ noServer: true });

      const existingUpgradeListeners = httpServer.listeners('upgrade').slice();
      httpServer.removeAllListeners('upgrade');

      httpServer.on('upgrade', (request: any, socket: any, head: any) => {
        const urlStr = request.url || '';
        if (urlStr.includes('/ws/hardware') || urlStr.includes('/ws/metrics')) {
          this.wss?.handleUpgrade(request, socket, head, (ws) => {
            this.wss?.emit('connection', ws, request);
          });
        } else {
          for (const listener of existingUpgradeListeners) {
            listener.call(httpServer, request, socket, head);
          }
        }
      });

      this.wss.on('connection', (ws: WebSocket) => {
        console.log(`💻 [NestJS PC] HMI Client Connected via Raw WebSocket`);
        this.wsClients.add(ws);

        ws.on('close', () => {
          this.wsClients.delete(ws);
        });

        ws.on('error', () => {
          this.wsClients.delete(ws);
        });
      });
      console.log(`✅ [NestJS PC] Hardware Monitoring Raw WebSocket relay attached to /ws/hardware`);
    } catch (e) {
      console.warn('⚠️ [NestJS PC] Could not attach raw WebSocket handler to HTTP server:', e);
    }
  }

  afterInit(server: SocketIoServer) {
    // Standby init hook
  }

  handleConnection(client: Socket) {
    console.log(`💻 HMI Client Connected via Socket.io: ${client.id}`);
    client.emit('CONNECTION_ESTABLISHED', { node: 'PC NestJS Central Server', status: 'ONLINE' });
  }

  handleDisconnect(client: Socket) {
    console.log(`💻 HMI Client Disconnected: ${client.id}`);
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket): string {
    return 'pong';
  }

  broadcastInspection(data: any) {
    if (this.server) {
      this.server.emit('NEW_INSPECTION', data);
    }
  }

  broadcastHardwareMetrics(data: any) {
    // 1. Relay via Socket.IO
    if (this.server) {
      this.server.emit('HARDWARE_METRICS', data);
      this.server.emit('hardware_metrics', data);
    }

    // 2. Relay via Raw WebSockets
    const jsonStr = JSON.stringify(data);
    this.wsClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(jsonStr);
      }
    });
  }
}

