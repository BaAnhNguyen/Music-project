import { IsString, IsNotEmpty, IsOptional, IsIn, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class CreateSongDto {
  @IsString()
  @IsNotEmpty({ message: 'Văn bản bài hát (rawText) không được để trống.' })
  rawText: string;

  @IsOptional()
  @IsString()
  @IsIn(['private', 'public'], { message: 'Visibility chỉ chấp nhận "private" hoặc "public".' })
  visibility?: 'private' | 'public';

    // Tên bài hát, khớp VarChar(255) trong schema
  @ApiProperty({ example: 'Sample song' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  // Ca sĩ/nghệ sĩ, không bắt buộc (cột artist là String?)
  @ApiPropertyOptional({ example: 'Đức Phúc' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  artist?: string;
}

export class ParsePreviewDto {
  @IsString()
  @IsNotEmpty({ message: 'Văn bản bài hát (rawText) không được để trống.' })
  rawText: string;
}