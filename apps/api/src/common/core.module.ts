import { Module, Global } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Global()
@Module({
  providers: [Reflector],
  exports: [Reflector],
})
export class CoreModule {}
