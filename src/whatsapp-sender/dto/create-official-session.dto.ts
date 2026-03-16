import { IsString, IsNotEmpty, Matches, MinLength } from 'class-validator';

export class CreateOfficialSessionDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/, { message: 'phoneNumberId must contain only numeric characters' })
  phoneNumberId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(20, { message: 'accessToken must be at least 20 characters long' })
  accessToken: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/, { message: 'wabaId must contain only numeric characters' })
  wabaId: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
}
