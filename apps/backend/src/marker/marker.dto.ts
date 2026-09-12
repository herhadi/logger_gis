import { IsArray, IsNumber, IsOptional, IsString, Length } from 'class-validator';
import { Type } from 'class-transformer';

export class MarkerDto {
  @IsString() @Length(1, 32) tipe!: string;
  @IsArray() coords!: number[];
  @IsOptional() @IsString() dc_id?: string;
  @IsOptional() @IsString() keterangan?: string;
  @IsOptional() @IsString() zona?: string;
  @IsOptional() @IsString() lokasi?: string;
  @IsOptional() @IsNumber() @Type(() => Number) elevation?: number;
}

export class MarkerUpdateDto {
  @IsOptional() @IsString() tipe?: string;
  @IsArray() coords!: number[];
  @IsOptional() @IsString() dc_id?: string;
  @IsOptional() @IsString() keterangan?: string;
  @IsOptional() @IsString() zona?: string;
  @IsOptional() @IsString() lokasi?: string;
  @IsOptional() @IsNumber() @Type(() => Number) elevation?: number;
}
