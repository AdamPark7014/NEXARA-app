import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChatService } from './chat.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('chat')
@UseGuards(RbacGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('channels')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_VIEW] })
  listChannels(@CurrentUser() user: { id: number }) {
    return this.chat.listChannels(user.id);
  }

  @Post('channels')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_VIEW] })
  createChannel(
    @CurrentUser() user: { id: number },
    @Body()
    body: { name: string; kind?: 'PUBLIC' | 'PRIVATE'; topic?: string; description?: string },
  ) {
    return this.chat.createChannel(user.id, body);
  }

  @Get('search')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_VIEW] })
  search(
    @CurrentUser() user: { id: number },
    @Query('q') q?: string,
    @Query('channelId') channelId?: string,
  ) {
    return this.chat.searchMessages(user.id, q ?? '', channelId ? Number(channelId) : undefined);
  }

  @Get('channels/:id')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_VIEW] })
  getChannel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { id: number }) {
    return this.chat.getChannel(id, user.id);
  }

  @Patch('channels/:id/topic')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_VIEW] })
  updateTopic(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @Body() body: { topic: string },
  ) {
    return this.chat.updateTopic(id, user.id, body.topic ?? '');
  }

  @Get('channels/:id/messages')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_VIEW] })
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
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_VIEW] })
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
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_VIEW] })
  markRead(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { id: number }) {
    return this.chat.markRead(id, user.id);
  }

  @Post('documents/:documentId/channel')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_VIEW] })
  ensureDocumentChannel(
    @Param('documentId', ParseIntPipe) documentId: number,
    @CurrentUser() user: { id: number },
  ) {
    return this.chat.ensureDocumentChannel(documentId, user.id);
  }

  @Post('dm')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_VIEW] })
  openDm(@CurrentUser() user: { id: number }, @Body() body: { userId: number }) {
    return this.chat.openDirect(user.id, Number(body.userId));
  }

  @Patch('messages/:id')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_VIEW] })
  editMessage(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @Body() body: { body: string },
  ) {
    return this.chat.editMessage(id, user.id, body.body ?? '');
  }

  @Delete('messages/:id')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_VIEW] })
  deleteMessage(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { id: number }) {
    return this.chat.deleteMessage(id, user.id);
  }

  @Post('messages/:id/reactions')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_VIEW] })
  react(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @Body() body: { emoji: string },
  ) {
    return this.chat.toggleReaction(id, user.id, body.emoji);
  }

  @Get('colleagues')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_VIEW] })
  colleagues(@CurrentUser() user: { id: number }, @Query('q') q?: string) {
    return this.chat.listColleagues(user.id, q);
  }
}
