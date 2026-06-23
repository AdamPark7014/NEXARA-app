import { PartialType } from '@nestjs/mapped-types';
import { CreateNewsPostDto } from './create-news-post.dto.js';

export class UpdateNewsPostDto extends PartialType(CreateNewsPostDto) {}
