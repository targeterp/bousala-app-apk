CREATE OR REPLACE FUNCTION get_transactions_columns()
RETURNS TABLE(column_name text) AS $$
BEGIN
    RETURN QUERY 
    SELECT information_schema.columns.column_name::text
    FROM information_schema.columns 
    WHERE table_name = 'transactions';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
