import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as os from 'os';
import { ModelsService } from './models.service';

@Controller('api/v1/models')
export class ModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  @Get()
  getModels() {
    const list = this.modelsService.getAllModels();
    return {
      status: 'success',
      total: list.length,
      models: list,
    };
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: os.tmpdir(),
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `model-${uniqueSuffix}-${file.originalname}`);
        },
      }),
      limits: {
        fileSize: 1024 * 1024 * 1024, // 1GB max for .pth / .pt models
      },
    }),
  )
  async uploadModel(
    @UploadedFile() file: Express.Multer.File,
    @Body('name') customName?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }
    return await this.modelsService.uploadModel(file, customName);
  }

  @Post('activate')
  async activateModel(
    @Body()
    body: {
      name: string;
      edge_ip?: string;
      recipe_name?: string;
    },
  ) {
    if (!body || !body.name) {
      throw new BadRequestException('Model name is required.');
    }
    return await this.modelsService.deployToEdge(body.name, body.edge_ip, body.recipe_name);
  }

  @Delete(':name')
  deleteModel(@Param('name') name: string) {
    if (!name) {
      throw new BadRequestException('Model name is required.');
    }
    return this.modelsService.deleteModel(name);
  }
}
