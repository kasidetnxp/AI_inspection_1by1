import { Module } from '@nestjs/common';
import { InspectionsController } from './inspections/inspections.controller';
import { InspectionsService } from './inspections/inspections.service';
import { EventsGateway } from './events/events.gateway';
import { HardwareMonitorService } from './events/hardware-monitor.service';
import { TrainingModule } from './training/training.module';
import { ModelsModule } from './models/models.module';
import { ConfigsModule } from './configs/configs.module';

@Module({
  imports: [TrainingModule, ModelsModule, ConfigsModule],
  controllers: [InspectionsController],
  providers: [InspectionsService, EventsGateway, HardwareMonitorService],
})
export class AppModule {}

