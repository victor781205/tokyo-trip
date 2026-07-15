-- ============================================
-- 清理 smoke / 測試資料（可重跑）
-- 請在 Supabase SQL Editor 執行
-- ============================================

-- 1) 推播測試訂閱
DELETE FROM public.push_subscriptions
WHERE trip_id LIKE 'trip_smoke_%'
   OR trip_id LIKE 'test_%'
   OR token LIKE 'smoke%'
   OR token LIKE 'web-endpoint-%'
   OR token LIKE 'https://example.com/push/%';

-- 2) 行程測試列
DELETE FROM public.sync_state
WHERE trip_id LIKE 'trip_smoke_%'
   OR trip_id LIKE 'test_%'
   OR trip_id LIKE 'test_bot_%'
   OR id LIKE 'state_trip_smoke_%';

-- 3) 結果
SELECT 'sync_state remaining' AS what, count(*)::int AS n FROM public.sync_state
UNION ALL
SELECT 'push_subscriptions remaining', count(*)::int FROM public.push_subscriptions;

SELECT trip_id, left(trip_secret, 8) AS secret_prefix, updated_at
FROM public.sync_state
ORDER BY updated_at DESC NULLS LAST
LIMIT 20;
