import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    const hash = await bcrypt.hash(createUserDto.password, 10);
    return this.prisma['user'].create({
      data: {
        ...createUserDto,
        passwordHash: hash,
      },
    });
  }


  findAll() {
    return this.prisma['user'].findMany({
      include: { role: true, department: true },
    });
  }

  findByDepartment(departmentId: number) {
    return this.prisma['user'].findMany({
      where: { departmentId },
      include: { role: true, department: true },
    });
  }

  findOne(id: number) {
    return this.prisma['user'].findUnique({
      where: { id },
      include: { role: true, department: true },
    });
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
      delete updateUserDto.password;
    }
    return this.prisma['user'].update({
      where: { id },
      data: updateUserDto,
    });
  }

  remove(id: number) {
    return this.prisma['user'].delete({ where: { id } });
  }
}
