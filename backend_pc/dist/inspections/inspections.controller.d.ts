import { InspectionsService } from './inspections.service';
export declare class InspectionsController {
    private readonly inspectionsService;
    constructor(inspectionsService: InspectionsService);
    receiveInspection(payload: any): {
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
    getModels(): {
        name: string;
        version: string;
        engine: string;
        size: string;
        accuracy: string;
        active: boolean;
    }[];
}
