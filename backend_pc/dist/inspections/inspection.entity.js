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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Inspection = void 0;
const typeorm_1 = require("typeorm");
let Inspection = class Inspection {
};
exports.Inspection = Inspection;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Inspection.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Inspection.prototype, "wafer_id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Inspection.prototype, "timestamp", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 'PASS' }),
    __metadata("design:type", String)
], Inspection.prototype, "decision", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 1 }),
    __metadata("design:type", Number)
], Inspection.prototype, "padsTotal", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 1 }),
    __metadata("design:type", Number)
], Inspection.prototype, "padsDetected", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Inspection.prototype, "probeMarks", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Inspection.prototype, "grains", void 0);
__decorate([
    (0, typeorm_1.Column)('float', { default: 95.0 }),
    __metadata("design:type", Number)
], Inspection.prototype, "confidence", void 0);
__decorate([
    (0, typeorm_1.Column)('float', { default: 0.0 }),
    __metadata("design:type", Number)
], Inspection.prototype, "inferenceTime", void 0);
__decorate([
    (0, typeorm_1.Column)('float', { default: 0.0 }),
    __metadata("design:type", Number)
], Inspection.prototype, "ruleTime", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 'CONTINUE PROCESS' }),
    __metadata("design:type", String)
], Inspection.prototype, "machineAction", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '-' }),
    __metadata("design:type", String)
], Inspection.prototype, "reason", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Inspection.prototype, "imageUrl", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Inspection.prototype, "createdAt", void 0);
exports.Inspection = Inspection = __decorate([
    (0, typeorm_1.Entity)('inspections')
], Inspection);
//# sourceMappingURL=inspection.entity.js.map