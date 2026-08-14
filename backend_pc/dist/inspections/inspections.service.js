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
exports.InspectionsService = void 0;
const common_1 = require("@nestjs/common");
const events_gateway_1 = require("../events/events.gateway");
const hardware_monitor_service_1 = require("../events/hardware-monitor.service");
let InspectionsService = class InspectionsService {
    constructor(eventsGateway, hardwareMonitorService) {
        this.eventsGateway = eventsGateway;
        this.hardwareMonitorService = hardwareMonitorService;
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
};
exports.InspectionsService = InspectionsService;
exports.InspectionsService = InspectionsService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => hardware_monitor_service_1.HardwareMonitorService))),
    __metadata("design:paramtypes", [events_gateway_1.EventsGateway,
        hardware_monitor_service_1.HardwareMonitorService])
], InspectionsService);
//# sourceMappingURL=inspections.service.js.map