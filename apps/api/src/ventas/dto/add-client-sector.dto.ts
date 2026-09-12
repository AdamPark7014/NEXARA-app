import { IsIn } from 'class-validator';

const SECTORS = ['PROYECTO', 'CORPORATIVO', 'COMERCIAL'] as const;

export class AddClientSectorDto {
  @IsIn(SECTORS)
  sector!: (typeof SECTORS)[number];
}
