import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '../../common/files/interceptores-subida.js';
import { PersonalImportService } from './personal-import.service.js';
import { UrlAccessGuard } from '../../common/rbac/url-access.guard.js';
import { RbacGuard, RBAC } from '../../common/rbac.guard.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { CurrentCompanyId } from '../../common/tenant/current-company.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';

@Controller('hr/personal-import')
@UseGuards(UrlAccessGuard, RbacGuard)
export class PersonalImportController {
  constructor(private readonly svc: PersonalImportService) {}

  @Post('preview')
  @RBAC({ anyPermissions: [PERMISSIONS.HR_MANAGE, PERMISSIONS.HR_VIEW] })
  @UseInterceptors(FileInterceptor('file'))
  preview(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.previsualizar(user, Number(companyId), file?.buffer as Buffer);
  }

  @Post('confirmar')
  @RBAC({ anyPermissions: [PERMISSIONS.HR_MANAGE, PERMISSIONS.HR_VIEW] })
  confirmar(
    @Body() body: any,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.confirmar(user, Number(companyId), body ?? {});
  }
}
