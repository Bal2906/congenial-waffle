import type { APIRoute } from 'astro';
import { getDbStats } from '../../utils/db';

export const GET: APIRoute = async () => {
  try {
    const stats = await getDbStats();
    return new Response(
      JSON.stringify({ success: true, ...stats }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('🔥 Error en API /api/db-stats:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message, totalInDb: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
