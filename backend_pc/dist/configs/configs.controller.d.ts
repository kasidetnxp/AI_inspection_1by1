import { ConfigsService } from './configs.service';
export declare class ConfigsController {
    private readonly configsService;
    constructor(configsService: ConfigsService);
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
    listConfigs(type: string): {
        name: string;
        is_active: boolean;
    }[];
    getConfig(type: string, filename: string): any;
    saveConfig(type: string, payload: any): Promise<{
        status: string;
        filename: string;
        message: string;
    }>;
    activateRecipe(payload: {
        name: string;
        edge_ip?: string;
    }): Promise<{
        status: string;
        active_file: string;
    }>;
    activateMachine(payload: {
        name: string;
        edge_ip?: string;
    }): Promise<{
        status: string;
        active_file: string;
    }>;
    uploadConfig(type: string, file: Express.Multer.File, edgeIp?: string): Promise<{
        status: string;
        filename: string;
    }>;
    deleteConfig(type: string, filename: string): {
        status: string;
    };
}
