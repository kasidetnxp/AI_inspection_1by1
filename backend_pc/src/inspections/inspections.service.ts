import { Injectable } from '@nestjs/common';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class InspectionsService {
  private latestRecord: any = {};
  private history: any[] = [];

  constructor(private readonly eventsGateway: EventsGateway) {}

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
    return {
      cpu: Math.floor(30 + Math.random() * 20),
      npu: Math.floor(80 + Math.random() * 15),
      ram: Math.floor(1024 + Math.random() * 200),
      temp: parseFloat((45.0 + Math.random() * 5.0).toFixed(1)),
      node: 'PC NestJS Central Server',
      db: 'PostgreSQL / Memory',
      edgeIp: process.env.EDGE_IP || '10.42.0.95',
    };
  }
}
