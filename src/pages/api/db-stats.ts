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
    return new Response(
      JSON.stringify({ success: false, error: error.message, totalInDb: 0 }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
