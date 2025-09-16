import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Do NOT pass datasources.url explicitly here. During Cloud Build, DATABASE_URL is not available
// and passing an undefined value causes PrismaClientConstructorValidationError.
// Prisma will read DATABASE_URL at runtime inside Cloud Run.
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
