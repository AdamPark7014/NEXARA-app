import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PageContentService, VALID_SECTIONS } from './page-content.service.js';
import { UpsertPageContentDto } from './dto/upsert-page-content.dto.js';

@Controller('studio/page-content')
export class PageContentController {
  constructor(private readonly svc: PageContentService) {}

  /** GET /api/studio/page-content — lista todas las secciones guardadas */
  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll() {
    return this.svc.findAll();
  }

  /** GET /api/studio/page-content/sections — lista las secciones válidas */
  @Get('sections')
  @UseGuards(AuthGuard('jwt'))
  listSections() {
    return { sections: VALID_SECTIONS };
  }

  /**
   * GET /api/studio/page-content/:section
   * Uso público (landing page) y Studio.
   */
  @Get(':section')
  findOne(@Param('section') section: string) {
    return this.svc.findOne(section);
  }

  /**
   * PUT /api/studio/page-content/:section
   * Solo Studio.
   */
  @Put(':section')
  @UseGuards(AuthGuard('jwt'))
  upsert(
    @Param('section') section: string,
    @Body() dto: UpsertPageContentDto,
  ) {
    return this.svc.upsert(section, dto);
  }
}
