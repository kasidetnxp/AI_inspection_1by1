import { EventsGateway } from '../events/events.gateway';
export declare class InspectionsService {
    private readonly eventsGateway;
    private latestRecord;
    private history;
    constructor(eventsGateway: EventsGateway);
    saveInspection(payload: any): {
        status: string;
        record: {
            id: any;
            wafer_id: any;
            timestamp: any;
            timeShort: any;
            decision: any;
            reason: any;
            padsTotal: any;
            padsDetected: any;
            probeMarks: any;
            grains: any;
            confidence: any;
            inferenceTime: any;
            ruleTime: any;
            machineAction: any;
            marks: any;
            grainList: any;
            alarms: any;
            imageUrl: any;
            annotatedImageUrl: any;
            comparisonImageUrl: any;
            rawImageUrl: any;
        };
    };
    getLatest(): any;
    getHistory(): any[];
    getStats(): {
        cpu: number;
        npu: number;
        ram: number;
        temp: number;
        node: string;
        db: string;
        edgeIp: string;
    };
}
