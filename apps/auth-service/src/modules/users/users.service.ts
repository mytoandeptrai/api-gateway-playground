import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(dto: Partial<User>): Promise<User> {
    const user = this.userRepository.create(dto);
    return this.userRepository.save(user);
  }

  async update(id: number, dto: UpdateUserDto): Promise<User> {
    await this.userRepository.update(id, dto);
    return await this.findById(id);
  }

  async findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async findById(id: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async updateRefreshToken(
    id: number,
    refreshToken: string | null,
  ): Promise<void> {
    await this.userRepository.update(id, { refreshToken });
  }
}
