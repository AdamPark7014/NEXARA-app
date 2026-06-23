import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { KbService } from './kb.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';

const VIEW = [PERMISSIONS.KB_VIEW, PERMISSIONS.KB_MANAGE, PERMISSIONS.CONSOLE_ADMIN];
const MANAGE = [PERMISSIONS.KB_MANAGE, PERMISSIONS.CONSOLE_ADMIN];

/** Endpoint público (sin guard) para la web pública y el portal cliente. */
@Controller('kb-public')
export class KbPublicController {
  constructor(private readonly service: KbService) {}

  @Get('articles')
  list(@Query('q') q?: string) {
    return this.service.listPublic(q);
  }

  @Get('articles/:slug')
  one(@Param('slug') slug: string) {
    return this.service.getArticle(slug);
  }

  @Get('categories')
  categories() {
    return this.service.listCategories('PUBLIC');
  }

  @Post('articles/:id/helpful')
  helpful(@Param('id', ParseIntPipe) id: number) {
    return this.service.markHelpful(id);
  }
}

/** Endpoint autenticado para administración */
@Controller('kb')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class KbController {
  constructor(private readonly service: KbService) {}

  @Get('categories')
  @RBAC({ anyPermissions: VIEW })
  listCategories(@Query('visibility') visibility?: string) {
    return this.service.listCategories(visibility);
  }

  @Post('categories')
  @RBAC({ anyPermissions: MANAGE })
  createCategory(@Body() dto: any) {
    return this.service.createCategory(dto);
  }

  @Get('articles')
  @RBAC({ anyPermissions: VIEW })
  listArticles(
    @Query('status') status?: string,
    @Query('visibility') visibility?: string,
    @Query('categoryId') categoryId?: string,
    @Query('q') q?: string,
    @Query('tag') tag?: string,
  ) {
    return this.service.listArticles({
      status,
      visibility,
      categoryId: categoryId ? +categoryId : undefined,
      q,
      tag,
    });
  }

  @Get('articles/:slugOrId')
  @RBAC({ anyPermissions: VIEW })
  getArticle(@Param('slugOrId') slugOrId: string) {
    return this.service.getArticle(slugOrId);
  }

  @Post('articles')
  @RBAC({ anyPermissions: MANAGE })
  createArticle(@Body() dto: any, @CurrentUser() user: any) {
    return this.service.createArticle({ ...dto, authorId: dto.authorId ?? user?.id });
  }

  @Patch('articles/:id')
  @RBAC({ anyPermissions: MANAGE })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.updateArticle(id, dto);
  }

  @Delete('articles/:id')
  @RBAC({ anyPermissions: MANAGE })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteArticle(id);
  }
}
