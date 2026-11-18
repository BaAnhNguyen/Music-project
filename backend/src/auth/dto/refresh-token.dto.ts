import { ApiProperty } from '@nestjs/swagger';
import { IsJWT } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ format: 'jwt' })
  @IsJWT()
  refreshToken: string;
}
