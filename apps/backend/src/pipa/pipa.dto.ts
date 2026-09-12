import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class PipaDto {
  @IsArray() coords!: number[][];
  @IsOptional() @IsString() dc_id?: string;
  @IsOptional() @IsNumber() @Type(() => Number) dia?: number;
  @IsOptional() @IsString() jenis?: string;
  @IsOptional() @IsNumber() @Type(() => Number) panjang?: number;
  @IsOptional() @IsString() keterangan?: string;
  @IsOptional() @IsString() lokasi?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsNumber() @Type(() => Number) diameter?: number;
  @IsOptional() @IsNumber() @Type(() => Number) roughness?: number;
  @IsOptional() @IsString() zona?: string;
}
