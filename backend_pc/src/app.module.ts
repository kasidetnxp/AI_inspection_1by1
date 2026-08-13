import { Module } from '@nestjs/common';
import { InspectionsController } from './inspections/inspections.controller';
import { InspectionsService } from './inspections/inspections.service';
import { EventsGateway } from './events/events.gateway';

@Module({
  imports: [],
  controllers: [InspectionsController],
  providers: [InspectionsService, EventsGateway],
})
export class AppModule {}
