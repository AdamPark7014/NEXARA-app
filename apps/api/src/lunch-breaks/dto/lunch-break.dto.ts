import { IsString, IsISO8601 } from 'class-validator';

export class CreateLunchBreakDto {
  @IsISO8601()
  checkinTime!: string; // ISO datetime string

  @IsString()
  checkinPhotoUrl!: string;
}

export class UpdateLunchBreakDto {
  @IsISO8601()
  checkoutTime!: string; // ISO datetime string

  @IsString()
  checkoutPhotoUrl?: string;
}
