-- Create a test RPC to capture the exact error message
CREATE OR REPLACE FUNCTION test_update_status_error(p_order_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_err_msg TEXT;
    v_err_detail TEXT;
    v_err_hint TEXT;
BEGIN
    BEGIN
        PERFORM update_custom_order_status_v2(p_order_id, 'delivered');
        RETURN 'SUCCESS';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS 
            v_err_msg = MESSAGE_TEXT,
            v_err_detail = PG_EXCEPTION_DETAIL,
            v_err_hint = PG_EXCEPTION_HINT;
        RETURN 'ERROR: ' || v_err_msg || ' | DETAIL: ' || v_err_detail || ' | HINT: ' || v_err_hint;
    END;
END;
$$ LANGUAGE plpgsql;
