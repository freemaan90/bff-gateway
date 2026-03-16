import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(4096)
  content: string;
}
