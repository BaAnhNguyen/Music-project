import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SongsService } from './songs.service';

@ApiTags('songs')
@Controller('songs')
export class SongsController {
  constructor(private readonly service: SongsService) {}

  // TODO: endpoints
  // CRUD /songs, POST /songs/:id/fork, GET /songs/:id/revisions, POST /songs/:id/revisions/:v/restore
}
