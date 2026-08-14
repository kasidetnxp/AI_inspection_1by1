"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventsGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const WebSocket = require("ws");
let EventsGateway = class EventsGateway {
    constructor() {
        this.wss = null;
        this.wsClients = new Set();
    }
    initRawWebSocketServer(httpServer) {
        if (!httpServer || this.wss)
            return;
        try {
            this.wss = new WebSocket.Server({ noServer: true });
            const existingUpgradeListeners = httpServer.listeners('upgrade').slice();
            httpServer.removeAllListeners('upgrade');
            httpServer.on('upgrade', (request, socket, head) => {
                const urlStr = request.url || '';
                if (urlStr.includes('/ws/hardware') || urlStr.includes('/ws/metrics')) {
                    this.wss?.handleUpgrade(request, socket, head, (ws) => {
                        this.wss?.emit('connection', ws, request);
                    });
                }
                else {
                    for (const listener of existingUpgradeListeners) {
                        listener.call(httpServer, request, socket, head);
                    }
                }
            });
            this.wss.on('connection', (ws) => {
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
        }
        catch (e) {
            console.warn('⚠️ [NestJS PC] Could not attach raw WebSocket handler to HTTP server:', e);
        }
    }
    afterInit(server) {
    }
    handleConnection(client) {
        console.log(`💻 HMI Client Connected via Socket.io: ${client.id}`);
        client.emit('CONNECTION_ESTABLISHED', { node: 'PC NestJS Central Server', status: 'ONLINE' });
    }
    handleDisconnect(client) {
        console.log(`💻 HMI Client Disconnected: ${client.id}`);
    }
    handlePing(client) {
        return 'pong';
    }
    broadcastInspection(data) {
        if (this.server) {
            this.server.emit('NEW_INSPECTION', data);
        }
    }
    broadcastHardwareMetrics(data) {
        if (this.server) {
            this.server.emit('HARDWARE_METRICS', data);
            this.server.emit('hardware_metrics', data);
        }
        const jsonStr = JSON.stringify(data);
        this.wsClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(jsonStr);
            }
        });
    }
};
exports.EventsGateway = EventsGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], EventsGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('ping'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", String)
], EventsGateway.prototype, "handlePing", null);
exports.EventsGateway = EventsGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: '*',
        },
    })
], EventsGateway);
//# sourceMappingURL=events.gateway.js.map