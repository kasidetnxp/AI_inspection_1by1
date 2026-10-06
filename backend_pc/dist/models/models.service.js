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
var ModelsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelsService = void 0;
const common_1 = require("@nestjs/common");
const fs = require("fs");
const path = require("path");
const child_process_1 = require("child_process");
let ModelsService = ModelsService_1 = class ModelsService {
    constructor() {
        this.logger = new common_1.Logger(ModelsService_1.name);
        this.projectRoot = '/home/nxp1/Desktop/PUNPUNJA/PROJECT/UIIU';
        this.masterDir = path.join(this.projectRoot, 'datasets', 'models', 'master');
        this.registryPath = path.join(this.projectRoot, 'datasets', 'model_registry.json');
        this.recipesDir = path.join(this.projectRoot, 'backend_pc', 'configs', 'recipes');
        this.machinesDir = path.join(this.projectRoot, 'backend_pc', 'configs', 'machines');
        this.bindingsPath = path.join(this.projectRoot, 'backend_pc', 'configs', 'model_recipe_bindings.json');
        this.imx8ModelsDir = path.join(this.projectRoot, 'backend_imx8', 'models');
        this.convertScript = path.join(this.projectRoot, 'backend_pc', 'scripts', 'convert_model.py');
        this.pyBin = '/home/nxp1/Desktop/PUNPUNJA/PROJECT/CASE_UNET/.venv/bin/python';
        this.ensureDirectories();
        this.syncInitialModels();
    }
    ensureDirectories() {
        [this.masterDir, path.dirname(this.registryPath)].forEach((dir) => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }
    syncInitialModels() {
        try {
            if (fs.existsSync(this.imx8ModelsDir)) {
                const files = fs.readdirSync(this.imx8ModelsDir);
                for (const file of files) {
                    if (file === 'active_model.tflite' || file === 'backup_model.tflite')
                        continue;
                    if (file.endsWith('.tflite')) {
                        const src = path.join(this.imx8ModelsDir, file);
                        const dst = path.join(this.masterDir, file);
                        if (!fs.existsSync(dst) && fs.existsSync(src)) {
                            fs.copyFileSync(src, dst);
                            this.logger.log(`Copied initial model '${file}' to Central Master Store.`);
                        }
                    }
                }
            }
        }
        catch (err) {
            this.logger.warn(`Failed during initial model sync: ${err.message}`);
        }
    }
    loadBindings() {
        const defaultData = {
            active_model: 'unet.tflite',
            active_recipe: 'Product_Setting.txt',
            active_machine_config: 'Machine_Setting.txt',
            bindings: {},
        };
        if (fs.existsSync(this.bindingsPath)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(this.bindingsPath, 'utf-8'));
                return { ...defaultData, ...parsed, bindings: parsed.bindings || {} };
            }
            catch (_) { }
        }
        return defaultData;
    }
    saveBindings(data) {
        try {
            fs.writeFileSync(this.bindingsPath, JSON.stringify(data, null, 2));
        }
        catch (err) {
            this.logger.warn(`Could not save bindings: ${err.message}`);
        }
    }
    loadRegistry() {
        if (fs.existsSync(this.registryPath)) {
            try {
                return JSON.parse(fs.readFileSync(this.registryPath, 'utf-8'));
            }
            catch (_) { }
        }
        return { models: [] };
    }
    saveRegistry(data) {
        try {
            fs.writeFileSync(this.registryPath, JSON.stringify(data, null, 2));
        }
        catch (err) {
            this.logger.warn(`Could not save registry: ${err.message}`);
        }
    }
    getAllModels() {
        this.ensureDirectories();
        const bindingsData = this.loadBindings();
        const registryData = this.loadRegistry();
        const registryMap = new Map();
        for (const m of registryData.models || []) {
            registryMap.set(m.model_name, m);
        }
        const masterFiles = fs.existsSync(this.masterDir) ? fs.readdirSync(this.masterDir) : [];
        const modelsMap = new Map();
        for (const f of masterFiles) {
            if (f === 'active_model.tflite' || f === 'backup_model.tflite')
                continue;
            const ext = path.extname(f).toLowerCase();
            if (ext !== '.tflite' && ext !== '.pth' && ext !== '.pt')
                continue;
            const baseName = path.basename(f, ext);
            const filePath = path.join(this.masterDir, f);
            const stats = fs.statSync(filePath);
            const sizeMb = (stats.size / (1024 * 1024)).toFixed(1);
            const regItem = registryMap.get(baseName);
            const boundInfo = bindingsData.bindings[f] || bindingsData.bindings[`${baseName}.tflite`] || {};
            let entry = modelsMap.get(baseName);
            if (!entry) {
                entry = {
                    name: `${baseName}.tflite`,
                    model_name: baseName,
                    version: 'v1.0.0',
                    format: 'TFLite INT8',
                    size: `${sizeMb} MB`,
                    size_bytes: stats.size,
                    created_at: stats.mtime.toISOString().replace('T', ' ').slice(0, 19),
                    active: false,
                    has_pth: false,
                    has_tflite: false,
                    bound_recipe: boundInfo.recipe || 'Product_Setting.txt',
                    bound_machine: boundInfo.machine_config || 'Machine_Setting.txt',
                };
                modelsMap.set(baseName, entry);
            }
            if (ext === '.tflite') {
                entry.has_tflite = true;
                entry.tflite_path = filePath;
                entry.size = `${sizeMb} MB`;
                entry.size_bytes = stats.size;
            }
            else if (ext === '.pth' || ext === '.pt') {
                entry.has_pth = true;
                entry.pth_path = filePath;
            }
            if (bindingsData.active_model) {
                entry.active = (entry.name === bindingsData.active_model || entry.model_name === path.basename(bindingsData.active_model, '.tflite'));
            }
            else if (regItem && regItem.active !== undefined) {
                entry.active = Boolean(regItem.active);
            }
            if (regItem && regItem.created_at) {
                entry.created_at = regItem.created_at;
            }
        }
        const list = Array.from(modelsMap.values());
        const hasActive = list.some((m) => m.active);
        if (!hasActive && list.length > 0) {
            const defaultActiveName = bindingsData.active_model || 'unet.tflite';
            const activeEntry = list.find((m) => m.name === defaultActiveName || m.model_name === path.basename(defaultActiveName, '.tflite')) || list[0];
            activeEntry.active = true;
        }
        return list;
    }
    async uploadModel(file, customName) {
        if (!file) {
            throw new common_1.BadRequestException('No model file uploaded.');
        }
        const origName = file.originalname;
        const ext = path.extname(origName).toLowerCase();
        if (ext !== '.tflite' && ext !== '.pth' && ext !== '.pt') {
            throw new common_1.BadRequestException('Supported model formats: .pth, .pt, or .tflite.');
        }
        const cleanBase = (customName && customName.trim().length > 0)
            ? customName.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
            : path.basename(origName, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        this.ensureDirectories();
        if (ext === '.tflite') {
            const destFile = path.join(this.masterDir, `${cleanBase}.tflite`);
            fs.copyFileSync(file.path, destFile);
            try {
                fs.unlinkSync(file.path);
            }
            catch (_) { }
            const stats = fs.statSync(destFile);
            const sizeMb = (stats.size / (1024 * 1024)).toFixed(1);
            this.updateRegistryEntry({
                model_name: cleanBase,
                tflite_path: destFile,
                has_tflite: true,
                created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
            });
            return {
                status: 'success',
                name: `${cleanBase}.tflite`,
                size: `${sizeMb} MB`,
                converted: false,
                message: `Model '${cleanBase}.tflite' uploaded to Central Master Store.`,
            };
        }
        const pthDest = path.join(this.masterDir, `${cleanBase}.pth`);
        const tfliteDest = path.join(this.masterDir, `${cleanBase}.tflite`);
        fs.copyFileSync(file.path, pthDest);
        try {
            fs.unlinkSync(file.path);
        }
        catch (_) { }
        this.logger.log(`Starting PyTorch to TFLite INT8 conversion on PC for '${cleanBase}'...`);
        const pyExecutable = fs.existsSync(this.pyBin) ? this.pyBin : 'python3';
        await this.runConversionProcess(pyExecutable, pthDest, tfliteDest);
        const stats = fs.statSync(tfliteDest);
        const sizeMb = (stats.size / (1024 * 1024)).toFixed(1);
        this.updateRegistryEntry({
            model_name: cleanBase,
            pth_path: pthDest,
            tflite_path: tfliteDest,
            has_pth: true,
            has_tflite: true,
            created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
        });
        return {
            status: 'success',
            name: `${cleanBase}.tflite`,
            pth_name: `${cleanBase}.pth`,
            size: `${sizeMb} MB`,
            converted: true,
            message: `Model '${cleanBase}.pth' converted to TFLite INT8 (${sizeMb} MB) and stored in Central Master Store.`,
        };
    }
    runConversionProcess(pythonCmd, pthPath, tflitePath) {
        return new Promise((resolve, reject) => {
            const proc = (0, child_process_1.spawn)(pythonCmd, [this.convertScript, pthPath, tflitePath, '256', '256']);
            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (d) => { stdout += d.toString(); });
            proc.stderr.on('data', (d) => { stderr += d.toString(); });
            proc.on('close', (code) => {
                if (code === 0 && fs.existsSync(tflitePath)) {
                    this.logger.log(`Conversion succeeded for ${tflitePath}`);
                    resolve();
                }
                else {
                    this.logger.error(`Conversion failed: ${stderr || stdout}`);
                    reject(new common_1.InternalServerErrorException(`Conversion failed (exit code ${code}): ${stderr.slice(-300)}`));
                }
            });
        });
    }
    updateRegistryEntry(entry) {
        const reg = this.loadRegistry();
        const idx = reg.models.findIndex((m) => m.model_name === entry.model_name);
        if (idx >= 0) {
            reg.models[idx] = { ...reg.models[idx], ...entry };
        }
        else {
            reg.models.push(entry);
        }
        this.saveRegistry(reg);
    }
    async deployToEdge(modelName, edgeIp = 'localhost', recipeName) {
        const cleanName = modelName.endsWith('.tflite') ? modelName : `${modelName}.tflite`;
        const modelBase = path.basename(cleanName, '.tflite');
        let tflitePath = path.join(this.masterDir, cleanName);
        if (!fs.existsSync(tflitePath)) {
            const candidate = path.join(this.imx8ModelsDir, cleanName);
            if (fs.existsSync(candidate)) {
                tflitePath = candidate;
            }
            else {
                throw new common_1.NotFoundException(`Model '${cleanName}' not found in Central Master Store.`);
            }
        }
        const bindingsData = this.loadBindings();
        const chosenRecipe = recipeName || bindingsData.bindings[cleanName]?.recipe || bindingsData.active_recipe || 'Product_Setting.txt';
        let recipeContent = '';
        const recipePath = path.join(this.recipesDir, chosenRecipe);
        if (fs.existsSync(recipePath)) {
            recipeContent = fs.readFileSync(recipePath, 'utf-8');
        }
        const chosenMachine = bindingsData.bindings[cleanName]?.machine_config || bindingsData.active_machine_config || 'Machine_Setting.txt';
        let machineContent = '';
        const machinePath = path.join(this.machinesDir, chosenMachine);
        if (fs.existsSync(machinePath)) {
            machineContent = fs.readFileSync(machinePath, 'utf-8');
        }
        const tfliteBuffer = fs.readFileSync(tflitePath);
        const resolvedEdgeIp = (!edgeIp || edgeIp === '0.0.0.0' || edgeIp === '::' || edgeIp === 'localhost') ? '127.0.0.1' : edgeIp;
        const targetUrl = `http://${resolvedEdgeIp}:8001/api/models/deploy-active`;
        this.logger.log(`Deploying active model '${cleanName}' to i.MX8 node at ${targetUrl}...`);
        try {
            const formData = new FormData();
            const fileBlob = new Blob([tfliteBuffer], { type: 'application/octet-stream' });
            formData.append('file', fileBlob, cleanName);
            formData.append('model_name', modelBase);
            if (chosenRecipe)
                formData.append('recipe_name', chosenRecipe);
            if (recipeContent)
                formData.append('recipe_content', recipeContent);
            if (chosenMachine)
                formData.append('machine_config_name', chosenMachine);
            if (machineContent)
                formData.append('machine_config_content', machineContent);
            const res = await fetch(targetUrl, {
                method: 'POST',
                body: formData,
                signal: AbortSignal.timeout(15000),
            });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`i.MX8 responded with HTTP ${res.status}: ${errText}`);
            }
            const resData = await res.json();
            const reg = this.loadRegistry();
            let foundInReg = false;
            for (const m of reg.models) {
                if (m.model_name === modelBase) {
                    m.active = true;
                    foundInReg = true;
                }
                else {
                    m.active = false;
                }
            }
            if (!foundInReg) {
                reg.models.push({
                    model_name: modelBase,
                    tflite_path: tflitePath,
                    active: true,
                    created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
                });
            }
            this.saveRegistry(reg);
            bindingsData.active_model = cleanName;
            bindingsData.active_recipe = chosenRecipe;
            bindingsData.active_machine_config = chosenMachine;
            if (!bindingsData.bindings[cleanName]) {
                bindingsData.bindings[cleanName] = { recipe: chosenRecipe, machine_config: chosenMachine };
            }
            this.saveBindings(bindingsData);
            return {
                status: 'success',
                active_model: cleanName,
                active_recipe: chosenRecipe,
                active_machine: chosenMachine,
                edge_response: resData,
                message: `Model '${cleanName}' deployed & hot-swapped on i.MX8 NPU delegate successfully.`,
            };
        }
        catch (err) {
            this.logger.error(`Deployment to i.MX8 failed: ${err.message}`);
            throw new common_1.InternalServerErrorException(`Failed to deploy model to i.MX8 (${resolvedEdgeIp}:8001): ${err.message}`);
        }
    }
    deleteModel(modelName) {
        const cleanName = modelName.endsWith('.tflite') ? path.basename(modelName, '.tflite') : modelName;
        const all = this.getAllModels();
        const target = all.find((m) => m.model_name === cleanName);
        if (!target) {
            throw new common_1.NotFoundException(`Model '${modelName}' not found.`);
        }
        if (target.active) {
            throw new common_1.BadRequestException(`Cannot delete active model '${modelName}'. Please activate another model first.`);
        }
        const exts = ['.tflite', '.pth', '.pt'];
        for (const ext of exts) {
            const p = path.join(this.masterDir, `${cleanName}${ext}`);
            if (fs.existsSync(p)) {
                try {
                    fs.unlinkSync(p);
                }
                catch (_) { }
            }
        }
        const reg = this.loadRegistry();
        reg.models = reg.models.filter((m) => m.model_name !== cleanName);
        this.saveRegistry(reg);
        return {
            status: 'success',
            message: `Model '${cleanName}' deleted from Central Master Store.`,
        };
    }
};
exports.ModelsService = ModelsService;
exports.ModelsService = ModelsService = ModelsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], ModelsService);
//# sourceMappingURL=models.service.js.map