import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // First try hard delete since we have CASCADE set up
    try {
      const deletedClient = await prisma.client.delete({
        where: { id: params.id },
      });
      return NextResponse.json(deletedClient);
    } catch (error) {
      // If hard delete fails, fall back to soft delete
      const updatedClient = await prisma.client.update({
        where: { id: params.id },
        data: { is_deleted: true }
      });
      return NextResponse.json(updatedClient);
    }
  } catch (error) {
    console.error('Error deleting client:', error);
    return NextResponse.json(
      { error: "Error deleting client" },
      { status: 500 }
    );
  }
} 