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
} from '@nestjs/common';
import { ContactMessagesService } from './contact-messages.service.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { CreateContactMessageDto } from './dto/create-contact-message.dto.js';
import { InboundContactMessageDto } from './dto/inbound-contact-message.dto.js';
import { UpdateContactMessageDto } from './dto/update-contact-message.dto.js';

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
    if (expectedToken && token !== expectedToken) {
      throw new UnauthorizedException('Token invalido');
    }
    return this.contactMessagesService.ingestInbound(inboundContactMessageDto);
  }

  @Get()
  findAll(@Query('status') status?: string, @Query('category') category?: string, @Query() query?: PaginationQueryDto) {
    return this.contactMessagesService.findAll(status, category, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.contactMessagesService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateContactMessageDto: UpdateContactMessageDto,
  ) {
    return this.contactMessagesService.update(id, updateContactMessageDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.contactMessagesService.remove(id);
  }
}
