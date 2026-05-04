require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function test() {
  await prisma.$connect();
  console.log("Connected!");
}

test();
