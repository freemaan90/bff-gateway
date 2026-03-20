import { IsOptional, IsString } from 'class-validator';

export class CallbackQueryDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  state: string;

  @IsOptional()
  @IsString()
  error?: string;
}
