import {
  Controller,
  Get,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TrainingService } from './training.service';
import { diskStorage } from 'multer';
import * as os from 'os';
import * as path from 'path';

@Controller('api/v1/training')
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  @Get('models')
  getModels() {
    const models = this.trainingService.getModels();
    return {
      status: 'success',
      total: models.length,
      models,
    };
  }

  @Post('upload-dataset')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: os.tmpdir(),
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `dataset-${uniqueSuffix}.zip`);
        },
      }),
      limits: {
        fileSize: 500 * 1024 * 1024, // 500MB max ZIP size
      },
    }),
  )
  async uploadDataset(
    @UploadedFile() file: any,
    @Body('model_name') modelName: string,
    @Body('base_model_id') baseModelId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No dataset ZIP file uploaded.');
    }
    if (!modelName || modelName.trim() === '') {
      throw new BadRequestException('model_name is required.');
    }

    const result = await this.trainingService.prepareDataset(file, modelName, baseModelId);
    return result;
  }

  @Post('start')
  async startTraining(
    @Body()
    params: {
      model_name: string;
      base_model?: string;
      epochs?: number;
      batch_size?: number;
      lr?: number;
      dataset_dir?: string;
    },
  ) {
    if (!params.model_name || params.model_name.trim() === '') {
      throw new BadRequestException('model_name is required to start training.');
    }
    return await this.trainingService.startTraining(params);
  }

  @Get('status')
  getStatus() {
    return this.trainingService.getStatus();
  }

  @Post('stop')
  stopTraining() {
    return this.trainingService.stopTraining();
  }
}
