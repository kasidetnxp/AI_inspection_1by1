import { Controller, Get, Post, Body, Param, Delete, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigsService } from './configs.service';
import { diskStorage } from 'multer';
import * as path from 'path';

@Controller('api/v1/configs')
export class ConfigsController {
  constructor(private readonly configsService: ConfigsService) {}

  @Get()
  getAllConfigs() {
    return this.configsService.getAllConfigs();
  }

  @Get(':type/list')
  listConfigs(@Param('type') type: string) {
    if (type !== 'product' && type !== 'machine') {
      throw new BadRequestException('Type must be product or machine');
    }
    return this.configsService.listConfigs(type);
  }

  @Get(':type/file/:filename')
  getConfig(@Param('type') type: string, @Param('filename') filename: string) {
    if (type !== 'product' && type !== 'machine') {
      throw new BadRequestException('Type must be product or machine');
    }
    return this.configsService.getConfig(type, filename);
  }

  @Post(':type/save')
  saveConfig(@Param('type') type: string, @Body() payload: any) {
    if (type !== 'product' && type !== 'machine') {
      throw new BadRequestException('Type must be product or machine');
    }
    return this.configsService.saveConfig(type, payload);
  }

  @Post('activate-recipe')
  activateRecipe(@Body() payload: { name: string, edge_ip?: string }) {
    if (!payload.name) throw new BadRequestException('Name is required');
    return this.configsService.activateConfig('product', payload.name, payload.edge_ip);
  }

  @Post('activate-machine')
  activateMachine(@Body() payload: { name: string, edge_ip?: string }) {
    if (!payload.name) throw new BadRequestException('Name is required');
    return this.configsService.activateConfig('machine', payload.name, payload.edge_ip);
  }

  @Post(':type/upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: '/tmp',
      filename: (req, file, cb) => {
        cb(null, `${Date.now()}_${file.originalname}`);
      }
    })
  }))
  uploadConfig(
    @Param('type') type: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('edge_ip') edgeIp?: string
  ) {
    if (type !== 'product' && type !== 'machine') {
      throw new BadRequestException('Type must be product or machine');
    }
    return this.configsService.handleUpload(type, file, edgeIp);
  }

  @Delete(':type/:filename')
  deleteConfig(@Param('type') type: string, @Param('filename') filename: string) {
    if (type !== 'product' && type !== 'machine') {
      throw new BadRequestException('Type must be product or machine');
    }
    return this.configsService.deleteConfig(type, filename);
  }
}
