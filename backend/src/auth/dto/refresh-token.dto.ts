import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token hiện tại' })
  @IsString()
  @IsNotEmpty()
  @IsJWT()
  refreshToken!: string;
}
