import { IsNotEmpty, IsString } from 'class-validator';

export class UpsertPreferenceDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  value!: string;
}
