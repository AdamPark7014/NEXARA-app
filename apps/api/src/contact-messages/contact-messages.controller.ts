import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { ContactMessagesService } from './contact-messages.service.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { CreateContactMessageDto } from './dto/create-contact-message.dto.js';
import { InboundContactMessageDto } from './dto/inbound-contact-message.dto.js';
import { UpdateContactMessageDto } from './dto/update-contact-message.dto.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

@Controller('contact-messages')
export class ContactMessagesController {
  constructor(private readonly contactMessagesService: ContactMessagesService) {}

  @Post()
  create(@Body() createContactMessageDto: CreateContactMessageDto) {
    return this.contactMessagesService.create(createContactMessageDto);
  }

  @Post('inbound')
  inbound(
    @Headers('x-inbound-token') token: string | undefined,
    @Body() inboundContactMessageDto: InboundContactMessageDto,
  ) {
    const expectedToken = process.env.INBOUND_EMAIL_TOKEN;
    if (!expectedToken || token !== expectedToken) {
      throw new UnauthorizedException('Token invalido');
    }
    return this.contactMessagesService.ingestInbound(inboundContactMessageDto);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  findAll(
    @CurrentCompanyId() companyId: number | null,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query() query?: PaginationQueryDto,
  ) {
    return this.contactMessagesService.findAll(status, category, query, companyId);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.contactMessagesService.findOne(id, companyId);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateContactMessageDto: UpdateContactMessageDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.contactMessagesService.update(id, updateContactMessageDto, companyId);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.contactMessagesService.remove(id, companyId);
  }
}
