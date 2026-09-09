import { TrainingService } from './training.service';
export declare class TrainingController {
    private readonly trainingService;
    constructor(trainingService: TrainingService);
    getModels(): {
        status: string;
        total: number;
        models: import("./training.service").ModelMetadata[];
    };
    uploadDataset(file: any, modelName: string, baseModelId?: string): Promise<any>;
    startTraining(params: {
        model_name: string;
        base_model?: string;
        epochs?: number;
        batch_size?: number;
        lr?: number;
        dataset_dir?: string;
    }): Promise<{
        status: string;
        model_name: string;
        pid: number;
        output_pth: string;
        output_tflite: string;
    }>;
    getStatus(): any;
    stopTraining(): {
        status: string;
        message: string;
    };
}
