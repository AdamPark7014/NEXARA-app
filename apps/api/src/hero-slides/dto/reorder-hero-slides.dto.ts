import { ArrayMinSize, IsArray, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class ReorderHeroSlidesDto {
  /** IDs en el orden deseado (de arriba a abajo). */
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  ids!: number[];
}
