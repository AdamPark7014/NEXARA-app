import { IsIn, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterFcmTokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsOptional()
  @IsString()
  @IsIn(['android', 'ios'])
  platform?: string;
}

class WebPushKeysDto {
  @IsString()
  p256dh!: string;

  @IsString()
  auth!: string;
}

class WebPushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => WebPushKeysDto)
  keys!: WebPushKeysDto;

  /** Lo envía el navegador en PushSubscription.toJSON() */
  @IsOptional()
  @IsNumber()
  expirationTime?: number | null;
}

export class RegisterWebPushDto {
  @IsObject()
  @ValidateNested()
  @Type(() => WebPushSubscriptionDto)
  subscription!: WebPushSubscriptionDto;
}
