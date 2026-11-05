import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PracticeService } from './practice.service';

@ApiTags('practice')
@Controller('practice')
export class PracticeController {
  constructor(private readonly service: PracticeService) {}

  // TODO: endpoints
  // POST /practice/sessions (Idempotency-Key), GET /practice/stats
}
