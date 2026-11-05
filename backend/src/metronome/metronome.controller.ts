import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MetronomeService } from './metronome.service';

@ApiTags('metronome')
@Controller('metronome')
export class MetronomeController {
  constructor(private readonly service: MetronomeService) {}

  // TODO: endpoints
  // (tùy chọn) CRUD /metronome/presets
}
