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
var ConfigsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigsService = void 0;
const common_1 = require("@nestjs/common");
const fs = require("fs");
const path = require("path");
let ConfigsService = ConfigsService_1 = class ConfigsService {
    constructor() {
        this.logger = new common_1.Logger(ConfigsService_1.name);
        this.projectRoot = '/home/nxp1/Desktop/PUNPUNJA/PROJECT/UIIU';
        this.configsDir = path.join(this.projectRoot, 'backend_pc', 'configs');
        this.recipesDir = path.join(this.configsDir, 'recipes');
        this.machinesDir = path.join(this.configsDir, 'machines');
        this.bindingsPath = path.join(this.configsDir, 'model_recipe_bindings.json');
        this.ensureDirectories();
    }
    ensureDirectories() {
        [this.recipesDir, this.machinesDir].forEach((dir) => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }
    getDir(type) {
        return type === 'product' ? this.recipesDir : this.machinesDir;
    }
    sanitizeFilename(filename) {
        return filename.replace(/[^a-zA-Z0-9_\-\.]/g, '');
    }
    loadBindings() {
        if (fs.existsSync(this.bindingsPath)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(this.bindingsPath, 'utf-8'));
                return {
                    active_model: 'unet.tflite',
                    active_recipe: 'Product_Setting.txt',
                    active_machine_config: 'Machine_Setting.txt',
                    ...parsed,
                    bindings: parsed.bindings || {},
                };
            }
            catch (_) { }
        }
        return {
            active_model: 'unet.tflite',
            active_recipe: 'Product_Setting.txt',
            active_machine_config: 'Machine_Setting.txt',
            bindings: {},
        };
    }
    saveBindings(data) {
        try {
            fs.writeFileSync(this.bindingsPath, JSON.stringify(data, null, 2));
        }
        catch (err) {
            this.logger.warn(`Could not save bindings: ${err.message}`);
        }
    }
    getAllConfigs() {
        const bindings = this.loadBindings();
        const recipesDir = this.getDir('product');
        const machinesDir = this.getDir('machine');
        const recipes = fs.existsSync(recipesDir)
            ? fs.readdirSync(recipesDir).filter(f => f.endsWith('.txt') || f.endsWith('.json')).map(f => ({ name: f, is_active: f === bindings.active_recipe }))
            : [];
        const machines = fs.existsSync(machinesDir)
            ? fs.readdirSync(machinesDir).filter(f => f.endsWith('.txt') || f.endsWith('.json')).map(f => ({ name: f, is_active: f === bindings.active_machine_config }))
            : [];
        return {
            recipes,
            machines,
            bindings: bindings.bindings || {},
            active_recipe: bindings.active_recipe || '',
            active_machine: bindings.active_machine_config || ''
        };
    }
    listConfigs(type) {
        const dir = this.getDir(type);
        if (!fs.existsSync(dir))
            return [];
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt') || f.endsWith('.json'));
        const bindings = this.loadBindings();
        const active = type === 'product' ? bindings.active_recipe : bindings.active_machine_config;
        return files.map(filename => ({
            name: filename,
            is_active: filename === active,
        }));
    }
    getConfig(type, filename) {
        const cleanName = this.sanitizeFilename(filename);
        const filePath = path.join(this.getDir(type), cleanName);
        if (!fs.existsSync(filePath)) {
            throw new common_1.NotFoundException(`Config file ${cleanName} not found`);
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        try {
            return JSON.parse(content);
        }
        catch {
            return { _raw: content };
        }
    }
    async saveConfig(type, payload) {
        const filename = this.sanitizeFilename(payload.filename);
        if (!filename)
            throw new common_1.BadRequestException("Filename is required");
        const ext = filename.endsWith('.json') ? '' : filename.endsWith('.txt') ? '' : '.txt';
        const finalName = filename + ext;
        const content = typeof payload.content === 'string' ? payload.content : JSON.stringify(payload.content, null, 2);
        const filePath = path.join(this.getDir(type), finalName);
        fs.writeFileSync(filePath, content);
        this.logger.log(`Saved master config ${finalName}`);
        if (payload.old_filename) {
            const oldCleanName = this.sanitizeFilename(payload.old_filename);
            if (oldCleanName && oldCleanName !== finalName) {
                const oldFilePath = path.join(this.getDir(type), oldCleanName);
                if (fs.existsSync(oldFilePath)) {
                    try {
                        fs.unlinkSync(oldFilePath);
                        this.logger.log(`Removed old config file ${oldCleanName} after rename to ${finalName}`);
                    }
                    catch (e) {
                        this.logger.warn(`Could not delete old file ${oldCleanName}: ${e.message}`);
                    }
                }
                const bindings = this.loadBindings();
                let bindingsChanged = false;
                if (type === 'product') {
                    if (bindings.active_recipe === oldCleanName) {
                        bindings.active_recipe = finalName;
                        bindingsChanged = true;
                    }
                    if (bindings.bindings) {
                        for (const modelKey of Object.keys(bindings.bindings)) {
                            if (bindings.bindings[modelKey]?.recipe === oldCleanName) {
                                bindings.bindings[modelKey].recipe = finalName;
                                bindingsChanged = true;
                            }
                        }
                    }
                }
                else {
                    if (bindings.active_machine_config === oldCleanName) {
                        bindings.active_machine_config = finalName;
                        bindingsChanged = true;
                    }
                    if (bindings.bindings) {
                        for (const modelKey of Object.keys(bindings.bindings)) {
                            if (bindings.bindings[modelKey]?.machine_config === oldCleanName) {
                                bindings.bindings[modelKey].machine_config = finalName;
                                bindingsChanged = true;
                            }
                        }
                    }
                }
                if (bindingsChanged) {
                    this.saveBindings(bindings);
                }
            }
        }
        if (payload.activate) {
            await this.activateConfig(type, finalName, payload.edge_ip);
        }
        return {
            status: 'success',
            filename: finalName,
            message: `Config ${finalName} saved successfully.`
        };
    }
    async activateConfig(type, filename, edgeIp = 'localhost') {
        const cleanName = this.sanitizeFilename(filename);
        const filePath = path.join(this.getDir(type), cleanName);
        if (!fs.existsSync(filePath)) {
            throw new common_1.NotFoundException(`Config file ${cleanName} not found`);
        }
        const bindings = this.loadBindings();
        if (type === 'product') {
            bindings.active_recipe = cleanName;
            if (bindings.active_model && !bindings.bindings[bindings.active_model]) {
                bindings.bindings[bindings.active_model] = {};
            }
            if (bindings.active_model) {
                bindings.bindings[bindings.active_model].recipe = cleanName;
            }
        }
        else {
            bindings.active_machine_config = cleanName;
            if (bindings.active_model && !bindings.bindings[bindings.active_model]) {
                bindings.bindings[bindings.active_model] = {};
            }
            if (bindings.active_model) {
                bindings.bindings[bindings.active_model].machine_config = cleanName;
            }
        }
        this.saveBindings(bindings);
        const content = fs.readFileSync(filePath, 'utf-8');
        const resolvedEdgeIp = (!edgeIp || edgeIp === '0.0.0.0' || edgeIp === '::' || edgeIp === 'localhost') ? '127.0.0.1' : edgeIp;
        const targetUrl = `http://${resolvedEdgeIp}:8001/api/config/${type}/save`;
        try {
            const res = await fetch(targetUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: cleanName,
                    content: content,
                    activate: true
                }),
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) {
                const errText = await res.text();
                this.logger.warn(`Edge hot-reload failed: ${errText}`);
                throw new Error(`Edge responded with HTTP ${res.status}: ${errText}`);
            }
            this.logger.log(`Successfully activated and synced ${cleanName} to edge`);
        }
        catch (err) {
            this.logger.error(`Failed to push active config to edge: ${err.message}`);
        }
        return { status: 'success', active_file: cleanName };
    }
    async handleUpload(type, file, edgeIp) {
        if (!file) {
            throw new common_1.BadRequestException('No file uploaded');
        }
        const cleanName = this.sanitizeFilename(file.originalname);
        const destPath = path.join(this.getDir(type), cleanName);
        fs.copyFileSync(file.path, destPath);
        try {
            fs.unlinkSync(file.path);
        }
        catch (_) { }
        return {
            status: 'success',
            filename: cleanName
        };
    }
    deleteConfig(type, filename) {
        const cleanName = this.sanitizeFilename(filename);
        const filePath = path.join(this.getDir(type), cleanName);
        if (!fs.existsSync(filePath)) {
            throw new common_1.NotFoundException(`Config file ${cleanName} not found`);
        }
        const bindings = this.loadBindings();
        const active = type === 'product' ? bindings.active_recipe : bindings.active_machine_config;
        if (cleanName === active) {
            throw new common_1.BadRequestException(`Cannot delete active config file: ${cleanName}`);
        }
        fs.unlinkSync(filePath);
        return { status: 'success' };
    }
};
exports.ConfigsService = ConfigsService;
exports.ConfigsService = ConfigsService = ConfigsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], ConfigsService);
//# sourceMappingURL=configs.service.js.map