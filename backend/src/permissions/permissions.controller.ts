import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';

@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('permission:manage')
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Post()
  create(@Body() dto: CreatePermissionDto) {
    return this.permissions.create(dto);
  }

  @Get()
  list() {
    return this.permissions.list();
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string) {
    return this.permissions.delete(id);
  }
}
