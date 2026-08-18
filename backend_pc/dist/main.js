"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const events_gateway_1 = require("./events/events.gateway");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.enableCors({
        origin: '*',
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        credentials: false,
    });
    const PORT = process.env.PORT || 3000;
    const EDGE_IP = process.env.EDGE_IP || '10.42.0.95';
    const httpServer = app.getHttpServer();
    const eventsGateway = app.get(events_gateway_1.EventsGateway);
    eventsGateway.initRawWebSocketServer(httpServer);
    await app.listen(PORT);
    console.log('============================================================');
    console.log(`🪺 NestJS Central PC Backend is running on: http://localhost:${PORT}`);
    console.log(`📡 WebSocket Gateway (Socket.io) ready on:  ws://localhost:${PORT}`);
    console.log(`👉 Ingestion Endpoint:                     POST http://localhost:${PORT}/api/v1/inspections`);
    console.log(`🌐 i.MX8 Edge Node Target IP:              http://${EDGE_IP}:8001`);
    console.log('============================================================');
}
bootstrap();
//# sourceMappingURL=main.js.map