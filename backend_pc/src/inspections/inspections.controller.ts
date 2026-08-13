import { Controller, Get, Post, Body } from '@nestjs/common';
import { InspectionsService } from './inspections.service';

@Controller('api/v1')
export class InspectionsController {
  constructor(private readonly inspectionsService: InspectionsService) {}

  @Post('inspections')
  receiveInspection(@Body() payload: any) {
    return this.inspectionsService.saveInspection(payload);
  }

  @Get('latest-inspection')
  getLatest() {
    return this.inspectionsService.getLatest();
  }

  @Get('history')
  getHistory() {
    return this.inspectionsService.getHistory();
  }

  @Get('sys-stats')
  getStats() {
    return this.inspectionsService.getStats();
  }

  @Get('models')
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
}
