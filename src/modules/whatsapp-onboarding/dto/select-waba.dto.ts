import { IsString, Matches } from 'class-validator';

export class SelectWabaDto {
  @IsString()
  @Matches(/^\d+$/, { message: 'wabaId must contain only digits' })
  wabaId: string;
}
