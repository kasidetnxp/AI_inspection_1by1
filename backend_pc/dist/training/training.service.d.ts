export interface ModelMetadata {
    model_name: string;
    pth_path: string;
    tflite_path: string;
    dataset_dir: string;
    train_count: number;
    val_count: number;
    created_at: string;
    base_model: string | null;
    val_miou?: number;
}
export declare class TrainingService {
    private readonly logger;
    private readonly pyBin;
    private readonly caseUnetRoot;
    private readonly registryPath;
    private readonly datasetsRoot;
    private readonly weightsDir;
    private readonly tfliteDir;
    private readonly statusFilePath;
    private activeProcess;
    private activeJobParams;
    constructor();
    private ensureDirectories;
    private syncInitialRegistry;
    getModels(): ModelMetadata[];
    prepareDataset(file: any, modelName: string, baseModelId?: string): Promise<any>;
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
    private registerModel;
    getStatus(): any;
    stopTraining(): {
        status: string;
        message: string;
    };
}
