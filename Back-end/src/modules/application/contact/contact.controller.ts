import { Controller, Post, Body } from '@nestjs/common';
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiExcludeController()
@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @ApiOperation({ summary: 'Create contact' })
  @Post()
  async create(@Body() createContactDto: CreateContactDto) {
    try {
      const contact = await this.contactService.create(createContactDto);
      return contact;
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
}
