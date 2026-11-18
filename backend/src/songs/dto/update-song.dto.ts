import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class UpdateSongDto {
  @IsInt()
  @Min(1)
  version: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Văn bản bài hát (rawText) không được để trống.' })
  rawText?: string;

  @IsOptional()
  @IsString()
  @IsIn(['private', 'public'], { message: 'Visibility chỉ chấp nhận "private" hoặc "public".' })
  visibility?: 'private' | 'public';
}
