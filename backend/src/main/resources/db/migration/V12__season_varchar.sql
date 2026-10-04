-- 修复 schema 校验失败: V10 把 season 建成 CHAR(7), 而 JPA 实体 @Column(length=7)
-- 映射为 VARCHAR(7), ddl-auto=validate 下 Hibernate 拒绝启动 (wrong column type)。
-- 统一改为 VARCHAR(7) 与实体一致; 值形如 "YYYY-MM" 恒为 7 字符, 语义不变。
ALTER TABLE game_sessions MODIFY COLUMN season VARCHAR(7) NULL;
ALTER TABLE backtest_results MODIFY COLUMN season VARCHAR(7) NULL;
