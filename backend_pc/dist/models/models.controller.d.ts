import { ModelsService } from './models.service';
export declare class ModelsController {
    private readonly modelsService;
    constructor(modelsService: ModelsService);
    getModels(): {
        status: string;
        total: number;
        models: import("./models.service").ModelEntry[];
    };
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
    activateModel(body: {
        name: string;
        edge_ip?: string;
        recipe_name?: string;
    }): Promise<{
        status: string;
        active_model: string;
        active_recipe: any;
        active_machine: any;
        edge_response: any;
        message: string;
    }>;
    deleteModel(name: string): {
        status: string;
        message: string;
    };
}
