import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UsersService } from './users.service';

@ApiTags('roles')
@ApiBearerAuth()
@Roles('admin')
@Controller('roles')
export class RolesController {
  constructor(private readonly service: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách role' })
  findAll() {
    return this.service.findRoles();
  }

  @Post()
  @ApiOperation({ summary: 'Thêm role' })
  create(@Body() dto: CreateRoleDto) {
    return this.service.createRole(dto);
  }

  @Patch(':code')
  @ApiOperation({ summary: 'Sửa tên role' })
  update(@Param('code') code: string, @Body() dto: UpdateRoleDto) {
    return this.service.updateRole(code, dto);
  }

  @Delete(':code')
  @ApiOperation({ summary: 'Xóa role chưa được sử dụng' })
  remove(@Param('code') code: string) {
    return this.service.deleteRole(code);
  }
}
