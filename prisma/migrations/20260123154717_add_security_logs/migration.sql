-- AlterTable
ALTER TABLE "Log" ADD COLUMN     "asn" TEXT,
ADD COLUMN     "browser" TEXT,
ADD COLUMN     "browserVer" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "deviceType" TEXT,
ADD COLUMN     "isp" TEXT,
ADD COLUMN     "os" TEXT,
ADD COLUMN     "osVersion" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "userAgent" TEXT;
