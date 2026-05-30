import { ConflictException, Injectable, Logger, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, type UserRole } from './entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User, 'main')
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * On first boot, seed an admin user so the dashboard has someone to
   * log in with. Credentials come from env (preferred) or default to
   * admin/changeme. The default is logged loudly so operators rotate
   * it immediately.
   */
  async onModuleInit(): Promise<void> {
    const count = await this.userRepo.count();
    if (count > 0) return;
    const username = process.env.ADMIN_USERNAME?.trim() || 'admin';
    const password = process.env.ADMIN_PASSWORD?.trim() || 'admin';
    const displayName = process.env.ADMIN_DISPLAY_NAME?.trim() || 'Administrator';
    await this.createUser({ username, password, displayName, role: 'admin' });
    this.logger.warn('');
    this.logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.warn('  👤 Seeded internal admin user:');
    this.logger.warn(`     username: ${username}`);
    this.logger.warn(`     password: ${password}`);
    this.logger.warn('  ⚠️  Change immediately from /admin/users in the dashboard.');
    this.logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.warn('');
  }

  async createUser(dto: RegisterDto): Promise<User> {
    const existing = await this.userRepo.findOne({ where: { username: dto.username } });
    if (existing) throw new ConflictException('username taken');
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = this.userRepo.create({
      username: dto.username,
      displayName: dto.displayName,
      passwordHash,
      role: (dto.role ?? 'operator') as UserRole,
    });
    return this.userRepo.save(user);
  }

  async verifyPassword(username: string, password: string): Promise<User> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.username = :username', { username })
      .getOne();
    if (!user || !user.isActive) throw new UnauthorizedException('invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('invalid credentials');
    return user;
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('user not found');
    return user;
  }

  async list(): Promise<User[]> {
    return this.userRepo.find({ order: { createdAt: 'DESC' } });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);
    if (dto.displayName !== undefined) user.displayName = dto.displayName;
    if (dto.role !== undefined) user.role = dto.role as UserRole;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl;
    if (dto.password) user.passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    return this.userRepo.save(user);
  }

  async remove(id: string): Promise<void> {
    await this.userRepo.delete(id);
  }

  async touchLastSeen(id: string): Promise<void> {
    await this.userRepo.update(id, { lastSeenAt: new Date() });
  }
}
