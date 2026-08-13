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
exports.InspectionsService = void 0;
const common_1 = require("@nestjs/common");
const events_gateway_1 = require("../events/events.gateway");
let InspectionsService = class InspectionsService {
    constructor(eventsGateway) {
        this.eventsGateway = eventsGateway;
        this.latestRecord = {};
        this.history = [];
    }
    saveInspection(payload) {
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
};
exports.InspectionsService = InspectionsService;
exports.InspectionsService = InspectionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [events_gateway_1.EventsGateway])
], InspectionsService);
//# sourceMappingURL=inspections.service.js.map