import { Body, Controller, Post } from '@nestjs/common';
import { BranchAuthService } from './branch-auth.service.js';

@Controller('branch-auth')
export class BranchAuthController {
  constructor(private readonly branchAuthService: BranchAuthService) {}

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.branchAuthService.login(body.email, body.password);
  }
}
