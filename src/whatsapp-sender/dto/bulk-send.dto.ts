import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class BulkSendDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsArray()
  @ArrayMaxSize(1000, { message: 'Cannot send to more than 1000 phone numbers at once' })
  phones: string[];

  @IsString()
  @IsOptional()
  message?: string;

  @IsString()
  @IsOptional()
  templateName?: string;

  @ValidateIf((o) => o.templateName !== undefined)
  @IsString()
  @IsNotEmpty({ message: 'languageCode is required when templateName is provided' })
  languageCode?: string;

  @IsArray()
  @IsOptional()
  templateComponents?: object[];
}
