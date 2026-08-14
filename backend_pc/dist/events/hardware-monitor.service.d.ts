import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
export interface HardwareMetrics {
    cpu: number;
    ram: number;
    temp: number;
    npu: number;
}
export declare class HardwareMonitorService implements OnModuleInit, OnModuleDestroy {
    private readonly eventsGateway;
    private wsClient;
    private reconnectTimer;
    private isDestroyed;
    private latestMetrics;
    constructor(eventsGateway: EventsGateway);
    onModuleInit(): void;
    onModuleDestroy(): void;
    getLatestMetrics(): HardwareMetrics;
    private connectToImx8HardwareWs;
    private scheduleReconnect;
}
