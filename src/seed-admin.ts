import 'reflect-metadata';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { AppDataSource } from './database';
import { User, UserRole } from './models/User';

dotenv.config();

async function seedAdmin() {
  try {
    // Ensure tables are created
    await AppDataSource.initialize();
    await AppDataSource.synchronize();
    console.log('Database connected and synchronized');

    const userRepo = AppDataSource.getRepository(User);

    // Check if admin already exists
    const existingAdmin = await userRepo.findOne({
      where: { email: 'admin@medical-camp.com' }
    });

    if (existingAdmin) {
      console.log('Admin user already exists');
      process.exit(0);
    }

    // Create admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const admin = userRepo.create({
      role: UserRole.ADMIN,
      name: 'System Admin',
      email: 'admin@medical-camp.com',
      phone: '+1234567890',
      passwordHash: hashedPassword,
      campId: null, // Admin has no camp assignment
      isActive: true // Must be active to login
    });

    await userRepo.save(admin);

    console.log('✅ Admin user created successfully');
    console.log('Email: admin@medical-camp.com');
    console.log('Password: admin123');
    console.log('\nPlease change this password in production!');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
}

seedAdmin();
