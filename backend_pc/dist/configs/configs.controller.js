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
exports.ConfigsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const configs_service_1 = require("./configs.service");
const multer_1 = require("multer");
let ConfigsController = class ConfigsController {
    constructor(configsService) {
        this.configsService = configsService;
    }
    getAllConfigs() {
        return this.configsService.getAllConfigs();
    }
    listConfigs(type) {
        if (type !== 'product' && type !== 'machine') {
            throw new common_1.BadRequestException('Type must be product or machine');
        }
        return this.configsService.listConfigs(type);
    }
    getConfig(type, filename) {
        if (type !== 'product' && type !== 'machine') {
            throw new common_1.BadRequestException('Type must be product or machine');
        }
        return this.configsService.getConfig(type, filename);
    }
    saveConfig(type, payload) {
        if (type !== 'product' && type !== 'machine') {
            throw new common_1.BadRequestException('Type must be product or machine');
        }
        return this.configsService.saveConfig(type, payload);
    }
    activateRecipe(payload) {
        if (!payload.name)
            throw new common_1.BadRequestException('Name is required');
        return this.configsService.activateConfig('product', payload.name, payload.edge_ip);
    }
    activateMachine(payload) {
        if (!payload.name)
            throw new common_1.BadRequestException('Name is required');
        return this.configsService.activateConfig('machine', payload.name, payload.edge_ip);
    }
    uploadConfig(type, file, edgeIp) {
        if (type !== 'product' && type !== 'machine') {
            throw new common_1.BadRequestException('Type must be product or machine');
        }
        return this.configsService.handleUpload(type, file, edgeIp);
    }
    deleteConfig(type, filename) {
        if (type !== 'product' && type !== 'machine') {
            throw new common_1.BadRequestException('Type must be product or machine');
        }
        return this.configsService.deleteConfig(type, filename);
    }
};
exports.ConfigsController = ConfigsController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ConfigsController.prototype, "getAllConfigs", null);
__decorate([
    (0, common_1.Get)(':type/list'),
    __param(0, (0, common_1.Param)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ConfigsController.prototype, "listConfigs", null);
__decorate([
    (0, common_1.Get)(':type/file/:filename'),
    __param(0, (0, common_1.Param)('type')),
    __param(1, (0, common_1.Param)('filename')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ConfigsController.prototype, "getConfig", null);
__decorate([
    (0, common_1.Post)(':type/save'),
    __param(0, (0, common_1.Param)('type')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ConfigsController.prototype, "saveConfig", null);
__decorate([
    (0, common_1.Post)('activate-recipe'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ConfigsController.prototype, "activateRecipe", null);
__decorate([
    (0, common_1.Post)('activate-machine'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ConfigsController.prototype, "activateMachine", null);
__decorate([
    (0, common_1.Post)(':type/upload'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.diskStorage)({
            destination: '/tmp',
            filename: (req, file, cb) => {
                cb(null, `${Date.now()}_${file.originalname}`);
            }
        })
    })),
    __param(0, (0, common_1.Param)('type')),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)('edge_ip')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], ConfigsController.prototype, "uploadConfig", null);
__decorate([
    (0, common_1.Delete)(':type/:filename'),
    __param(0, (0, common_1.Param)('type')),
    __param(1, (0, common_1.Param)('filename')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ConfigsController.prototype, "deleteConfig", null);
exports.ConfigsController = ConfigsController = __decorate([
    (0, common_1.Controller)('api/v1/configs'),
    __metadata("design:paramtypes", [configs_service_1.ConfigsService])
], ConfigsController);
//# sourceMappingURL=configs.controller.js.map