UPDATE scheme SET position = CASE kind WHEN 'max' THEN reps WHEN 'fixed' THEN 10 * sets + reps ELSE 1000 END;
