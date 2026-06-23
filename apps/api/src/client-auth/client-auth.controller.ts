import { Body, Controller, Post } from '@nestjs/common';
import { ClientAuthService } from './client-auth.service.js';

@Controller('client-auth')
export class ClientAuthController {
  constructor(private readonly clientAuthService: ClientAuthService) {}

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.clientAuthService.login(body.email, body.password);
  }
}
