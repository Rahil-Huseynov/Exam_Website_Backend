import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import type { Prisma } from 'generated/prisma';
import * as path from 'path';
import { PrismaService } from 'src/prisma/prisma.service';
import { PushService } from 'src/push/push.service';
import { ensureAbsoluteUrl } from 'src/utils/urls';

@Injectable()
export class UserCarsService {
  private readonly uploadDir: string;
  private readonly logger = new Logger(UserCarsService.name);
  private frontendBase: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
  ) {
    this.uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    this.frontendBase = process.env.FRONTEND_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
  }


  private getPremiumSeconds(): number {
    const envVal =
      process.env.PREMIUM_EXPIRES_SECONDS ??
      process.env.NEXT_PUBLIC_PREMIUM_EXPIRES_SECONDS;
    const n = Number(envVal);
    if (!envVal || Number.isNaN(n) || n <= 0) return 86400;
    return Math.floor(n);
  }

  private getPremiumExpiresDate(): Date {
    const secs = this.getPremiumSeconds();
    return new Date(Date.now() + secs * 1000);
  }

  private addDays(date: Date, days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  private normalizeDescription(input: any): string | null {
    if (input === undefined || input === null) return null;
    const s = String(input);
    return s.replace(/\r\n/g, '\n');
  }

  private normalizeUrl(url: string | null | undefined): string {
    if (!url) return '/placeholder.svg';
    return url.replace(/^\/+/, '');
  }

  async createUserCar(data: any) {
    const normalizedDescription = this.normalizeDescription(data.description);

    const imagesUrls: string[] | undefined = Array.isArray(data.imagesUrls)
      ? data.imagesUrls
      : typeof data.imagesUrls === 'string' && data.imagesUrls.length
        ? [data.imagesUrls]
        : undefined;

    const expiresAt = data.status === 'premium' ? this.getPremiumExpiresDate() : null;

    this.logger.debug(`createUserCar: normalizedDescription = ${JSON.stringify(normalizedDescription)}`);

    const result = await this.prisma.$transaction(async (tx) => {
      const createdUserCar = await tx.userCars.create({
        data: {
          brand: data.brand,
          model: data.model,
          year: Number(data.year || 0),
          price: Number(data.price || 0),
          mileage: Number(data.mileage || 0),
          fuel: data.fuel,
          condition: data.condition,
          color: data.color,
          location: data.location,
          ban: data.ban,
          viewcount: data.viewcount ?? 0,
          engine: data.engine,
          SaleType: data.SaleType,
          vinCode: data.vinCode,
          gearbox: data.gearbox,
          description: normalizedDescription,
          features: data.features ?? [],
          status: data.status,
          premiumExpiresAt: expiresAt,
          userId: Number(data.userId),
          images: imagesUrls ? { create: imagesUrls.map((u, idx) => ({ url: u, order: idx })) } : undefined,
        },
        include: { images: { orderBy: { order: 'asc' } } },
      });

      const createdAllCar = await tx.allCarsList.create({
        data: {
          brand: createdUserCar.brand,
          model: createdUserCar.model,
          year: createdUserCar.year,
          price: createdUserCar.price,
          mileage: createdUserCar.mileage,
          fuel: createdUserCar.fuel,
          condition: createdUserCar.condition,
          color: createdUserCar.color,
          SaleType: createdUserCar.SaleType,
          vinCode: createdUserCar.vinCode,
          location: createdUserCar.location,
          ban: createdUserCar.ban,
          viewcount: createdUserCar.viewcount ?? 0,
          engine: createdUserCar.engine,
          gearbox: createdUserCar.gearbox,
          description: createdUserCar.description,
          features: createdUserCar.features ?? [],
          status: createdUserCar.status,
          premiumExpiresAt: expiresAt,
          userCar: { connect: { id: createdUserCar.id } },
          userId: createdUserCar.userId,
          images: imagesUrls ? { create: imagesUrls.map((u, idx) => ({ url: u, order: idx })) } : undefined,
        },
        include: { images: { orderBy: { order: 'asc' } } },
      });

      await tx.userCars.update({ where: { id: createdUserCar.id }, data: { allCarsListId: createdAllCar.id } });

      return { newUserCar: createdUserCar, newAllCar: createdAllCar };
    });

    try {
      const carToNotify = result.newAllCar ?? result.newUserCar;

      const firstImageRaw = (carToNotify.images && carToNotify.images[0]) ? carToNotify.images[0].url : null;
      const firstImageUrl = ensureAbsoluteUrl(firstImageRaw, this.frontendBase) || null;

      const payload = {
        title: 'New car added 🚗',
        body: [
          carToNotify.brand,
          carToNotify.model,
          carToNotify.year ? `${carToNotify.year}` : null,
          carToNotify.price ? `Price: ${carToNotify.price} zł` : null,
        ].filter(Boolean).join(' — '),
        url: `${this.frontendBase.replace(/\/+$/, '')}/cars/${carToNotify.id}`,
        icon: firstImageUrl || `${this.frontendBase.replace(/\/+$/, '')}/placeholder-128.png`,
        image: firstImageUrl || undefined,
        images: (carToNotify.images ?? []).map((i: any) => ensureAbsoluteUrl(i.url, this.frontendBase) || ''),
        meta: {
          id: carToNotify.id,
          userId: carToNotify.userId ?? null,
          status: carToNotify.status ?? null,
        },
      };

      this.pushService.sendPushToAll(payload).catch((err: Error) => {
        this.logger.warn(`Failed to send push after createUserCar: ${err.message}`);
      });

      this.logger.log(`Push notification triggered for created user car id=${carToNotify.id}`);
    } catch (err) {
      this.logger.warn(`Push notification error: ${(err as Error).message}`);
    }

    return result;
  }


  async getAllUserCars() {
    return this.prisma.userCars.findMany({
      include: {
        images: { orderBy: { order: 'asc' } },
        allCar: { include: { images: { orderBy: { order: 'asc' } } } },
      },
    });
  }

  async getUserCarById(id: number) {
    const car = await this.prisma.userCars.findUnique({
      where: { id },
      include: {
        images: { orderBy: { order: 'asc' } },
        allCar: { include: { images: { orderBy: { order: 'asc' } } } },
        user: true,
      },
    });
    if (!car) return null;

    if (car.allCar) {
      const [updatedUserCar] = await this.prisma.$transaction([
        this.prisma.userCars.update({
          where: { id },
          data: { viewcount: { increment: 1 } },
          include: {
            images: { orderBy: { order: 'asc' } },
            allCar: { include: { images: { orderBy: { order: 'asc' } } } },
            user: true,
          },
        }),
        this.prisma.allCarsList.update({
          where: { id: car.allCar.id },
          data: { viewcount: { increment: 1 } },
        }),
      ]);

      const normalizeUrl = (u: string | null | undefined) => (!u ? '/placeholder.svg' : String(u).replace(/^\/+/, ''));

      const images = (updatedUserCar.images ?? []).map((i) => ({ id: i.id, url: normalizeUrl(i.url) }));
      const allCar = updatedUserCar.allCar
        ? { ...updatedUserCar.allCar, images: (updatedUserCar.allCar.images ?? []).map((i) => ({ id: i.id, url: normalizeUrl(i.url) })) }
        : null;

      return {
        id: updatedUserCar.id,
        brand: updatedUserCar.brand,
        model: updatedUserCar.model,
        year: updatedUserCar.year,
        price: updatedUserCar.price,
        mileage: updatedUserCar.mileage,
        fuel: updatedUserCar.fuel,
        condition: updatedUserCar.condition,
        color: updatedUserCar.color,
        SaleType: updatedUserCar.SaleType,
        vinCode: updatedUserCar.vinCode,
        viewcount: updatedUserCar.viewcount,
        ban: updatedUserCar.ban,
        location: updatedUserCar.location,
        engine: updatedUserCar.engine,
        gearbox: updatedUserCar.gearbox,
        description: updatedUserCar.description,
        features: updatedUserCar.features,
        status: updatedUserCar.status,
        createdAt: updatedUserCar.createdAt,
        updatedAt: updatedUserCar.updatedAt,
        images,
        allCar,
        allCarsListId: updatedUserCar.allCarsListId ?? updatedUserCar.allCar?.id ?? null,
      };
    } else {
      const updatedUserCar = await this.prisma.userCars.update({
        where: { id },
        data: { viewcount: { increment: 1 } },
        include: {
          images: { orderBy: { order: 'asc' } },
          allCar: { include: { images: { orderBy: { order: 'asc' } } } },
          user: true,
        },
      });

      const normalizeUrl = (u: string | null | undefined) => (!u ? '/placeholder.svg' : String(u).replace(/^\/+/, ''));

      const images = (updatedUserCar.images ?? []).map((i) => ({ id: i.id, url: normalizeUrl(i.url) }));
      const allCar = updatedUserCar.allCar
        ? { ...updatedUserCar.allCar, images: (updatedUserCar.allCar.images ?? []).map((i) => ({ id: i.id, url: normalizeUrl(i.url) })) }
        : null;

      return {
        id: updatedUserCar.id,
        brand: updatedUserCar.brand,
        model: updatedUserCar.model,
        year: updatedUserCar.year,
        price: updatedUserCar.price,
        mileage: updatedUserCar.mileage,
        fuel: updatedUserCar.fuel,
        condition: updatedUserCar.condition,
        color: updatedUserCar.color,
        SaleType: updatedUserCar.SaleType,
        vinCode: updatedUserCar.vinCode,
        viewcount: updatedUserCar.viewcount,
        ban: updatedUserCar.ban,
        location: updatedUserCar.location,
        engine: updatedUserCar.engine,
        gearbox: updatedUserCar.gearbox,
        description: updatedUserCar.description,
        features: updatedUserCar.features,
        status: updatedUserCar.status,
        createdAt: updatedUserCar.createdAt,
        updatedAt: updatedUserCar.updatedAt,
        images,
        allCar,
        allCarsListId: updatedUserCar.allCarsListId ?? updatedUserCar.allCar?.id ?? null,
      };
    }
  }

  async updateUserCar(id: number, data: any) {
    const userCar = await this.prisma.userCars.findUnique({
      where: { id },
      include: { allCar: true, images: { orderBy: { order: 'asc' } } },
    });
    if (!userCar) throw new BadRequestException('UserCar not found');

    const allowedFields = [
      'brand', 'model', 'year', 'price', 'mileage', 'fuel', 'condition', 'color', 'SaleType',
      'vinCode', 'location', 'ban', 'engine', 'gearbox', 'description', 'features',
      'name', 'phone', 'phoneCode', 'status', 'email', 'userId',
    ];

    const updatePayload: any = {};
    for (const key of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        let val = data[key];
        if (['year', 'price', 'mileage', 'userId'].includes(key) && val !== undefined && val !== null && val !== '') {
          const n = Number(val);
          if (!Number.isNaN(n)) val = n;
          else val = undefined;
        }
        if (key === 'features' && val && !Array.isArray(val)) {
          try {
            val = typeof val === 'string' ? JSON.parse(val) : Array.from(val);
          } catch {
            val = Array.isArray(val) ? val : [val];
          }
        }

        if (key === 'description' && val !== undefined && val !== null) {
          val = this.normalizeDescription(val);
          this.logger.debug(`updateUserCar: normalized description for id=${id} => ${JSON.stringify(val)}`);
        }

        if (val !== undefined) updatePayload[key] = val;
      }
    }

    if (Object.prototype.hasOwnProperty.call(updatePayload, 'status')) {
      if (updatePayload.status === 'premium') {
        updatePayload.premiumExpiresAt = this.getPremiumExpiresDate();
      } else {
        updatePayload.premiumExpiresAt = null;
      }
    }

    const imagesUrls: string[] | undefined = Array.isArray(data.imagesUrls)
      ? data.imagesUrls
      : typeof data.imagesUrls === 'string' && data.imagesUrls.length
        ? [data.imagesUrls]
        : undefined;

    const ops: Prisma.PrismaPromise<any>[] = [];

    if (imagesUrls && imagesUrls.length > 0) {
      const oldFilenames: string[] = userCar.images.map((i) => i.url).filter(Boolean as any);
      if (userCar.allCar) {
        const allCarImages = await this.prisma.carimages.findMany({ where: { allCarId: userCar.allCar.id } });
        oldFilenames.push(...allCarImages.map((i) => i.url).filter(Boolean as any));
      }
      const uniqueOldFilenames = [...new Set(oldFilenames)];

      for (const filename of uniqueOldFilenames) {
        if (/^https?:\/\//i.test(filename)) continue;
        const filePath = path.join(this.uploadDir, filename);
        try {
          await fs.unlink(filePath);
        } catch (err: any) {
          if (err.code !== 'ENOENT') {
            this.logger.warn(`Failed to delete file ${filePath}: ${err?.message ?? err}`);
          }
        }
      }

      ops.push(this.prisma.carimages.deleteMany({ where: { userCarId: id } }));
      if (userCar.allCar) {
        ops.push(this.prisma.carimages.deleteMany({ where: { allCarId: userCar.allCar.id } }));
      }

      for (const [idx, url] of imagesUrls.entries()) {
        ops.push(this.prisma.carimages.create({
          data: { url, order: idx, userCarId: id, allCarId: userCar.allCar ? userCar.allCar.id : undefined },
        }));
      }
    }

    if (data.images && Array.isArray(data.images)) {
      const imageIds = data.images.map((img: any) => Number(img.id)).filter((id: number) => !Number.isNaN(id));
      if (imageIds.length !== data.images.length) throw new BadRequestException('Invalid image ids');

      const count = await this.prisma.carimages.count({ where: { userCarId: id, id: { in: imageIds } } });
      if (count !== imageIds.length) throw new BadRequestException('Images do not belong to this car');

      const imageUpdates = imageIds.map((imgId: number, idx: number) =>
        this.prisma.carimages.update({
          where: { id: imgId },
          data: { order: idx },
        })
      );
      ops.push(...imageUpdates);
    }

    if (userCar.allCar) {
      const allCarPayload: any = {};
      for (const k of Object.keys(updatePayload)) allCarPayload[k] = updatePayload[k];
      if (Object.keys(allCarPayload).length > 0) {
        ops.push(this.prisma.allCarsList.update({ where: { id: userCar.allCar.id }, data: allCarPayload }));
      }
    }

    if (Object.keys(updatePayload).length > 0) {
      ops.push(this.prisma.userCars.update({ where: { id }, data: updatePayload }));
    }

    if (ops.length === 0) {
      return this.prisma.userCars.findUnique({
        where: { id },
        include: {
          images: { orderBy: { order: 'asc' } },
          allCar: { include: { images: { orderBy: { order: 'asc' } } } },
        },
      });
    }

    await this.prisma.$transaction(ops);
    return this.prisma.userCars.findUnique({
      where: { id },
      include: {
        images: { orderBy: { order: 'asc' } },
        allCar: { include: { images: { orderBy: { order: 'asc' } } } },
      },
    });
  }

  async getRecentCars() {
    const cars = await this.prisma.userCars.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { images: { orderBy: { order: 'asc' } } },
    });

    return cars.map((car) => ({
      id: car.id,
      brand: car.brand,
      model: car.model,
      year: car.year,
      price: car.price,
      status: car.status,
      viewcount: car.viewcount,
    }));
  }

  async deleteUserCar(id: number) {
    const userCar = await this.prisma.userCars.findUnique({
      where: { id },
      include: { images: true, allCar: { include: { images: true } } },
    });
    if (!userCar) return null;

    const filenames: string[] = [
      ...(userCar.images ?? []).map((i) => i.url),
      ...(userCar.allCar?.images ?? []).map((i) => i.url),
    ].filter(Boolean as any);

    for (const filename of filenames) {
      if (!filename) continue;
      if (/^https?:\/\//i.test(filename)) continue;
      const filePath = path.join(this.uploadDir, filename);
      try {
        await fs.unlink(filePath);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          this.logger.warn(`Failed to delete file ${filePath}: ${err?.message ?? err}`);
        }
      }
    }

    const ops: Prisma.PrismaPromise<any>[] = [];
    ops.push(this.prisma.carimages.deleteMany({ where: { userCarId: id } }));
    if (userCar.allCar) {
      ops.push(this.prisma.carimages.deleteMany({ where: { allCarId: userCar.allCar.id } }));
      ops.push(this.prisma.allCarsList.deleteMany({ where: { id: userCar.allCar.id } }));
    }

    ops.push(this.prisma.userCars.deleteMany({ where: { id } }));

    const results = await this.prisma.$transaction(ops);
    return results[results.length - 1];
  }

  async createAllCar(data: any) {
    const normalizedDescription = this.normalizeDescription(data.description);

    const imagesUrls: string[] | undefined = Array.isArray(data.imagesUrls)
      ? data.imagesUrls
      : typeof data.imagesUrls === 'string' && data.imagesUrls.length
        ? [data.imagesUrls]
        : undefined;

    const expiresAt = data.status === 'premium' ? this.getPremiumExpiresDate() : null;

    this.logger.debug(`createAllCar: normalizedDescription = ${JSON.stringify(normalizedDescription)}`);

    if (data.userId) {
      return this.prisma.$transaction(async (tx) => {
        const createdAll = await tx.allCarsList.create({
          data: {
            brand: data.brand,
            model: data.model,
            year: Number(data.year || 0),
            price: Number(data.price || 0),
            mileage: Number(data.mileage || 0),
            fuel: data.fuel,
            condition: data.condition,
            color: data.color,
            SaleType: data.SaleType,
            vinCode: data.vinCode,
            viewcount: data.viewcount ?? 0,
            location: data.location,
            ban: data.ban,
            engine: data.engine,
            gearbox: data.gearbox,
            description: normalizedDescription,
            features: data.features ?? [],
            status: data.status,
            premiumExpiresAt: expiresAt,
            userId: Number(data.userId),
            images: imagesUrls ? { create: imagesUrls.map((u, idx) => ({ url: u, order: idx })) } : undefined,
          },
          include: { images: { orderBy: { order: 'asc' } } },
        });

        const createdUserCar = await tx.userCars.create({
          data: {
            brand: createdAll.brand,
            model: createdAll.model,
            year: createdAll.year,
            price: createdAll.price,
            mileage: createdAll.mileage,
            fuel: createdAll.fuel,
            condition: createdAll.condition,
            color: createdAll.color,
            SaleType: createdAll.SaleType,
            vinCode: createdAll.vinCode,
            viewcount: createdAll.viewcount ?? 0,
            location: createdAll.location,
            ban: createdAll.ban,
            engine: createdAll.engine,
            gearbox: createdAll.gearbox,
            description: createdAll.description,
            features: createdAll.features ?? [],
            status: createdAll.status,
            premiumExpiresAt: expiresAt,
            userId: createdAll.userId!,
            allCarsListId: createdAll.id,
            images: imagesUrls ? { create: imagesUrls.map((u, idx) => ({ url: u, order: idx })) } : undefined,
          },
          include: { images: { orderBy: { order: 'asc' } } },
        });

        return { createdAll, createdUserCar };
      });
    } else {
      const createdAll = await this.prisma.allCarsList.create({
        data: {
          brand: data.brand,
          model: data.model,
          year: Number(data.year || 0),
          price: Number(data.price || 0),
          mileage: Number(data.mileage || 0),
          fuel: data.fuel,
          condition: data.condition,
          color: data.color,
          SaleType: data.SaleType,
          vinCode: data.vinCode,
          viewcount: data.viewcount ?? 0,
          location: data.location,
          ban: data.ban,
          engine: data.engine,
          gearbox: data.gearbox,
          description: normalizedDescription,
          features: data.features ?? [],
          status: data.status,
          premiumExpiresAt: expiresAt,
          images: imagesUrls ? { create: imagesUrls.map((u, idx) => ({ url: u, order: idx })) } : undefined,
        },
        include: { images: { orderBy: { order: 'asc' } } },
      });

      return { createdAll };
    }
  }

  async getAllCars() {
    return this.prisma.allCarsList.findMany({
      include: {
        images: { orderBy: { order: 'asc' } },
        userCar: { include: { images: { orderBy: { order: 'asc' } } } },
      },
    });
  }

  async getAllCarById(id: number) {
    return this.prisma.allCarsList.findUnique({
      where: { id },
      include: {
        images: { orderBy: { order: 'asc' } },
        userCar: { include: { images: { orderBy: { order: 'asc' } } } },
      },
    });
  }

  async updateAllCar(id: number, data: any) {
    const allCar = await this.prisma.allCarsList.findUnique({
      where: { id },
      include: { images: { orderBy: { order: 'asc' } }, userCar: true },
    });
    if (!allCar) throw new BadRequestException('AllCar not found');

    const allowed = ['brand', 'model', 'year', 'price', 'mileage', 'fuel', 'condition', 'color', 'SaleType', 'vinCode', 'location', 'ban', 'engine', 'gearbox', 'description', 'features', 'status', 'userId'];
    const updatePayload: any = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(data, k)) {
        let val = data[k];
        if (['year', 'price', 'mileage', 'userId'].includes(k) && val !== undefined && val !== '' && val !== null) {
          const n = Number(val);
          if (!Number.isNaN(n)) val = n;
          else val = undefined;
        }
        if (k === 'features' && val && !Array.isArray(val)) {
          try { val = typeof val === 'string' ? JSON.parse(val) : Array.from(val); } catch { val = Array.isArray(val) ? val : [val]; }
        }

        if (k === 'description' && val !== undefined && val !== null) {
          val = this.normalizeDescription(val);
          this.logger.debug(`updateAllCar: normalized description for id=${id} => ${JSON.stringify(val)}`);
        }

        if (val !== undefined) updatePayload[k] = val;
      }
    }

    if (Object.prototype.hasOwnProperty.call(updatePayload, 'status')) {
      if (updatePayload.status === 'premium') {
        updatePayload.premiumExpiresAt = this.getPremiumExpiresDate();
      } else {
        updatePayload.premiumExpiresAt = null;
      }
    }

    const imagesUrls: string[] | undefined = Array.isArray(data.imagesUrls)
      ? data.imagesUrls
      : typeof data.imagesUrls === 'string' && data.imagesUrls.length
        ? [data.imagesUrls]
        : undefined;

    const ops: Prisma.PrismaPromise<any>[] = [];

    if (imagesUrls && imagesUrls.length > 0) {
      const oldFilenames: string[] = allCar.images.map((i) => i.url).filter(Boolean as any);
      if (allCar.userCar) {
        const userCarImages = await this.prisma.carimages.findMany({ where: { userCarId: allCar.userCar.id } });
        oldFilenames.push(...userCarImages.map((i) => i.url).filter(Boolean as any));
      }
      const uniqueOldFilenames = [...new Set(oldFilenames)];
      for (const filename of uniqueOldFilenames) {
        if (/^https?:\/\//i.test(filename)) continue;
        const filePath = path.join(this.uploadDir, filename);
        try {
          await fs.unlink(filePath);
        } catch (err: any) {
          if (err.code !== 'ENOENT') {
            this.logger.warn(`Failed to delete file ${filePath}: ${err?.message ?? err}`);
          }
        }
      }
      ops.push(this.prisma.carimages.deleteMany({ where: { allCarId: id } }));
      if (allCar.userCar) {
        ops.push(this.prisma.carimages.deleteMany({ where: { userCarId: allCar.userCar.id } }));
      }
      for (const [idx, url] of imagesUrls.entries()) {
        ops.push(this.prisma.carimages.create({ data: { url, order: idx, allCarId: id, userCarId: allCar.userCar ? allCar.userCar.id : undefined } }));
      }
    }

    if (data.images && Array.isArray(data.images)) {
      const imageIds = data.images.map((img: any) => Number(img.id)).filter((id: number) => !Number.isNaN(id));
      if (imageIds.length !== data.images.length) throw new BadRequestException('Invalid image ids');

      const count = await this.prisma.carimages.count({ where: { allCarId: id, id: { in: imageIds } } });
      if (count !== imageIds.length) throw new BadRequestException('Images do not belong to this car');

      const imageUpdates = imageIds.map((imgId: number, idx: number) =>
        this.prisma.carimages.update({
          where: { id: imgId },
          data: { order: idx },
        })
      );
      ops.push(...imageUpdates);
    }

    if (Object.keys(updatePayload).length > 0) {
      ops.push(this.prisma.allCarsList.update({ where: { id }, data: updatePayload }));
      if (allCar.userCar) {
        ops.push(this.prisma.userCars.update({ where: { id: allCar.userCar.id }, data: updatePayload }));
      }
    }

    if (ops.length === 0) {
      return this.prisma.allCarsList.findUnique({
        where: { id },
        include: {
          images: { orderBy: { order: 'asc' } },
          userCar: { include: { images: { orderBy: { order: 'asc' } } } },
        },
      });
    }

    await this.prisma.$transaction(ops);
    return this.prisma.allCarsList.findUnique({
      where: { id },
      include: {
        images: { orderBy: { order: 'asc' } },
        userCar: { include: { images: { orderBy: { order: 'asc' } } } },
      },
    });
  }

  async deleteAllCar(id: number) {
    const allCar = await this.prisma.allCarsList.findUnique({
      where: { id },
      include: { images: true, userCar: { include: { images: true } } },
    });
    if (!allCar) return null;

    const filenames: string[] = [
      ...(allCar.images ?? []).map((i) => i.url),
      ...(allCar.userCar?.images ?? []).map((i) => i.url),
    ].filter(Boolean as any);

    for (const filename of filenames) {
      if (!filename) continue;
      if (/^https?:\/\//i.test(filename)) continue;
      const filePath = path.join(this.uploadDir, filename);
      try {
        await fs.unlink(filePath);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          this.logger.warn(`Failed to delete file ${filePath}: ${err?.message ?? err}`);
        }
      }
    }

    const ops: Prisma.PrismaPromise<any>[] = [];
    ops.push(this.prisma.carimages.deleteMany({ where: { allCarId: id } }));
    if (allCar.userCar) {
      ops.push(this.prisma.carimages.deleteMany({ where: { userCarId: allCar.userCar.id } }));
      ops.push(this.prisma.userCars.deleteMany({ where: { id: allCar.userCar.id } }));
    }
    ops.push(this.prisma.allCarsList.deleteMany({ where: { id } }));

    const results = await this.prisma.$transaction(ops);
    return results[results.length - 1];
  }
}
