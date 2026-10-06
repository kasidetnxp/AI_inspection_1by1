export interface ModelEntry {
    name: string;
    model_name: string;
    version: string;
    format: string;
    size: string;
    size_bytes: number;
    created_at: string;
    active: boolean;
    has_pth: boolean;
    has_tflite: boolean;
    pth_path?: string;
    tflite_path?: string;
    bound_recipe?: string;
    bound_machine?: string;
}
export declare class ModelsService {
    private readonly logger;
    private readonly projectRoot;
    private readonly masterDir;
    private readonly registryPath;
    private readonly recipesDir;
    private readonly machinesDir;
    private readonly bindingsPath;
    private readonly imx8ModelsDir;
    private readonly convertScript;
    private readonly pyBin;
    constructor();
    private ensureDirectories;
    private syncInitialModels;
    private loadBindings;
    private saveBindings;
    private loadRegistry;
    private saveRegistry;
    getAllModels(): ModelEntry[];
    uploadModel(file: Express.Multer.File, customName?: string): Promise<{
        status: string;
        name: string;
        size: string;
        converted: boolean;
        message: string;
        pth_name?: undefined;
    } | {
        status: string;
        name: string;
        pth_name: string;
        size: string;
        converted: boolean;
        message: string;
    }>;
    private runConversionProcess;
    private updateRegistryEntry;
    deployToEdge(modelName: string, edgeIp?: string, recipeName?: string): Promise<{
        status: string;
        active_model: string;
        active_recipe: any;
        active_machine: any;
        edge_response: any;
        message: string;
    }>;
    deleteModel(modelName: string): {
        status: string;
        message: string;
    };
}
