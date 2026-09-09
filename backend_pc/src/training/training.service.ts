import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, execSync, ChildProcess } from 'child_process';

export interface ModelMetadata {
  model_name: string;
  pth_path: string;
  tflite_path: string;
  dataset_dir: string;
  train_count: number;
  val_count: number;
  created_at: string;
  base_model: string | null;
  val_miou?: number;
}

@Injectable()
export class TrainingService {
  private readonly logger = new Logger(TrainingService.name);

  private readonly pyBin = '/home/nxp1/Desktop/PUNPUNJA/PROJECT/CASE_UNET/.venv/bin/python';
  private readonly caseUnetRoot = '/home/nxp1/Desktop/PUNPUNJA/PROJECT/CASE_UNET';
  private readonly registryPath = '/home/nxp1/Desktop/PUNPUNJA/PROJECT/UIIU/datasets/model_registry.json';
  private readonly datasetsRoot = '/home/nxp1/Desktop/PUNPUNJA/PROJECT/UIIU/datasets/training_runs';
  private readonly weightsDir = '/home/nxp1/Desktop/PUNPUNJA/PROJECT/CASE_UNET/models/3class/weights';
  private readonly tfliteDir = '/home/nxp1/Desktop/PUNPUNJA/PROJECT/UIIU/backend_imx8/models';
  private readonly statusFilePath = '/tmp/case_unet_train_status.json';

  private activeProcess: ChildProcess | null = null;
  private activeJobParams: any = null;

  constructor() {
    this.ensureDirectories();
    this.syncInitialRegistry();
  }

  private ensureDirectories() {
    [this.datasetsRoot, this.weightsDir, this.tfliteDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  private syncInitialRegistry() {
    let registry: { models: ModelMetadata[] } = { models: [] };
    if (fs.existsSync(this.registryPath)) {
      try {
        registry = JSON.parse(fs.readFileSync(this.registryPath, 'utf-8'));
      } catch (e) {
        registry = { models: [] };
      }
    }

    // Discover existing .pth models in CASE_UNET weights
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

  getModels(): ModelMetadata[] {
    this.syncInitialRegistry();
    try {
      const data = JSON.parse(fs.readFileSync(this.registryPath, 'utf-8'));
      return data.models || [];
    } catch (e) {
      return [];
    }
  }

  async prepareDataset(file: any, modelName: string, baseModelId?: string) {
    if (!file || !file.path) {
      throw new BadRequestException('No zip file uploaded');
    }
    const cleanModelName = modelName.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const targetDatasetDir = path.join(this.datasetsRoot, cleanModelName);
    
    // Lookup base model dataset if requested
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
      const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
      const lines = output.trim().split('\n');
      const jsonLine = lines[lines.length - 1];
      const result = JSON.parse(jsonLine);

      // Clean up uploaded zip file
      try {
        fs.unlinkSync(file.path);
      } catch (_) {}

      return result;
    } catch (err) {
      this.logger.error(`Dataset prep failed: ${err.message}`);
      try {
        fs.unlinkSync(file.path);
      } catch (_) {}
      throw new BadRequestException(`Dataset preparation failed: ${err.message}`);
    }
  }

  async startTraining(params: {
    model_name: string;
    base_model?: string;
    epochs?: number;
    batch_size?: number;
    lr?: number;
    dataset_dir?: string;
  }) {
    const currentStatus = this.getStatus();
    if (currentStatus?.state === 'running') {
      if (this.activeProcess && this.activeProcess.pid) {
        try {
          process.kill(this.activeProcess.pid, 0);
          throw new BadRequestException('A training job is already active. Please wait or stop the current job.');
        } catch (e) {
          if (e instanceof BadRequestException) throw e;
        }
      }
    }

    const cleanModelName = params.model_name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const datasetDir = params.dataset_dir || path.join(this.datasetsRoot, cleanModelName);
    if (!fs.existsSync(datasetDir)) {
      throw new BadRequestException(`Dataset directory does not exist: ${datasetDir}. Please upload dataset first.`);
    }

    const outputPth = path.join(this.weightsDir, `${cleanModelName}.pth`);
    const outputTflite = path.join(this.tfliteDir, `${cleanModelName}.tflite`);

    let baseWeightsPath: string | null = null;
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

    // Reset stop file if any
    const stopFile = `${this.statusFilePath}.stop`;
    if (fs.existsSync(stopFile)) {
      try { fs.unlinkSync(stopFile); } catch (_) {}
    }

    // Write initial status file
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
      logs: [`[INIT] Initialized training job for ${cleanModelName}`],
    };
    fs.writeFileSync(this.statusFilePath, JSON.stringify(initialStatus, null, 2));

    this.activeJobParams = { cleanModelName, datasetDir, outputPth, outputTflite, baseModel: params.base_model };

    this.activeProcess = spawn(this.pyBin, args, {
      cwd: this.caseUnetRoot,
      detached: true,
      stdio: 'ignore',
    });
    this.activeProcess.on('exit', () => {
      this.activeProcess = null;
    });
    this.activeProcess.unref();

    // Register in model registry
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

  private registerModel(meta: ModelMetadata) {
    let registry: { models: ModelMetadata[] } = { models: [] };
    try {
      registry = JSON.parse(fs.readFileSync(this.registryPath, 'utf-8'));
    } catch (_) {}

    const idx = registry.models.findIndex((m) => m.model_name === meta.model_name);
    if (idx >= 0) {
      registry.models[idx] = { ...registry.models[idx], ...meta };
    } else {
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
    } catch (e) {
      return { state: 'running', message: 'Reading status...' };
    }
  }

  stopTraining() {
    const stopFile = `${this.statusFilePath}.stop`;
    fs.writeFileSync(stopFile, 'STOP');

    if (this.activeProcess && !this.activeProcess.killed) {
      try {
        this.activeProcess.kill('SIGTERM');
      } catch (_) {}
    }

    try {
      if (fs.existsSync(this.statusFilePath)) {
        const current = JSON.parse(fs.readFileSync(this.statusFilePath, 'utf-8'));
        current.state = 'stopped';
        current.logs.push('[STOP] Training stopped by user operator');
        fs.writeFileSync(this.statusFilePath, JSON.stringify(current, null, 2));
      }
    } catch (_) {}

    return { status: 'stopped', message: 'Stop signal dispatched' };
  }
}
