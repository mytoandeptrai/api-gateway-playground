import {
  Controller,
  Get,
  Post,
  Body,
  UseInterceptors,
  Param,
  Patch,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { CacheInterceptor } from 'src/shared/caching/interceptors/cache.interceptor';
import {
  Cacheable,
  CacheInvalidate,
} from 'src/shared/caching/decorators/cacheable.decorator';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('users')
@Controller('users')
@UseInterceptors(CacheInterceptor)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @Cacheable({
    key: (args) => `user:${args[0]?.params?.id}`,
    ttl: 3600,
    tags: ['users'],
  })
  async getUser(@Param('id') id: number) {
    return this.usersService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @CacheInvalidate({
    tags: ['users'],
  })
  async updateUser(@Param('id') id: number, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }
}
