import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateTemplateDto) {
    return this.prisma.messageTemplate.create({ data: dto });
  }

  findAll() {
    return this.prisma.messageTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, dto: UpdateTemplateDto) {
    await this.findOneOrFail(id);
    return this.prisma.messageTemplate.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOneOrFail(id);
    return this.prisma.messageTemplate.delete({ where: { id } });
  }

  private async findOneOrFail(id: string) {
    const template = await this.prisma.messageTemplate.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException('Plantilla no encontrada');
    }
    return template;
  }
}
