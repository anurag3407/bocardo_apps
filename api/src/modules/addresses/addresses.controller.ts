import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/decorators';
import { AddressDto, AddressListDto, CreateAddressDto, UpdateAddressDto } from './addresses.dto';
import { AddressesService } from './addresses.service';

@ApiTags('addresses')
@ApiBearerAuth()
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @ZodResponse({ type: AddressListDto })
  list(@CurrentUser() user: AuthUser) {
    return this.addresses.list(user.id);
  }

  @Post()
  @ZodResponse({ type: AddressDto, status: 201 })
  create(@CurrentUser() user: AuthUser, @Body() body: CreateAddressDto) {
    return this.addresses.create(user.id, body);
  }

  @Patch(':id')
  @ZodResponse({ type: AddressDto })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAddressDto,
  ) {
    return this.addresses.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.addresses.remove(user.id, id);
  }
}
