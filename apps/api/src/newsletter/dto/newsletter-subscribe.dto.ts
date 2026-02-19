import { IsEmail, IsOptional, IsString } from 'class-validator';

export class NewsletterSubscribeDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  pageUrl?: string;
}
