import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChatService } from './chat.service.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

type MulterFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('chat')
@UseGuards(AuthGuard('jwt'))
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('channels')
  listChannels(@CurrentUser() user: { id: number }, @CurrentCompanyId() companyId: number | null) {
    return this.chat.listChannels(user.id, companyId);
  }

  @Post('channels')
  createChannel(
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
    @Body()
    body: { name: string; kind?: 'PUBLIC' | 'PRIVATE'; topic?: string; description?: string },
  ) {
    return this.chat.createChannel(user.id, body, companyId);
  }

  @Get('search')
  search(
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
    @Query('q') q?: string,
    @Query('channelId') channelId?: string,
  ) {
    return this.chat.searchMessages(
      user.id,
      q ?? '',
      channelId ? Number(channelId) : undefined,
      companyId,
    );
  }

  @Get('channels/:id')
  getChannel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.chat.getChannel(id, user.id, companyId);
  }

  @Patch('channels/:id/topic')
  updateTopic(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { topic: string },
  ) {
    return this.chat.updateTopic(id, user.id, body.topic ?? '', companyId);
  }

  @Post('channels/:id/members')
  addMember(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { userId: number },
  ) {
    return this.chat.addMember(id, user.id, Number(body.userId), companyId);
  }

  @Delete('channels/:id/leave')
  leaveChannel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.chat.leaveChannel(id, user.id, companyId);
  }

  @Patch('channels/:id/mute')
  setMuted(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { muted?: boolean },
  ) {
    return this.chat.setChannelMuted(id, user.id, Boolean(body?.muted), companyId);
  }

  @Get('channels/:id/pins')
  listPins(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.chat.listPinnedMessages(id, user.id, companyId);
  }

  @Get('channels/:id/messages')
  listMessages(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
    @Query('beforeId') beforeId?: string,
    @Query('aroundId') aroundId?: string,
    @Query('limit') limit?: string,
    @Query('parentId') parentId?: string,
  ) {
    return this.chat.listMessages(
      id,
      user.id,
      {
        beforeId: beforeId ? Number(beforeId) : undefined,
        aroundId: aroundId ? Number(aroundId) : undefined,
        limit: limit ? Number(limit) : undefined,
        parentId:
          parentId === undefined
            ? null
            : parentId === '' || parentId === 'null'
              ? null
              : Number(parentId),
      },
      companyId,
    );
  }

  @Post('channels/:id/messages')
  postMessage(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
    @Body()
    body: {
      body: string;
      parentId?: number | null;
      attachmentUrl?: string | null;
      attachmentName?: string | null;
    },
  ) {
    return this.chat.postMessage(id, user.id, body, companyId);
  }

  @Patch('channels/:id/read')
  markRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.chat.markRead(id, user.id, companyId);
  }

  @Post('dm')
  openDm(
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { userId: number },
  ) {
    return this.chat.openDirect(user.id, Number(body.userId), companyId);
  }

  @Patch('messages/:id')
  editMessage(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { body: string },
  ) {
    return this.chat.editMessage(id, user.id, body.body ?? '', companyId);
  }

  @Post('messages/:id/pin')
  togglePin(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.chat.togglePin(id, user.id, companyId);
  }

  @Post('messages/:id/reactions')
  react(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { emoji: string },
  ) {
    return this.chat.toggleReaction(id, user.id, body.emoji, companyId);
  }

  @Get('colleagues')
  colleagues(
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
    @Query('q') q?: string,
  ) {
    return this.chat.listColleagues(user.id, q, companyId);
  }

  @Get('mentions')
  mentions(
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
    @Query('q') q?: string,
    @Query('kind') kind?: 'USER' | 'ACTIVITY' | 'EVIDENCE',
  ) {
    return this.chat.searchMentionables(user.id, q ?? '', kind, companyId);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  upload(@UploadedFile() file?: MulterFile) {
    if (!file) {
      throw new BadRequestException('Archivo requerido');
    }
    return this.chat.saveAttachment(file);
  }
}
