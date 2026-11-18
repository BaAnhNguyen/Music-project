import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class ReorderSongsDto {
  @ApiProperty({ type: [String], description: 'Toàn bộ songId của playlist theo thứ tự mới (không thiếu, không thừa)' })
  @IsArray()
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  songIds: string[];
}
