import { IsString } from 'class-validator';

export class CreateSalesOpportunityNoteDto {
  @IsString()
  message!: string;
}
