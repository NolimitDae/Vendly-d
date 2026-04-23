import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateSubcategoryDto {
	@IsString()
	@IsNotEmpty()
	@MinLength(3)
	@Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
	name: string;

	@IsString()
	@IsNotEmpty()
	@Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
	category_id: string;
}
