import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FavoritesService {
  constructor(private prisma: PrismaService) { }

  async addFavorite(userId: number, carId: number) {
    const existing = await this.prisma.favorite.findUnique({
      where: { userId_carId: { userId, carId } },
    });
    if (existing) {
      throw new ConflictException('Already favorited');
    }
    const car = await this.prisma.allCarsList.findUnique({ where: { id: carId } });
    if (!car) {
      throw new NotFoundException('Car not found');
    }
    return this.prisma.favorite.create({
      data: { userId, carId },
      include: { car: true },
    });
  }

  async removeFavorite(userId: number, favoriteId: number) {
    const existing = await this.prisma.favorite.findUnique({
      where: { id: favoriteId },
    });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Favorite not found');
    }
    return this.prisma.favorite.delete({
      where: { id: favoriteId },
    });
  }


  async getFavorites(userId: number) {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      include: {
        car: { include: { images: true } },
      },
      orderBy: { car: { createdAt: 'desc' } },
    });

    return rows.map((fav) => {
      const car = fav.car ?? null;
      const normalizeUrl = (u: string | null | undefined) => (!u ? '/placeholder.svg' : String(u).replace(/^\/+/, ''));

      return {
        id: fav.id,
        userId: fav.userId,
        carId: fav.carId,
        createdAt: fav.createdAt,
        allCarsListId: car?.id ?? fav.carId,
        car: car
          ? {
            id: car.id,
            publicId: car.publicId,
            viewcount: car.viewcount,
            brand: car.brand,
            model: car.model,
            year: car.year,
            SaleType: car.SaleType,
            vinCode: car.vinCode,
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