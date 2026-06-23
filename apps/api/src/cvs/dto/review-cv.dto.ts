import { IsArray, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

const DECISIONS = ['PENDING', 'APPROVED', 'REJECTED'] as const;
const EMPLOYMENT_STATUSES = ['NEW_CANDIDATE', 'CURRENT_EMPLOYEE', 'FORMER_EMPLOYEE'] as const;
const STAGES = [
  'INBOX',
  'RECRUITER_SHORTLIST',
  'RECRUITER_REJECTED',
  'ADMIN_SHORTLIST',
  'ADMIN_REJECTED',
  'SUPERADMIN_SHORTLIST',
  'SUPERADMIN_REJECTED',
  'APPROVED',
] as const;

export class RecruiterReviewCvDto {
  @IsIn(DECISIONS)
  decision!: (typeof DECISIONS)[number];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(EMPLOYMENT_STATUSES)
  employmentStatus?: (typeof EMPLOYMENT_STATUSES)[number];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class AdminReviewCvDto {
  @IsIn(DECISIONS)
  decision!: (typeof DECISIONS)[number];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SuperadminReviewCvDto {
  @IsIn(DECISIONS)
  decision!: (typeof DECISIONS)[number];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class MoveCvDto {
  @IsIn(STAGES)
  stage!: (typeof STAGES)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class ReorderCvDto {
  @IsIn(STAGES)
  stage!: (typeof STAGES)[number];

  @IsArray()
  @IsInt({ each: true })
  orderedIds!: number[];
}
