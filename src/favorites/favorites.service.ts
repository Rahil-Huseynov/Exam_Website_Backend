import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FavoritesService {
  constructor(private prisma: PrismaService) {}

  async addFavorite(userId: number, publicId: string) {
    const car = await this.prisma.allCarsList.findUnique({ where: { publicId } });
    if (!car) throw new NotFoundException('Car not found');
    const existing = await this.prisma.favorite.findUnique({
      where: { userId_carId: { userId, carId: car.id } },
    });
    if (existing) throw new ConflictException('Already favorited');
    return this.prisma.favorite.create({
      data: { userId, carId: car.id },
      include: { car: true },
    });
  }

  async removeFavoriteByPublicId(userId: number, publicId: string) {
    const car = await this.prisma.allCarsList.findUnique({ where: { publicId } });
    if (!car) throw new NotFoundException('Car not found');
    const existing = await this.prisma.favorite.findUnique({
      where: { userId_carId: { userId, carId: car.id } },
    });
    if (!existing) throw new NotFoundException('Favorite not found');
    return this.prisma.favorite.delete({ where: { id: existing.id } });
  }

  async removeFavorite(userId: number, favoriteId: number) {
    const existing = await this.prisma.favorite.findUnique({ where: { id: favoriteId } });
    if (!existing || existing.userId !== userId) throw new NotFoundException('Favorite not found');
    return this.prisma.favorite.delete({ where: { id: favoriteId } });
  }

  async getFavorites(userId: number) {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      include: { car: { include: { images: true } } },
      orderBy: { car: { createdAt: 'desc' } },
    });
    return rows.map((fav) => {
      const car = fav.car ?? null;
      const normalizeUrl = (u: string | null | undefined) => (!u ? '/placeholder.svg' : String(u).replace(/^\/+/, ''));
      return {
        id: fav.id,
        carPublicId: car?.publicId ?? null,
        createdAt: fav.createdAt,
        car: car
          ? {
              publicId: car.publicId,
              brand: car.brand,
              model: car.model,
              year: car.year,
              SaleType: car.SaleType,
              price: car.price,
              mileage: car.mileage,
              gearbox: car.gearbox,
              fuel: car.fuel,
              condition: car.condition,
              color: car.color,
              location: car.location,
              status: car.status,
              description: car.description,
              features: car.features ?? [],
              images: (car.images ?? []).map((img) => ({ id: img.id, url: normalizeUrl(img.url) })),
            }
          : null,
      };
    });
  }
}