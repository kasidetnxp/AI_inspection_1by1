import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { Server as SocketIoServer, Socket } from 'socket.io';
export declare class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
    server: SocketIoServer;
    private wss;
    private wsClients;
    initRawWebSocketServer(httpServer: any): void;
    afterInit(server: SocketIoServer): void;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handlePing(client: Socket): string;
    broadcastInspection(data: any): void;
    broadcastHardwareMetrics(data: any): void;
}
