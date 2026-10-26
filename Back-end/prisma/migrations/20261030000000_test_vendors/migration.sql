-- Demo vendors made in Admin -> Settings -> Test vendors (shown with a "Test" badge; never emailed or paid out)
ALTER TABLE "users" ADD COLUMN "is_test" BOOLEAN NOT NULL DEFAULT false;
