import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EventsGateway } from './events/events.gateway';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS for React Frontend HMI
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: false,
  });

  const PORT = process.env.PORT || 3000;
  const EDGE_IP = process.env.EDGE_IP || '10.42.0.95';

  const httpServer = app.getHttpServer();
  const eventsGateway = app.get(EventsGateway);
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

