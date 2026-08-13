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
exports.InspectionsController = void 0;
const common_1 = require("@nestjs/common");
const inspections_service_1 = require("./inspections.service");
let InspectionsController = class InspectionsController {
    constructor(inspectionsService) {
        this.inspectionsService = inspectionsService;
    }
    receiveInspection(payload) {
        return this.inspectionsService.saveInspection(payload);
    }
    getLatest() {
        return this.inspectionsService.getLatest();
    }
    getHistory() {
        return this.inspectionsService.getHistory();
    }
    getStats() {
        return this.inspectionsService.getStats();
    }
    getModels() {
        return [
            {
                name: 'unet_int8.tflite',
                version: 'v1.0.0',
                engine: 'TFLite / NPU (NXP i.MX8)',
                size: '3.5 MB',
                accuracy: '97.2%',
                active: true,
            },
        ];
    }
};
exports.InspectionsController = InspectionsController;
__decorate([
    (0, common_1.Post)('inspections'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "receiveInspection", null);
__decorate([
    (0, common_1.Get)('latest-inspection'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "getLatest", null);
__decorate([
    (0, common_1.Get)('history'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "getHistory", null);
__decorate([
    (0, common_1.Get)('sys-stats'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('models'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "getModels", null);
exports.InspectionsController = InspectionsController = __decorate([
    (0, common_1.Controller)('api/v1'),
    __metadata("design:paramtypes", [inspections_service_1.InspectionsService])
], InspectionsController);
//# sourceMappingURL=inspections.controller.js.map