-- AlterTable
ALTER TABLE "allCarsList" ADD COLUMN     "premiumExpiresAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'basic';

-- AlterTable
ALTER TABLE "userJournal" ADD COLUMN     "premiumExpiresAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'basic';
