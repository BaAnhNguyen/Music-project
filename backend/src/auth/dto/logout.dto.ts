import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsJWT, IsOptional } from 'class-validator';

export class LogoutDto {
  @ApiPropertyOptional({ description: 'Refresh token cần thu hồi cùng access token hiện tại' })
  @IsOptional()
  @IsJWT()
  refreshToken?: string;
}
