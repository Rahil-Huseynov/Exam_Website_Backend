import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const banks = await prisma.questionBank.findMany({
    select: { id: true },
  })

  for (const bank of banks) {
    const questions = await prisma.question.findMany({
      where: { bankId: bank.id },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })

    for (let i = 0; i < questions.length; i++) {
      await prisma.question.update({
        where: { id: questions[i].id },
        data: { sort: i },
      })
    }

    console.log(`✔ bank ${bank.id} → ${questions.length} sual`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
