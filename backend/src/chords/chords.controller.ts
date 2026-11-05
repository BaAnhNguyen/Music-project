import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ChordsService } from './chords.service';

@ApiTags('chords')
@Controller('chords')
export class ChordsController {
  constructor(private readonly service: ChordsService) {}

  // TODO: endpoints
  // GET /chords?name=&instrument= (cache-aside Redis)
}
