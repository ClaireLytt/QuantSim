import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(BASE_DIR, "data", "raw")
INDICATOR_DIR = os.path.join(BASE_DIR, "data", "indicators")
PREDICTION_DIR = os.path.join(BASE_DIR, "data", "predictions")

# 标的池: (代码, 名称, 行业/板块, 市场)
# 市场: STOCK=A股(一手100股), US=美股(1股起买), CRYPTO=加密货币(1枚起买)
STOCK_POOL = [
    ("600519", "贵州茅台", "白酒", "STOCK"),
    ("000858", "五粮液", "白酒", "STOCK"),
    ("601318", "中国平安", "保险", "STOCK"),
    ("600036", "招商银行", "银行", "STOCK"),
    ("000333", "美的集团", "家电", "STOCK"),
    ("002594", "比亚迪", "汽车", "STOCK"),
    ("300750", "宁德时代", "电池", "STOCK"),
    ("601899", "紫金矿业", "有色", "STOCK"),
    ("AAPL", "苹果", "科技", "US"),
    ("MSFT", "微软", "科技", "US"),
    ("NVDA", "英伟达", "半导体", "US"),
    ("TSLA", "特斯拉", "汽车", "US"),
    ("BTC", "比特币", "加密货币", "CRYPTO"),
    ("ETH", "以太坊", "加密货币", "CRYPTO"),
    ("SOL", "Solana", "加密货币", "CRYPTO"),
    ("DOGE", "狗狗币", "加密货币", "CRYPTO"),
    ("600030", "中信证券", "券商", "STOCK"),
    ("601888", "中国中免", "免税", "STOCK"),
    ("600276", "恒瑞医药", "医药", "STOCK"),
    ("000651", "格力电器", "家电", "STOCK"),
    ("601012", "隆基绿能", "光伏", "STOCK"),
    ("002415", "海康威视", "安防", "STOCK"),
    ("600900", "长江电力", "电力", "STOCK"),
    ("603259", "药明康德", "医药", "STOCK"),
    ("GOOG", "谷歌", "科技", "US"),
    ("AMZN", "亚马逊", "电商", "US"),
    ("META", "Meta", "社交", "US"),
    ("NFLX", "奈飞", "流媒体", "US"),
    ("AMD", "超威半导体", "半导体", "US"),
    ("BNB", "币安币", "加密货币", "CRYPTO"),
    ("XRP", "瑞波币", "加密货币", "CRYPTO"),
    ("ADA", "艾达币", "加密货币", "CRYPTO"),
]

START_DATE = "20240101"
END_DATE = "20251231"

DB_CONFIG = {
    "host": os.environ.get("QUANTSIM_DB_HOST", "127.0.0.1"),
    "port": int(os.environ.get("QUANTSIM_DB_PORT", "3306")),
    "user": os.environ.get("QUANTSIM_DB_USER", "root"),
    "password": os.environ.get("QUANTSIM_DB_PASSWORD", "root"),
    "database": os.environ.get("QUANTSIM_DB_NAME", "quantsim"),
}
