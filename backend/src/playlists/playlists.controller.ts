import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PlaylistsService } from './playlists.service';

@ApiTags('playlists')
@Controller('playlists')
export class PlaylistsController {
  constructor(private readonly service: PlaylistsService) {}

  // TODO: endpoints
  // CRUD /playlists, POST /playlists/:id/songs, PATCH reorder, DELETE song
}
