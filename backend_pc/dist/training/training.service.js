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
var TrainingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrainingService = void 0;
const common_1 = require("@nestjs/common");
const fs = require("fs");
const path = require("path");
const child_process_1 = require("child_process");
let TrainingService = TrainingService_1 = class TrainingService {
    constructor() {
        this.logger = new common_1.Logger(TrainingService_1.name);
        this.pyBin = '/home/nxp1/Desktop/PUNPUNJA/PROJECT/CASE_UNET/.venv/bin/python';
        this.caseUnetRoot = '/home/nxp1/Desktop/PUNPUNJA/PROJECT/CASE_UNET';
        this.registryPath = '/home/nxp1/Desktop/PUNPUNJA/PROJECT/UIIU/datasets/model_registry.json';
        this.datasetsRoot = '/home/nxp1/Desktop/PUNPUNJA/PROJECT/UIIU/datasets/training_runs';
        this.weightsDir = '/home/nxp1/Desktop/PUNPUNJA/PROJECT/CASE_UNET/models/3class/weights';
        this.tfliteDir = '/home/nxp1/Desktop/PUNPUNJA/PROJECT/UIIU/backend_imx8/models';
        this.statusFilePath = '/tmp/case_unet_train_status.json';
        this.activeProcess = null;
        this.activeJobParams = null;
        this.ensureDirectories();
        this.syncInitialRegistry();
    }
    ensureDirectories() {
        [this.datasetsRoot, this.weightsDir, this.tfliteDir].forEach((dir) => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }
    syncInitialRegistry() {
        let registry = { models: [] };
        if (fs.existsSync(this.registryPath)) {
            try {
                registry = JSON.parse(fs.readFileSync(this.registryPath, 'utf-8'));
            }
            catch (e) {
                registry = { models: [] };
            }
        }
        if (fs.existsSync(this.weightsDir)) {
            const pthFiles = fs.readdirSync(this.weightsDir).filter((f) => f.endsWith('.pth'));
            for (const f of pthFiles) {
                const modelName = path.parse(f).name;
                const exists = registry.models.some((m) => m.model_name === modelName);
                if (!exists) {
                    const tflitePath = path.join(this.tfliteDir, `${modelName}.tflite`);
                    registry.models.push({
                        model_name: modelName,
                        pth_path: path.join(this.weightsDir, f),
                        tflite_path: fs.existsSync(tflitePath) ? tflitePath : '',
                        dataset_dir: '/home/nxp1/Desktop/PUNPUNJA/PROJECT/CASE_UNET/data/processed_unet',
                        train_count: 80,
                        val_count: 20,
                        created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
                        base_model: null,
                    });
                }
            }
        }
        fs.writeFileSync(this.registryPath, JSON.stringify(registry, null, 2));
    }
    getModels() {
        this.syncInitialRegistry();
        try {
            const data = JSON.parse(fs.readFileSync(this.registryPath, 'utf-8'));
            return data.models || [];
        }
        catch (e) {
            return [];
        }
    }
    async prepareDataset(file, modelName, baseModelId) {
        if (!file || !file.path) {
            throw new common_1.BadRequestException('No zip file uploaded');
        }
        const cleanModelName = modelName.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
        const targetDatasetDir = path.join(this.datasetsRoot, cleanModelName);
        let baseDatasetDir = 'none';
        if (baseModelId) {
            const models = this.getModels();
            const baseModel = models.find((m) => m.model_name === baseModelId);
            if (baseModel && baseModel.dataset_dir && fs.existsSync(baseModel.dataset_dir)) {
                baseDatasetDir = baseModel.dataset_dir;
            }
        }
        const scriptPath = path.join(this.caseUnetRoot, 'src/unet/prep_dataset.py');
        const cmd = `"${this.pyBin}" "${scriptPath}" "${file.path}" "${targetDatasetDir}" "${baseDatasetDir}"`;
        this.logger.log(`Executing dataset prep: ${cmd}`);
        try {
            const output = (0, child_process_1.execSync)(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
            const lines = output.trim().split('\n');
            const jsonLine = lines[lines.length - 1];
            const result = JSON.parse(jsonLine);
            try {
                fs.unlinkSync(file.path);
            }
            catch (_) { }
            return result;
        }
        catch (err) {
            this.logger.error(`Dataset prep failed: ${err.message}`);
            try {
                fs.unlinkSync(file.path);
            }
            catch (_) { }
            throw new common_1.BadRequestException(`Dataset preparation failed: ${err.message}`);
        }
    }
    async startTraining(params) {
        if (this.activeProcess && this.activeProcess.exitCode === null && !this.activeProcess.killed) {
            throw new common_1.BadRequestException('A training job is already active. Please wait or stop the current job.');
        }
        const cleanModelName = params.model_name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
        const datasetDir = params.dataset_dir || path.join(this.datasetsRoot, cleanModelName);
        if (!fs.existsSync(datasetDir)) {
            throw new common_1.BadRequestException(`Dataset directory does not exist: ${datasetDir}. Please upload dataset first.`);
        }
        const outputPth = path.join(this.weightsDir, `${cleanModelName}.pth`);
        const outputTflite = path.join(this.tfliteDir, `${cleanModelName}.tflite`);
        let baseWeightsPath = null;
        if (params.base_model) {
            const models = this.getModels();
            const base = models.find((m) => m.model_name === params.base_model);
            if (base && fs.existsSync(base.pth_path)) {
                baseWeightsPath = base.pth_path;
            }
        }
        const epochs = Number(params.epochs) || 30;
        const batchSize = Number(params.batch_size) || 4;
        const lr = Number(params.lr) || 0.0001;
        const scriptPath = path.join(this.caseUnetRoot, 'src/unet/train_job.py');
        const args = [
            scriptPath,
            '--model-name', cleanModelName,
            '--dataset-dir', datasetDir,
            '--epochs', String(epochs),
            '--batch-size', String(batchSize),
            '--lr', String(lr),
            '--status-file', this.statusFilePath,
            '--output-pth', outputPth,
            '--output-tflite', outputTflite,
        ];
        if (baseWeightsPath) {
            args.push('--base-weights', baseWeightsPath);
        }
        this.logger.log(`Starting training process: ${this.pyBin} ${args.join(' ')}`);
        const stopFile = `${this.statusFilePath}.stop`;
        if (fs.existsSync(stopFile)) {
            try {
                fs.unlinkSync(stopFile);
            }
            catch (_) { }
        }
        const initialStatus = {
            state: 'running',
            model_name: cleanModelName,
            base_model: params.base_model || null,
            current_epoch: 0,
            total_epochs: epochs,
            train_loss: 0,
            val_loss: 0,
            progress_pct: 0,
            eta_seconds: 0,
            saved_pth: outputPth,
            saved_tflite: outputTflite,
            logs: [`🚀 Initialized training job for ${cleanModelName}`],
        };
        fs.writeFileSync(this.statusFilePath, JSON.stringify(initialStatus, null, 2));
        this.activeJobParams = { cleanModelName, datasetDir, outputPth, outputTflite, baseModel: params.base_model };
        this.activeProcess = (0, child_process_1.spawn)(this.pyBin, args, {
            cwd: this.caseUnetRoot,
            detached: true,
            stdio: 'ignore',
        });
        this.activeProcess.on('exit', () => {
            this.activeProcess = null;
        });
        this.activeProcess.unref();
        this.registerModel({
            model_name: cleanModelName,
            pth_path: outputPth,
            tflite_path: outputTflite,
            dataset_dir: datasetDir,
            train_count: 0,
            val_count: 0,
            created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
            base_model: params.base_model || null,
        });
        return {
            status: 'started',
            model_name: cleanModelName,
            pid: this.activeProcess.pid,
            output_pth: outputPth,
            output_tflite: outputTflite,
        };
    }
    registerModel(meta) {
        let registry = { models: [] };
        try {
            registry = JSON.parse(fs.readFileSync(this.registryPath, 'utf-8'));
        }
        catch (_) { }
        const idx = registry.models.findIndex((m) => m.model_name === meta.model_name);
        if (idx >= 0) {
            registry.models[idx] = { ...registry.models[idx], ...meta };
        }
        else {
            registry.models.push(meta);
        }
        fs.writeFileSync(this.registryPath, JSON.stringify(registry, null, 2));
    }
    getStatus() {
        if (!fs.existsSync(this.statusFilePath)) {
            return {
                state: 'idle',
                model_name: '',
                current_epoch: 0,
                total_epochs: 0,
                train_loss: 0,
                val_loss: 0,
                progress_pct: 0,
                eta_seconds: 0,
                logs: [],
            };
        }
        try {
            const data = JSON.parse(fs.readFileSync(this.statusFilePath, 'utf-8'));
            return data;
        }
        catch (e) {
            return { state: 'running', message: 'Reading status...' };
        }
    }
    stopTraining() {
        const stopFile = `${this.statusFilePath}.stop`;
        fs.writeFileSync(stopFile, 'STOP');
        if (this.activeProcess && !this.activeProcess.killed) {
            try {
                this.activeProcess.kill('SIGTERM');
            }
            catch (_) { }
        }
        try {
            if (fs.existsSync(this.statusFilePath)) {
                const current = JSON.parse(fs.readFileSync(this.statusFilePath, 'utf-8'));
                current.state = 'stopped';
                current.logs.push('⏹️ Training job stopped by user operator');
                fs.writeFileSync(this.statusFilePath, JSON.stringify(current, null, 2));
            }
        }
        catch (_) { }
        return { status: 'stopped', message: 'Stop signal dispatched' };
    }
};
exports.TrainingService = TrainingService;
exports.TrainingService = TrainingService = TrainingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], TrainingService);
//# sourceMappingURL=training.service.js.map