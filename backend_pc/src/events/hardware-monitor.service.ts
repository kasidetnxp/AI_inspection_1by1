import { Injectable, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import * as WebSocket from 'ws';
import { EventsGateway } from './events.gateway';

export interface HardwareMetrics {
  cpu: number;
  ram: number;
  temp: number;
  npu: number;
}

@Injectable()
export class HardwareMonitorService implements OnModuleInit, OnModuleDestroy {
  private wsClient: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isDestroyed = false;
  private latestMetrics: HardwareMetrics = {
    cpu: 0,
    ram: 0,
    temp: 0,
    npu: -1,
  };

  constructor(
    @Inject(forwardRef(() => EventsGateway))
    private readonly eventsGateway: EventsGateway,
  ) {}

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

  getLatestMetrics(): HardwareMetrics {
    return this.latestMetrics;
  }

  private connectToImx8HardwareWs() {
    if (this.isDestroyed) return;

    const primaryIp = process.env.EDGE_IP || '10.42.0.95';
    const targets = [primaryIp];
    if (primaryIp !== '127.0.0.1' && primaryIp !== 'localhost') {
      targets.push('127.0.0.1');
    }

    const tryConnect = (index: number) => {
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

        client.on('message', (data: WebSocket.Data) => {
          try {
            const payload: HardwareMetrics = JSON.parse(data.toString());
            this.latestMetrics = payload;
            // Relay hardware metrics to connected frontend clients
            this.eventsGateway.broadcastHardwareMetrics(payload);
          } catch (e) {
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
          } else {
            // Try fallback target IP if available
            tryConnect(index + 1);
          }
        });
      } catch (e: any) {
        console.error(`⚠️ [NestJS PC] Failed to initiate WS connection (${targetUrl}): ${e.message}`);
        tryConnect(index + 1);
      }
    };

    tryConnect(0);
  }

  private scheduleReconnect() {
    if (this.isDestroyed) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = setTimeout(() => {
      this.connectToImx8HardwareWs();
    }, 3000);
  }
}
