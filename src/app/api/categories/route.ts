import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { tenantId, name } = await req.json();

    const category = await prisma.category.create({
      data: {
        tenantId,
        name,
        sortOrder: 0,
      },
    });

    return NextResponse.json(category);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
