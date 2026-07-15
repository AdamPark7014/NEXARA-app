import { Controller, Post, Body, Req, HttpCode, Get, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/current-user.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() loginDto: LoginDto, @Req() req: Request) {
    return this.authService.login(loginDto, req);
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  profile(@CurrentUser() user: any) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.authService.getProfile(Number(user.id));
  }
}
