-- Count attempted operations before calling R2, including failed requests.
CREATE TABLE r2_operation_usage (
  month TEXT NOT NULL,
  class TEXT NOT NULL CHECK(class IN ('A', 'B')),
  operations INTEGER NOT NULL CHECK(operations > 0),
  PRIMARY KEY (month, class)
);
