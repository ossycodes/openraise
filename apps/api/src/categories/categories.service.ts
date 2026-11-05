import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Category } from '../generated/prisma/client.js';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from './categories.schemas.js';

export interface PublicCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
}

function toPublic(c: Category): PublicCategory {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    sortOrder: c.sortOrder,
  };
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PublicCategory[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toPublic);
  }

  async get(slug: string): Promise<PublicCategory> {
    const row = await this.prisma.category.findUnique({ where: { slug } });
    if (!row) throw new NotFoundException('Category not found');
    return toPublic(row);
  }

  async create(input: CreateCategoryInput): Promise<PublicCategory> {
    try {
      return toPublic(await this.prisma.category.create({ data: input }));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A category with this slug already exists');
      }
      throw error;
    }
  }

  async update(slug: string, input: UpdateCategoryInput): Promise<PublicCategory> {
    const result = await this.prisma.category.updateMany({
      where: { slug },
      data: input,
    });
    if (result.count === 0) throw new NotFoundException('Category not found');
    return this.get(slug);
  }
}
