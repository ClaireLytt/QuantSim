"""数据管道一键刷新编排: fetch --incremental -> indicators -> predict -> load。

用法: python refresh.py            (增量更新行情后全链路重算并入库)
     python refresh.py --full     (全量重拉行情)

供后端 quantsim.refresh 定时任务调用, 也可手动执行; 任一步骤失败即以非零码退出。
"""
import argparse
import subprocess
import sys
import time

STEPS_INCREMENTAL = [
    [sys.executable, "fetch_data.py", "--incremental"],
    [sys.executable, "compute_indicators.py"],
    [sys.executable, "train_predictor.py"],
    [sys.executable, "load_to_db.py"],
]

STEPS_FULL = [
    [sys.executable, "fetch_data.py", "--force"],
    [sys.executable, "compute_indicators.py"],
    [sys.executable, "train_predictor.py"],
    [sys.executable, "load_to_db.py"],
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true", help="全量重拉行情而非增量")
    args = parser.parse_args()

    steps = STEPS_FULL if args.full else STEPS_INCREMENTAL
    started = time.time()
    for step in steps:
        label = " ".join(step[1:])
        print(f"\n===== [refresh] {label} =====", flush=True)
        result = subprocess.run(step)
        if result.returncode != 0:
            print(f"[refresh] 步骤失败: {label} (exit {result.returncode})", flush=True)
            sys.exit(result.returncode)
    print(f"\n[refresh] 全部完成, 耗时 {time.time() - started:.0f}s", flush=True)


if __name__ == "__main__":
    main()
