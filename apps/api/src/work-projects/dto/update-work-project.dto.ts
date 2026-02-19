import { PartialType } from '@nestjs/mapped-types';
import { CreateWorkProjectDto } from './create-work-project.dto.js';

export class UpdateWorkProjectDto extends PartialType(CreateWorkProjectDto) {}
