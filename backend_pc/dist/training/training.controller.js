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
exports.TrainingController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const training_service_1 = require("./training.service");
const multer_1 = require("multer");
const os = require("os");
let TrainingController = class TrainingController {
    constructor(trainingService) {
        this.trainingService = trainingService;
    }
    getModels() {
        const models = this.trainingService.getModels();
        return {
            status: 'success',
            total: models.length,
            models,
        };
    }
    async uploadDataset(file, modelName, baseModelId) {
        if (!file) {
            throw new common_1.BadRequestException('No dataset ZIP file uploaded.');
        }
        if (!modelName || modelName.trim() === '') {
            throw new common_1.BadRequestException('model_name is required.');
        }
        const result = await this.trainingService.prepareDataset(file, modelName, baseModelId);
        return result;
    }
    async startTraining(params) {
        if (!params.model_name || params.model_name.trim() === '') {
            throw new common_1.BadRequestException('model_name is required to start training.');
        }
        return await this.trainingService.startTraining(params);
    }
    getStatus() {
        return this.trainingService.getStatus();
    }
    stopTraining() {
        return this.trainingService.stopTraining();
    }
};
exports.TrainingController = TrainingController;
__decorate([
    (0, common_1.Get)('models'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TrainingController.prototype, "getModels", null);
__decorate([
    (0, common_1.Post)('upload-dataset'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.diskStorage)({
            destination: os.tmpdir(),
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
                cb(null, `dataset-${uniqueSuffix}.zip`);
            },
        }),
        limits: {
            fileSize: 500 * 1024 * 1024,
        },
    })),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)('model_name')),
    __param(2, (0, common_1.Body)('base_model_id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "uploadDataset", null);
__decorate([
    (0, common_1.Post)('start'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "startTraining", null);
__decorate([
    (0, common_1.Get)('status'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TrainingController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Post)('stop'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TrainingController.prototype, "stopTraining", null);
exports.TrainingController = TrainingController = __decorate([
    (0, common_1.Controller)('api/v1/training'),
    __metadata("design:paramtypes", [training_service_1.TrainingService])
], TrainingController);
//# sourceMappingURL=training.controller.js.map