import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

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
}
