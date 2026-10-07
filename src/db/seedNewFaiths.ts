/**
 * Adds the four newer sanctuaries (Theravada, Tibetan Buddhism, Mongolian shamanism,
 * Russian Orthodox). Idempotent: rows that already exist are left untouched, and any
 * error is logged and ignored so it never stops the server from starting.
 */
import { getPool } from './connection';

const ROWS: [string, string, string, string, string][] = [
  ['南傳佛教寺院', 'theravada', '斯里蘭卡、緬甸、泰國、柬埔寨、寮國的上座部佛教傳統', '☸️', '#D4881C'],
  ['藏傳佛教寺院', 'tibetan_buddhist', '經幡、酥油燈與六字大明咒', '🏔️', '#9B2335'],
  ['蒙古薩滿聖地', 'mongol_shaman', '長生天、敖包與祖靈 — 蒙古薩滿信仰', '🦅', '#2F6EA5'],
  ['東正教堂', 'orthodox', '聖像、蠟燭與祈禱 — 俄羅斯東正教', '☦️', '#8E6B1F'],
];

export async function seedNewFaiths(): Promise<void> {
  try {
    const pool = getPool();
    // Older databases may still carry the original religion_type CHECK list.
    await pool.execute('ALTER TABLE sanctuaries DROP CONSTRAINT IF EXISTS sanctuaries_religion_type_check');
    for (const [name, type, description, icon, color] of ROWS) {
      await pool.execute(
        `INSERT INTO sanctuaries (name, religion_type, description, icon, color, language)
         VALUES (?, ?, ?, ?, ?, 'zh-TW')
         ON CONFLICT (religion_type) DO NOTHING`,
        [name, type, description, icon, color]
      );
    }
  } catch (e) {
    console.error('[seedNewFaiths] skipped:', e);
  }
}
