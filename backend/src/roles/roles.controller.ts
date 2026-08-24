import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Audit } from '../audit/audit.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('role:manage')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Post()
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Get()
  list() {
    return this.roles.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.roles.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string) {
    return this.roles.delete(id);
  }

  @Post(':id/permissions/:permissionId')
  @HttpCode(201)
  @UseInterceptors(AuditInterceptor)
  @Audit('permission:assign')
  assignPermission(@Param('id') id: string, @Param('permissionId') permissionId: string) {
    return this.roles.assignPermission(id, permissionId);
  }

  @Delete(':id/permissions/:permissionId')
  @HttpCode(204)
  @UseInterceptors(AuditInterceptor)
  @Audit('permission:remove')
  removePermission(@Param('id') id: string, @Param('permissionId') permissionId: string) {
    return this.roles.removePermission(id, permissionId);
  }
}
