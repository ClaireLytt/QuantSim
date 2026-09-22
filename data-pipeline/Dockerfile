FROM python:3.11-slim

# pyspark 需要 JRE
RUN apt-get update \
    && apt-get install -y --no-install-recommends default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py ./

# 默认跑 mock 数据链路; 真实数据改为 fetch_data.py
CMD ["sh", "-c", "python mock_data.py && python compute_indicators.py && python train_predictor.py && python load_to_db.py"]
