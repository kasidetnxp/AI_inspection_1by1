export declare class Inspection {
    id: number;
    wafer_id: string;
    timestamp: string;
    decision: string;
    padsTotal: number;
    padsDetected: number;
    probeMarks: number;
    grains: number;
    confidence: number;
    inferenceTime: number;
    ruleTime: number;
    machineAction: string;
    reason: string;
    imageUrl: string;
    createdAt: Date;
}
