-- 与 V12 同因: V10 的 rooms.code 建成 CHAR(6), 实体映射 VARCHAR(6), validate 拒启。
-- (V12 已在部分库应用, 不能回改, 故单开一版; 至此迁移里所有 CHAR 列清零。)
ALTER TABLE rooms MODIFY COLUMN code VARCHAR(6) NOT NULL;
