import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { CarsService, FilterOptions } from './cars.service';

@Controller('car')
export class CarsController {
  constructor(private readonly carsService: CarsService) { }

  @Get('all')
  async getAllCars(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('brand') brand?: string,
    @Query('model') model?: string,
    @Query('location') location?: string,
    @Query('ban') ban?: string,
    @Query('engine') engine?: string,
    @Query('gearbox') gearbox?: string,
    @Query('year') year?: string,
    @Query('fuel') fuel?: string,
    @Query('condition') condition?: string,
    @Query('color') color?: string,
    @Query('SaleType') SaleType?: string,
    @Query('vinCode') vinCode?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('sortBy') sortBy?: string,
  ) {
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 20;

    const filters: FilterOptions = {
      search,
      status,
      brand,
      model,
      fuel,
      condition,
      location,
      ban,
      engine,
      gearbox,
      color,
      SaleType,
      vinCode,
      sortBy,
      year: year ? parseInt(year, 10) : undefined,
      minPrice: minPrice ? parseInt(minPrice, 10) : undefined,
      maxPrice: maxPrice ? parseInt(maxPrice, 10) : undefined,
    };

    return this.carsService.getAllCarsFromAllList(pageNumber, limitNumber, filters);
  }

  @Get('for-sale')
  async getForSaleCars(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('brand') brand?: string,
    @Query('model') model?: string,
    @Query('location') location?: string,
    @Query('ban') ban?: string,
    @Query('engine') engine?: string,
    @Query('gearbox') gearbox?: string,
    @Query('year') year?: string,
    @Query('fuel') fuel?: string,
    @Query('condition') condition?: string,
    @Query('color') color?: string,
    @Query('vinCode') vinCode?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('sortBy') sortBy?: string,
  ) {
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 20;

    const filters: FilterOptions = {
      search,
      status,
      brand,
      model,
      fuel,
      condition,
      location,
      ban,
      engine,
      gearbox,
      color,
      SaleType: 'forSale',
      vinCode,
      sortBy,
      year: year ? parseInt(year, 10) : undefined,
      minPrice: minPrice ? parseInt(minPrice, 10) : undefined,
      maxPrice: maxPrice ? parseInt(maxPrice, 10) : undefined,
    };

    return this.carsService.getAllCarsFromAllList(pageNumber, limitNumber, filters);
  }

  @Get('for-rent')
  async getForRentCars(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('brand') brand?: string,
    @Query('model') model?: string,
    @Query('location') location?: string,
    @Query('ban') ban?: string,
    @Query('engine') engine?: string,
    @Query('gearbox') gearbox?: string,
    @Query('year') year?: string,
    @Query('fuel') fuel?: string,
    @Query('condition') condition?: string,
    @Query('color') color?: string,
    @Query('vinCode') vinCode?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('sortBy') sortBy?: string,
  ) {
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 20;

    const filters: FilterOptions = {
      search,
      status,
      brand,
      model,
      fuel,
      condition,
      location,
      ban,
      engine,
      gearbox,
      color,
      SaleType: 'forRent',
      vinCode,
      sortBy,
      year: year ? parseInt(year, 10) : undefined,
      minPrice: minPrice ? parseInt(minPrice, 10) : undefined,
      maxPrice: maxPrice ? parseInt(maxPrice, 10) : undefined,
    };

    return this.carsService.getAllCarsFromAllList(pageNumber, limitNumber, filters);
  }

  @Get('premium')
  async getPremiumCars(
    @Query('page') page = '1',
    @Query('limit') limit = '12',
    @Query('search') search = '',
    @Query('brand') brand?: string,
    @Query('model') model?: string,
    @Query('year') year?: number,
    @Query('fuel') fuel?: string,
    @Query('ban') ban?: string,
    @Query('engine') engine?: string,
    @Query('gearbox') gearbox?: string,
    @Query('location') location?: string,
    @Query('condition') condition?: string,
    @Query('color') color?: string,
    @Query('SaleType') SaleType?: string,
    @Query('vinCode') vinCode?: string,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
    @Query('sortBy') sortBy?: string,
  ) {
    return this.carsService.getPremiumCarsFromAllList({
      page: Number(page),
      limit: Number(limit),
      search,
      brand,
      model,
      year: year ? Number(year) : undefined,
      fuel,
      location,
      ban,
      engine,
      gearbox,
      condition,
      color,
      SaleType,
      vinCode,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      sortBy,
    });
  }

  @Get(':id')
  async getCarById(@Param('id', ParseIntPipe) id: number) {
    return this.carsService.getCarById(id);
  }
}
