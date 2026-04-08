const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "acme" },
    update: { name: "Acme Foods" },
    create: {
      name: "Acme Foods",
      slug: "acme",
      logoUrl: null,
    },
  });

  const backOfHouse = await prisma.category.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Back of House" } },
    update: { sortOrder: 1 },
    create: {
      tenantId: tenant.id,
      name: "Back of House",
      sortOrder: 1,
    },
  });

  const kitchen = await prisma.category.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Kitchen" } },
    update: { sortOrder: 2 },
    create: {
      tenantId: tenant.id,
      name: "Kitchen",
      sortOrder: 2,
    },
  });

  await prisma.formTemplate.upsert({
    where: {
      id: "11111111-1111-1111-1111-111111111111",
    },
    update: {
      tenantId: tenant.id,
      categoryId: kitchen.id,
      title: "Daily Fridge Temperature Log",
      isStandard: true,
      schema: {
        version: 1,
        title: "Daily Fridge Temperature Log",
        fields: [
          {
            id: "fridge1_temp",
            type: "temp",
            label: "Fridge 1 (°C)",
            required: true,
            min: -2,
            max: 8,
            alertAbove: 5,
            unit: "C",
          },
          {
            id: "fridge2_temp",
            type: "temp",
            label: "Fridge 2 (°C)",
            required: true,
            min: -2,
            max: 8,
            alertAbove: 5,
            unit: "C",
          },
          {
            id: "notes",
            type: "text",
            label: "Notes",
            required: false,
          },
        ],
      },
    },
    create: {
      id: "11111111-1111-1111-1111-111111111111",
      tenantId: tenant.id,
      categoryId: kitchen.id,
      title: "Daily Fridge Temperature Log",
      isStandard: true,
      schema: {
        version: 1,
        title: "Daily Fridge Temperature Log",
        fields: [
          {
            id: "fridge1_temp",
            type: "temp",
            label: "Fridge 1 (°C)",
            required: true,
            min: -2,
            max: 8,
            alertAbove: 5,
            unit: "C",
          },
          {
            id: "fridge2_temp",
            type: "temp",
            label: "Fridge 2 (°C)",
            required: true,
            min: -2,
            max: 8,
            alertAbove: 5,
            unit: "C",
          },
          {
            id: "notes",
            type: "text",
            label: "Notes",
            required: false,
          },
        ],
      },
    },
  });

  await prisma.formTemplate.upsert({
    where: {
      id: "22222222-2222-2222-2222-222222222222",
    },
    update: {
      tenantId: tenant.id,
      categoryId: backOfHouse.id,
      title: "Opening Checks",
      isStandard: false,
      schema: {
        version: 1,
        title: "Opening Checks",
        fields: [
          { id: "manager_name", type: "text", label: "Manager", required: true },
          { id: "comments", type: "text", label: "Comments", required: false },
          {
            id: "sign_off",
            type: "signature",
            label: "Manager Signature",
            required: true,
          },
        ],
      },
    },
    create: {
      id: "22222222-2222-2222-2222-222222222222",
      tenantId: tenant.id,
      categoryId: backOfHouse.id,
      title: "Opening Checks",
      isStandard: false,
      schema: {
        version: 1,
        title: "Opening Checks",
        fields: [
          { id: "manager_name", type: "text", label: "Manager", required: true },
          { id: "comments", type: "text", label: "Comments", required: false },
          {
            id: "sign_off",
            type: "signature",
            label: "Manager Signature",
            required: true,
          },
        ],
      },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
