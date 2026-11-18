import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddSongDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  songId: string;
}
