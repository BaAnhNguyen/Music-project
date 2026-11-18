import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// Giá trị lưu trong DB (schema: private | public). Cho phép client gửi "PUBLIC"/"PRIVATE" nhờ Transform.
export const PLAYLIST_VISIBILITIES = ['private', 'public'] as const;
export type PlaylistVisibility = (typeof PLAYLIST_VISIBILITIES)[number];

export const trimString = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export const lowerString = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.toLowerCase() : value);

export class CreatePlaylistDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ enum: PLAYLIST_VISIBILITIES, default: 'private' })
  @IsOptional()
  @Transform(lowerString)
  @IsIn(PLAYLIST_VISIBILITIES)
  visibility?: PlaylistVisibility;
}
