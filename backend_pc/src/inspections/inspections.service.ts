import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { EventsGateway } from '../events/events.gateway';
import { HardwareMonitorService } from '../events/hardware-monitor.service';

@Injectable()
export class InspectionsService {
  private latestRecord: any = {};
  private history: any[] = [];

  constructor(
    private readonly eventsGateway: EventsGateway,
    @Inject(forwardRef(() => HardwareMonitorService))
    private readonly hardwareMonitorService: HardwareMonitorService,
  ) {}

  saveInspection(payload: any) {
    const formattedRecord = {
      id: payload.id || `#WF-${2940 + this.history.length + 1}`,
      wafer_id: payload.id || payload.wafer_id,
      timestamp: payload.timestamp || new Date().toLocaleString(),
      timeShort: payload.timeShort || new Date().toLocaleTimeString(),
      decision: payload.decision || 'PASS',
      reason: payload.reason || '-',
      padsTotal: payload.padsTotal || 1,
      padsDetected: payload.padsDetected || 1,
      probeMarks: payload.probeMarks || 0,
      grains: payload.grains || 0,
      confidence: payload.confidence || 95.0,
      inferenceTime: payload.inferenceTime || 16.5,
      ruleTime: payload.ruleTime || 2.1,
      machineAction: payload.machineAction || 'CONTINUE PROCESS',
      marks: payload.marks || [],
      grainList: payload.grainList || [],
      alarms: payload.alarms || [],
      imageUrl: payload.imageUrl,
      annotatedImageUrl: payload.annotatedImageUrl || payload.imageUrl,
      comparisonImageUrl: payload.comparisonImageUrl,
      rawImageUrl: payload.rawImageUrl,
    };

    this.latestRecord = formattedRecord;
    this.history.unshift(formattedRecord);

    // Broadcast to HMI Clients
    this.eventsGateway.broadcastInspection({
      event: 'NEW_INSPECTION',
      data: formattedRecord,
    });

    console.log(`🪺 [NestJS PC] Saved & Broadcasted Inspection: ${formattedRecord.id} -> ${formattedRecord.decision}`);
    return { status: 'SUCCESS', record: formattedRecord };
  }

  getLatest() {
    return this.latestRecord;
  }

  getHistory() {
    return this.history;
  }

  getStats() {
    const metrics = this.hardwareMonitorService ? this.hardwareMonitorService.getLatestMetrics() : { cpu: 0, ram: 0, temp: 0, npu: -1 };
    return {
      cpu: metrics.cpu,
      npu: metrics.npu,
      ram: metrics.ram,
      temp: metrics.temp,
      node: 'PC NestJS Central Server',
      db: 'PostgreSQL / Memory',
      edgeIp: process.env.EDGE_IP || '10.42.0.95',
    };
  }
}

