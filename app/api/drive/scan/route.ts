import { NextResponse } from 'next/server';
import { scanDriveFolder } from '../../../../lib/drive';

export async function POST(req: Request) {
  try {
    const { link } = await req.json();
    const files = await scanDriveFolder(link);
    return NextResponse.json({ files });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}