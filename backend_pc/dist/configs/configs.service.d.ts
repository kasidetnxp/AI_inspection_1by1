export declare class ConfigsService {
    private readonly logger;
    private readonly projectRoot;
    private readonly configsDir;
    private readonly recipesDir;
    private readonly machinesDir;
    private readonly bindingsPath;
    constructor();
    private ensureDirectories;
    private getDir;
    private sanitizeFilename;
    private loadBindings;
    private saveBindings;
    getAllConfigs(): {
        recipes: {
            name: string;
            is_active: boolean;
        }[];
        machines: {
            name: string;
            is_active: boolean;
        }[];
        bindings: any;
        active_recipe: any;
        active_machine: any;
    };
    getActiveConfig(): {
        status: string;
        source: string;
        active_recipe: any;
        active_machine: any;
        product: any;
        machine: any;
        prober_name: any;
        computed: {
            failDistanceUm: number;
            maxAreaRatioPct: number;
            targetWidth: any;
            targetHeight: any;
            minAreaSizes: any;
            hRoi: any;
            vRoi: any;
            simulatedSourceFolder: any;
            simulatedJudgeFolder: any;
            processedFolder: any;
            outputFolder: any;
            isHardwareMounted: boolean;
        };
    };
    listConfigs(type: 'product' | 'machine'): {
        name: string;
        is_active: boolean;
    }[];
    getConfig(type: 'product' | 'machine', filename: string): any;
    saveConfig(type: 'product' | 'machine', payload: any): Promise<{
        status: string;
        filename: string;
        message: string;
    }>;
    activateConfig(type: 'product' | 'machine', filename: string, edgeIp?: string): Promise<{
        status: string;
        active_file: string;
    }>;
    handleUpload(type: 'product' | 'machine', file: Express.Multer.File, edgeIp?: string): Promise<{
        status: string;
        filename: string;
    }>;
    deleteConfig(type: 'product' | 'machine', filename: string): {
        status: string;
    };
}
