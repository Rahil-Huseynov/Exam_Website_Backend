-- CreateTable
CREATE TABLE "PaymentResponse" (
    "id" TEXT NOT NULL,
    "userId" INTEGER,
    "orderId" VARCHAR(255),
    "transactionId" TEXT,
    "operationCode" TEXT,
    "status" TEXT,
    "rrn" TEXT,
    "payload" JSONB,
    "signature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentResponse_orderId_idx" ON "PaymentResponse"("orderId");

-- CreateIndex
CREATE INDEX "PaymentResponse_userId_idx" ON "PaymentResponse"("userId");

-- AddForeignKey
ALTER TABLE "PaymentResponse" ADD CONSTRAINT "PaymentResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
