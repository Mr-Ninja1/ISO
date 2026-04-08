const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const suggestedCategories = ["Kitchen", "FOH", "Bakery", "Storage", "BOH"];

  for (let i = 0; i < suggestedCategories.length; i++) {
    const name = suggestedCategories[i];
    await prisma.categorySuggestion.upsert({
      where: { name },
      update: { sortOrder: i },
      create: { name, sortOrder: i },
    });
  }

  await prisma.templateLibrary.upsert({
    where: { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
    update: {
      title: "Daily Fridge Temperature Log",
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
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      title: "Daily Fridge Temperature Log",
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

  await prisma.templateLibrary.upsert({
    where: { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" },
    update: {
      title: "Opening Checks",
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
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      title: "Opening Checks",
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

  await prisma.templateLibrary.upsert({
    where: { id: "cccccccc-cccc-cccc-cccc-cccccccccccc" },
    update: {
      title: "Deep Freezer Temperature Log",
      schema: {
        version: 1,
        title: "Deep Freezer Temperature Log",
        sections: [
          {
            type: "fields",
            title: "Header Information",
            fields: [
              {
                id: "compiled_by",
                type: "text",
                label: "Compiled By",
                required: true,
              },
              {
                id: "approved_by",
                type: "text",
                label: "Approved By",
                required: true,
              },
              {
                id: "unit_location",
                type: "text",
                label: "Unit/Location",
                required: true,
              },
            ],
          },
          {
            type: "grid",
            id: "form_data",
            title: "Monthly Log (31 Days)",
            rows: 31,
            columns: [
              {
                id: "day",
                type: "text",
                label: "Day",
                required: true,
                readOnly: true,
              },
              {
                id: "morn_temp",
                type: "temp",
                label: "Morn Temp",
                required: false,
                unit: "C",
              },
              {
                id: "morn_sign",
                type: "signature",
                label: "Morn Sign",
                required: false,
              },
              {
                id: "aft_temp",
                type: "temp",
                label: "Aft Temp",
                required: false,
                unit: "C",
              },
              {
                id: "aft_sign",
                type: "signature",
                label: "Aft Sign",
                required: false,
              },
              {
                id: "action_taken",
                type: "text",
                label: "Action Taken",
                required: false,
              },
            ],
          },
          {
            type: "fields",
            title: "Verification",
            fields: [
              {
                id: "supervisor_signature",
                type: "signature",
                label: "Supervisor Signature",
                required: true,
              },
              {
                id: "complex_manager_signature",
                type: "signature",
                label: "Complex Manager Signature",
                required: true,
              },
              {
                id: "hseq_manager_signature",
                type: "signature",
                label: "HSEQ Manager Signature",
                required: true,
              },
            ],
          },
        ],
      },
    },
    create: {
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      title: "Deep Freezer Temperature Log",
      schema: {
        version: 1,
        title: "Deep Freezer Temperature Log",
        sections: [
          {
            type: "fields",
            title: "Header Information",
            fields: [
              {
                id: "compiled_by",
                type: "text",
                label: "Compiled By",
                required: true,
              },
              {
                id: "approved_by",
                type: "text",
                label: "Approved By",
                required: true,
              },
              {
                id: "unit_location",
                type: "text",
                label: "Unit/Location",
                required: true,
              },
            ],
          },
          {
            type: "grid",
            id: "form_data",
            title: "Monthly Log (31 Days)",
            rows: 31,
            columns: [
              {
                id: "day",
                type: "text",
                label: "Day",
                required: true,
                readOnly: true,
              },
              {
                id: "morn_temp",
                type: "temp",
                label: "Morn Temp",
                required: false,
                unit: "C",
              },
              {
                id: "morn_sign",
                type: "signature",
                label: "Morn Sign",
                required: false,
              },
              {
                id: "aft_temp",
                type: "temp",
                label: "Aft Temp",
                required: false,
                unit: "C",
              },
              {
                id: "aft_sign",
                type: "signature",
                label: "Aft Sign",
                required: false,
              },
              {
                id: "action_taken",
                type: "text",
                label: "Action Taken",
                required: false,
              },
            ],
          },
          {
            type: "fields",
            title: "Verification",
            fields: [
              {
                id: "supervisor_signature",
                type: "signature",
                label: "Supervisor Signature",
                required: true,
              },
              {
                id: "complex_manager_signature",
                type: "signature",
                label: "Complex Manager Signature",
                required: true,
              },
              {
                id: "hseq_manager_signature",
                type: "signature",
                label: "HSEQ Manager Signature",
                required: true,
              },
            ],
          },
        ],
      },
    },
  });

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

  await prisma.formTemplate.upsert({
    where: {
      id: "33333333-3333-3333-3333-333333333333",
    },
    update: {
      tenantId: tenant.id,
      categoryId: kitchen.id,
      title: "Deep Freezer Temperature Log",
      isStandard: true,
      schema: {
        version: 1,
        title: "Deep Freezer Temperature Log",
        sections: [
          {
            type: "fields",
            title: "Header Information",
            fields: [
              {
                id: "compiled_by",
                type: "text",
                label: "Compiled By",
                required: true,
              },
              {
                id: "approved_by",
                type: "text",
                label: "Approved By",
                required: true,
              },
              {
                id: "unit_location",
                type: "text",
                label: "Unit/Location",
                required: true,
              },
            ],
          },
          {
            type: "grid",
            id: "form_data",
            title: "Monthly Log (31 Days)",
            rows: 31,
            columns: [
              {
                id: "day",
                type: "text",
                label: "Day",
                required: true,
                readOnly: true,
              },
              {
                id: "morn_temp",
                type: "temp",
                label: "Morn Temp",
                required: false,
                unit: "C",
              },
              {
                id: "morn_sign",
                type: "signature",
                label: "Morn Sign",
                required: false,
              },
              {
                id: "aft_temp",
                type: "temp",
                label: "Aft Temp",
                required: false,
                unit: "C",
              },
              {
                id: "aft_sign",
                type: "signature",
                label: "Aft Sign",
                required: false,
              },
              {
                id: "action_taken",
                type: "text",
                label: "Action Taken",
                required: false,
              },
            ],
          },
          {
            type: "fields",
            title: "Verification",
            fields: [
              {
                id: "supervisor_signature",
                type: "signature",
                label: "Supervisor Signature",
                required: true,
              },
              {
                id: "complex_manager_signature",
                type: "signature",
                label: "Complex Manager Signature",
                required: true,
              },
              {
                id: "hseq_manager_signature",
                type: "signature",
                label: "HSEQ Manager Signature",
                required: true,
              },
            ],
          },
        ],
      },
    },
    create: {
      id: "33333333-3333-3333-3333-333333333333",
      tenantId: tenant.id,
      categoryId: kitchen.id,
      title: "Deep Freezer Temperature Log",
      isStandard: true,
      schema: {
        version: 1,
        title: "Deep Freezer Temperature Log",
        sections: [
          {
            type: "fields",
            title: "Header Information",
            fields: [
              {
                id: "compiled_by",
                type: "text",
                label: "Compiled By",
                required: true,
              },
              {
                id: "approved_by",
                type: "text",
                label: "Approved By",
                required: true,
              },
              {
                id: "unit_location",
                type: "text",
                label: "Unit/Location",
                required: true,
              },
            ],
          },
          {
            type: "grid",
            id: "form_data",
            title: "Monthly Log (31 Days)",
            rows: 31,
            columns: [
              {
                id: "day",
                type: "text",
                label: "Day",
                required: true,
                readOnly: true,
              },
              {
                id: "morn_temp",
                type: "temp",
                label: "Morn Temp",
                required: false,
                unit: "C",
              },
              {
                id: "morn_sign",
                type: "signature",
                label: "Morn Sign",
                required: false,
              },
              {
                id: "aft_temp",
                type: "temp",
                label: "Aft Temp",
                required: false,
                unit: "C",
              },
              {
                id: "aft_sign",
                type: "signature",
                label: "Aft Sign",
                required: false,
              },
              {
                id: "action_taken",
                type: "text",
                label: "Action Taken",
                required: false,
              },
            ],
          },
          {
            type: "fields",
            title: "Verification",
            fields: [
              {
                id: "supervisor_signature",
                type: "signature",
                label: "Supervisor Signature",
                required: true,
              },
              {
                id: "complex_manager_signature",
                type: "signature",
                label: "Complex Manager Signature",
                required: true,
              },
              {
                id: "hseq_manager_signature",
                type: "signature",
                label: "HSEQ Manager Signature",
                required: true,
              },
            ],
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
