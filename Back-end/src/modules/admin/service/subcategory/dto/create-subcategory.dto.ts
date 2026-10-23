import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSubcategoryDto {
	@IsString()
	@IsNotEmpty()
	@MinLength(2)
	@MaxLength(100)
	@Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
	name: string;

	@IsString()
	@IsNotEmpty()
	@Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
	category_id: string;
}
