import { Module } from '@nestjs/common';
import { MetronomeController } from './metronome.controller';
import { MetronomeService } from './metronome.service';

@Module({
  controllers: [MetronomeController],
  providers: [MetronomeService],
  exports: [MetronomeService],
})
export class MetronomeModule {}
