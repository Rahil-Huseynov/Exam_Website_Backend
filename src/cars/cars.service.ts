import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type FilterOptions = {
  search?: string;
  status?: string;
  brand?: string;
  model?: string;
  year?: number;
  fuel?: string;
  location?: string;
  ban?: string;
  engine?: string;
  gearbox?: string;
  condition?: string;
  color?: string;
  SaleType?: string;
  vinCode?: string;
  viewcount?: number;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class CarsService {
  constructor(private prisma: PrismaService) { }

  private getUploadsBase(): string {
    const base =
      (process.env.UPLOADS_BASE as string) ||
      (process.env.NEXT_PUBLIC_UPLOADS_BASE as string) ||
      '/uploads';
    return base.replace(/\/+$/, '');
  }

  private normalizeUrl(u: string | null | undefined): string {
    if (!u) return '/placeholder.svg';
    const s = String(u).trim();
    if (!s) return '/placeholder.svg';
    if (/^https?:\/\//i.test(s)) return s;
    const cleaned = s.replace(/^\/+/, '').replace(/^uploads\/+/i, '');
    const base = this.getUploadsBase();
    return `${base}/${cleaned}`;
  }

  private hasFiltersProvided(filters: FilterOptions) {
    return !!(
      (filters.search && String(filters.search).trim() !== '') ||
      (filters.brand && filters.brand !== 'all') ||
      (filters.model && filters.model !== 'all') ||
      (typeof filters.year === 'number' && !Number.isNaN(filters.year)) ||
      (filters.fuel && filters.fuel !== 'all') ||
      (filters.location && filters.location !== 'all') ||
      (filters.ban && filters.ban !== 'all') ||
      (filters.engine && filters.engine !== 'all') ||
      (filters.gearbox && filters.gearbox !== 'all') ||
      (filters.condition && filters.condition !== 'all') ||
      (filters.color && filters.color !== 'all') ||
      (filters.SaleType && filters.SaleType !== 'all') ||
      (filters.vinCode && filters.vinCode !== 'all') ||

      typeof filters.minPrice === 'number' ||
      typeof filters.maxPrice === 'number'
    );
  }

  async getAllCarsFromAllList(
    page = 1,
    limit = 20,
    filters: FilterOptions = {},
  ) {
    let pageNumber = Number(page) || 1;
    let limitNumber = Number(limit) || 20;
    const maxLimit = 100;
    if (limitNumber <= 0) limitNumber = 20;
    if (limitNumber > maxLimit) limitNumber = maxLimit;
    if (pageNumber <= 0) pageNumber = 1;

    const where: any = {};
    if (filters.status && filters.status !== 'all') {
      where.status = filters.status;
    } else {
      where.status = { not: 'sold' };
    }

    if (filters.brand && filters.brand !== 'all') where.brand = filters.brand;
    if (filters.model && filters.model !== 'all') where.model = filters.model;
    if (filters.fuel && filters.fuel !== 'all') where.fuel = filters.fuel;
    if (filters.location && filters.location !== 'all') where.location = filters.location;
    if (filters.ban && filters.ban !== 'all') where.ban = filters.ban;
    if (filters.engine && filters.engine !== 'all') where.engine = filters.engine;
    if (filters.gearbox && filters.gearbox !== 'all') where.gearbox = filters.gearbox;
    if (filters.condition && filters.condition !== 'all') where.condition = filters.condition;
    if (filters.color && filters.color !== 'all') where.color = filters.color;
    if (filters.SaleType && filters.SaleType !== 'all') where.SaleType = filters.SaleType;
    if (filters.vinCode && filters.vinCode !== 'all') where.vinCode = filters.vinCode;

    if (typeof filters.year === 'number' && !Number.isNaN(filters.year)) where.year = filters.year;

    if (typeof filters.minPrice === 'number' || typeof filters.maxPrice === 'number') {
      where.price = {};
      if (typeof filters.minPrice === 'number') where.price.gte = filters.minPrice;
      if (typeof filters.maxPrice === 'number') where.price.lte = filters.maxPrice;
    }

    if (filters.search && String(filters.search).trim() !== '') {
      const q = String(filters.search).trim();
      where.AND = where.AND ?? [];
      where.AND.push({
        OR: [
          { brand: { contains: q, mode: 'insensitive' } },
          { model: { contains: q, mode: 'insensitive' } },
          { location: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    const hasFilters = this.hasFiltersProvided(filters);
    let orderBy: any = undefined;
    const mapSortToOrder = (sb?: string): any | null => {
      if (!sb) return null;
      switch (sb) {
        case 'price-low':
        case 'price_asc':
          return { price: 'asc' };
        case 'price-high':
        case 'price_desc':
          return { price: 'desc' };
        case 'year-new':
        case 'year_desc':
          return { year: 'desc' };
        case 'year-old':
        case 'year_asc':
          return { year: 'asc' };
        case 'mileage-low':
          return { mileage: 'asc' };
        case 'mileage-high':
          return { mileage: 'desc' };
        default:
          return null;
      }
    };

    const secondaryOrder = mapSortToOrder(filters.sortBy);

    if (!hasFilters) {
      orderBy = secondaryOrder ? [{ createdAt: 'desc' }, secondaryOrder] : [{ createdAt: 'desc' }];
    } else {
      if (secondaryOrder) {
        orderBy = [secondaryOrder];
      } else {
        orderBy = undefined;
      }
    }

    const skip = (pageNumber - 1) * limitNumber;

    const [rows, totalCount] = await this.prisma.$transaction([
      this.prisma.allCarsList.findMany({
        where,
        skip,
        take: limitNumber,
        ...(orderBy ? { orderBy } : {}),
        include: { images: true, user: true },
      }),
      this.prisma.allCarsList.count({ where }),
    ]);

    const formatted = rows.map((car: any) => ({
      id: car.id,
      brand: car.brand,
      model: car.model,
      year: car.year,
      price: car.price,
      mileage: car.mileage,
      fuel: car.fuel,
      condition: car.condition,
      color: car.color,
      SaleType: car.SaleType,
      vinCode: car.vinCode,
      viewcount: car.viewcount,
      location: car.location,
      ban: car.ban,
      engine: car.engine,
      gearbox: car.gearbox,
      description: car.description,
      features: car.features ?? [],
      name: car.name,
      phone: car.phone,
      phoneCode: car.phoneCode,
      email: car.email,
      status: car.status,
      createdAt: car.createdAt,
      user: car.user
        ? {
          id: car.user.id,
          firstName: car.user.firstName,
          lastName: car.user.lastName,
          email: car.user.email,
          phoneNumber: car.user.phoneNumber,
          phoneCode: car.user.phoneCode,
        }
        : null,
      images:
        car.images?.map((img: any) => ({
          id: img.id,
          url: this.normalizeUrl(String(img.url ?? '')),
        })) ?? [],
    }));

    const totalPages = Math.max(1, Math.ceil((totalCount ?? 0) / limitNumber));
    if (pageNumber > totalPages) pageNumber = totalPages;

    return {
      cars: formatted,
      totalCount,
      totalPages,
      currentPage: pageNumber,
    };
  }

  async getPremiumCarsFromAllList(filters: FilterOptions = {}) {
    let pageNumber = Number(filters.page) || 1;
    let limitNumber = Number(filters.limit) || 12;
    const maxLimit = 100;

    if (limitNumber <= 0) limitNumber = 12;
    if (limitNumber > maxLimit) limitNumber = maxLimit;
    if (pageNumber <= 0) pageNumber = 1;

    const where: any = { status: 'premium' };

    if (filters.brand && filters.brand !== 'all') where.brand = filters.brand;
    if (filters.model && filters.model !== 'all') where.model = filters.model;
    if (filters.fuel && filters.fuel !== 'all') where.fuel = filters.fuel;
    if (filters.location && filters.location !== 'all') where.location = filters.location;
    if (filters.ban && filters.ban !== 'all') where.ban = filters.ban;
    if (filters.engine && filters.engine !== 'all') where.engine = filters.engine;
    if (filters.gearbox && filters.gearbox !== 'all') where.gearbox = filters.gearbox;
    if (filters.condition && filters.condition !== 'all') where.condition = filters.condition;
    if (filters.color && filters.color !== 'all') where.color = filters.color;
    if (filters.SaleType && filters.SaleType !== 'all') where.SaleType = filters.SaleType;
    if (filters.vinCode && filters.vinCode !== 'all') where.vinCode = filters.vinCode;
    if (typeof filters.year === 'number' && !Number.isNaN(filters.year)) where.year = filters.year;
    if (typeof filters.minPrice === 'number' || typeof filters.maxPrice === 'number') {
      where.price = {};
      if (typeof filters.minPrice === 'number') where.price.gte = filters.minPrice;
      if (typeof filters.maxPrice === 'number') where.price.lte = filters.maxPrice;
    }

    if (filters.search) {
      where.AND = where.AND ?? [];
      where.AND.push({
        OR: [
          { brand: { contains: filters.search, mode: 'insensitive' } },
          { model: { contains: filters.search, mode: 'insensitive' } },
          { location: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }

    const hasFilters = this.hasFiltersProvided(filters);

    const mapSortToOrder = (sb?: string): any | null => {
      if (!sb) return null;
      switch (sb) {
        case 'price-low': return { price: 'asc' };
        case 'price-high': return { price: 'desc' };
        case 'year-new': return { year: 'desc' };
        case 'year-old': return { year: 'asc' };
        case 'mileage-low': return { mileage: 'asc' };
        case 'mileage-high': return { mileage: 'desc' };
        default: return null;
      }
    };

    const secondaryOrder = mapSortToOrder(filters.sortBy);

    let orderBy: any = undefined;
    if (!hasFilters) {
      orderBy = secondaryOrder ? [{ createdAt: 'desc' }, secondaryOrder] : [{ createdAt: 'desc' }];
    } else {
      if (secondaryOrder) orderBy = [secondaryOrder];
      else orderBy = undefined;
    }

    const [cars, totalCount] = await this.prisma.$transaction([
      this.prisma.allCarsList.findMany({
        where,
        skip: (pageNumber - 1) * limitNumber,
        take: limitNumber,
        ...(orderBy ? { orderBy } : {}),
        include: {
          images: true,
          user: true,
        },
      }),
      this.prisma.allCarsList.count({ where }),
    ]);

    return {
      cars,
      totalCount,
      totalPages: Math.ceil(totalCount / limitNumber),
      currentPage: pageNumber,
    };
  }

  async getCarById(id: number) {
    const allCar = await this.prisma.allCarsList.findUnique({
      where: { id },
      include: { images: true, user: true, userCar: true },
    });
    if (allCar) {
      if (allCar.userCar) {
        const [updatedAllCar] = await this.prisma.$transaction([
          this.prisma.allCarsList.update({
            where: { id },
            data: { viewcount: { increment: 1 } },
            include: { images: true, user: true, userCar: true },
          }),
          this.prisma.userCars.update({
            where: { id: allCar.userCar.id },
            data: { viewcount: { increment: 1 } },
          }),
        ]);

        const updated = updatedAllCar;
        return {
          id: updated.id,
          brand: updated.brand,
          model: updated.model,
          year: updated.year,
          price: updated.price,
          mileage: updated.mileage,
          fuel: updated.fuel,
          ban: updated.ban,
          engine: updated.engine,
          gearbox: updated.gearbox,
          condition: updated.condition,
          color: updated.color,
          SaleType: updated.SaleType,
          vinCode: updated.vinCode,
          location: updated.location,
          description: updated.description,
          features: updated.features ?? [],
          status: updated.status,
          createdAt: updated.createdAt,
          viewcount: updated.viewcount,
          user: updated.user
            ? {
              id: updated.user.id,
              firstName: updated.user.firstName,
              lastName: updated.user.lastName,
              email: updated.user.email,
              phoneNumber: updated.user.phoneNumber,
              phoneCode: updated.user.phoneCode,
            }
            : null,
          images:
            updated.images?.map((img: any) => ({
              id: img.id,
              url: this.normalizeUrl(String(img.url ?? '')),
            })) ?? [],
        };
      } else {
        const updated = await this.prisma.allCarsList.update({
          where: { id },
          data: { viewcount: { increment: 1 } },
          include: { images: true, user: true },
        });

        return {
          id: updated.id,
          brand: updated.brand,
          model: updated.model,
          year: updated.year,
          price: updated.price,
          mileage: updated.mileage,
          fuel: updated.fuel,
          ban: updated.ban,
          engine: updated.engine,
          gearbox: updated.gearbox,
          condition: updated.condition,
          color: updated.color,
          SaleType: updated.SaleType,
          vinCode: updated.vinCode,
          location: updated.location,
          description: updated.description,
          features: updated.features ?? [],
          status: updated.status,
          createdAt: updated.createdAt,
          viewcount: updated.viewcount,
          user: updated.user
            ? {
              id: updated.user.id,
              firstName: updated.user.firstName,
              lastName: updated.user.lastName,
              email: updated.user.email,
              phoneNumber: updated.user.phoneNumber,
              phoneCode: updated.user.phoneCode,
            }
            : null,
          images:
            updated.images?.map((img: any) => ({
              id: img.id,
              url: this.normalizeUrl(String(img.url ?? '')),
            })) ?? [],
        };
      }
    }
    const userCar = await this.prisma.userCars.findUnique({
      where: { id },
      include: { images: true, allCar: true, user: true },
    });

    if (userCar) {
      if (userCar.allCar) {
        const [updatedUserCar] = await this.prisma.$transaction([
          this.prisma.userCars.update({
            where: { id },
            data: { viewcount: { increment: 1 } },
            include: { images: true, user: true, allCar: true },
          }),
          this.prisma.allCarsList.update({
            where: { id: userCar.allCar.id },
            data: { viewcount: { increment: 1 } },
          }),
        ]);

        const updated = updatedUserCar;
        return {
          id: updated.id,
          brand: updated.brand,
          model: updated.model,
          year: updated.year,
          price: updated.price,
          mileage: updated.mileage,
          fuel: updated.fuel,
          ban: updated.ban,
          engine: updated.engine,
          gearbox: updated.gearbox,
          condition: updated.condition,
          color: updated.color,
          SaleType: updated.SaleType,
          vinCode: updated.vinCode,
          location: updated.location,
          description: updated.description,
          features: updated.features ?? [],
          status: updated.status,
          createdAt: updated.createdAt,
          viewcount: updated.viewcount,
          user: updated.user
            ? {
              id: updated.user.id,
              firstName: updated.user.firstName,
              lastName: updated.user.lastName,
              email: updated.user.email,
              phoneNumber: updated.user.phoneNumber,
              phoneCode: updated.user.phoneCode,
            }
            : null,
          images:
            updated.images?.map((img: any) => ({
              id: img.id,
              url: this.normalizeUrl(String(img.url ?? '')),
            })) ?? [],
          allCar: updated.allCar
            ? { id: updated.allCar.id, brand: updated.allCar.brand, model: updated.allCar.model }
            : null,
        };
      } else {
        const updated = await this.prisma.userCars.update({
          where: { id },
          data: { viewcount: { increment: 1 } },
          include: { images: true, user: true, allCar: true },
        });

        return {
          id: updated.id,
          brand: updated.brand,
          model: updated.model,
          year: updated.year,
          price: updated.price,
          mileage: updated.mileage,
          fuel: updated.fuel,
          ban: updated.ban,
          engine: updated.engine,
          gearbox: updated.gearbox,
          condition: updated.condition,
          color: updated.color,
          SaleType: updated.SaleType,
          vinCode: updated.vinCode,
          location: updated.location,
          description: updated.description,
          features: updated.features ?? [],
          status: updated.status,
          createdAt: updated.createdAt,
          viewcount: updated.viewcount,
          user: updated.user
            ? {
              id: updated.user.id,
              firstName: updated.user.firstName,
              lastName: updated.user.lastName,
              email: updated.user.email,
              phoneNumber: updated.user.phoneNumber,
              phoneCode: updated.user.phoneCode,
            }
            : null,
          images:
            updated.images?.map((img: any) => ({
              id: img.id,
              url: this.normalizeUrl(String(img.url ?? '')),
            })) ?? [],
          allCar: updated.allCar
            ? { id: updated.allCar.id, brand: updated.allCar.brand, model: updated.allCar.model }
            : null,
        };
      }
    }

    return null;
  }
  async getAllCarsPremiumFirst(
    page = 1,
    limit = 20,
    filters: FilterOptions = {},
  ) {
    let pageNumber = Number(page) || 1;
    let limitNumber = Number(limit) || 20;
    const maxLimit = 100;
    if (limitNumber <= 0) limitNumber = 20;
    if (limitNumber > maxLimit) limitNumber = maxLimit;
    if (pageNumber <= 0) pageNumber = 1;

    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'sold') {
        return {
          cars: [],
          totalCount: 0,
          totalPages: 1,
          currentPage: pageNumber,
        };
      }
      return this.getAllCarsFromAllList(page, limit, filters);
    }

    const baseWhere: any = {};
    baseWhere.status = { not: 'sold' };

    if (filters.brand && filters.brand !== 'all') baseWhere.brand = filters.brand;
    if (filters.model && filters.model !== 'all') baseWhere.model = filters.model;
    if (filters.fuel && filters.fuel !== 'all') baseWhere.fuel = filters.fuel;
    if (filters.location && filters.location !== 'all') baseWhere.location = filters.location;
    if (filters.ban && filters.ban !== 'all') baseWhere.ban = filters.ban;
    if (filters.engine && filters.engine !== 'all') baseWhere.engine = filters.engine;
    if (filters.gearbox && filters.gearbox !== 'all') baseWhere.gearbox = filters.gearbox;
    if (filters.condition && filters.condition !== 'all') baseWhere.condition = filters.condition;
    if (filters.color && filters.color !== 'all') baseWhere.color = filters.color;
    if (filters.SaleType && filters.SaleType !== 'all') baseWhere.SaleType = filters.SaleType;
    if (filters.vinCode && filters.vinCode !== 'all') baseWhere.vinCode = filters.vinCode;
    if (typeof filters.year === 'number' && !Number.isNaN(filters.year)) baseWhere.year = filters.year;
    if (typeof filters.minPrice === 'number' || typeof filters.maxPrice === 'number') {
      baseWhere.price = {};
      if (typeof filters.minPrice === 'number') baseWhere.price.gte = filters.minPrice;
      if (typeof filters.maxPrice === 'number') baseWhere.price.lte = filters.maxPrice;
    }
    if (filters.search && String(filters.search).trim() !== '') {
      const q = String(filters.search).trim();
      baseWhere.AND = baseWhere.AND ?? [];
      baseWhere.AND.push({
        OR: [
          { brand: { contains: q, mode: 'insensitive' } },
          { model: { contains: q, mode: 'insensitive' } },
          { location: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    const mapSortToOrder = (sb?: string): any | null => {
      if (!sb) return null;
      switch (sb) {
        case 'price-low':
        case 'price_asc':
          return { price: 'asc' };
        case 'price-high':
        case 'price_desc':
          return { price: 'desc' };
        case 'year-new':
        case 'year_desc':
          return { year: 'desc' };
        case 'year-old':
        case 'year_asc':
          return { year: 'asc' };
        case 'mileage-low':
          return { mileage: 'asc' };
        case 'mileage-high':
          return { mileage: 'desc' };
        default:
          return null;
      }
    };

    const secondaryOrder = mapSortToOrder(filters.sortBy);
    const orderByForFind: any[] = secondaryOrder ? [{ createdAt: 'desc' }, secondaryOrder] : [{ createdAt: 'desc' }];

    const premiumWhere = { ...baseWhere, status: 'premium' };
    const nonPremiumWhere = { 
      ...baseWhere, 
      status: { notIn: ['premium', 'sold'] } 
    };

    const [premiumCount, nonPremiumCount] = await Promise.all([
      this.prisma.allCarsList.count({ where: premiumWhere }),
      this.prisma.allCarsList.count({ where: nonPremiumWhere }),
    ]);

    const totalCount = (premiumCount ?? 0) + (nonPremiumCount ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalCount / limitNumber));
    if (pageNumber > totalPages) pageNumber = totalPages;

    const skip = (pageNumber - 1) * limitNumber;

    let rows: any[] = [];

    if (skip < premiumCount) {
      const premiumSkip = skip;
      const premiumTake = Math.min(limitNumber, Math.max(0, premiumCount - premiumSkip));
      const premiumRows = await this.prisma.allCarsList.findMany({
        where: premiumWhere,
        skip: premiumSkip,
        take: premiumTake,
        orderBy: orderByForFind,
        include: { images: true, user: true },
      });
      rows = rows.concat(premiumRows);

      if (premiumTake < limitNumber) {
        const need = limitNumber - premiumTake;
        const nonRows = await this.prisma.allCarsList.findMany({
          where: nonPremiumWhere,
          skip: 0,
          take: need,
          orderBy: orderByForFind,
          include: { images: true, user: true },
        });
        rows = rows.concat(nonRows);
      }
    } else {
      const nonSkip = skip - premiumCount;
      const nonRows = await this.prisma.allCarsList.findMany({
        where: nonPremiumWhere,
        skip: nonSkip,
        take: limitNumber,
        orderBy: orderByForFind,
        include: { images: true, user: true },
      });
      rows = rows.concat(nonRows);
    }

    const formatted = rows.map((car: any) => ({
      id: car.id,
      brand: car.brand,
      model: car.model,
      year: car.year,
      price: car.price,
      mileage: car.mileage,
      fuel: car.fuel,
      condition: car.condition,
      color: car.color,
      SaleType: car.SaleType,
      vinCode: car.vinCode,
      viewcount: car.viewcount,
      location: car.location,
      ban: car.ban,
      engine: car.engine,
      gearbox: car.gearbox,
      description: car.description,
      features: car.features ?? [],
      name: car.name,
      phone: car.phone,
      phoneCode: car.phoneCode,
      email: car.email,
      status: car.status,
      createdAt: car.createdAt,
      user: car.user
        ? {
          id: car.user.id,
          firstName: car.user.firstName,
          lastName: car.user.lastName,
          email: car.user.email,
          phoneNumber: car.user.phoneNumber,
          phoneCode: car.user.phoneCode,
        }
        : null,
      images:
        car.images?.map((img: any) => ({
          id: img.id,
          url: this.normalizeUrl(String(img.url ?? '')),
        })) ?? [],
    }));

    return {
      cars: formatted,
      totalCount,
      totalPages,
      currentPage: pageNumber,
    };
  }


}