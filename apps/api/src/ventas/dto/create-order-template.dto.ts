export class CreateOrderTemplateDto {
  name!: string;
  description?: string;
  isDefault?: boolean;
  headerLogo?: string;
  headerText?: string;
  companyName?: string;
  companyEmail?: string;
  companyPhone?: string;
  footerText?: string;
  footerAlignment?: string;
  primaryColor?: string;
  secondaryColor?: string;
  textColor?: string;
  sections?: any;
  customCss?: string;
}
