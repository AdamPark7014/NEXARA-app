import { IsNumber, IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';

export enum NotifyCategoryEnum {
  ATTENDANCE = 'attendance',
  LUNCH_BREAKS = 'lunch_breaks',
  ACTIVITIES = 'activities',
  EVIDENCES = 'evidences',
  VIATICS = 'viatics',
  TOOLS = 'tools',
  FINES = 'fines',
  PROFILE = 'profile',
  VEHICLES = 'vehicles',
  QUOTES = 'quotes',
  ORDERS = 'orders',
  PROJECTS = 'projects',
  GENERAL = 'general',
}

export enum NotifyPriorityEnum {
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low',
}

export class CreateNotificationDto {
  @IsNumber()
  userId!: number;

  @IsString()
  type!: string;

  @IsEnum(NotifyCategoryEnum)
  category!: string;

  @IsString()
  title!: string;

  @IsString()
  message!: string;

  @IsNumber()
  @IsOptional()
  triggerUserId?: number;

  @IsNumber()
  @IsOptional()
  relatedEntityId?: number;

  @IsString()
  @IsOptional()
  entityType?: string;

  @IsString()
  @IsOptional()
  relatedUrl?: string;

  @IsEnum(NotifyPriorityEnum)
  @IsOptional()
  priority?: string;
}

export class NotificationFiltersDto {
  @IsBoolean()
  @IsOptional()
  isRead?: boolean;

  @IsEnum(NotifyCategoryEnum)
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  since?: string; // ISO date string

  @IsNumber()
  @IsOptional()
  limit?: number;

  @IsNumber()
  @IsOptional()
  offset?: number;
}

export class BulkNotificationDto {
  @IsOptional()
  notifications!: CreateNotificationDto[];
}

export class MarkAsReadDto {
  @IsNumber()
  notificationId!: number;
}
