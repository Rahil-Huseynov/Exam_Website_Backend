import { Controller, Get, Param, Body, Post, Put, Delete, BadRequestException, UseGuards } from '@nestjs/common';
import { UserCarsService } from './user-cars.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('user-cars')
export class UserCarsController {
  constructor(private readonly userCarsService: UserCarsService) { }

  @UseGuards(AuthGuard('jwt'))
  @Post()
  async create(@Body() body: any) {
    console.log('UserCarsController.create body.description:', JSON.stringify(body?.description));
    return this.userCarsService.createUserCar(body);
  }

  @Get()
  async getAll() {
    return this.userCarsService.getAllUserCars();
  }

  @Get('recent')
  async getRecent() {
    return this.userCarsService.getRecentCars();
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const carId = Number(id);
    if (Number.isNaN(carId)) throw new BadRequestException('Invalid car id');
    return this.userCarsService.getUserCarById(carId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    return this.userCarsService.updateUserCar(Number(id), body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.userCarsService.deleteUserCar(Number(id));
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('all')
  async createAll(@Body() body: any) {
    console.log('UserCarsController.createAll body.description:', JSON.stringify(body?.description));
    return this.userCarsService.createAllCar(body);
  }

  @Get('all')
  async getAllCars() {
    return this.userCarsService.getAllCars();
  }

  @Get('all/:id')
  async getAllCarById(@Param('id') id: string) {
    const carId = Number(id);
    if (Number.isNaN(carId)) throw new BadRequestException('Invalid id');
    return this.userCarsService.getAllCarById(carId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('all/:id')
  async updateAllCar(@Param('id') id: string, @Body() body: any) {
    return this.userCarsService.updateAllCar(Number(id), body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('all/:id')
  async deleteAllCar(@Param('id') id: string) {
    return this.userCarsService.deleteAllCar(Number(id));
  }
}
