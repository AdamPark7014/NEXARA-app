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
  listChannels(@CurrentUser() user: { id: number }) {
    return this.chat.listChannels(user.id);
  }

  @Post('channels')
  createChannel(
    @CurrentUser() user: { id: number },
    @Body()
    body: { name: string; kind?: 'PUBLIC' | 'PRIVATE'; topic?: string; description?: string },
  ) {
    return this.chat.createChannel(user.id, body);
  }

  @Get('search')
  search(
    @CurrentUser() user: { id: number },
    @Query('q') q?: string,
    @Query('channelId') channelId?: string,
  ) {
    return this.chat.searchMessages(user.id, q ?? '', channelId ? Number(channelId) : undefined);
  }

  @Get('channels/:id')
  getChannel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { id: number }) {
    return this.chat.getChannel(id, user.id);
  }

  @Patch('channels/:id/topic')
  updateTopic(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @Body() body: { topic: string },
  ) {
    return this.chat.updateTopic(id, user.id, body.topic ?? '');
  }

  @Post('channels/:id/members')
  addMember(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @Body() body: { userId: number },
  ) {
    return this.chat.addMember(id, user.id, Number(body.userId));
  }

  @Delete('channels/:id/leave')
  leaveChannel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { id: number }) {
    return this.chat.leaveChannel(id, user.id);
  }

  @Patch('channels/:id/mute')
  setMuted(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @Body() body: { muted?: boolean },
  ) {
    return this.chat.setChannelMuted(id, user.id, Boolean(body?.muted));
  }

  @Get('channels/:id/pins')
  listPins(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { id: number }) {
    return this.chat.listPinnedMessages(id, user.id);
  }

  @Get('channels/:id/messages')
  listMessages(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @Query('beforeId') beforeId?: string,
    @Query('limit') limit?: string,
    @Query('parentId') parentId?: string,
  ) {
    return this.chat.listMessages(id, user.id, {
      beforeId: beforeId ? Number(beforeId) : undefined,
      limit: limit ? Number(limit) : undefined,
      parentId:
        parentId === undefined
          ? null
          : parentId === '' || parentId === 'null'
            ? null
            : Number(parentId),
    });
  }

  @Post('channels/:id/messages')
  postMessage(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @Body()
    body: {
      body: string;
      parentId?: number | null;
      attachmentUrl?: string | null;
      attachmentName?: string | null;
    },
  ) {
    return this.chat.postMessage(id, user.id, body);
  }

  @Patch('channels/:id/read')
  markRead(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { id: number }) {
    return this.chat.markRead(id, user.id);
  }

  @Post('dm')
  openDm(@CurrentUser() user: { id: number }, @Body() body: { userId: number }) {
    return this.chat.openDirect(user.id, Number(body.userId));
  }

  @Patch('messages/:id')
  editMessage(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @Body() body: { body: string },
  ) {
    return this.chat.editMessage(id, user.id, body.body ?? '');
  }

  @Post('messages/:id/pin')
  togglePin(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { id: number }) {
    return this.chat.togglePin(id, user.id);
  }

  @Post('messages/:id/reactions')
  react(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @Body() body: { emoji: string },
  ) {
    return this.chat.toggleReaction(id, user.id, body.emoji);
  }

  @Get('colleagues')
  colleagues(@CurrentUser() user: { id: number }, @Query('q') q?: string) {
    return this.chat.listColleagues(user.id, q);
  }

  @Get('mentions')
  mentions(
    @CurrentUser() user: { id: number },
    @Query('q') q?: string,
    @Query('kind') kind?: 'USER' | 'ACTIVITY' | 'EVIDENCE',
  ) {
    return this.chat.searchMentionables(user.id, q ?? '', kind);
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
