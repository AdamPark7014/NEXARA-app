export class CreateLunchBreakDto {
  checkinTime: string; // ISO datetime string
  checkinPhotoUrl: string;
}

export class UpdateLunchBreakDto {
  checkoutTime: string; // ISO datetime string
  checkoutPhotoUrl: string;
}
