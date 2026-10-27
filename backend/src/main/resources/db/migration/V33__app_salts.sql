-- 审计创意24 (产品拍板): 竞技盲局行情不可逆扰动的全局密钥。
-- 盲局此前下发精确 OHLC/量, 可拿收益率序列在无鉴权的 /api/lab/history 全库滑窗比对,
-- 唯一定位标的与真实窗口 (2026-10 审计 P1-9)。扰动种子 = SHA(标的+起始日) XOR 此密钥,
-- 密钥只存在于服务端, 同一挑战/房间/战书 (同标的同起始日) 全员同一扰动, 榜单可比。
CREATE TABLE app_salts (
    name       VARCHAR(32) NOT NULL PRIMARY KEY,
    salt       BIGINT      NOT NULL,
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
