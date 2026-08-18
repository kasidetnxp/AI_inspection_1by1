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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HardwareMonitorService = void 0;
const common_1 = require("@nestjs/common");
const WebSocket = require("ws");
const events_gateway_1 = require("./events.gateway");
let HardwareMonitorService = class HardwareMonitorService {
    constructor(eventsGateway) {
        this.eventsGateway = eventsGateway;
        this.wsClient = null;
        this.reconnectTimer = null;
        this.isDestroyed = false;
        this.latestMetrics = {
            cpu: 0,
            ram: 0,
            temp: 0,
            npu: -1,
        };
    }
    onModuleInit() {
        this.connectToImx8HardwareWs();
    }
    onModuleDestroy() {
        this.isDestroyed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.wsClient) {
            this.wsClient.close();
            this.wsClient = null;
        }
    }
    getLatestMetrics() {
        return this.latestMetrics;
    }
    connectToImx8HardwareWs() {
        if (this.isDestroyed)
            return;
        const primaryIp = process.env.EDGE_IP || '10.42.0.95';
        const targets = [primaryIp];
        if (primaryIp !== '127.0.0.1' && primaryIp !== 'localhost') {
            targets.push('127.0.0.1');
        }
        const tryConnect = (index) => {
            if (this.isDestroyed || index >= targets.length) {
                this.scheduleReconnect();
                return;
            }
            const targetIp = targets[index];
            const targetUrl = `ws://${targetIp}:8001/ws/hardware`;
            console.log(`📡 [NestJS PC] Connecting to i.MX8 Hardware WS at ${targetUrl}...`);
            try {
                const client = new WebSocket(targetUrl);
                let connected = false;
                client.on('open', () => {
                    connected = true;
                    this.wsClient = client;
                    console.log(`✅ [NestJS PC] Connected to i.MX8 Hardware WebSocket (${targetUrl})`);
                });
                client.on('message', (data) => {
                    try {
                        const payload = JSON.parse(data.toString());
                        this.latestMetrics = payload;
                        this.eventsGateway.broadcastHardwareMetrics(payload);
                    }
                    catch (e) {
                        console.error(`⚠️ [NestJS PC] Error parsing hardware metrics JSON:`, e);
                    }
                });
                client.on('error', (err) => {
                    console.warn(`⚠️ [NestJS PC] i.MX8 Hardware WS error (${targetUrl}): ${err.message}`);
                });
                client.on('close', () => {
                    if (connected) {
                        console.warn(`🔌 [NestJS PC] i.MX8 Hardware WS disconnected. Reconnecting in 3s...`);
                        this.scheduleReconnect();
                    }
                    else {
                        tryConnect(index + 1);
                    }
                });
            }
            catch (e) {
                console.error(`⚠️ [NestJS PC] Failed to initiate WS connection (${targetUrl}): ${e.message}`);
                tryConnect(index + 1);
            }
        };
        tryConnect(0);
    }
    scheduleReconnect() {
        if (this.isDestroyed)
            return;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        this.reconnectTimer = setTimeout(() => {
            this.connectToImx8HardwareWs();
        }, 3000);
    }
};
exports.HardwareMonitorService = HardwareMonitorService;
exports.HardwareMonitorService = HardwareMonitorService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)((0, common_1.forwardRef)(() => events_gateway_1.EventsGateway))),
    __metadata("design:paramtypes", [events_gateway_1.EventsGateway])
], HardwareMonitorService);
//# sourceMappingURL=hardware-monitor.service.js.map