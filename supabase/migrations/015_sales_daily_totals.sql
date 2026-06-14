CREATE OR REPLACE FUNCTION fn_sales_daily_totals(
  p_branch_id UUID DEFAULT NULL,
  p_date_from DATE,
  p_date_to DATE
)
RETURNS TABLE(
  date DATE,
  branch_id UUID,
  sum_amount NUMERIC,
  sum_cost NUMERIC,
  tx_count INTEGER
)
LANGUAGE sql
AS $$
  SELECT
    s.date::date AS date,
    s.branch_id,
    SUM(s.total_amount) AS sum_amount,
    SUM(s.total_cost) AS sum_cost,
    COUNT(*)::INTEGER AS tx_count
  FROM sales s
  WHERE s.date::date >= p_date_from
    AND s.date::date <= p_date_to
    AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
  GROUP BY s.date::date, s.branch_id
  ORDER BY s.date::date, s.branch_id;
$$;

NOTIFY pgrst, 'reload schema';
