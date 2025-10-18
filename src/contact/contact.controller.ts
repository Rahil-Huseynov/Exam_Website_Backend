import { Body, Controller, Post, UsePipes, ValidationPipe, HttpException, HttpStatus } from '@nestjs/common';
import { ContactService } from './contact.service';
import { ContactDto } from './dto/contact.dto';

@Controller('contact')
export class ContactController {
  constructor(private contactService: ContactService) {}

  @Post()
  @UsePipes(new ValidationPipe({ transform: true }))
  async sendContact(@Body() body: ContactDto) {
    try {
      await this.contactService.sendContactEmail(body);
      return { message: 'Sent' };
    } catch (err) {
      throw new HttpException('Failed to send message. Try again later.', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
