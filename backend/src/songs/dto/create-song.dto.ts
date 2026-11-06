import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class CreateSongDto {
  @IsString()
  @IsNotEmpty({ message: 'Văn bản bài hát (rawText) không được để trống.' })
  rawText: string;

  @IsOptional()
  @IsString()
  @IsIn(['private', 'public'], { message: 'Visibility chỉ chấp nhận "private" hoặc "public".' })
  visibility?: 'private' | 'public';
}

export class ParsePreviewDto {
  @IsString()
  @IsNotEmpty({ message: 'Văn bản bài hát (rawText) không được để trống.' })
  rawText: string;
}