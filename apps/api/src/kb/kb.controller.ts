import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { KbService } from './kb.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

const VIEW = [PERMISSIONS.KB_VIEW, PERMISSIONS.KB_MANAGE, PERMISSIONS.CONSOLE_ADMIN];
const MANAGE = [PERMISSIONS.KB_MANAGE, PERMISSIONS.CONSOLE_ADMIN];

@Controller('kb-public')
export class KbPublicController {
  constructor(private readonly service: KbService) {}

  @Get('articles')
  list(@Query('q') q?: string) {
    return this.service.listPublic(q);
  }

  @Get('articles/:slug')
  one(@Param('slug') slug: string) {
    return this.service.getArticle(slug, null, true);
  }

  @Get('categories')
  categories() {
    return this.service.listCategories('PUBLIC', null, true);
  }

  @Post('articles/:id/helpful')
  helpful(@Param('id', ParseIntPipe) id: number) {
    return this.service.markHelpful(id);
  }
}

@Controller('kb')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class KbController {
  constructor(private readonly service: KbService) {}

  @Get('categories')
  @RBAC({ anyPermissions: VIEW })
  listCategories(
    @CurrentCompanyId() companyId: number | null,
    @Query('visibility') visibility?: string,
  ) {
    return this.service.listCategories(visibility, companyId);
  }

  @Post('categories')
  @RBAC({ anyPermissions: MANAGE })
  createCategory(@Body() dto: any, @CurrentCompanyId() companyId: number | null) {
    return this.service.createCategory(dto, companyId);
  }

  @Get('articles')
  @RBAC({ anyPermissions: VIEW })
  listArticles(
    @CurrentCompanyId() companyId: number | null,
    @Query('status') status?: string,
    @Query('visibility') visibility?: string,
    @Query('categoryId') categoryId?: string,
    @Query('q') q?: string,
    @Query('tag') tag?: string,
  ) {
    return this.service.listArticles(
      {
        status,
        visibility,
        categoryId: categoryId ? +categoryId : undefined,
        q,
        tag,
      },
      companyId,
    );
  }

  @Get('articles/:slugOrId')
  @RBAC({ anyPermissions: VIEW })
  getArticle(
    @Param('slugOrId') slugOrId: string,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.getArticle(slugOrId, companyId);
  }

  @Post('articles')
  @RBAC({ anyPermissions: MANAGE })
  createArticle(
    @Body() dto: any,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.createArticle({ ...dto, authorId: dto.authorId ?? user?.id }, companyId);
  }

  @Patch('articles/:id')
  @RBAC({ anyPermissions: MANAGE })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.updateArticle(id, dto, companyId);
  }

  @Delete('articles/:id')
  @RBAC({ anyPermissions: MANAGE })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.service.deleteArticle(id, companyId);
  }
}
