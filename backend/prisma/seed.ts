import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  await prisma.role.createMany({
    data: [
      { code: 'user', name: 'User' },
      { code: 'admin', name: 'Administrator' },
    ],
    skipDuplicates: true,
  });

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required to seed the admin account');
  }

  const passwordHash = await argon2.hash(password);
  await prisma.user.upsert({
    where: { email: email.trim().toLowerCase() },
    update: { passwordHash, displayName: 'Administrator', role: 'admin' },
    create: {
      email: email.trim().toLowerCase(),
      passwordHash,
      displayName: 'Administrator',
      role: 'admin',
    },
  });
}

main().finally(() => prisma.$disconnect());
