import { IsArray, IsOptional, IsString } from 'class-validator';

export class PolygonDto {
  @IsArray() coords!: number[][];
  @IsOptional() @IsString() nosamw?: string;
  @IsOptional() @IsString() nosambckup?: string;
}
