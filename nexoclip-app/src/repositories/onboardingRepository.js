const columns = 'user_id, status, answers, completed_at';

export async function findOnboarding(db, userId) {
  const result = await db.query(`SELECT ${columns} FROM user_onboarding WHERE user_id = $1`, [userId]);
  return result.rows[0] || null;
}

export async function upsertOnboarding(db, { userId, status, answers }) {
  const result = await db.query(
    `INSERT INTO user_onboarding (user_id, status, answers)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET status = EXCLUDED.status, answers = EXCLUDED.answers,
       completed_at = now(), updated_at = now()
     RETURNING ${columns}`,
    [userId, status, JSON.stringify(answers)],
  );
  return result.rows[0];
}
