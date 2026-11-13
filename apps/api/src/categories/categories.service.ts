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

  async create(
    input: CreateCategoryInput,
    actorId?: string,
  ): Promise<PublicCategory> {
    try {
      const { reason, ...data } = input;
      return toPublic(
        await this.prisma.$transaction(async (tx) => {
          const row = await tx.category.create({ data });
          await tx.auditEvent.create({
            data: {
              actorId,
              action: 'CATEGORY_CREATED',
              targetType: 'Category',
              targetId: row.id,
              after: {
                slug: row.slug,
                name: row.name,
                description: row.description,
                sortOrder: row.sortOrder,
                reason: reason ?? 'Category created',
              },
            },
          });
          return row;
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A category with this slug already exists');
      }
      throw error;
    }
  }

  async update(
    slug: string,
    input: UpdateCategoryInput,
    actorId?: string,
  ): Promise<PublicCategory> {
    const { expectedUpdatedAt, reason, ...data } = input;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Category" WHERE "slug" = ${slug} FOR UPDATE`;
      const old = await tx.category.findUnique({ where: { slug } });
      if (!old) throw new NotFoundException('Category not found');
      if (
        expectedUpdatedAt &&
        old.updatedAt.toISOString() !== expectedUpdatedAt
      )
        throw new ConflictException('Category changed. Reload before saving.');
      const row = await tx.category.update({ where: { slug }, data });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'CATEGORY_CHANGED',
          targetType: 'Category',
          targetId: row.id,
          before: {
            name: old.name,
            description: old.description,
            sortOrder: old.sortOrder,
          },
          after: {
            name: row.name,
            description: row.description,
            sortOrder: row.sortOrder,
            reason: reason ?? 'Category updated',
          },
        },
      });
      return toPublic(row);
    });
  }
}
