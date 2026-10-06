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
exports.ModelsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const os = require("os");
const models_service_1 = require("./models.service");
let ModelsController = class ModelsController {
    constructor(modelsService) {
        this.modelsService = modelsService;
    }
    getModels() {
        const list = this.modelsService.getAllModels();
        return {
            status: 'success',
            total: list.length,
            models: list,
        };
    }
    async uploadModel(file, customName) {
        if (!file) {
            throw new common_1.BadRequestException('No file uploaded.');
        }
        return await this.modelsService.uploadModel(file, customName);
    }
    async activateModel(body) {
        if (!body || !body.name) {
            throw new common_1.BadRequestException('Model name is required.');
        }
        return await this.modelsService.deployToEdge(body.name, body.edge_ip, body.recipe_name);
    }
    deleteModel(name) {
        if (!name) {
            throw new common_1.BadRequestException('Model name is required.');
        }
        return this.modelsService.deleteModel(name);
    }
};
exports.ModelsController = ModelsController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "getModels", null);
__decorate([
    (0, common_1.Post)('upload'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.diskStorage)({
            destination: os.tmpdir(),
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
                cb(null, `model-${uniqueSuffix}-${file.originalname}`);
            },
        }),
        limits: {
            fileSize: 1024 * 1024 * 1024,
        },
    })),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)('name')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ModelsController.prototype, "uploadModel", null);
__decorate([
    (0, common_1.Post)('activate'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ModelsController.prototype, "activateModel", null);
__decorate([
    (0, common_1.Delete)(':name'),
    __param(0, (0, common_1.Param)('name')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "deleteModel", null);
exports.ModelsController = ModelsController = __decorate([
    (0, common_1.Controller)('api/v1/models'),
    __metadata("design:paramtypes", [models_service_1.ModelsService])
], ModelsController);
//# sourceMappingURL=models.controller.js.map