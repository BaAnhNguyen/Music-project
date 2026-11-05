import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateRoleDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name!: string;
}
